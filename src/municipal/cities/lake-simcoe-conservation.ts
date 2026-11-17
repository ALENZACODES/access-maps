import { oneOf, pointVenueJob, type G7LayerJob } from "./g7-helpers.js";

/**
 * Lake Simcoe Region Conservation Authority (LSRCA) layer retrieved on 2026-11-17 from the
 * LSRCA Open Data hub (https://lsrca-open-data-camaps.opendata.arcgis.com): LSRCA Lands -
 * Public, under the Lake Simcoe Region Conservation Authority Open Data Licence v1.0 named in
 * the item's licence field. The layer draws each property as one or more parcels; one venue
 * is stored per PROPERTY_NAME, at the vertex mean of its first parcel (lowest OBJECTID),
 * which is a map anchor, not an entrance. The layer has no accessibility column.
 */

export const LAKE_SIMCOE_CONSERVATION_JOBS: readonly G7LayerJob[] = [
  pointVenueJob("lsrca-public-lands", {
    idKey: "OBJECTID",
    idFrom: "name",
    name: "PROPERTY_NAME",
    fixedCategory: "conservation area",
    group: "park",
    anchor: "ring_mean",
    keep: (row) => oneOf(row.PUBLIC_RELEASE, ["Yes"]),
    extra: ["PUBLIC_RELEASE"],
  }),
];

export const LAKE_SIMCOE_CONSERVATION_LAYERS: Readonly<Record<string, string>> = {
  "lsrca-public-lands": "https://gis.lsrca.on.ca/gis/rest/services/OpenData/MapServer/46",
};
