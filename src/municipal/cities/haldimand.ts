import type { DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import {
  civicText,
  dataset,
  featurePoint,
  flag,
  labelled,
  pathRecord,
  pointFields,
  present,
  published,
  venueRecord,
  type CityFeature,
  type Row,
} from "./g3-shared.js";

/**
 * Haldimand County layers retrieved on 2026-11-16 from the County's public GIS server
 * (gis.haldimandcounty.ca). These layers are not listed in the County's open-data catalogue
 * and state no licence; the basis for including them is the repository owner's statement
 * of 2026-11-16, recorded in sources/registry.json.
 *
 * Creator, editor, inspector and comment columns are never requested.
 */

/** Location and cross street joined as "LOCATION / INTERSECTION", or UNKNOWN when both are blank. */
function crossing(row: Row, ctx: Provenance): FieldValue {
  const parts = ["Location", "Intersecti"].map((key) => present(row, key)).filter((value) => value !== "");
  if (parts.length === 0) return unknownField(ctx, { source_key: "Location,Intersecti" });
  return fv(parts.join(" / "), ctx, { source_key: "Location,Intersecti" });
}

/** A yes/no publisher flag kept as COLUMN=YES or COLUMN=NO; UNKNOWN, blank and other tokens stay UNKNOWN. */
function yesNo(row: Row, key: string, ctx: Provenance): FieldValue {
  return flag(row, key, ["YES", "NO"], ctx);
}

/** Two flags joined into one `COLUMN=value; COLUMN=value` description, keeping only the filled ones. */
function flags(row: Row, keys: readonly string[], ctx: Provenance): FieldValue {
  const kept = keys.map((key) => yesNo(row, key, ctx)).filter((field) => field.value !== "UNKNOWN");
  if (kept.length === 0) return unknownField(ctx, { source_key: keys.join(",") });
  return fv(kept.map((field) => String(field.value)).join("; "), ctx, {
    source_key: kept.map((field) => field.source_key).join(","),
  });
}

/**
 * Accessible Parking (points). The County's layer is named AccessibleParking; each point is
 * a mapped accessible parking location. Its Accessible column was blank on every row on
 * 2026-11-16. ParkingType (Lot or On Street), ByLaw and a filled Accessible value are kept as
 * published pairs in wheelchair_description. No space count is published or derived.
 */
export function mapHaldimandAccessibleParking(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featurePoint(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: unknownField(ctx),
      category: dataset("accessible parking location", ctx),
      category_group: dataset("parking", ctx),
      ...pointFields(point, ctx),
      ...civicText(row, "Address", ctx),
      operator: published(row, "Ownership", ctx),
      wheelchair_description: labelled(row, ["ParkingType", "ByLaw", "Accessible"], ctx),
    },
    ctx,
  );
}

/** Sidewalk STATUS values imported. NOT ASSUMED, PROPOSED, REMOVED and blank rows are left out. */
export const HALDIMAND_SIDEWALK_STATUSES = ["ACTIVE", "BUILT"] as const;

/**
 * Sidewalk (lines). WIDTH is free text in mixed forms (1.52m (5'-0"), 1.5, 1.22000003) and is
 * kept as the published pair `WIDTH=<text>` in wheelchair_description; the numeric width
 * stays UNKNOWN. SURFTYPE is the surface.
 */
export function mapHaldimandSidewalk(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  const status = present(row, "STATUS").toUpperCase();
  if (!(HALDIMAND_SIDEWALK_STATUSES as readonly string[]).includes(status)) return null;
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    {
      kind: dataset("sidewalk", ctx),
      surface: published(row, "SURFTYPE", ctx),
      width: unknownField(ctx),
      wheelchair_description: labelled(row, ["WIDTH"], ctx),
    },
    ctx,
  );
}

/** The TrafficSignals Subtype codes imported: 0 LOCATION ONLY and 1 TRAFFIC SIGNAL POLE. */
export const HALDIMAND_SIGNAL_SUBTYPES: Readonly<Record<string, string>> = {
  "0": "traffic signal location",
  "1": "traffic signal pole",
};

/** Removed_Da holds 1899-12-30 (-2209161600000) or a blank when nothing was removed; any later date means removed. */
function removed(row: Row): boolean {
  const raw = present(row, "Removed_Da");
  if (raw === "") return false;
  const value = Number(raw);
  return Number.isFinite(value) && value > -2209161600000;
}

/**
 * Traffic Signals (points). The layer holds signal poles, handwells, cabinets and other
 * parts; only location and pole points (Subtype 0 and 1) are imported, and rows with a
 * removal date are left out. Audible and Accessible are the County's flags and are kept as
 * Audible=YES or NO and Accessible=YES or NO in wheelchair_description. Accessible=UNKNOWN
 * and blank stay UNKNOWN. speech_output and wheelchair are not derived from them.
 */
export function mapHaldimandTrafficSignal(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  const category = HALDIMAND_SIGNAL_SUBTYPES[present(row, "Subtype")];
  if (category === undefined || removed(row)) return null;
  const point = featurePoint(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: crossing(row, ctx),
      category: dataset(category, ctx),
      category_group: dataset("traffic_signal", ctx),
      ...pointFields(point, ctx),
      addr_city: published(row, "Town", ctx),
      wheelchair_description: flags(row, ["Audible", "Accessible"], ctx),
    },
    ctx,
  );
}

/** The Name the County gives a pedestrian crossover in service. */
export const HALDIMAND_CROSSOVER_NAME = "PEDESTRIAN CROSSOVER";

/**
 * Pedestrian Crossings (points). Only rows named PEDESTRIAN CROSSOVER without a removal date
 * are imported; the OUT OF COMMISSION row and a row named "test" are left out. Audible and
 * Accessible are kept as published flags.
 */
export function mapHaldimandPedestrianCrossing(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (present(row, "Name").toUpperCase() !== HALDIMAND_CROSSOVER_NAME || removed(row)) return null;
  const point = featurePoint(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: crossing(row, ctx),
      category: published(row, "Name", ctx),
      category_group: dataset("pedestrian_crossing", ctx),
      ...pointFields(point, ctx),
      addr_city: published(row, "Town", ctx),
      wheelchair_description: flags(row, ["Audible", "Accessible"], ctx),
    },
    ctx,
  );
}

/**
 * Trail Network Existing Network (lines). Only ACTIVE rows marked OffRoad = Y are imported;
 * on-road cycling routes and rows in the planning stage are left out. Type and Class are
 * kept together as the kind.
 */
export function mapHaldimandTrail(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (present(row, "Status").toUpperCase() !== "ACTIVE") return null;
  if (present(row, "OffRoad").toUpperCase() !== "Y") return null;
  return pathRecord(feature, `${ctx.source_id}:${row.OBJECTID}`, { kind: labelled(row, ["Type", "Class"], ctx) }, ctx);
}
