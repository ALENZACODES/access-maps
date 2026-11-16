import type { ReleaseEvidence, SourceEvidence, SurfaceEvidence } from "./evidence-contract.js";
import { auditRelease, type AuditOptions, type AuditResult } from "./evidence-audit.js";

export type ChangeSeverity = "blocking" | "review" | "informational";
export type ChangeKind =
  | "source-added" | "source-removed" | "source-state" | "source-origin"
  | "source-licence" | "source-permission" | "source-date" | "source-notice"
  | "source-metadata" | "surface-added" | "surface-removed"
  | "surface-sources" | "surface-locale" | "surface-accessibility"
  | "surface-offline" | "surface-date" | "surface-metadata" | "new-finding"
  | "resolved-finding";

export interface EvidenceChange {
  readonly kind: ChangeKind;
  readonly severity: ChangeSeverity;
  readonly entityId: string;
  readonly field: string;
  readonly before: string;
  readonly after: string;
  readonly affectedSurfaces: readonly string[];
}

export interface ComparisonResult {
  readonly beforeReleaseId: string;
  readonly afterReleaseId: string;
  readonly blocked: boolean;
  readonly changes: readonly EvidenceChange[];
  readonly newlyBlockingCodes: readonly string[];
  readonly resolvedBlockingCodes: readonly string[];
  readonly beforeAudit: AuditResult;
  readonly afterAudit: AuditResult;
}

const SOURCE_FIELDS = [
  "family", "name", "sourceUrl", "licenceUrl", "licenceName", "licenceEvidence",
  "redistributionPermission", "acquisitionDate", "datasetDate", "termsReviewedDate",
  "attribution", "notes", "state",
] as const;
const SURFACE_FIELDS = [
  "name", "mode", "sourceIds", "locale", "offline", "creditedNearMap",
  "keyboardAccessible", "screenReaderLabelled", "minimumTargetPx", "publicationDate",
] as const;

type SourceField = typeof SOURCE_FIELDS[number];
type SurfaceField = typeof SURFACE_FIELDS[number];

function sourceFieldKind(field: SourceField): ChangeKind {
  switch (field) {
    case "state": return "source-state";
    case "sourceUrl": return "source-origin";
    case "licenceUrl":
    case "licenceName":
    case "licenceEvidence": return "source-licence";
    case "redistributionPermission": return "source-permission";
    case "attribution": return "source-notice";
    case "acquisitionDate":
    case "datasetDate":
    case "termsReviewedDate": return "source-date";
    default: return "source-metadata";
  }
}

function surfaceFieldKind(field: SurfaceField): ChangeKind {
  switch (field) {
    case "sourceIds": return "surface-sources";
    case "locale": return "surface-locale";
    case "offline": return "surface-offline";
    case "creditedNearMap":
    case "keyboardAccessible":
    case "screenReaderLabelled":
    case "minimumTargetPx": return "surface-accessibility";
    case "publicationDate": return "surface-date";
    default: return "surface-metadata";
  }
}

function display(value: unknown): string {
  if (Array.isArray(value)) return [...value].sort().join(", ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function severityForSource(
  field: SourceField,
  before: SourceEvidence,
  after: SourceEvidence,
): ChangeSeverity {
  if (field === "notes" || field === "name") return "informational";
  if (field === "datasetDate") return "review";
  if (field === "termsReviewedDate" || field === "acquisitionDate") return "review";
  if (field === "state") {
    return before.state === "included" && after.state !== "included" ? "blocking" : "review";
  }
  if (field === "licenceEvidence" || field === "redistributionPermission") {
    return before[field] === "YES" && after[field] !== "YES" ? "blocking" : "review";
  }
  if (field === "licenceUrl" || field === "sourceUrl" || field === "attribution") {
    return after[field] === "UNKNOWN" || after[field] === "" ? "blocking" : "review";
  }
  return "review";
}

function severityForSurface(
  field: SurfaceField,
  before: SurfaceEvidence,
  after: SurfaceEvidence,
): ChangeSeverity {
  if (field === "name" || field === "publicationDate") return "informational";
  if (field === "sourceIds" || field === "locale" || field === "mode") return "review";
  if (field === "minimumTargetPx") {
    if (after.minimumTargetPx === "UNKNOWN") return "blocking";
    if (before.minimumTargetPx === "UNKNOWN") return "review";
    return after.minimumTargetPx < before.minimumTargetPx ? "blocking" : "review";
  }
  return before[field] === "YES" && after[field] !== "YES" ? "blocking" : "review";
}

function linkedSurfaces(release: ReleaseEvidence, sourceId: string): string[] {
  return release.surfaces.filter((surface) => surface.sourceIds.includes(sourceId))
    .map((surface) => surface.id).sort();
}

function change(
  kind: ChangeKind,
  severity: ChangeSeverity,
  entityId: string,
  field: string,
  before: string,
  after: string,
  affectedSurfaces: readonly string[],
): EvidenceChange {
  return { kind, severity, entityId, field, before, after, affectedSurfaces };
}

function compareSources(
  before: ReleaseEvidence,
  after: ReleaseEvidence,
): EvidenceChange[] {
  const changes: EvidenceChange[] = [];
  const oldEntries = new Map(before.sources.map((source) => [source.id, source] as const));
  const nextEntries = new Map(after.sources.map((source) => [source.id, source] as const));
  for (const [id, prior] of oldEntries) {
    const next = nextEntries.get(id);
    const affectedSurfaces = [...new Set([
      ...linkedSurfaces(before, id), ...linkedSurfaces(after, id),
    ])].sort();
    if (!next) {
      changes.push(change("source-removed", prior.state === "included" ? "blocking" : "review",
        id, "source", "present", "removed", affectedSurfaces));
      continue;
    }
    for (const field of SOURCE_FIELDS) {
      const oldValue = display(prior[field]);
      const newValue = display(next[field]);
      if (oldValue !== newValue) {
        changes.push(change(sourceFieldKind(field), severityForSource(field, prior, next),
          id, field, oldValue, newValue, affectedSurfaces));
      }
    }
  }
  for (const [id, source] of nextEntries) {
    if (!oldEntries.has(id)) {
      changes.push(change("source-added", "review", id, "source", "absent", "present",
        linkedSurfaces(after, source.id)));
    }
  }
  return changes;
}

function compareSurfaces(
  before: ReleaseEvidence,
  after: ReleaseEvidence,
): EvidenceChange[] {
  const changes: EvidenceChange[] = [];
  const oldEntries = new Map(before.surfaces.map((surface) => [surface.id, surface] as const));
  const nextEntries = new Map(after.surfaces.map((surface) => [surface.id, surface] as const));
  for (const [id, prior] of oldEntries) {
    const next = nextEntries.get(id);
    if (!next) {
      changes.push(change("surface-removed", "review", id, "surface", "present", "removed", [id]));
      continue;
    }
    for (const field of SURFACE_FIELDS) {
      const oldValue = display(prior[field]);
      const newValue = display(next[field]);
      if (oldValue !== newValue) {
        changes.push(change(surfaceFieldKind(field), severityForSurface(field, prior, next),
          id, field, oldValue, newValue, [id]));
      }
    }
  }
  for (const [id] of nextEntries) {
    if (!oldEntries.has(id)) {
      changes.push(change("surface-added", "review", id, "surface", "absent", "present", [id]));
    }
  }
  return changes;
}

function findingKey(code: string, path: string): string {
  return `${code}\u0000${path}`;
}

function compareFindings(before: AuditResult, after: AuditResult): EvidenceChange[] {
  const changes: EvidenceChange[] = [];
  const old = new Map(before.findings.filter((f) => f.level === "block")
    .map((item) => [findingKey(item.code, item.path), item] as const));
  const next = new Map(after.findings.filter((f) => f.level === "block")
    .map((item) => [findingKey(item.code, item.path), item] as const));
  for (const [key, item] of next) {
    if (!old.has(key)) {
      changes.push(change("new-finding", "blocking", item.sourceId ?? item.surfaceId ?? "release",
        item.path, "absent", item.code, item.surfaceId ? [item.surfaceId] : []));
    }
  }
  for (const [key, item] of old) {
    if (!next.has(key)) {
      changes.push(change("resolved-finding", "informational", item.sourceId ?? item.surfaceId ?? "release",
        item.path, item.code, "resolved", item.surfaceId ? [item.surfaceId] : []));
    }
  }
  return changes;
}

/** Compare explicit releases; no unstated date, rights or accessibility assumptions. */
export function compareReleaseEvidence(
  before: ReleaseEvidence,
  after: ReleaseEvidence,
  options: AuditOptions = {},
): ComparisonResult {
  const beforeAudit = auditRelease(before, options);
  const afterAudit = auditRelease(after, options);
  const changes = [
    ...compareSources(before, after),
    ...compareSurfaces(before, after),
    ...compareFindings(beforeAudit, afterAudit),
  ].sort((a, b) => a.entityId.localeCompare(b.entityId) ||
    a.field.localeCompare(b.field) || a.kind.localeCompare(b.kind));
  return {
    beforeReleaseId: before.releaseId,
    afterReleaseId: after.releaseId,
    blocked: afterAudit.blocked || changes.some((item) => item.severity === "blocking"),
    changes,
    newlyBlockingCodes: changes.filter((item) => item.kind === "new-finding")
      .map((item) => item.after),
    resolvedBlockingCodes: changes.filter((item) => item.kind === "resolved-finding")
      .map((item) => item.before),
    beforeAudit,
    afterAudit,
  };
}

export function changesForSource(
  result: ComparisonResult,
  id: string,
): readonly EvidenceChange[] {
  return result.changes.filter((item) => item.entityId === id ||
    (item.field === "sourceIds" && (item.before.includes(id) || item.after.includes(id))));
}

export function changesForSurface(
  result: ComparisonResult,
  id: string,
): readonly EvidenceChange[] {
  return result.changes.filter((item) => item.entityId === id || item.affectedSurfaces.includes(id));
}

export function listBlockingChanges(result: ComparisonResult): readonly EvidenceChange[] {
  return result.changes.filter((item) => item.severity === "blocking");
}

export function distinctAffectedSurfaces(result: ComparisonResult): readonly string[] {
  return [...new Set(result.changes.flatMap((item) => [...item.affectedSurfaces]))].sort();
}

export function changedFields(result: ComparisonResult, entityId: string): readonly string[] {
  return [...new Set(result.changes.filter((item) => item.entityId === entityId)
    .map((item) => item.field))].sort();
}
