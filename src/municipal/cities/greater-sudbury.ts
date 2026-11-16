import { buildRecord, type DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import {
  attributesOf,
  civic,
  coded,
  dataset,
  labelled,
  lineFields,
  pointFields,
  pointOf,
  present,
  published,
  regionOf,
  type RawFeature,
  type Row,
} from "./g4-helpers.js";

/** City of Greater Sudbury open-data layers retrieved on 2026-11-16. */

/**
 * Parks and Playgrounds (RECREATION_VIEW_OPENDATA layer 4). The Accessibility column
 * holds Full, Partial or N/A. Full and Partial are kept as the City's own words in
 * wheelchair_description. N/A stays UNKNOWN. wheelchair stays UNKNOWN in every case.
 */
export function mapSudburyPlayground(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const point = pointOf(feature);
  const raw = row.Accessibility ?? "";
  const stated = present(row, "Accessibility");
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID_1 || row.OBJECTID}`,
    regionOf(point),
    {
      name: published(row, "Name_EN", ctx),
      category: published(row, "Category_E", ctx),
      category_group: dataset("park_feature", ctx),
      ...pointFields(point, ctx),
      ...civic(row.Address_EN ?? "", "Address_EN", ctx),
      addr_city: published(row, "Community", ctx),
      wheelchair_description:
        stated === "Full" || stated === "Partial"
          ? fv(`Accessibility=${stated}`, ctx, { source_key: "Accessibility", raw })
          : unknownField(ctx, { source_key: "Accessibility", raw }),
    },
    ctx,
  );
}

/** Recreation (RECREATION_VIEW_OPENDATA layer 2). The layer has no accessibility column. */
export function mapSudburyRecreation(feature: RawFeature, ctx: Provenance): DataRecord {
  const row = attributesOf(feature);
  const point = pointOf(feature);
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(point),
    {
      name: published(row, "Name_EN", ctx),
      category: published(row, "Category_EN", ctx),
      category_group: dataset("park_or_recreation_facility", ctx),
      ...pointFields(point, ctx),
      ...civic(row.Address_EN ?? "", "Address_EN", ctx),
      addr_city: published(row, "COMMUNITY", ctx),
      website: /^https?:\/\/\S+$/.test(present(row, "Website")) ? published(row, "Website", ctx) : unknownField(ctx, { source_key: "Website" }),
    },
    ctx,
  );
}

/** MATERIAL domain on Road Sidewalk Path Trail, read 2026-11-16. */
export const SUDBURY_MATERIAL: Readonly<Record<string, string>> = {
  A: "Asphalt",
  L: "Lockstone",
  C: "Concrete",
  G: "Granular",
  W: "Wood",
};

const SUDBURY_TRUE_FALSE: Readonly<Record<string, string>> = { "0": "no", "1": "yes" };
const SUDBURY_WALKING_TYPES = new Set(["Sidewalk", "Walkway", "Trail"]);

/** True for an active sidewalk, walkway or trail. Bike paths, shoulders and untyped lines are left out. */
export function sudburySegmentIsWalkway(row: Row): boolean {
  return (row.LIFECYCLESTATUS ?? "").trim() === "ACT" && SUDBURY_WALKING_TYPES.has((row.STYPE ?? "").trim());
}

function sudburyStairs(row: Row, ctx: Provenance): FieldValue {
  const notes: Row = {};
  const stairs = (row.STAIRS ?? "").trim();
  if (stairs === "1") notes.STAIRS = "True";
  if (stairs === "0") notes.STAIRS = "False";
  notes.WIDTH = row.WIDTH ?? "";
  return labelled(notes, ["STAIRS", "WIDTH"], ctx);
}

/**
 * Road Sidewalk Path Trail (Road_Dataset layer 14). Only segments that pass
 * sudburySegmentIsWalkway are imported (others return null): proposed, abandoned and
 * removed segments are not places a person can travel today. RAILING uses the layer's
 * 0 False / 1 True domain. STAIRS and WIDTH are kept as `COLUMN=value` text: the path
 * schema has no stairs yes/no field and the layer does not state the unit of WIDTH.
 */
export function mapSudburyWalkway(feature: RawFeature, ctx: Provenance): DataRecord | null {
  const row = attributesOf(feature);
  if (!sudburySegmentIsWalkway(row)) return null;
  const line = lineFields(feature, ctx);
  return buildRecord(
    "path",
    `${ctx.source_id}:${row.OBJECTID}`,
    line.region,
    {
      kind: published(row, "STYPE", ctx),
      footway: (row.STYPE ?? "").trim() === "Sidewalk" ? fv("sidewalk", ctx, { source_key: "STYPE", raw: row.STYPE ?? "" }) : unknownField(ctx, { source_key: "STYPE", raw: row.STYPE ?? "" }),
      surface: coded(row, "MATERIAL", SUDBURY_MATERIAL, ctx),
      handrail: coded(row, "RAILING", SUDBURY_TRUE_FALSE, ctx),
      wheelchair_description: sudburyStairs(row, ctx),
      geometry: line.geometry,
      geometry_type: line.geometry_type,
    },
    ctx,
  );
}

export const GREATER_SUDBURY_JOBS = [
  { id: "greater-sudbury-playgrounds", tranches: ["venue" as const], map: mapSudburyPlayground },
  { id: "greater-sudbury-recreation", tranches: ["venue" as const], map: mapSudburyRecreation },
  { id: "greater-sudbury-walkways", tranches: ["path" as const], map: mapSudburyWalkway },
];
