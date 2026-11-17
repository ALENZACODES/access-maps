import { oneOf, pointVenueJob, trailJob, type G7LayerJob } from "./g7-helpers.js";
import type { Row } from "./g4-helpers.js";

/**
 * Niagara Peninsula Conservation Authority (NPCA) layers retrieved on 2026-11-17 through the
 * ArcGIS Online items 39db3b32033c4ce4a75462fc4bc60e32 (Conservation Areas NPCA) and
 * 2b76c478b43549af83b97870ed3b14d0 (Conservation Authority Trails NPCA), whose licence field
 * links the Open Government Licence – Niagara Peninsula Conservation Authority (NPCA), based
 * on version 2.0 of the Open Government Licence – Canada. The NPCA watershed covers the
 * Niagara Region municipalities and parts of Haldimand County and the City of Hamilton.
 *
 * The conservation area layer's WC_Access column is the Authority's own Yes/No flag. It is
 * kept as `WC_Access=<value>` text in wheelchair_description and is not turned into a
 * wheelchair yes or no. The trail layer's AverageSlope and MaximumGrade have no stated unit
 * and are kept as `COLUMN=value` text, as is TrailRating.
 */

/** Trail rows that are roads, driveways, parking loops, or retired or abandoned paths are left out. */
export function npcaTrailIsPath(row: Row): boolean {
  if (oneOf(row.Feature, ["Road"])) return false;
  if (oneOf(row.TrailType, ["Road", "Retired", "Abandoned Path", "Driveway", "Parking Loop"])) return false;
  if (oneOf(row.TrailRating, ["Retired"])) return false;
  return true;
}

export const NIAGARA_PENINSULA_CONSERVATION_JOBS: readonly G7LayerJob[] = [
  pointVenueJob("npca-conservation-areas", {
    // CA_ID is the Authority's own area number. Morgan's Point is drawn as two polygons with
    // one CA_ID, so it is stored once (the importer drops a repeated id).
    idKey: "CA_ID",
    name: "CA_Name",
    fixedCategory: "conservation area",
    group: "park",
    city: "Municipali",
    website: "WebPage",
    anchor: "ring_mean",
    labelledColumns: ["WC_Access"],
  }),
  trailJob("npca-trails", {
    idKey: "OBJECTID",
    kind: "trail",
    name: "TrailName",
    surface: "Surface",
    labelledColumns: ["TrailRating", "AverageSlope", "MaximumGrade"],
    keep: npcaTrailIsPath,
    extra: ["Feature", "TrailType"],
  }),
];

export const NIAGARA_PENINSULA_CONSERVATION_LAYERS: Readonly<Record<string, string>> = {
  "npca-conservation-areas": "https://utility.arcgis.com/usrsvcs/servers/39db3b32033c4ce4a75462fc4bc60e32/rest/services/Conservation_Lands_Grouping/MapServer/0",
  "npca-trails": "https://utility.arcgis.com/usrsvcs/servers/2b76c478b43549af83b97870ed3b14d0/rest/services/Conservation_Authority_Trails_NPCA/MapServer/0",
};
