import { buildRecord, type DataRecord } from "../../model/records.js";
import { unknownField, type Provenance } from "../../model/provenance.js";
import {
  civic,
  dataset,
  firstPublished,
  pathRecords,
  pointFields,
  positiveNumber,
  present,
  published,
  regionOf,
  yesNo,
  type CityFeature,
} from "./york-durham-shared.js";

/** Town of Ajax open data, retrieved 2026-11-16. None of these layers has an accessibility column. */

/** Town Facilities (building outlines). The stored point is the vertex mean of the outline. */
export function mapAjaxFacility(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(feature),
    {
      name: published(row, "NAME", ctx),
      category: dataset("town facility", ctx),
      category_group: dataset("civic_facility", ctx),
      ...pointFields(feature, ctx),
      ...civic(row, "ADDRESS", ctx),
      ref: published(row, "FACILITYID", ctx),
    },
    ctx,
  );
}

/** Playgrounds (points): playgrounds, splash pads, skate parks and exercise equipment. LOCATION is the park name. */
export function mapAjaxPlayground(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(feature),
    {
      name: firstPublished(row, ["LOCATION", "LOCATION_CW"], ctx),
      category: published(row, "TYPE", ctx),
      category_group: dataset("park_feature", ctx),
      ...pointFields(feature, ctx),
      ref: published(row, "FACILITYID", ctx),
    },
    ctx,
  );
}

/**
 * Recreational Trails. Rows with STATUS = Removed or GRADE = Decommissioned are skipped
 * (null). The field alias gives WIDTH as "Width (m)". LENGTH is the section length; the
 * layer's own trail labels print the same number in metres. LIGHTING uses the layer's
 * Yes/No domain. GRADE is a condition rating (Very Good to Very Poor) and is not stored:
 * it is not an accessibility statement.
 */
export function mapAjaxTrail(feature: CityFeature, ctx: Provenance): DataRecord[] | null {
  const row = feature.attributes;
  if (present(row, "STATUS").toLowerCase() === "removed") return null;
  if (present(row, "GRADE").toLowerCase() === "decommissioned") return null;
  return pathRecords(feature, ctx, `${ctx.source_id}:${row.OBJECTID}`, (singlePart) => ({
    kind: dataset("recreational trail", ctx),
    surface: published(row, "SURFACE_TYPE", ctx),
    width: positiveNumber(row, "WIDTH", ctx),
    lit: yesNo(row, "LIGHTING", ctx),
    length_m: singlePart ? positiveNumber(row, "LENGTH", ctx) : unknownField(ctx, { source_key: "LENGTH" }),
  }));
}
