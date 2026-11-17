import { oneOf, pointVenueJob, trailJob, type G7LayerJob } from "./g7-helpers.js";

/**
 * Quinte Conservation layers retrieved on 2026-11-17 from the Authority's open-data
 * service (https://gis.quinteconservation.ca/qcagispub/rest/services/ODS/OpenDataService01/MapServer),
 * listed on https://data.quinteconservation.ca under the Quinte Conservation Authority Open
 * Data Licence v1.0 (linked from each item's licence field). The Authority's watersheds
 * cover parts of Hastings, Lennox and Addington, Prince Edward and Frontenac. Neither layer
 * has an accessibility column. A trail's DIFFICULTY is kept as the Authority's own
 * `DIFFICULTY=<value>` text in wheelchair_description; it is not a wheelchair yes or no.
 */

const LAYER = "https://gis.quinteconservation.ca/qcagispub/rest/services/ODS/OpenDataService01/MapServer";

export const QUINTE_CONSERVATION_JOBS: readonly G7LayerJob[] = [
  pointVenueJob("quinte-conservation-areas", {
    idKey: "OBJECTID",
    name: "NAME",
    fixedCategory: "conservation area",
    group: "park",
    address: "EMERGENCY_ADDRESS",
    addressBeforeComma: true,
    city: "MUNICIPALITY",
    keep: (row) => oneOf(row.STATUS, ["Active"]),
    extra: ["STATUS"],
  }),
  trailJob("quinte-conservation-trails", {
    idKey: "OBJECTID",
    kind: "trail",
    name: "NAME",
    labelledColumns: ["DIFFICULTY"],
    keep: (row) => oneOf(row.STATUS, ["Active"]),
    extra: ["STATUS"],
  }),
];

export const QUINTE_CONSERVATION_LAYERS: Readonly<Record<string, string>> = {
  "quinte-conservation-areas": `${LAYER}/0`,
  "quinte-conservation-trails": `${LAYER}/4`,
};
