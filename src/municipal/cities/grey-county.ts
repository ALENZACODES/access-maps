import { buildRecord, type DataRecord } from "../../model/records.js";
import { fv, type Provenance } from "../../model/provenance.js";
import { attributesOf, pointFields, pointOf, present, published, regionOf, type RawFeature } from "./g4-helpers.js";
import type { G7LayerJob } from "./g7-helpers.js";

/**
 * County of Grey layer retrieved on 2026-11-16: Grey Transit Route (GTR) Bus Stops, item
 * e337a60124f94279bab1b9c30022e5f6, whose licence field reads "Licensed under Grey County
 * Open Data" and links the Grey County Open Data Licence on https://maps.grey.ca/pages/terms.
 * The layer is the County's own stop list, not a GTFS feed; it has no wheelchair_boarding
 * column, so wheelchair boarding stays UNKNOWN.
 */

export function mapGreyGtrStop(feature: RawFeature, ctx: Provenance): DataRecord | null {
  const row = attributesOf(feature);
  const stopId = present(row, "stop_id");
  if (stopId === "") return null;
  const point = pointOf(feature);
  return buildRecord(
    "transit",
    `${ctx.source_id}:${stopId}`,
    regionOf(point),
    {
      name: published(row, "stop_name", ctx),
      ...pointFields(point, ctx),
      stop_code: published(row, "stop_id", ctx),
      location_type: fv("stop", ctx, { source_key: "layer" }),
      description: published(row, "stop_desc", ctx),
    },
    ctx,
  );
}

export const GREY_COUNTY_JOBS: readonly G7LayerJob[] = [
  { id: "grey-county-gtr-bus-stops", tranches: ["transit"], fields: ["OBJECTID", "stop_id", "stop_name", "stop_desc"], map: mapGreyGtrStop },
];

export const GREY_COUNTY_LAYERS: Readonly<Record<string, string>> = {
  "grey-county-gtr-bus-stops": "https://gis.grey.ca/server/rest/services/Public/GC_GTR/FeatureServer/4",
};
