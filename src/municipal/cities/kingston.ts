import { buildRecord, type DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import {
  attributesOf,
  civic,
  coded,
  dataset,
  lineFields,
  pointFields,
  pointOf,
  present,
  published,
  regionOf,
  ringMeanOf,
  spaceCount,
  type RawFeature,
  type Row,
} from "./g4-helpers.js";

/** City of Kingston open-data layers retrieved on 2026-11-16. */

/** CONTROL_TYPE domain on the Parking Lot layer, read 2026-11-16. */
export const KINGSTON_PARKING_CONTROL: Readonly<Record<string, string>> = {
  "0": "Attended",
  "1": "Pay and Display",
  "2": "Permit",
};

/**
 * Parking Lot Areas: fee-based lots, one polygon per lot. HANDICAP_SPACE is the published
 * count of designated spaces and is stored as capacity_disabled, including a published 0.
 * The stored point is the vertex mean of the lot outline, not an entrance.
 */
export function mapKingstonParkingLot(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const point = ringMeanOf(feature);
  const control = coded(row, "CONTROL_TYPE", KINGSTON_PARKING_CONTROL, ctx);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(point),
    {
      name: published(row, "MAP_LABEL", ctx),
      category:
        control.value === "UNKNOWN"
          ? dataset("fee-based parking lot", ctx)
          : fv(`fee-based parking lot, ${String(control.value)}`, ctx, { source_key: "CONTROL_TYPE", raw: row.CONTROL_TYPE ?? "" }),
      category_group: dataset("parking", ctx),
      ...pointFields(point, ctx, "geometry:vertex_mean"),
      operator: published(row, "OWNERSHIP", ctx),
      capacity_disabled: spaceCount(row, "HANDICAP_SPACE", ctx),
      ref: published(row, "LOT_ID", ctx),
    },
    ctx,
  );
}

/** The trail layer writes its Y/N domain as Y, N, Yes or No. */
function kingstonTrailAccessible(row: Row, ctx: Provenance): FieldValue {
  if (!("ACCESSIBLE" in row)) return unknownField(ctx);
  const raw = row.ACCESSIBLE ?? "";
  const lowered = raw.trim().toLowerCase();
  if (lowered === "y" || lowered === "yes") return fv("ACCESSIBLE=Yes", ctx, { source_key: "ACCESSIBLE", raw });
  if (lowered === "n" || lowered === "no") return fv("ACCESSIBLE=No", ctx, { source_key: "ACCESSIBLE", raw });
  return unknownField(ctx, { source_key: "ACCESSIBLE", raw });
}

/**
 * Trails. Only rows with STATUS 0 (ACTIVE) are imported; inactive and proposed trails
 * return null. The City's ACCESSIBLE flag is kept as `ACCESSIBLE=Yes` or `ACCESSIBLE=No`.
 * The layer does not say what was assessed, so wheelchair stays UNKNOWN.
 */
export function mapKingstonTrail(feature: RawFeature, ctx: Provenance): DataRecord | null {
  const row = attributesOf(feature);
  if ((row.STATUS ?? "").trim() !== "0") return null;
  const line = lineFields(feature, ctx);
  return buildRecord(
    "path",
    `${ctx.source_id}:${row.OBJECTID}`,
    line.region,
    {
      kind: published(row, "TRAIL_CLASS", ctx),
      footway: dataset("trail", ctx),
      wheelchair_description: kingstonTrailAccessible(row, ctx),
      signposted_as: published(row, "TRAILNAME", ctx),
      geometry: line.geometry,
      geometry_type: line.geometry_type,
    },
    ctx,
  );
}

/**
 * Points of Interest types that are parks, recreation places, civic buildings, parking
 * or transit places. Other types (businesses, schools, places of worship, utilities and
 * so on) are not imported. Type Washroom is the separate kingston-public-washrooms source.
 */
export const KINGSTON_POI_TYPES: Readonly<Record<string, string>> = {
  Playground: "park_feature",
  Park: "park",
  Parkette: "park",
  "Splash Pad": "park_feature",
  Beach: "park_feature",
  "Park Shelter": "park_feature",
  "Change Room": "park_feature",
  "Off-Leash Dog Park": "park_feature",
  "Boat Ramp": "park_feature",
  "Community Garden": "park_feature",
  "Outdoor Rink (Staffed)": "park_feature",
  "Outdoor Rink (Community)": "park_feature",
  "Outdoor Rink (Unstaffed)": "park_feature",
  "Trail Access": "trail_access",
  "Trail Access & Parking": "trail_access",
  "Trailhead & Parking": "trail_access",
  "Drink Fountain": "drinking_water",
  Library: "civic_facility",
  Arena: "civic_facility",
  "Recreation Facility": "civic_facility",
  "Municipal Government Facility": "civic_facility",
  "Government Centre": "civic_facility",
  Museum: "civic_facility",
  "Parking Lot": "parking",
  "Park and Ride": "parking",
  "Bus Transfer Station": "transit",
};

/**
 * Points of Interest. The layer has no accessibility column, so every accessibility field
 * stays UNKNOWN. A type outside KINGSTON_POI_TYPES returns null.
 */
export function mapKingstonPointOfInterest(feature: RawFeature, ctx: Provenance): DataRecord | null {
  const row = attributesOf(feature);
  const group = KINGSTON_POI_TYPES[present(row, "POI_TYPE_DESC")];
  if (!group) return null;
  const point = pointOf(feature);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(point),
    {
      name: published(row, "MAP_LABEL", ctx).value === "UNKNOWN" ? published(row, "POI_NAME", ctx) : published(row, "MAP_LABEL", ctx),
      category: published(row, "POI_TYPE_DESC", ctx),
      category_group: dataset(group, ctx),
      ...pointFields(point, ctx),
      ...civic(row.ADDRESS ?? "", "ADDRESS", ctx),
      operator: published(row, "OWNERSHIP", ctx),
      website: /^https?:\/\/\S+$/.test(present(row, "URL")) ? published(row, "URL", ctx) : unknownField(ctx, { source_key: "URL" }),
      ref: published(row, "POI_ID", ctx),
    },
    ctx,
  );
}

export const KINGSTON_JOBS = [
  { id: "kingston-parking-lots", tranches: ["venue" as const], map: mapKingstonParkingLot },
  { id: "kingston-trails", tranches: ["path" as const], map: mapKingstonTrail },
  { id: "kingston-points-of-interest", tranches: ["venue" as const], map: mapKingstonPointOfInterest },
];
