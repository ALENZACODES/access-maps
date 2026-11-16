/** Places shell adapter. Facts and source metadata come only from the web pack. */
import type { FieldValue, PackRecord, PackSource, PackSourceEntry, PlaceDetail, Tranche } from "./pack-types.js";

export type { FieldValue, PackManifest, PackRecord, PackSource, PackSourceEntry, PlaceDetail, Tranche } from "./pack-types.js";
export { placesMessages } from "./messages.js";

export const SHELL_CONTRACT_VERSION = "1.2.0";
export const UNKNOWN = "UNKNOWN";
export const DEFAULT_LIMIT = 50;
export const PLACE_TRANCHES: Tranche[] = ["venue", "washroom", "transit"];

export interface PlacesContext {
  locale: "en" | "fr";
  offline: boolean;
  nowIso: string;
  /** Coordinates obtained with the person's permission for this search only. */
  near?: { lat: number; lon: number };
  /** Must be true before a caller may offer or use Near me. */
  geolocationGranted?: boolean;
}

export interface PlaceProvenance {
  source_name: string;
  source_url: string | null;
  licence: string;
  licence_url: string | null;
  source_date: string;
  retrieved_at: string;
  tier: 0 | 1 | 2 | 3 | 4;
  prototype_label: "SEEDED-OPEN-DATA" | "PROTOTYPE-UNVERIFIED";
  freshness: "unknown";
}

export interface PlaceHit {
  id: string;
  name: string;
  provenance: PlaceProvenance;
  attribution: string;
  category: string;
  city: string;
  tranche: "venue" | "washroom" | "transit";
  /** All sources contributing to this record, filtered to the published pack. */
  sources: PackSourceEntry[];
}

export interface ModuleResult<T> {
  moduleId: "places";
  availability: "ready";
  items: T[];
  messageKey: string;
  asOf: string | null;
  liveStatus: "unavailable";
  /** Counts results removed after the public pack's search, without logging a location. */
  truncated?: number;
  /** Whether the host may expose its Near me control. */
  nearMeAvailable?: boolean;
}

export type SkipReason = "name_unknown" | "source_not_registered" | "tier_without_evidence";
export interface SearchDiagnostics {
  skipped: Record<SkipReason, number>;
  truncated: number;
}

/** Lowercase, NFD, accents and punctuation removed, as in pack search indexes. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function fieldText(field: FieldValue | undefined): string {
  if (!field || field.value === null || field.value === UNKNOWN) return UNKNOWN;
  if (typeof field.value === "string") return field.value.trim() || UNKNOWN;
  if (typeof field.value === "number" || typeof field.value === "boolean") return String(field.value);
  return UNKNOWN;
}

function hasEvidence(field: FieldValue): boolean {
  return (typeof field.source_key === "string" && field.source_key.trim().length > 0) ||
    (field.raw !== undefined && field.raw !== null && String(field.raw).trim().length > 0);
}

function permittedName(record: PackRecord, sources: ReadonlyMap<string, PackSourceEntry>):
  | { field: FieldValue; source: PackSourceEntry; name: string }
  | SkipReason {
  const field = record.fields.name;
  const name = fieldText(field);
  if (!field || name === UNKNOWN) return "name_unknown";
  const source = sources.get(field.source_id);
  if (!source || !source.inWebPack || source.heldReason) return "source_not_registered";
  if (field.tier !== 0 && field.tier !== 1 && !hasEvidence(field)) return "tier_without_evidence";
  return { field, source, name };
}

function permittedSources(record: PackRecord, allowed: ReadonlyMap<string, PackSourceEntry>, source: PackSource): PackSourceEntry[] {
  const recordIds = new Set(Object.values(record.fields).map((field) => field?.source_id).filter((id): id is string => Boolean(id)));
  const entries = source.sourcesFor(record).filter((entry) => recordIds.has(entry.sourceId) && allowed.has(entry.sourceId));
  const found = new Set(entries.map((entry) => entry.sourceId));
  for (const id of recordIds) {
    if (allowed.has(id) && !found.has(id)) entries.push(allowed.get(id)!);
  }
  return entries;
}

function toHit(record: PackRecord, source: PackSource, allowed: ReadonlyMap<string, PackSourceEntry>): PlaceHit | SkipReason {
  const name = permittedName(record, allowed);
  if (typeof name === "string") return name;
  if (record.tranche !== "venue" && record.tranche !== "washroom" && record.tranche !== "transit") return "source_not_registered";
  return {
    id: record.id,
    name: name.name,
    tranche: record.tranche,
    provenance: {
      source_name: name.source.name,
      source_url: name.source.url ?? null,
      licence: name.field.licence,
      licence_url: name.source.licence === name.field.licence ? name.source.licenceUrl ?? null : null,
      source_date: name.field.retrieved_at,
      retrieved_at: name.field.retrieved_at,
      tier: name.field.tier,
      prototype_label: name.field.tier === 0 ? "SEEDED-OPEN-DATA" : "PROTOTYPE-UNVERIFIED",
      freshness: "unknown",
    },
    attribution: name.source.attribution,
    category: fieldText(record.fields.category),
    city: fieldText(record.fields.addr_city),
    sources: permittedSources(record, allowed, source),
  };
}

function asOf(items: Array<{ provenance: PlaceProvenance }>): string | null {
  return items.map((item) => item.provenance.source_date).filter(Boolean).sort().at(-1) ?? null;
}

function ready<T>(items: T[], key: string, date: string | null): ModuleResult<T> {
  return { moduleId: "places", availability: "ready", items, messageKey: key, asOf: date, liveStatus: "unavailable" };
}

function validNear(ctx: PlacesContext): { lat: number; lon: number } | undefined {
  if (!ctx.geolocationGranted || !ctx.near) return undefined;
  const { lat, lon } = ctx.near;
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat, lon } : undefined;
}

/** No global location listener, storage, telemetry or network geolocation endpoint. */
export function createPlacesModule(source: PackSource) {
  let diagnostics: SearchDiagnostics = {
    skipped: { name_unknown: 0, source_not_registered: 0, tier_without_evidence: 0 }, truncated: 0,
  };

  async function allowedSources(): Promise<Map<string, PackSourceEntry>> {
    const manifest = await source.manifest();
    return new Map(manifest.sources.filter((entry) => entry.inWebPack && !entry.heldReason).map((entry) => [entry.sourceId, entry]));
  }

  async function search(query: { text: string }, ctx: PlacesContext): Promise<ModuleResult<PlaceHit>> {
    const allowed = await allowedSources();
    const needle = fold(query.text);
    const near = validNear(ctx);
    diagnostics = { skipped: { name_unknown: 0, source_not_registered: 0, tier_without_evidence: 0 }, truncated: 0 };
    if (!needle) {
      return { ...ready<PlaceHit>([], "places.shellEnterText", null), nearMeAvailable: Boolean(ctx.geolocationGranted) };
    }
    // Search only the data client's public web pack. Coordinates are supplied transiently
    // in memory, only after consent, and are never persisted by this module.
    const indexed = await source.search(query.text, { ...(near ? { near } : {}), tranches: PLACE_TRANCHES, limit: DEFAULT_LIMIT });
    const hits: PlaceHit[] = [];
    const seen = new Set<string>();
    for (const indexedHit of indexed) {
      if (seen.has(indexedHit.id)) continue;
      seen.add(indexedHit.id);
      if (!PLACE_TRANCHES.includes(indexedHit.tranche)) continue;
      if (indexedHit.name === null || !fold(indexedHit.name)) {
        diagnostics.skipped.name_unknown += 1;
        continue;
      }
      if (!fold(indexedHit.name).includes(needle)) continue;
      const record = await source.get(indexedHit.id);
      if (!record || record.id !== indexedHit.id || record.tranche !== indexedHit.tranche) continue;
      const hit = toHit(record, source, allowed);
      if (typeof hit === "string") diagnostics.skipped[hit] += 1;
      else if (fold(hit.name).includes(needle)) hits.push(hit);
    }
    hits.sort((a, b) => a.name.localeCompare(b.name, ctx.locale) || a.id.localeCompare(b.id));
    diagnostics.truncated = Math.max(0, hits.length - DEFAULT_LIMIT);
    const items = hits.slice(0, DEFAULT_LIMIT);
    return {
      ...ready(items, items.length ? "places.shellResults" : "places.shellNoResults", asOf(items)),
      truncated: diagnostics.truncated,
      nearMeAvailable: Boolean(ctx.geolocationGranted),
    };
  }

  async function get(id: string, _ctx: PlacesContext): Promise<ModuleResult<PlaceDetail>> {
    const record = await source.get(id);
    if (!record || !PLACE_TRANCHES.includes(record.tranche)) return ready([], "places.shellNotFound", null);
    const allowed = await allowedSources();
    const nameField = record.fields.name;
    const nameSource = nameField && allowed.get(nameField.source_id);
    if (nameField && (!nameSource || (nameField.tier > 1 && !hasEvidence(nameField)))) {
      return ready([], "places.shellNotFound", null);
    }
    const sources = permittedSources(record, allowed, source);
    if (!sources.length) return ready([], "places.shellNotFound", null);
    // A detail view gets the original unchanged record; missing fields stay UNKNOWN.
    // Filter inaccessible / held-source fields before handing them to the detail view.
    const fields = Object.fromEntries(Object.entries(record.fields).filter(([, field]) =>
      !field || (allowed.has(field.source_id) && (field.tier <= 1 || hasEvidence(field)))));
    const detail: PlaceDetail = { id: record.id, name: fieldText(nameField), record: { ...record, fields }, sources };
    return ready([detail], "places.shellResults", nameField?.retrieved_at ?? null);
  }

  return {
    id: "places" as const,
    search,
    get,
    /** Counts exclusions from the last search; no location data is recorded. */
    diagnostics: (): SearchDiagnostics => ({ skipped: { ...diagnostics.skipped }, truncated: diagnostics.truncated }),
  };
}
