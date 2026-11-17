import { pointVenueJob, type G7LayerJob } from "./g7-helpers.js";

/**
 * County of Hastings open-data layers retrieved on 2026-11-16 from the County's open-data
 * hub (https://opendata-Hastings-GIS.hub.arcgis.com/) under the Open Government License –
 * Corporation of the County of Hastings, version 1.0 (stated in full in each item's licence
 * field). The layers cover the County's fourteen lower-tier municipalities; the hospital
 * layer also lists hospitals in Belleville and Quinte West. None has an accessibility
 * column, so every accessibility field stays UNKNOWN. The municipal office layer has a
 * phone column, which is not requested.
 */

const LAYER = "https://services1.arcgis.com/1xcPmb5WGexkkJ9w/arcgis/rest/services";

export const HASTINGS_COUNTY_JOBS: readonly G7LayerJob[] = [
  pointVenueJob("hastings-county-libraries", {
    idKey: "FID",
    name: "Name",
    fixedCategory: "library",
    group: "library",
    address: "civic_ad",
    city: "Community",
  }),
  pointVenueJob("hastings-county-sports-facilities", {
    idKey: "FID",
    name: "Name",
    category: "Fac_Typ",
    group: "recreation",
    address: "civic_ad",
    city: "Community",
  }),
  pointVenueJob("hastings-county-arenas", {
    idKey: "FID",
    name: "Name",
    category: "Fac_Typ",
    group: "recreation",
    address: "civic_ad",
    city: "Community",
    website: "web_lnk",
  }),
  pointVenueJob("hastings-county-hospitals", {
    idKey: "FID",
    name: "NAME",
    fixedCategory: "hospital",
    group: "healthcare",
    address: "ADDRESS",
    city: "AMAL_MUN",
  }),
  pointVenueJob("hastings-county-municipal-offices", {
    idKey: "FID",
    name: "NAME",
    fixedCategory: "municipal office",
    group: "civic_facility",
    address: "ADDRESS",
    city: "COMMUNITY",
    website: "WEBSITE",
  }),
];

export const HASTINGS_COUNTY_LAYERS: Readonly<Record<string, string>> = {
  "hastings-county-libraries": `${LAYER}/Libraries_OpenData/FeatureServer/0`,
  "hastings-county-sports-facilities": `${LAYER}/Sports_OpenData/FeatureServer/0`,
  "hastings-county-arenas": `${LAYER}/Arenas_OpenData/FeatureServer/0`,
  "hastings-county-hospitals": `${LAYER}/Hospitals_OpenData/FeatureServer/0`,
  "hastings-county-municipal-offices": `${LAYER}/MunicipalOffice_OpenData/FeatureServer/0`,
};
