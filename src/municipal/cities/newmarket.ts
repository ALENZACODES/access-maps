import { buildRecord, type DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import {
  civic,
  dataset,
  pathRecords,
  pointFields,
  present,
  published,
  regionOf,
  type CityFeature,
} from "./york-durham-shared.js";

/**
 * Town of Newmarket open data, retrieved 2026-11-16. None of these layers has an
 * accessibility column, so every accessibility field stays UNKNOWN.
 */

/**
 * Park Features (polygons). CAT = WASHROOM becomes a washroom record placed at the vertex
 * mean of the washroom outline. CAT = RETIRED is skipped (null). Every other category is a
 * venue with the published category.
 */
export function mapNewmarketParkFeature(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  const category = present(row, "CAT").toUpperCase();
  if (category === "" || category === "RETIRED") return null;
  const id = `${ctx.source_id}:${row.OBJECTID}`;
  if (category === "WASHROOM") {
    return buildRecord(
      "washroom",
      id,
      regionOf(feature),
      {
        name: published(row, "LANDMARK", ctx),
        ...pointFields(feature, ctx),
        facility_type: published(row, "CAT", ctx),
        ...civic(row, "MUN_ADD", ctx),
        building: dataset("park", ctx),
      },
      ctx,
    );
  }
  return buildRecord(
    "venue",
    id,
    regionOf(feature),
    {
      name: published(row, "LANDMARK", ctx),
      category: published(row, "CAT", ctx),
      category_group: dataset("park_feature", ctx),
      ...pointFields(feature, ctx),
      ...civic(row, "MUN_ADD", ctx),
    },
    ctx,
  );
}

/** Trails. CLASS and SURFACE are stored as published. The layer has no length column. */
export function mapNewmarketTrail(feature: CityFeature, ctx: Provenance): DataRecord[] {
  const row = feature.attributes;
  return pathRecords(feature, ctx, `${ctx.source_id}:${row.OBJECTID}`, () => ({
    kind: published(row, "CLASS", ctx),
    surface: published(row, "SURFACE", ctx),
  }));
}

/**
 * Trail Points. FEATURE = Washroom becomes a washroom record at the published point. The
 * other features (access points, parking, bridges, connections, underpasses and repair
 * stations) are venues with the published feature type.
 */
export function mapNewmarketTrailPoint(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  const type = present(row, "FEATURE");
  if (type === "") return null;
  const id = `${ctx.source_id}:${row.OBJECTID}`;
  if (type.toLowerCase() === "washroom") {
    return buildRecord(
      "washroom",
      id,
      regionOf(feature),
      {
        name: published(row, "NAME", ctx),
        ...pointFields(feature, ctx),
        facility_type: published(row, "FEATURE", ctx),
        building: dataset("trail", ctx),
      },
      ctx,
    );
  }
  return buildRecord(
    "venue",
    id,
    regionOf(feature),
    {
      name: published(row, "NAME", ctx),
      category: published(row, "FEATURE", ctx),
      category_group: dataset("trail_feature", ctx),
      ...pointFields(feature, ctx),
    },
    ctx,
  );
}

/** Landmark categories that are public civic or recreation buildings. */
export const NEWMARKET_FACILITY_CATEGORIES: readonly string[] = [
  "ADMINISTRATION - MUNICIPAL",
  "ADMINISTRATION - REGIONAL",
  "ARENA",
  "CULTURAL FACILITY",
  "FITNESS CENTRE",
  "POOL",
  "RECREATION CENTRE",
];

/**
 * Landmarks. Only the categories in NEWMARKET_FACILITY_CATEGORIES are imported (others
 * return null): the layer also lists schools, places of worship, cameras, ponds and other
 * points that are not public facilities.
 */
export function mapNewmarketLandmark(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (!NEWMARKET_FACILITY_CATEGORIES.includes(present(row, "CAT").toUpperCase())) return null;
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(feature),
    {
      name: published(row, "LANDMARK", ctx),
      category: published(row, "CAT", ctx),
      category_group: dataset("civic_facility", ctx),
      ...pointFields(feature, ctx),
      addr_housenumber: published(row, "ST_NUM", ctx),
      addr_street: published(row, "STREET", ctx),
      addr_unit: published(row, "UNIT_NUM", ctx),
    },
    ctx,
  );
}
