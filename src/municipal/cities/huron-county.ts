import { oneOf, pointVenueJob, trailJob, type G7LayerJob } from "./g7-helpers.js";
import type { Row } from "./g4-helpers.js";

/**
 * County of Huron layers retrieved on 2026-11-16 from
 * https://services1.arcgis.com/Nl1VlZHemqspPW1n/arcgis/rest/services/ under the Open
 * Government Licence – The County of Huron (stated in each item's licence field). The
 * layers cover the County's nine lower-tier municipalities. None has an accessibility
 * column except the trail use columns, so every other accessibility field stays UNKNOWN.
 */

const LAYER = "https://services1.arcgis.com/Nl1VlZHemqspPW1n/arcgis/rest/services";

/** Recreation Type values left out: private golf courses and marinas, as for the County of Essex. */
export const HURON_RECREATION_LEFT_OUT = ["Golf Course", "Marina"] as const;

/** Trail Features TYPE values that are places a person goes to. Benches, trees, hills, bridges and habitat points are left out. */
export const HURON_TRAIL_FEATURE_PLACES = [
  "Parking",
  "Access Point",
  "Entrance",
  "Lookout",
  "River Lookout",
  "Picnic Area",
  "Platform",
  "Boardwalk",
  "Stairs",
  "Historic Feature",
  "Historical Feature",
  "Homestead",
  "Garden",
] as const;

/** Trails rows left out: TRAIL_TYPE Closed or Road, and TRAIL_USE1 Driveway, CLOSED or Snowmobile. */
export function huronTrailIsOpenPath(row: Row): boolean {
  if (oneOf(row.TRAIL_TYPE, ["Closed", "Road"])) return false;
  if (oneOf(row.TRAIL_USE1, ["Driveway", "CLOSED", "Snowmobile"])) return false;
  return true;
}

function recreationGroup(row: Row): string {
  return oneOf(row.Type, ["Hiking Trail"]) ? "trail_access" : "recreation";
}

export const HURON_COUNTY_JOBS: readonly G7LayerJob[] = [
  pointVenueJob("huron-county-libraries", { idKey: "OBJECTID", name: "Branch", fixedCategory: "library", group: "library", address: "Location" }),
  pointVenueJob("huron-county-parks", {
    idKey: "OBJECTID_1",
    name: "POI_Name",
    category: "Type",
    group: "park",
    address: "Address",
    city: "Municipality",
    postcode: "PostalCode",
    website: "Website",
  }),
  pointVenueJob("huron-county-recreation", {
    idKey: "OBJECTID_1",
    name: "POI_Name",
    category: "Type",
    group: recreationGroup,
    address: "Full_Address",
    addressBeforeComma: true,
    city: "Municipality",
    website: "Website",
    keep: (row) => !oneOf(row.Type, HURON_RECREATION_LEFT_OUT),
  }),
  pointVenueJob("huron-county-entertainment", {
    idKey: "OBJECTID_1",
    name: "POI_Name",
    category: "Type",
    group: "culture",
    address: "Full_Address",
    addressBeforeComma: true,
    city: "Municipality",
    website: "Website",
  }),
  pointVenueJob("huron-county-places-of-worship", {
    idKey: "OBJECTID_1",
    name: "POI_Name",
    category: "Type",
    group: "place_of_worship",
    address: "Full_Address",
    addressBeforeComma: true,
    city: "Municipality",
    website: "Website",
  }),
  pointVenueJob("huron-county-trail-features", {
    idKey: "OBJECTID_1",
    name: "COMMENTS",
    category: "TYPE",
    group: "trail_feature",
    keep: (row) => oneOf(row.TYPE, HURON_TRAIL_FEATURE_PLACES),
  }),
  trailJob("huron-county-trails", {
    idKey: "OBJECTID",
    kind: "trail",
    name: "TRAIL_NAME",
    surface: "SURFACE",
    flagColumns: ["TRAIL_USE1", "TRAIL_USE2", "TRAIL_USE3", "TRAIL_USE4"],
    keep: huronTrailIsOpenPath,
    extra: ["TRAIL_TYPE"],
  }),
];

/** Layer URL for each job, as written to sources/registry.json download_url. */
export const HURON_COUNTY_LAYERS: Readonly<Record<string, string>> = {
  "huron-county-libraries": `${LAYER}/Library/FeatureServer/0`,
  "huron-county-parks": `${LAYER}/Parks/FeatureServer/0`,
  "huron-county-recreation": `${LAYER}/Recreation/FeatureServer/0`,
  "huron-county-entertainment": `${LAYER}/Entertainment/FeatureServer/0`,
  "huron-county-places-of-worship": `${LAYER}/Places_of_Worship/FeatureServer/0`,
  "huron-county-trail-features": `${LAYER}/Trail_Features/FeatureServer/0`,
  "huron-county-trails": `${LAYER}/Trails/FeatureServer/0`,
};
