import type { Issue } from "./common.ts";

export type Tier = 0 | 1 | 2 | 3 | 4 | "UNKNOWN";
export interface AuditPart {
  index: number;
  kind: "calendar" | "trips";
  sourceId: string;
  regionId: string;
  path: string;
  placement: "git" | "release";
  assetName?: string;
  bytes: number;
  sha256: string;
  tripCount: number;
}
export interface ScheduleGroup {
  sourceId: string;
  sourceName: string;
  regionId: string;
  provenance: { source: string; licence: string; retrievedOn: string; verificationTier: Tier };
  feedStart: string;
  feedEnd: string;
  calendar: AuditPart;
  trips: AuditPart[];
}
export interface ManifestAudit {
  groups: ScheduleGroup[];
  issues: Issue[];
  declaredParts: number;
  heldSources: number;
}

export const MAX_TRIP_ROWS = 100_000;
export const MAX_COMPRESSED_BYTES = 50_000_000;
const MAX_SOURCES = 4096;
const MAX_PARTS = 32_768;
const acceptedMetrolinxLicence = "Metrolinx Access and Use Agreement (accepted 2026-11-15)";
const acceptedMetrolinxUrl = "https://www.gotransit.com/en/partner-with-us/software-developers";

type Row = Record<string, unknown>;
type Source = Pick<ScheduleGroup, "sourceName" | "sourceId" | "provenance"> & { licenceUrl: string; at: string };
interface Draft {
  key: string;
  at: string;
  regionId: string;
  source: Source;
  rows: Array<{ part: AuditPart; start: string; end: string }>;
}
type Finding = (code: string, at: string, severity?: "error" | "warning") => void;

function record(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function plainLabel(value: unknown): value is string {
  return typeof value === "string" && value.length <= 300 && value.trim().length > 0
    && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function publicLicenceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isDate(value: unknown, compact: boolean): value is string {
  if (typeof value !== "string" || !(compact ? /^\d{8}$/ : /^\d{4}-\d\d-\d\d$/).test(value)) return false;
  const digits = value.replaceAll("-", "");
  if (digits.startsWith("0000")) return false;
  const isoDay = digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6);
  const time = Date.parse(isoDay + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === isoDay;
}

function tier(value: unknown): Tier | undefined {
  if (value === undefined || value === "UNKNOWN") return "UNKNOWN";
  if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4) return value;
  return undefined;
}

function withheld(id: string, name: string): boolean {
  const held = [id, name].some((item) => item.trim().toLowerCase().includes("miway"));
  return held || id === "metrolinx" || (id.startsWith("metrolinx-") && !["metrolinx-go", "metrolinx-up"].includes(id));
}

function inspectSources(inputs: unknown[], report: ManifestAudit, note: Finding) {
  const sources = new Map<string, Source>();
  const seen = new Set<string>();
  const held = new Set<string>();
  for (const [index, input] of inputs.entries()) {
    const at = "sources[" + index + "]";
    if (!record(input) || typeof input.sourceId !== "string" || input.sourceId.length > 100) {
      note("source.shape", at);
      continue;
    }
    const id = input.sourceId.toLowerCase();
    if (seen.has(id)) {
      sources.delete(id);
      note("source.duplicate", at + ".sourceId");
      continue;
    }
    seen.add(id);
    if (!identifier(input.sourceId) || !plainLabel(input.sourceName) || typeof input.inWebPack !== "boolean") {
      note("source.shape", at);
      continue;
    }
    if (!input.inWebPack || withheld(id, input.sourceName) || input.heldReason !== undefined) {
      held.add(id);
      report.heldSources++;
      if (input.inWebPack) note("source.held", at);
      continue;
    }
    const verificationTier = tier(input.verificationTier);
    if (!plainLabel(input.licence) || !publicLicenceUrl(input.licenceUrl) || !isDate(input.retrieved, false)
      || verificationTier === undefined
      || (id.startsWith("metrolinx-") && (input.licence !== acceptedMetrolinxLicence || input.licenceUrl !== acceptedMetrolinxUrl))) {
      note("source.provenance", at);
      continue;
    }
    sources.set(id, {
      at, sourceId: id, sourceName: input.sourceName, licenceUrl: input.licenceUrl,
      provenance: { source: id, licence: input.licence, retrievedOn: input.retrieved, verificationTier },
    });
  }
  return { sources, held };
}

/** Paths and release asset names are the two distinct names emitted by the v1 builder. */
export function canonicalLocation(row: Pick<AuditPart, "sourceId" | "regionId" | "path" | "placement" | "assetName" | "kind">): boolean {
  if (!identifier(row.sourceId) || !identifier(row.regionId) || typeof row.path !== "string" || row.path.length > 255) return false;
  const prefix = row.regionId + "/" + row.sourceId + "/";
  if (!row.path.startsWith(prefix)) return false;
  const file = row.path.slice(prefix.length);
  if (row.kind === "calendar" ? file !== "calendar.json.gz" : row.kind !== "trips" || !/^trips-\d{4,6}\.ndjson\.gz$/.test(file)) return false;
  if (row.kind === "trips") {
    const sequence = file.slice(6, -10);
    if (sequence !== String(Number(sequence)).padStart(4, "0")) return false;
  }
  if (row.placement === "git") return !row.sourceId.startsWith("metrolinx-") && row.assetName === undefined;
  return row.placement === "release" && row.assetName === row.sourceId + "-schedules-v1-" + row.regionId + "-" + file;
}

function parsePart(input: Row, index: number, draft: Draft, note: Finding): Draft["rows"][number] | undefined {
  const at = "parts[" + index + "]";
  const { kind, placement, bytes, tripCount, sha256 } = input;
  if ((kind !== "calendar" && kind !== "trips") || (placement !== "git" && placement !== "release")
    || typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_COMPRESSED_BYTES
    || typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256)
    || typeof tripCount !== "number" || !Number.isSafeInteger(tripCount) || (kind === "calendar" ? tripCount !== 0 : tripCount < 1 || tripCount > MAX_TRIP_ROWS)) {
    note("part.declaration", at);
    return undefined;
  }
  const { sourceId, provenance } = draft.source;
  if (typeof input.path !== "string" || (input.assetName !== undefined && typeof input.assetName !== "string")) {
    note("part.path", at);
    return undefined;
  }
  const part: AuditPart = {
    index, sourceId, regionId: draft.regionId, kind, placement, bytes, tripCount, sha256, path: input.path,
    ...(input.assetName === undefined ? {} : { assetName: input.assetName }),
  };
  if (!canonicalLocation(part)) {
    note("part.path", at + ".path");
    return undefined;
  }
  if (input.licence !== provenance.licence || input.licenceUrl !== draft.source.licenceUrl || input.retrieved !== provenance.retrievedOn
    || (input.verificationTier !== undefined && input.verificationTier !== provenance.verificationTier)) {
    note("part.provenance", at);
    return undefined;
  }
  const { feedStart: start, feedEnd: end } = input;
  if ((start !== "UNKNOWN" && !isDate(start, true)) || (end !== "UNKNOWN" && !isDate(end, true))
    || (start !== "UNKNOWN" && end !== "UNKNOWN" && start > end)) {
    note("part.coverage", at);
    return undefined;
  }
  if (start === "UNKNOWN" || end === "UNKNOWN") note("part.coverage", at, "warning");
  return { part, start, end };
}

function finishGroup(draft: Draft, note: Finding): ScheduleGroup | undefined {
  const calendars = draft.rows.filter(({ part }) => part.kind === "calendar");
  if (calendars.length !== 1 || !calendars[0]) {
    note("group.calendar", draft.at);
    return undefined;
  }
  const { part: calendar, start: feedStart, end: feedEnd } = calendars[0];
  const trips = draft.rows.map(({ part }) => part).filter((part) => part.kind === "trips");
  if (!trips.length) {
    note("group.trips", draft.at);
    return undefined;
  }
  if (draft.rows.some((row) => row.start !== feedStart || row.end !== feedEnd)) {
    note("group.coverage", draft.at);
    return undefined;
  }
  const sequence = (p: AuditPart) => Number(p.path.slice(p.path.lastIndexOf("trips-") + 6, -10));
  trips.sort((a, b) => sequence(a) - sequence(b));
  if (trips.some((part, position) => sequence(part) !== position)) {
    note("group.sequence", draft.at);
    return undefined;
  }
  const { sourceId, sourceName, provenance } = draft.source;
  return { sourceId, sourceName, regionId: draft.regionId, provenance, feedStart, feedEnd, calendar, trips };
}

export function auditManifest(input: unknown): ManifestAudit {
  const report: ManifestAudit = { groups: [], issues: [], declaredParts: 0, heldSources: 0 };
  const note: Finding = (code, at, severity = "error") => { report.issues.push({ code, at, severity }); };
  if (!record(input) || input.version !== 1 || !Array.isArray(input.sources) || !Array.isArray(input.parts)) {
    note("manifest.shape", "manifest");
    return report;
  }
  report.declaredParts = input.parts.length;
  if (input.parts.length > MAX_PARTS || input.sources.length > MAX_SOURCES) {
    note("manifest.limit", "manifest");
    return report;
  }
  if (!input.sources.length) note("manifest.shape", "sources");
  const { sources, held } = inspectSources(input.sources, report, note);
  const drafts = new Map<string, Draft>();
  const quarantined = new Set<string>();
  const badSources = new Set<string>();
  const referenced = new Set<string>();
  const claims = new Map<string, string>();
  for (const [index, row] of input.parts.entries()) {
    const at = "parts[" + index + "]";
    if (!record(row)) {
      note("part.declaration", at);
      continue;
    }
    const rawSource = typeof row.sourceId === "string" ? row.sourceId.toLowerCase() : "";
    const rawRegion = typeof row.regionId === "string" ? row.regionId.toLowerCase() : "";
    const key = rawRegion + "/" + rawSource;
    // A misplaced shard can identify two different groups through its path and
    // metadata. Neither group can be called complete until those claims agree.
    if (typeof row.path === "string" && row.path.length <= 255) {
      const [pathRegion, pathSource, filename, extra] = row.path.toLowerCase().split("/");
      if (extra === undefined && filename && identifier(pathRegion) && identifier(pathSource)) {
        const pathKey = pathRegion + "/" + pathSource;
        if (pathKey !== key) quarantined.add(pathKey);
      }
    }
    // Collect even malformed declarations before reading any group. A broken alias
    // must not allow its earlier owner to pass on a case-insensitive filesystem.
    for (const field of ["path", "assetName"] as const) {
      const name = row[field];
      if (typeof name !== "string" || name.length > 512) continue;
      const claim = field + "/" + name.toLowerCase();
      const owner = claims.get(claim);
      if (owner !== undefined) {
        quarantined.add(owner);
        quarantined.add(key);
        note("part.duplicate", at + "." + field);
      } else {
        claims.set(claim, key);
      }
    }
    const source = sources.get(rawSource);
    if (!source || !identifier(row.sourceId)) {
      note(held.has(rawSource) ? "source.held" : "part.source", at + ".sourceId");
      quarantined.add(key);
      continue;
    }
    referenced.add(rawSource);
    if (!identifier(row.regionId)) {
      if (identifier(rawRegion)) quarantined.add(key);
      else badSources.add(rawSource);
      note("part.declaration", at + ".regionId");
      continue;
    }
    let draft = drafts.get(key);
    if (!draft) {
      draft = { key, at, regionId: row.regionId, source, rows: [] };
      drafts.set(key, draft);
    }
    const parsed = parsePart(row, index, draft, note);
    if (parsed) draft.rows.push(parsed);
    else quarantined.add(key);
  }
  for (const draft of drafts.values()) {
    if (quarantined.has(draft.key) || badSources.has(draft.source.sourceId)) continue;
    const group = finishGroup(draft, note);
    if (group) report.groups.push(group);
  }
  for (const source of sources.values()) {
    if (!referenced.has(source.sourceId)) note("source.empty", source.at);
  }
  return report;
}
