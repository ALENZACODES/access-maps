import { createHash } from "node:crypto";
import fieldsByTranche from "../../../schema/fields.json" with { type: "json" };

type Tranche = keyof typeof fieldsByTranche;
type JsonObject = Record<string, unknown>;
type VerificationTier = 0 | 1 | 2 | 3 | 4;

export type EvidenceReason =
  | "licence-mismatch"
  | "tier-mismatch"
  | "date-mismatch"
  | "credit-mismatch"
  | "source-held"
  | "derived-copy"
  | "unsupported-value";

export interface EvidenceCase {
  id: string;
  revision: string;
  tranche: Tranche;
  field: string;
  source: string;
  licence: string;
  retrievedOn: string;
  verificationTier: VerificationTier;
  attribution: string;
  value: string;
  state: "unknown" | "held" | "recorded";
  reasons: EvidenceReason[];
}

type LicenceId = "ODbL-1.0" | "OGL-Toronto-1.0";

const terms: Record<LicenceId, { credit: string; url: string }> = {
  "ODbL-1.0": {
    credit: "© OpenStreetMap contributors",
    url: "https://opendatacommons.org/licenses/odbl/1-0/",
  },
  "OGL-Toronto-1.0": {
    credit: "Contains information licensed under the Open Government Licence – Toronto.",
    url: "https://open.toronto.ca/open-data-licence/",
  },
};

// The offline reader can carry these exact notices. Additional terms need an
// explicit presentation contract before records from another source can enter.
const torontoMunicipal = new Set([
  "toronto-accessible-parking-stalls",
  "toronto-community-centre-washrooms",
  "toronto-crem-washrooms",
  "toronto-drinking-fountains",
  "toronto-library-branches",
  "toronto-park-washrooms",
  "toronto-parks-recreation-facilities",
  "toronto-pedestrian-network",
  "toronto-street-washrooms",
  "toronto-traffic-signals",
]);

interface SourcePolicy {
  kind: "osm" | "gtfs" | "municipal";
  licence: LicenceId;
  tier: VerificationTier;
}

function policyFor(source: string): SourcePolicy {
  if (source === "osm-ontario") return { kind: "osm", licence: "ODbL-1.0", tier: 0 };
  if (source === "gtfs-ttc") return { kind: "gtfs", licence: "OGL-Toronto-1.0", tier: 1 };
  if (torontoMunicipal.has(source)) return { kind: "municipal", licence: "OGL-Toronto-1.0", tier: 0 };
  throw new Error("evidence/source-unsupported");
}

const binary = ["yes", "no"];
const boarding = [
  "entrance_accessible",
  "entrance_not_accessible",
  "accessible_path",
  "no_accessible_path",
  "some_vehicles_accessible",
  "boarding_not_possible",
];

// A single pack row can also contain names, URLs, phone-like strings and
// location descriptions. Project just the selected field's bounded vocabulary.
const vocabulary = new Map<string, readonly string[]>([
  ["wheelchair", [...binary, "limited", "designated"]],
  ["ramp", binary],
  ["ramp_wheelchair", binary],
  ["automatic_door", binary],
  ["tactile_paving", [...binary, "partial"]],
  ["handrail", binary],
  ["lit", binary],
  ["hearing_loop", binary],
  ["braille", binary],
  ["speech_output", binary],
  ["adult_changing_table", binary],
  ["changing_table", binary],
  ["wheelchair_boarding", boarding],
  ["step_count", []],
  ["stair_count", []],
]);

const evidenceKeys = new Set([
  "value", "source_id", "licence", "retrieved_at", "tier", "source_key", "raw", "derived",
]);

function object(input: unknown, error: string): JsonObject {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(error);
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== null && prototype !== Object.prototype) throw new Error(error);
  return input as JsonObject;
}

function string(input: unknown, error: string, limit = 2048): string {
  if (typeof input !== "string" || !input.trim() || input.length > limit) throw new Error(error);
  return input;
}

function calendarDay(input: unknown): string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(input)) {
    throw new Error("evidence/date-invalid");
  }
  const parsed = new Date(input + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || !parsed.toISOString().startsWith(input + "T")) {
    throw new Error("evidence/date-invalid");
  }
  return input;
}

function tier(input: unknown): VerificationTier {
  if (input !== 0 && input !== 1 && input !== 2 && input !== 3 && input !== 4) {
    throw new Error("evidence/tier-invalid");
  }
  return input;
}

function optionalString(value: unknown, limit: number, error: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length > limit) throw new Error(error);
  return value;
}

function sequenceDigest(domain: string, parts: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify([domain, ...parts]), "utf8").digest("hex");
}

function registryIndex(input: unknown): Map<string, JsonObject> {
  const { sources } = object(input, "evidence/registry-invalid");
  if (!Array.isArray(sources) || sources.length > 8192) throw new Error("evidence/registry-invalid");
  const entries = new Map<string, JsonObject>();
  for (const item of sources) {
    const entry = object(item, "evidence/registry-invalid");
    const id = string(entry.id, "evidence/source-id-invalid", 128);
    if (entries.has(id)) throw new Error("evidence/source-ambiguous");
    entries.set(id, entry);
  }
  return entries;
}

interface SourceStamp {
  licence: string;
  retrievedOn: string;
  tier: VerificationTier;
  attribution: string;
  held: boolean;
  licenceUrl: string | null;
  origin: readonly (string | null)[];
}

function sourceStamp(entry: JsonObject, policy: SourcePolicy): SourceStamp {
  const name = string(entry.name, "evidence/source-name-invalid");
  if (/miway/i.test(name)) throw new Error("evidence/source-unsupported");
  const kind = string(entry.kind, "evidence/source-kind-invalid", 32);
  const notes = optionalString(entry.notes, 32768, "evidence/source-notes-invalid") ?? "";
  const tierNote = optionalString(entry.tier_note, 8192, "evidence/source-notes-invalid") ?? "";
  // Match the release builder's review flags while keeping publisher notes out
  // of portable files, even when fetching source metadata from the real registry.
  const termsFlag = /not been reconciled|revocable|legal review is still required|not treated as a settled open grant|held for legal review/i;
  return {
    licence: string(entry.licence_id, "evidence/licence-invalid", 256),
    retrievedOn: calendarDay(entry.retrieved_at),
    tier: tier(entry.tier),
    attribution: string(entry.attribution, "evidence/credit-invalid"),
    held: kind !== policy.kind || termsFlag.test(notes) || termsFlag.test(tierNote),
    licenceUrl: optionalString(entry.licence_url, 2048, "evidence/licence-url-invalid"),
    origin: [
      name, kind, optionalString(entry.url, 2048, "evidence/source-url-invalid"),
      optionalString(entry.download_url, 4096, "evidence/download-url-invalid"),
      optionalString(entry.licence_name, 512, "evidence/licence-name-invalid"),
    ],
  };
}

interface Selection {
  recordId: string;
  region: string;
  tranche: Tranche;
  fieldName: string;
  data: JsonObject;
}

function selectedField(input: unknown): Selection {
  const selection = object(input, "evidence/selection-invalid");
  const fieldName = string(selection.field, "evidence/field-invalid", 64);
  const record = object(selection.record, "evidence/record-invalid");
  const recordId = string(record.id, "evidence/record-id-invalid", 512);
  const region = string(record.region, "evidence/region-invalid", 20);
  if (region !== "unknown" && !/^[ns]\d{2}\.[05]_[ew]\d{3}\.[05]$/u.test(region)) {
    throw new Error("evidence/region-invalid");
  }
  const tranche = record.tranche;
  if (tranche !== "venue" && tranche !== "washroom" && tranche !== "transit" && tranche !== "path") {
    throw new Error("evidence/tranche-invalid");
  }
  if (!vocabulary.has(fieldName) || !fieldsByTranche[tranche].includes(fieldName)) {
    throw new Error("evidence/field-unsupported");
  }
  const fields = object(record.fields, "evidence/fields-invalid");
  if (!Object.hasOwn(fields, fieldName)) throw new Error("evidence/field-missing");
  const data = object(fields[fieldName], "evidence/field-invalid");
  if (Object.keys(data).some((key) => !evidenceKeys.has(key))) throw new Error("evidence/field-invalid");
  return { recordId, region, tranche, fieldName, data };
}

interface FieldStamp {
  licence: string;
  retrievedOn: string;
  tier: VerificationTier;
  value: string | number;
  raw: string | number | null;
  sourceKey: string | null;
  derived: boolean;
}

function scalar(value: unknown, error: string): string | number {
  if (typeof value === "string" && value.length <= 4096) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(error);
}

function fieldStamp(field: JsonObject): FieldStamp {
  if (field.derived !== undefined && typeof field.derived !== "boolean") {
    throw new Error("evidence/derived-invalid");
  }
  return {
    licence: string(field.licence, "evidence/licence-invalid", 256),
    retrievedOn: calendarDay(field.retrieved_at),
    tier: tier(field.tier),
    value: scalar(field.value, "evidence/value-invalid"),
    raw: field.raw == null ? null : scalar(field.raw, "evidence/raw-invalid"),
    sourceKey: optionalString(field.source_key, 512, "evidence/source-key-invalid"),
    derived: field.derived === true,
  };
}

function displayToken(name: string, value: string | number): string | null {
  if (value === "UNKNOWN") return value;
  if (name === "step_count" || name === "stair_count") {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 9999) {
      return String(value);
    }
    return typeof value === "string" && /^(?:0|[1-9]\d{0,3})$/u.test(value) ? value : null;
  }
  return typeof value === "string" && vocabulary.get(name)?.includes(value) ? value : null;
}

function recordBelongsToSource(recordId: string, tranche: Tranche, sourceId: string): boolean {
  if (sourceId === "osm-ontario") {
    if (tranche === "washroom" && /^osm:toilets-at:(node|way|relation)\/[1-9]\d*$/u.test(recordId)) return true;
    return tranche !== "transit" && /^osm:(node|way|relation)\/[1-9]\d*$/u.test(recordId);
  }
  const prefix = sourceId === "gtfs-ttc" ? "gtfs:gtfs-ttc:" : sourceId + ":";
  if (!recordId.startsWith(prefix) || recordId.length === prefix.length) return false;
  if (sourceId !== "gtfs-ttc") return true;
  const pathway = recordId.startsWith(prefix + "pathway:");
  return pathway ? tranche === "path" && recordId.length > prefix.length + 8 : tranche === "transit";
}

function evidenceCase(selection: Selection, sources: ReadonlyMap<string, JsonObject>): EvidenceCase {
  const { fieldName, recordId, region, tranche, data } = selection;
  const sourceId = string(data.source_id, "evidence/source-id-invalid", 128);
  const policy = policyFor(sourceId);
  const source = sources.get(sourceId);
  if (!source) throw new Error("evidence/source-missing");
  const stamp = sourceStamp(source, policy);
  if (!recordBelongsToSource(recordId, tranche, sourceId)) throw new Error("evidence/record-source-mismatch");
  const field = fieldStamp(data);
  const token = displayToken(fieldName, field.value);
  const reasons: EvidenceReason[] = [];
  const notice = terms[policy.licence];
  if (field.licence !== policy.licence || stamp.licence !== policy.licence ||
      (stamp.licenceUrl !== null && stamp.licenceUrl !== notice.url)) {
    reasons.push("licence-mismatch");
  }
  if (field.tier !== policy.tier || stamp.tier !== policy.tier) reasons.push("tier-mismatch");
  if (field.retrievedOn !== stamp.retrievedOn) reasons.push("date-mismatch");
  if (stamp.attribution !== notice.credit) reasons.push("credit-mismatch");
  if (stamp.held) reasons.push("source-held");
  if (field.derived) reasons.push("derived-copy");
  if (token === null) reasons.push("unsupported-value");

  const id = "c-" + sequenceDigest("maps.review.case.v1", [sourceId, tranche, recordId, fieldName]).slice(0, 32);
  // The tuple order is part of the fingerprint contract. Formatting, JSON
  // member order and unrelated fields on the row must never stale a ballot.
  const revision = sequenceDigest("maps.review.evidence.v1", [
    id, region, sourceId, tranche, fieldName, field.value, field.raw, field.sourceKey,
    field.derived, field.licence, field.retrievedOn, field.tier,
    stamp.origin, stamp.licence, stamp.licenceUrl, stamp.retrievedOn, stamp.tier, stamp.attribution, reasons,
  ]);

  return {
    id,
    revision,
    tranche,
    field: fieldName,
    source: sourceId,
    licence: Object.hasOwn(terms, field.licence) ? field.licence : "UNKNOWN",
    retrievedOn: field.retrievedOn,
    verificationTier: field.tier,
    attribution: notice.credit,
    value: reasons.length === 0 && token !== null ? token : "UNKNOWN",
    state: reasons.length > 0 ? "held" : token === "UNKNOWN" ? "unknown" : "recorded",
    reasons,
  };
}

export interface LocatedEvidence {
  /** One-based position in the coordinator's local selections array. */
  selectionNumber: number;
  evidence: EvidenceCase;
}

/** Bind the local source-row selection order to its portable review case. Only
 * the coordinator needs this index. No place identifiers leave the source file. */
export function locateReviewEvidence(registry: unknown, selections: unknown): LocatedEvidence[] {
  const sources = registryIndex(registry);
  if (!Array.isArray(selections) || selections.length > 4096) throw new Error("evidence/selections-invalid");
  const seen = new Set<string>();
  const located: LocatedEvidence[] = [];
  for (const [index, selection] of selections.entries()) {
    const evidence = evidenceCase(selectedField(selection), sources);
    if (seen.has(evidence.id)) throw new Error("evidence/case-ambiguous");
    seen.add(evidence.id);
    located.push({ selectionNumber: index + 1, evidence });
  }
  return located;
}

/** Project selected pack FieldValues into metadata for offline review. A
 * malformed selection rejects the batch to prevent a silent partial intake. */
export function buildReviewEvidence(registry: unknown, selections: unknown): EvidenceCase[] {
  const cases = locateReviewEvidence(registry, selections).map(row => row.evidence);
  return cases.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}
