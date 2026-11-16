import { buildRecord, coordinateField, regionFromPoint, type DataRecord } from "../../model/records.js";
import { unknownField, type Provenance } from "../../model/provenance.js";
import {
  attributesOf,
  dataset,
  labelled,
  lineFields,
  pointFields,
  pointOf,
  published,
  regionOf,
  type RawFeature,
} from "./g4-helpers.js";

/** City of Cornwall open-data layers retrieved on 2026-11-16. */

/**
 * Sidewalks Network. MATERIAL is stored as published. TYPE (STANDARD or MONOLITHIC) and
 * SWLK_WIDTH are kept as `COLUMN=value` text: the layer does not state the unit of the
 * width, so it is not written to the width field. SEG_LENGTH has no stated unit either
 * and is not stored.
 */
export function mapCornwallSidewalk(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const line = lineFields(feature, ctx);
  return buildRecord(
    "path",
    `${ctx.source_id}:${row.OBJECTID}`,
    line.region,
    {
      kind: dataset("sidewalk", ctx),
      footway: dataset("sidewalk", ctx),
      surface: published(row, "MATERIAL", ctx),
      wheelchair_description: labelled(row, ["TYPE", "SWLK_WIDTH"], ctx),
      geometry: line.geometry,
      geometry_type: line.geometry_type,
    },
    ctx,
  );
}

/**
 * Recreational Paths and Bike Lanes. Only rows with ON_ROAD = N are imported (others
 * return null): painted bicycle lanes, paved shoulders and mixed-traffic routes are lines
 * on the roadway, and a path record is read as somewhere a person can travel off the road.
 * PATH_WIDTH is kept as `COLUMN=value` text because the layer states no unit.
 */
export function mapCornwallRecreationalPath(feature: RawFeature, ctx: Provenance): DataRecord | null {
  const row = attributesOf(feature);
  if ((row.ON_ROAD ?? "").trim().toUpperCase() !== "N") return null;
  const line = lineFields(feature, ctx);
  return buildRecord(
    "path",
    `${ctx.source_id}:${row.OBJECTID}`,
    line.region,
    {
      kind: published(row, "FACILITY_TYPE", ctx),
      surface: published(row, "SURFACE_TYPE", ctx),
      wheelchair_description: labelled(row, ["PATH_WIDTH"], ctx),
      signposted_as: published(row, "PATH_NAME", ctx),
      geometry: line.geometry,
      geometry_type: line.geometry_type,
    },
    ctx,
  );
}

/** Water Bottle Filling Stations. LOCATION is the published place name. No accessibility column exists. */
export function mapCornwallWaterStation(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const point = pointOf(feature);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.FID}`,
    regionOf(point),
    {
      name: published(row, "LOCATION", ctx),
      category: dataset("water bottle filling station", ctx),
      category_group: dataset("drinking_water", ctx),
      ...pointFields(point, ctx),
    },
    ctx,
  );
}

/**
 * CornwallTransit Bus Stops, the City's open-data layer of its transit stops. The
 * `wheelchair` column is 0 on every row retrieved and the layer does not define it, so
 * wheelchair_boarding stays UNKNOWN with the published token on `raw`.
 */
export function mapCornwallBusStop(feature: RawFeature, ctx: Provenance): DataRecord | null {
  const row = attributesOf(feature);
  const stopId = (row.stop_id ?? "").trim();
  if (!stopId) return null;
  const point = pointOf(feature);
  return buildRecord(
    "transit",
    `${ctx.source_id}:${stopId}`,
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    {
      name: published(row, "stop_name", ctx),
      lat: coordinateField(point?.lat ?? null, ctx, "geometry"),
      lon: coordinateField(point?.lon ?? null, ctx, "geometry"),
      stop_code: published(row, "stop_id", ctx),
      wheelchair_boarding: unknownField(ctx, { source_key: "wheelchair", raw: row.wheelchair ?? "" }),
    },
    ctx,
  );
}

export const CORNWALL_JOBS = [
  { id: "cornwall-sidewalks", tranches: ["path" as const], map: mapCornwallSidewalk },
  { id: "cornwall-recreational-paths", tranches: ["path" as const], map: mapCornwallRecreationalPath },
  { id: "cornwall-water-bottle-filling-stations", tranches: ["venue" as const], map: mapCornwallWaterStation },
  { id: "cornwall-transit-bus-stops", tranches: ["transit" as const], map: mapCornwallBusStop },
];
