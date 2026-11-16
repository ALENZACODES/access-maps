/**
 * Search over imported venue records for the access-main shell route `/places`.
 *
 * Output follows `ModuleResult`, `PlaceHit`, and `Provenance` in access-main
 * `packages/shared/src`, contract version 1.1.0. The shell checks each result
 * with `checkModuleResult` before it lists anything.
 *
 * Input is the import shape in access-main `packages/schema/schema/import`:
 * venue records whose fields are FieldValue objects, and source-registry
 * entries. This package does not read `data/`, download feeds, or edit
 * records. A venue is left out, not filled in, when:
 * - its name is UNKNOWN or blank;
 * - its name's source is not in the registry;
 * - its name's tier is not 0 or 1 (the shell's prototype cache refuses 2, 3, and 4).
 */

export const SHELL_CONTRACT_VERSION = "1.1.0";
export const UNKNOWN = "UNKNOWN";
export const DEFAULT_LIMIT = 50;

export interface FieldValue {
  value: string | number | Array<[number, number]>;
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: 0 | 1 | 2 | 3 | 4;
  source_key?: string;
  raw?: string | number | null;
  derived?: boolean;
}

export interface VenueRecord {
  id: string;
  tranche: "venue";
  region: string;
  fields: Record<string, FieldValue>;
}

export interface SourceRegistryEntry {
  id: string;
  name: string;
  kind: string;
  url: string;
  download_url: string;
  licence_name: string;
  licence_url: string;
  licence_id: string;
  attribution: string;
  retrieved_at: string;
  tier: number;
  tier_note?: string;
  notes?: string;
}

export interface ShellProvenance {
  source_name: string;
  source_url: string | null;
  licence: string;
  licence_url: string | null;
  source_date: string;
  retrieved_at: string;
  tier: 0 | 1;
  prototype_label: "SEEDED-OPEN-DATA" | "PROTOTYPE-UNVERIFIED";
  freshness: "unknown";
}

export interface ShellPlaceHit {
  id: string;
  name: string;
  provenance: ShellProvenance;
  /** Extra field. Attribution the source requires, for example "(c) OpenStreetMap contributors". */
  attribution: string;
  /** Extra field. Values are copied as stored. UNKNOWN stays UNKNOWN. */
  category: string;
  city: string;
}

export interface PlacesShellContext {
  locale: "en" | "fr";
  offline: boolean;
  nowIso: string;
  query?: string;
}

export interface PlacesShellResult {
  moduleId: "places";
  availability: "ready";
  items: ShellPlaceHit[];
  messageKey: string;
  asOf: string | null;
  liveStatus: "unavailable";
}

export type SkipReason = "name_unknown" | "source_not_registered" | "tier_not_in_prototype";

/** Lower case, no accents, single spaces. Used for matching only, never for display. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stringValue(field: FieldValue | undefined): string {
  if (!field) return UNKNOWN;
  return typeof field.value === "string" && field.value.trim() ? field.value : typeof field.value === "number" ? String(field.value) : UNKNOWN;
}

/** Builds a hit, or says why the venue is left out. */
export function toPlaceHit(
  venue: VenueRecord,
  sources: ReadonlyMap<string, SourceRegistryEntry>,
  storedAt: string,
): ShellPlaceHit | SkipReason {
  const nameField = venue.fields.name;
  const name = stringValue(nameField);
  if (!nameField || name === UNKNOWN) return "name_unknown";
  const source = sources.get(nameField.source_id);
  if (!source) return "source_not_registered";
  if (nameField.tier !== 0 && nameField.tier !== 1) return "tier_not_in_prototype";
  return {
    id: venue.id,
    name,
    provenance: {
      source_name: source.name,
      source_url: source.url || null,
      licence: nameField.licence,
      licence_url: source.licence_id === nameField.licence ? source.licence_url || null : null,
      // The import records only the day it was retrieved. That day is the only date the source gives here.
      source_date: nameField.retrieved_at,
      retrieved_at: storedAt,
      tier: nameField.tier,
      prototype_label: nameField.tier === 0 ? "SEEDED-OPEN-DATA" : "PROTOTYPE-UNVERIFIED",
      freshness: "unknown",
    },
    attribution: source.attribution,
    category: stringValue(venue.fields.category),
    city: stringValue(venue.fields.addr_city),
  };
}

function matches(venue: VenueRecord, needle: string): boolean {
  const haystack = ["name", "category", "addr_street", "addr_city"]
    .map((key) => stringValue(venue.fields[key]))
    .filter((value) => value !== UNKNOWN)
    .join(" ");
  return fold(haystack).includes(needle);
}

export interface PlacesIndexOptions {
  venues: Iterable<VenueRecord>;
  sources: Iterable<SourceRegistryEntry>;
  limit?: number;
}

export interface PlacesSearchOutcome {
  result: PlacesShellResult;
  /** How many matching venues were left out, by reason. Shown in a data-status page, not hidden. */
  skipped: Record<SkipReason, number>;
  /** Matching hits beyond the limit. */
  truncated: number;
}

export function createPlacesSearch(options: PlacesIndexOptions) {
  const venues = [...options.venues];
  const sources = new Map([...options.sources].map((entry) => [entry.id, entry]));
  const limit = options.limit ?? DEFAULT_LIMIT;

  function search(ctx: PlacesShellContext): PlacesSearchOutcome {
    const skipped: Record<SkipReason, number> = { name_unknown: 0, source_not_registered: 0, tier_not_in_prototype: 0 };
    const needle = fold(ctx.query ?? "");
    const hits: ShellPlaceHit[] = [];
    if (needle) {
      for (const venue of venues) {
        if (!matches(venue, needle)) continue;
        const hit = toPlaceHit(venue, sources, ctx.nowIso);
        if (typeof hit === "string") skipped[hit] += 1;
        else hits.push(hit);
      }
    }
    hits.sort((a, b) => a.name.localeCompare(b.name, ctx.locale) || a.id.localeCompare(b.id));
    const items = hits.slice(0, limit);
    const dates = items.map((item) => item.provenance.source_date).sort();
    return {
      result: {
        moduleId: "places",
        availability: "ready",
        items,
        messageKey: needle ? "places.shellResults" : "places.shellEnterText",
        asOf: dates.at(-1) ?? null,
        liveStatus: "unavailable",
      },
      skipped,
      truncated: Math.max(0, hits.length - limit),
    };
  }

  return {
    search,
    module: {
      id: "places" as const,
      search: (query: { text: string }, ctx: PlacesShellContext): Promise<PlacesShellResult> =>
        Promise.resolve(search({ ...ctx, query: query.text }).result),
    },
  };
}
