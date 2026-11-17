import { buildRecord, type DataRecord, type Tranche } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import {
  attributesOf,
  civic,
  dataset,
  lineFields,
  pointFields,
  pointOf,
  present,
  published,
  regionOf,
  type RawFeature,
  type Row,
} from "./g4-helpers.js";
import { lineParts, partId } from "./g6-helpers.js";

/**
 * Shared mappers for the small-town sweep (lane G7): county, district and other
 * upper-tier layers that cover many small municipalities at once.
 *
 * The rules of g4-helpers apply: a field is filled only from a column the publisher
 * filled, a publisher's accessible flag is kept as `COLUMN=value` text and never turned
 * into a wheelchair yes or no, and phone, fax and email columns are never requested.
 */

/** One ArcGIS REST layer read into one source. `fields` are the only columns requested. */
export interface G7LayerJob {
  id: string;
  tranches: Tranche[];
  fields: readonly string[];
  map: (feature: RawFeature, ctx: Provenance) => DataRecord | DataRecord[] | null;
}

/** How one point layer's columns become a venue record. Every column named here is requested. */
export interface PointVenueSpec {
  /** Column holding the layer's own stable id (OBJECTID, FID). */
  idKey: string;
  /** Column holding the place name. */
  name: string;
  /** Column holding the publisher's own class; when absent, `fixedCategory` is stored as dataset text. */
  category?: string;
  fixedCategory?: string;
  /** The repository's category group, either fixed or chosen from the row. */
  group: string | ((row: Row) => string);
  /** Column holding a civic address such as `14 Flint Ave`. */
  address?: string;
  /**
   * The address column is a full one-line address (`56 North St, GODERICH, ON N7A 2T4`):
   * only the part before the first comma is read as the civic address. The rest stays in
   * the published column and is not split into city or postcode.
   */
  addressBeforeComma?: boolean;
  /** Column holding the community or municipality. */
  city?: string;
  postcode?: string;
  website?: string;
  /** Rows for which this returns false are left out (the job reports them as skipped). */
  keep?: (row: Row) => boolean;
  /** Other columns `keep` or `group` read. */
  extra?: readonly string[];
}

/** Columns a point venue spec reads, for the layer request. */
export function pointVenueFields(spec: PointVenueSpec): string[] {
  return [spec.idKey, spec.name, spec.category, spec.address, spec.city, spec.postcode, spec.website, ...(spec.extra ?? [])].filter(
    (key): key is string => typeof key === "string",
  );
}

/** Maps one point feature to a venue with every accessibility field UNKNOWN. */
export function mapPointVenue(spec: PointVenueSpec, feature: RawFeature, ctx: Provenance): DataRecord | null {
  const row = attributesOf(feature);
  if (spec.keep && !spec.keep(row)) return null;
  const key = present(row, spec.idKey);
  if (key === "") return null;
  const point = pointOf(feature);
  const fields: Record<string, FieldValue> = {
    name: published(row, spec.name, ctx),
    category: spec.category
      ? published(row, spec.category, ctx)
      : spec.fixedCategory
        ? dataset(spec.fixedCategory, ctx)
        : unknownField(ctx),
    category_group: dataset(typeof spec.group === "function" ? spec.group(row) : spec.group, ctx),
    ...pointFields(point, ctx),
  };
  if (spec.address) {
    const raw = row[spec.address] ?? "";
    Object.assign(fields, civic(spec.addressBeforeComma ? (raw.split(",")[0] ?? "") : raw, spec.address, ctx));
  }
  if (spec.city) fields.addr_city = published(row, spec.city, ctx);
  if (spec.postcode) fields.addr_postcode = published(row, spec.postcode, ctx);
  if (spec.website) fields.website = published(row, spec.website, ctx);
  return buildRecord("venue", `${ctx.source_id}:${key}`, regionOf(point), fields, ctx);
}

/** A venue layer job built from a spec. */
export function pointVenueJob(id: string, spec: PointVenueSpec): G7LayerJob {
  return {
    id,
    tranches: ["venue"],
    fields: pointVenueFields(spec),
    map: (feature, ctx) => mapPointVenue(spec, feature, ctx),
  };
}

/** How one line layer's columns become path records. */
export interface TrailSpec {
  idKey: string;
  /** The path kind stored as dataset text, for example `trail`. */
  kind: string;
  /** Column holding the trail name. */
  name?: string;
  /** Column holding the surface as published. */
  surface?: string;
  /** Columns whose published values are kept as `COLUMN=value` text in wheelchair_description, only when one says accessible. */
  flagColumns?: readonly string[];
  keep?: (row: Row) => boolean;
  /** Other columns `keep` reads. */
  extra?: readonly string[];
}

export function trailFields(spec: TrailSpec): string[] {
  return [spec.idKey, spec.name, spec.surface, ...(spec.flagColumns ?? []), ...(spec.extra ?? [])].filter((key): key is string => typeof key === "string");
}

/**
 * The publisher's own accessible flag, kept as `COLUMN=value` text when a listed column
 * reads accessible. Otherwise UNKNOWN: a trail without the word is not known to be inaccessible.
 */
export function accessibleFlag(row: Row, keys: readonly string[], ctx: Provenance): FieldValue {
  for (const key of keys) {
    const value = present(row, key);
    if (/^accessible$/i.test(value)) return fv(`${key}=${value}`, ctx, { source_key: key, raw: row[key] ?? "" });
  }
  return unknownField(ctx, keys.length > 0 ? { source_key: keys.join(",") } : {});
}

/** Maps one line feature to one path record per part. */
export function mapTrail(spec: TrailSpec, feature: RawFeature, ctx: Provenance): DataRecord[] | null {
  const row = attributesOf(feature);
  if (spec.keep && !spec.keep(row)) return null;
  const key = present(row, spec.idKey);
  if (key === "") return null;
  return lineParts(feature).map(({ feature: piece, part }) => {
    const line = lineFields(piece, ctx);
    const fields: Record<string, FieldValue> = {
      kind: dataset(spec.kind, ctx),
      geometry: line.geometry,
      geometry_type: line.geometry_type,
    };
    if (spec.name) fields.signposted_as = published(row, spec.name, ctx);
    if (spec.surface) fields.surface = published(row, spec.surface, ctx);
    if (spec.flagColumns) fields.wheelchair_description = accessibleFlag(row, spec.flagColumns, ctx);
    return buildRecord("path", partId(ctx.source_id, key, part), line.region, fields, ctx);
  });
}

export function trailJob(id: string, spec: TrailSpec): G7LayerJob {
  return { id, tranches: ["path"], fields: trailFields(spec), map: (feature, ctx) => mapTrail(spec, feature, ctx) };
}

/** True when the trimmed value, compared without case, is one of `values`. */
export function oneOf(value: string | undefined, values: readonly string[]): boolean {
  const normal = (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return values.some((item) => item.toLowerCase() === normal);
}
