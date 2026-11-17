import { buildRecord, type DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import { attributesOf, civic, pointFields, pointOf, present, published, regionOf, type RawFeature } from "./g4-helpers.js";
import { mapPointVenue, oneOf, trailJob, type G7LayerJob, type PointVenueSpec } from "./g7-helpers.js";

/**
 * County of Lennox and Addington layers retrieved on 2026-11-17 from the County's open-data
 * portal (https://open-data-hub-lennoxaddington.hub.arcgis.com/). Each item's licence field
 * links the portal's Terms of Use page, which holds the Open Government Licence – County of
 * Lennox and Addington, version 2. Items whose own licence field instead carries the County's
 * all-rights-reserved terms (such as Dining, Lodging, POI) are not imported. The layers cover
 * Addington Highlands, Greater Napanee, Loyalist and Stone Mills. None has an accessibility
 * column, so every accessibility field stays UNKNOWN.
 */

const LAYER = "https://services.arcgis.com/YmmKxwNVvLQW5zcm/arcgis/rest/services";

/**
 * Facility Sites DESCRIPT values that are public places a person can visit. Cemeteries,
 * schools and child care centres, fire, police and EMS stations, works garages and waste
 * sites, housing and care residences, the correctional facility, heli pads, golf courses
 * and the blank row are left out.
 */
export const LA_PUBLIC_PLACE_TYPES = [
  "Municipal Park",
  "Boat Ramp / Dock",
  "Place of Worship",
  "Playground",
  "Ball Diamond",
  "Public Parking Lot",
  "Historic Site / Point of Interest",
  "Community Centre",
  "Soccer Pitch",
  "Trailhead",
  "Conservation Authority Park",
  "Municipal Administration",
  "Sport Complex",
  "Library",
  "Provincial Park",
  "County Forest",
  "Gymnasium",
  "Pavilion",
  "Hockey Arena",
  "Tennis Court",
  "Fair / Exhibition / Rodeo Grounds",
  "Fair Grounds",
  "Outdoor Ice Rink",
  "Public Washroom",
  "Canteen",
  "Museum & Archives",
  "Skateboard Park",
  "Track",
  "Trail Access",
  "Amherst Island Ferry",
  "Glenora Ferry",
  "Basketball Court",
  "Beach",
  "Cave System",
  "Curling Rink",
  "Emergency Department Napanee General Hospital",
  "Hospital",
  "Health Services",
  "Lawn Bowling",
  "Pool",
  "Splash Pad",
  "Train Station",
  "Winery",
  "Ontario Works/Social Housing/Child Services",
  "Continuing/Community Education",
] as const;

function laGroup(row: Record<string, string>): string {
  const type = present(row, "DESCRIPT");
  if (oneOf(type, ["Municipal Park", "Conservation Authority Park", "Provincial Park", "County Forest", "Beach", "Playground", "Splash Pad", "Skateboard Park"])) return "park";
  if (oneOf(type, ["Library"])) return "library";
  if (oneOf(type, ["Public Parking Lot"])) return "parking";
  if (oneOf(type, ["Trailhead", "Trail Access"])) return "trail_access";
  if (oneOf(type, ["Municipal Administration", "Ontario Works/Social Housing/Child Services"])) return "civic_facility";
  if (oneOf(type, ["Hospital", "Health Services", "Emergency Department Napanee General Hospital"])) return "healthcare";
  if (oneOf(type, ["Place of Worship"])) return "place_of_worship";
  if (oneOf(type, ["Historic Site / Point of Interest", "Museum & Archives", "Cave System", "Winery"])) return "culture";
  if (oneOf(type, ["Amherst Island Ferry", "Glenora Ferry", "Train Station"])) return "transport";
  if (oneOf(type, ["Continuing/Community Education"])) return "education";
  return "recreation";
}

const FACILITY_SPEC: PointVenueSpec = {
  idKey: "OBJECTID",
  name: "NAME",
  category: "DESCRIPT",
  group: laGroup,
  city: "COMMUNITY",
  website: "URL",
  keep: (row) => oneOf(row.DESCRIPT, LA_PUBLIC_PLACE_TYPES),
  extra: ["FACILITYID", "FCODE"],
};

/**
 * Facility Sites Point. FACILITYID holds the civic address on most rows (for example
 * `2 Factory Street`) and is read as the address. A Public Washroom row is stored as a
 * washroom record; every other kept row as a venue.
 */
export function mapLaFacility(feature: RawFeature, ctx: Provenance): DataRecord | null {
  const row = attributesOf(feature);
  if (oneOf(row.DESCRIPT, ["Public Washroom"])) {
    const key = present(row, "OBJECTID");
    if (key === "") return null;
    const point = pointOf(feature);
    return buildRecord(
      "washroom",
      `${ctx.source_id}:${key}`,
      regionOf(point),
      {
        name: published(row, "NAME", ctx),
        ...pointFields(point, ctx),
        facility_type: published(row, "DESCRIPT", ctx),
        ...civic(row.FACILITYID ?? "", "FACILITYID", ctx),
        addr_city: published(row, "COMMUNITY", ctx),
        website: published(row, "URL", ctx),
      },
      ctx,
    );
  }
  const record = mapPointVenue(FACILITY_SPEC, feature, ctx);
  if (!record) return null;
  Object.assign(record.fields, civic(row.FACILITYID ?? "", "FACILITYID", ctx));
  return record;
}

/** Sidewalks SURFACE values that are sidewalks or boardwalks; roadside walkways, aprons, gravel, bare asphalt and the uncollected row are left out. */
export const LA_SIDEWALK_SURFACES = ["Concrete Sidewalk", "Narrow Asphalt Sidewalk", "Asphalt Sidewalk", "Roadside Asphalt Sidewalk", "Wooden Boardwalk"] as const;

export const LENNOX_ADDINGTON_JOBS: readonly G7LayerJob[] = [
  {
    id: "lennox-addington-facility-sites",
    tranches: ["venue", "washroom"],
    fields: ["OBJECTID", "FACILITYID", "NAME", "FCODE", "DESCRIPT", "URL", "COMMUNITY"],
    map: mapLaFacility,
  },
  trailJob("lennox-addington-sidewalks", {
    idKey: "OBJECTID",
    kind: "sidewalk",
    surface: "SURFACE",
    keep: (row) => oneOf(row.SURFACE, LA_SIDEWALK_SURFACES),
  }),
];

export const LENNOX_ADDINGTON_LAYERS: Readonly<Record<string, string>> = {
  "lennox-addington-facility-sites": `${LAYER}/facility_sites_points_(public)/FeatureServer/0`,
  "lennox-addington-sidewalks": `${LAYER}/Sidewalks_(View)/FeatureServer/0`,
};
