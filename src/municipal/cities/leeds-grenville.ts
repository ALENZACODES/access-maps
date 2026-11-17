import { pointVenueJob, type G7LayerJob } from "./g7-helpers.js";

/**
 * United Counties of Leeds and Grenville open-data layers retrieved on 2026-11-16 from the
 * Leeds Grenville GeoHub (https://geohub-uclg.hub.arcgis.com/) under the Open Government
 * Licence – United Counties of Leeds and Grenville, version 1.0 (Terms of Use page, read
 * 2026-11-16). The layers cover the Counties' ten lower-tier municipalities and the
 * separated City of Brockville. Neither has an accessibility column, so every
 * accessibility field stays UNKNOWN. The County Offices owner and roll-number columns
 * are not requested.
 */

const LAYER = "https://services3.arcgis.com/KQcdsE7S72bcD7R8/arcgis/rest/services";

export const LEEDS_GRENVILLE_JOBS: readonly G7LayerJob[] = [
  pointVenueJob("leeds-grenville-municipal-offices", {
    idKey: "OBJECTID",
    name: "Name",
    category: "Type",
    group: "civic_facility",
    address: "Reformloc",
    city: "Municipali",
  }),
  pointVenueJob("leeds-grenville-county-offices", {
    idKey: "OBJECTID",
    name: "Name",
    category: "Type",
    group: "civic_facility",
    address: "Reformloc",
    city: "City_Prov",
  }),
];

export const LEEDS_GRENVILLE_LAYERS: Readonly<Record<string, string>> = {
  "leeds-grenville-municipal-offices": `${LAYER}/LG_MunicipalOffices_OpenData/FeatureServer/14`,
  "leeds-grenville-county-offices": `${LAYER}/LG_CountyOffices_OpenData/FeatureServer/10`,
};
