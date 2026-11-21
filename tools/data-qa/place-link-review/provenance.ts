import {
  metrolinxAuaLegendEn, metrolinxOglLineEn,
} from "../../../packages/timetables/src/index.ts";
import transitTerms from "../../../packages/timetables/src/licence-allowlist.json" with { type: "json" };

export const SOURCE_ISSUES = [
  "missing-declaration", "duplicate-declaration", "excluded-source", "terms-held",
  "incomplete-name", "incomplete-licence", "invalid-source-url", "invalid-licence-url",
  "invalid-retrieval-date", "invalid-tier", "incomplete-attribution", "invalid-policy-notes",
  "incorrect-osm-credit", "special-source-terms", "invalid-kind",
] as const;

export type SourceIssue = typeof SOURCE_ISSUES[number];
export type RegistryTier = 0 | 1 | 2 | 3 | 4;
export type RegistryStatus = "included" | "held" | "unknown";

export interface SourceEvidence {
  readonly sourceId: string;
  readonly sourceName: string | null;
  readonly licence: string | null;
  readonly licenceUrl: string | null;
  readonly sourceUrl: string | null;
  readonly attribution: string | null;
  readonly retrievedOn: string | null;
  readonly verificationTier: RegistryTier | null;
  /** 'included' means the registry metadata passed review. Record-level coverage is separate. */
  readonly status: RegistryStatus;
  readonly issues: readonly SourceIssue[];
}

export type SourceCatalogue = ReadonlyMap<string, SourceEvidence>;

const sourceKinds = new Set(["osm", "gtfs", "gtfs-rt", "municipal", "provincial", "federal", "aggregator"]);
const heldTerms = /not been reconciled|revocable|legal review is still required|not treated as a settled open grant|held for legal review/i;
const ltcEnglish = "Transit data is available from London Transit Commission under its Terms of Use";
const ltcFrench = "Les données de transport en commun sont disponibles auprès de la Commission de transport de London : elles sont offertes aux termes de ses conditions d’utilisation.";
const controls = /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/u;
const placeholder = /^(?:unknown|inconnue?|n\/?a|null|undefined|tbd|unclear)$/iu;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function own(row: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(row, key) ? row[key] : undefined;
}

function id(value: unknown): string {
  if (typeof value !== "string" || value.length > 160 || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u.test(value)) {
    throw new TypeError("registry-source-id");
  }
  return value;
}

function printable(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value ||
      placeholder.test(value) || controls.test(value)) return null;
  return value;
}

function publicUrl(value: unknown): string | null {
  const raw = printable(value);
  if (!raw || !/^https?:\/\//iu.test(raw) || /[\s\\]/u.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password) return null;
    // Dataset queries and document anchors can be public. Authentication parameters
    // also occur in fragments, which still travel with an exported citation.
    const sensitive = /^(?:(?:access|refresh|id|auth)[_-]?token|token|api[_-]?key|client[_-]?secret|auth(?:orization)?|password|sig(?:nature)?|credential|x-amz-.+|x-goog-.+)$/iu;
    const fragment = url.hash.slice(1);
    const routedQuery = fragment.slice(fragment.indexOf("?") + 1);
    for (const params of [url.searchParams, new URLSearchParams(fragment), new URLSearchParams(routedQuery)]) {
      for (const key of params.keys()) if (sensitive.test(key)) return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function date(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith("0000-")) return null;
  const parsed = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? value : null;
}

function tier(value: unknown): RegistryTier | null {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

function excluded(value: string): boolean {
  return value.toLowerCase().includes("miway");
}

function freeze(evidence: SourceEvidence): SourceEvidence {
  Object.freeze(evidence.issues);
  return Object.freeze(evidence);
}

function noDeclaration(sourceId: string, issue: "missing-declaration" | "duplicate-declaration", held = false): SourceEvidence {
  const denied = excluded(sourceId);
  return freeze({
    sourceId, sourceName: null, licence: null, licenceUrl: null, sourceUrl: null,
    attribution: null, retrievedOn: null, verificationTier: null,
    status: denied || held ? "held" : "unknown",
    issues: denied ? [issue, "excluded-source"] : [issue],
  });
}

function transitPolicyMatches(row: Record<string, unknown>, source: SourceEvidence): boolean {
  const isLtc = source.sourceId === "gtfs-ltc";
  if (!isLtc && !source.sourceId.startsWith("metrolinx-")) return true;
  const terms = transitTerms.find(entry => entry.sourceId === (isLtc ? "ltc" : source.sourceId));
  if (!terms || !source.attribution || !source.licence ||
      (source.licence !== terms.licence && own(row, "licence_name") !== terms.licence) ||
      source.licenceUrl !== terms.licenceUrl) return false;
  if (isLtc) {
    return source.attribution.includes(ltcEnglish) && source.attribution.includes(ltcFrench) &&
      source.attribution.includes(terms.licenceUrl) && !/logo|crest|mark|endors/iu.test(source.attribution);
  }
  return source.retrievedOn === terms.retrieved && source.attribution.includes(metrolinxAuaLegendEn) &&
    source.attribution.includes(metrolinxOglLineEn);
}

function parseRow(row: Record<string, unknown>): SourceEvidence {
  const sourceId = id(own(row, "id"));
  const sourceName = printable(own(row, "name"));
  const licence = printable(own(row, "licence_id"));
  const licenceUrl = publicUrl(own(row, "licence_url"));
  const sourceUrl = publicUrl(own(row, "url"));
  let attribution = printable(own(row, "attribution"));
  const retrievedOn = date(own(row, "retrieved_at"));
  const verificationTier = tier(own(row, "tier"));
  const kind = own(row, "kind");
  const issues: SourceIssue[] = [];
  if (excluded(sourceId) || excluded(sourceName ?? "")) issues.push("excluded-source");
  // Notes influence admission, but their text (including contact/operational data) stays local.
  const notes = [own(row, "notes"), own(row, "tier_note")];
  if (notes.some(note => typeof note === "string" && heldTerms.test(note))) issues.push("terms-held");
  if (notes.some(note => note !== undefined && typeof note !== "string")) issues.push("invalid-policy-notes");
  if (!sourceName) issues.push("incomplete-name");
  if (!licence) issues.push("incomplete-licence");
  if (!sourceUrl) issues.push("invalid-source-url");
  if (!licenceUrl) issues.push("invalid-licence-url");
  if (!retrievedOn) issues.push("invalid-retrieval-date");
  if (verificationTier === null) issues.push("invalid-tier");
  if (!attribution) issues.push("incomplete-attribution");
  if (typeof kind !== "string" || !sourceKinds.has(kind)) issues.push("invalid-kind");
  if ((kind === "osm" || sourceId === "osm-ontario") && attribution !== "© OpenStreetMap contributors") {
    issues.push("incorrect-osm-credit");
    attribution = null;
  }

  const evidence: SourceEvidence = {
    sourceId, sourceName, licence, licenceUrl, sourceUrl, attribution,
    retrievedOn, verificationTier, status: "unknown", issues,
  };
  if (!transitPolicyMatches(row, evidence)) issues.push("special-source-terms");
  let status: RegistryStatus = issues.length ? "unknown" : "included";
  if (issues.includes("terms-held") || issues.includes("excluded-source")) status = "held";
  return freeze({ ...evidence, status });
}

/** Parse both archived and candidate registry shapes without mutating the input. */
export function readProvenance(input: unknown): SourceCatalogue {
  if (!object(input)) throw new TypeError("registry-shape");
  const rows = own(input, "sources");
  if (!Array.isArray(rows)) throw new TypeError("registry-sources");
  const result = new Map<string, SourceEvidence>();
  for (const row of rows) {
    if (!object(row)) throw new TypeError("registry-source");
    const evidence = parseRow(row);
    const previous = result.get(evidence.sourceId);
    if (previous) {
      // Do not publish a declaration chosen arbitrarily from a duplicate.
      const held = previous.status === "held" || evidence.status === "held";
      result.set(evidence.sourceId, noDeclaration(evidence.sourceId, "duplicate-declaration", held));
    } else {
      result.set(evidence.sourceId, evidence);
    }
  }
  return result;
}

/** Return one evidence row per distinct requested source, including missing declarations. */
export function resolveSources(catalogue: SourceCatalogue, sourceIds: Iterable<string>): SourceEvidence[] {
  const ids = new Set<string>();
  for (const sourceId of sourceIds) ids.add(id(sourceId));
  return [...ids].sort().map(sourceId => catalogue.get(sourceId) ?? noDeclaration(sourceId, "missing-declaration"));
}

export function canDiscloseSources(catalogue: SourceCatalogue, sourceIds: Iterable<string>): boolean {
  let seen = false;
  for (const sourceId of sourceIds) {
    if (catalogue.get(sourceId)?.status !== "included" || excluded(sourceId)) return false;
    seen = true;
  }
  return seen;
}

const comparedFields = [
  "sourceName", "licence", "licenceUrl", "sourceUrl", "attribution", "retrievedOn",
  "verificationTier", "status", "issues",
] as const;
export type SourceField = typeof comparedFields[number];
export type SourceChangeKind = "added" | "removed" | "held" | "restored" | "changed";

export interface SourceChange {
  sourceId: string;
  kind: SourceChangeKind;
  fields: SourceField[];
  previous: SourceEvidence | null;
  candidate: SourceEvidence | null;
}

function fieldChanged(field: SourceField, a: SourceEvidence, b: SourceEvidence): boolean {
  if (field === "issues") {
    return a.issues.length !== b.issues.length || a.issues.some((issue, index) => issue !== b.issues[index]);
  }
  return a[field] !== b[field];
}

/** Compare catalogue declarations only for the supplied scope, including releases with no link edits. */
export function compareSources(
  previous: SourceCatalogue, candidate: SourceCatalogue, sourceIds: Iterable<string>,
): SourceChange[] {
  const changes: SourceChange[] = [];
  const scope = new Set<string>();
  for (const sourceId of sourceIds) scope.add(id(sourceId));
  for (const sourceId of [...scope].sort()) {
    const before = previous.get(sourceId) ?? null;
    const after = candidate.get(sourceId) ?? null;
    if (!before && !after) continue;
    if (!before || !after) {
      changes.push({ sourceId, previous: before, candidate: after, kind: after ? "added" : "removed", fields: [] });
      continue;
    }
    const fields = comparedFields.filter(field => fieldChanged(field, before, after));
    if (!fields.length) continue;
    let kind: SourceChangeKind = "changed";
    if (after.status === "held" && before.status !== "held") kind = "held";
    if (before.status !== "included" && after.status === "included") kind = "restored";
    changes.push({ sourceId, kind, fields, previous: before, candidate: after });
  }
  return changes;
}
