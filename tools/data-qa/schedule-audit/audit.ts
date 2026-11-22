import { auditCalendar, type CalendarIndex } from './calendar.ts';
import type { Issue } from './common.ts';
import { auditManifest, type AuditPart, type ScheduleGroup } from './manifest.ts';
import { readManifestFile, readPart } from './parts.ts';
import { TripAudit } from './trips.ts';

export interface AuditOptions {
  manifest: string;
  packRoot: string;
  releaseRoot?: string;
  source?: string;
  region?: string;
  maxExamples?: number;
}

export type Status = 'clean' | 'review' | 'incomplete' | 'invalid';

interface FindingCount {
  code: string;
  severity: Issue['severity'];
  count: number;
}

class Findings {
  private readonly counts = new Map<string, FindingCount>();
  readonly examples: Issue[] = [];
  readonly limit: number;
  errors = 0;
  warnings = 0;

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1000) {
      throw new RangeError('The example limit must be an integer from 0 to 1000.');
    }
    this.limit = limit;
  }

  add(issue: Issue): void {
    if (issue.severity === 'error') this.errors++;
    else this.warnings++;
    const key = issue.severity + '/' + issue.code;
    const existing = this.counts.get(key);
    if (existing) existing.count++;
    else this.counts.set(key, { code: issue.code, severity: issue.severity, count: 1 });
    if (this.examples.length < this.limit) this.examples.push(issue);
  }

  report() {
    // Locations follow inspection order. The breakdown remains complete when the sample is empty.
    return {
      errors: this.errors,
      warnings: this.warnings,
      counts: Array.from(this.counts.values()),
      examples: this.examples,
      omitted: this.errors + this.warnings - this.examples.length,
    };
  }
}

function emptyTotals() {
  return {
    selectedParts: 0,
    decodedParts: 0,
    missingParts: 0,
    invalidParts: 0,
    declaredTripRows: 0,
    decodedRows: 0,
    tripObjects: 0,
    rowsWithErrors: 0,
    rowsWithWarnings: 0,
    stopTimeEntries: 0,
    unknownWheelchairTrips: 0,
    afterMidnightTrips: 0,
    duplicateTripIds: 0,
    untrackedTripIds: 0,
  };
}

export type Totals = ReturnType<typeof emptyTotals>;

export interface PartReceipt {
  index: number;
  kind: AuditPart['kind'];
  placement: AuditPart['placement'];
  bytesDeclared: number;
  tripRowsDeclared: number;
  outcome: 'decoded' | 'missing' | 'invalid';
  rowsDecoded: number;
  errors: number;
  warnings: number;
}

export interface GroupReport {
  sourceId: string;
  regionId: string;
  provenance: ScheduleGroup['provenance'];
  feedStart: string;
  feedEnd: string;
  status: Status;
  totals: Totals;
  parts: PartReceipt[];
}

export interface AuditReport {
  version: 1;
  status: Status;
  selection: { source: string | null; region: string | null };
  manifest: { declaredParts: number; eligibleGroups: number; heldSources: number };
  totals: Totals;
  groups: GroupReport[];
  findings: ReturnType<Findings['report']>;
}

function status(errors: number, warnings: number, incomplete: boolean): Status {
  if (errors) return 'invalid';
  if (incomplete) return 'incomplete';
  return warnings ? 'review' : 'clean';
}

async function inspectGroup(group: ScheduleGroup, options: AuditOptions, findings: Findings): Promise<GroupReport> {
  const totals = emptyTotals();
  const parts: PartReceipt[] = [];
  const errorsAtStart = findings.errors;
  const warningsAtStart = findings.warnings;
  let calendar: CalendarIndex | null = null;
  let tripAudit: TripAudit | undefined;

  for (const part of [group.calendar, ...group.trips]) {
    const errorsBefore = findings.errors;
    const warningsBefore = findings.warnings;
    const payload = await readPart(part, options);
    const receipt: PartReceipt = {
      index: part.index,
      kind: part.kind,
      placement: part.placement,
      bytesDeclared: part.bytes,
      tripRowsDeclared: part.tripCount,
      outcome: 'decoded',
      rowsDecoded: 0,
      errors: 0,
      warnings: 0,
    };
    totals.selectedParts++;
    totals.declaredTripRows += part.tripCount;
    switch (payload.status) {
      case 'missing':
      case 'invalid':
        findings.add(payload.issue);
        receipt.outcome = payload.status;
        if (payload.status === 'missing') totals.missingParts++;
        else totals.invalidParts++;
        break;
      case 'calendar':
        totals.decodedParts++;
        calendar = auditCalendar(payload.value, group, issue => {
          findings.add({ ...issue, at: 'parts[' + part.index + ']' + issue.at });
        });
        break;
      case 'trips': {
        totals.decodedParts++;
        // A catalogue can be absent even when later trip shards are available.
        // Track trip IDs only across this source and region.
        tripAudit ??= new TripAudit(calendar, { maxIssues: 0, onIssue: issue => findings.add(issue) });
        const result = tripAudit.auditPart({
          partIndex: part.index,
          tripCount: part.tripCount,
          feedStart: group.feedStart,
          feedEnd: group.feedEnd,
        }, payload.rows);
        receipt.rowsDecoded = result.parsedRows;
        totals.decodedRows += result.parsedRows;
        totals.tripObjects += result.tripRows;
        totals.rowsWithErrors += result.rowsWithErrors;
        totals.rowsWithWarnings += result.rowsWithWarnings;
        totals.stopTimeEntries += result.stopTimes;
        totals.unknownWheelchairTrips += result.unknownWheelchairTrips;
        totals.afterMidnightTrips += result.afterMidnightTrips;
        totals.duplicateTripIds += result.duplicateTripIds;
        totals.untrackedTripIds += result.untrackedTripIds;
        break;
      }
    }
    receipt.errors = findings.errors - errorsBefore;
    receipt.warnings = findings.warnings - warningsBefore;
    parts.push(receipt);
  }
  return {
    sourceId: group.sourceId,
    regionId: group.regionId,
    provenance: group.provenance,
    feedStart: group.feedStart,
    feedEnd: group.feedEnd,
    status: status(findings.errors - errorsAtStart, findings.warnings - warningsAtStart, totals.missingParts > 0),
    totals,
    parts,
  };
}

/** Audit one local snapshot. Declared row totals are regional copies, never unique journeys. */
export async function auditSchedules(options: AuditOptions): Promise<AuditReport> {
  const findings = new Findings(options.maxExamples ?? 20);
  const totals = emptyTotals();
  const groups: GroupReport[] = [];
  const file = await readManifestFile(options.manifest);
  const manifest = { declaredParts: 0, eligibleGroups: 0, heldSources: 0 };
  if (!file.ok) findings.add(file.issue);
  else {
    const parsed = auditManifest(file.value);
    for (const issue of parsed.issues) findings.add(issue);
    manifest.declaredParts = parsed.declaredParts;
    manifest.eligibleGroups = parsed.groups.length;
    manifest.heldSources = parsed.heldSources;
    for (const group of parsed.groups) {
      if (options.source !== undefined && options.source !== group.sourceId) continue;
      if (options.region !== undefined && options.region !== group.regionId) continue;
      const result = await inspectGroup(group, options, findings);
      groups.push(result);
      for (const field of Object.keys(totals) as Array<keyof Totals>) totals[field] += result.totals[field];
    }
    if (!groups.length && (parsed.groups.length > 0 || !findings.errors)) {
      findings.add({ code: 'selection.empty', at: 'manifest', severity: 'warning' });
    }
  }
  return {
    version: 1,
    status: status(findings.errors, findings.warnings, totals.missingParts > 0 || groups.length === 0),
    selection: { source: options.source ?? null, region: options.region ?? null },
    manifest,
    totals,
    groups,
    findings: findings.report(),
  };
}
