import type { DataRecord, Tranche } from "../../model/records.js";
import type { Provenance, Tier } from "../../model/provenance.js";
import { mapAjaxFacility, mapAjaxPlayground, mapAjaxTrail } from "./ajax.js";
import { mapMarkhamFacility, mapMarkhamTrail } from "./markham.js";
import { mapNewmarketLandmark, mapNewmarketParkFeature, mapNewmarketTrail, mapNewmarketTrailPoint } from "./newmarket.js";
import { mapOshawaCommunityCentre, mapOshawaTrail } from "./oshawa.js";
import { mapPickeringFacility, mapPickeringPark } from "./pickering.js";
import { mapWhitbyFacility, mapWhitbyPark, mapWhitbySidewalk, mapWhitbyTrail } from "./whitby.js";
import { mapYorkBusStop } from "./york-region.js";
import type { CityFeature } from "./york-durham-shared.js";

export interface CityJob {
  /** Registry source id. The registry download_url is the ArcGIS REST layer that is read. */
  id: string;
  tier: Tier;
  tranches: Tranche[];
  map: (feature: CityFeature, ctx: Provenance) => DataRecord | DataRecord[] | null;
}

/** One job per imported layer. `scripts/import-york-durham-cities.ts` runs them in this order. */
export const YORK_DURHAM_JOBS: readonly CityJob[] = [
  { id: "york-region-yrt-bus-stops", tier: 1, tranches: ["transit"], map: mapYorkBusStop },
  { id: "markham-city-facilities", tier: 0, tranches: ["venue"], map: mapMarkhamFacility },
  { id: "markham-trails", tier: 0, tranches: ["path"], map: mapMarkhamTrail },
  { id: "newmarket-park-features", tier: 0, tranches: ["venue", "washroom"], map: mapNewmarketParkFeature },
  { id: "newmarket-trails", tier: 0, tranches: ["path"], map: mapNewmarketTrail },
  { id: "newmarket-trail-points", tier: 0, tranches: ["venue", "washroom"], map: mapNewmarketTrailPoint },
  { id: "newmarket-landmarks", tier: 0, tranches: ["venue"], map: mapNewmarketLandmark },
  { id: "oshawa-community-centres", tier: 0, tranches: ["venue"], map: mapOshawaCommunityCentre },
  { id: "oshawa-trails", tier: 0, tranches: ["path"], map: mapOshawaTrail },
  { id: "whitby-town-facilities", tier: 0, tranches: ["venue"], map: mapWhitbyFacility },
  { id: "whitby-parks", tier: 0, tranches: ["venue", "washroom"], map: mapWhitbyPark },
  { id: "whitby-sidewalks", tier: 0, tranches: ["path"], map: mapWhitbySidewalk },
  { id: "whitby-trails", tier: 0, tranches: ["path"], map: mapWhitbyTrail },
  { id: "ajax-town-facilities", tier: 0, tranches: ["venue"], map: mapAjaxFacility },
  { id: "ajax-playgrounds", tier: 0, tranches: ["venue"], map: mapAjaxPlayground },
  { id: "ajax-recreational-trails", tier: 0, tranches: ["path"], map: mapAjaxTrail },
  { id: "pickering-facilities", tier: 0, tranches: ["venue"], map: mapPickeringFacility },
  { id: "pickering-parks", tier: 0, tranches: ["venue", "washroom"], map: mapPickeringPark },
];

/** GTFS feeds from `src/gtfs/feeds.ts` that this importer also reads. */
export const YORK_DURHAM_GTFS_FEED_IDS: readonly string[] = ["gtfs-drt"];
