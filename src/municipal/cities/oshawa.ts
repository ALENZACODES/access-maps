import { buildRecord, type DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import { coded, pathRecords, pointFields, published, regionOf, dataset, type CityFeature } from "./york-durham-shared.js";

/**
 * City of Oshawa open data, retrieved 2026-11-16. Neither layer has an accessibility
 * column, so every accessibility field stays UNKNOWN.
 */

/** Community Centres (points). The address is published in separate number, unit and street columns. */
export function mapOshawaCommunityCentre(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(feature),
    {
      name: published(row, "FULLNAME", ctx),
      category: published(row, "CATEGORY", ctx),
      category_group: dataset("civic_facility", ctx),
      ...pointFields(feature, ctx),
      addr_housenumber: published(row, "ADDRESS_NUM", ctx),
      addr_street: published(row, "ADDRESS_STREET", ctx),
      addr_unit: published(row, "ADDRESS_UNIT", ctx),
    },
    ctx,
  );
}

/** TYPE coded-value domain on the Oshawa Trails layer, read 2026-11-16. Only walking types are listed. */
export const OSHAWA_TRAIL_TYPE: Readonly<Record<string, string>> = {
  S: "SIDEWALK",
  W: "WALKWAY",
  FW: "FACILITY WALKWAY",
  WT: "WALK-THROUGH",
  PP: "PARK PATHWAY",
  MUP: "MULTI-USE PATH (ATMP: TWO-WAY IN-BOULEVARD MULTI-USE TRAIL)",
  T: "TRAIL (ATMP: STANDARD MULTI-USE RECREATIONAL PATHWAY)",
  NT: "NATURE TRAIL - OFF-ROAD RURAL",
};

/**
 * Trails. The TYPE code is stored as the name the layer's domain gives it. A code that is
 * not a walking type in OSHAWA_TRAIL_TYPE (the domain also defines crosswalk and cycling
 * route codes) is skipped (null). The layer has no surface, width or length column.
 */
export function mapOshawaTrail(feature: CityFeature, ctx: Provenance): DataRecord[] | null {
  const row = feature.attributes;
  if (!OSHAWA_TRAIL_TYPE[(row.TYPE ?? "").trim()]) return null;
  return pathRecords(feature, ctx, `${ctx.source_id}:${row.OBJECTID}`, () => ({
    kind: coded(row, "TYPE", OSHAWA_TRAIL_TYPE, ctx),
  }));
}
