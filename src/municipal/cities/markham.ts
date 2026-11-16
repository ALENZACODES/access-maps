import { buildRecord, type DataRecord } from "../../model/records.js";
import { unknownField, type Provenance } from "../../model/provenance.js";
import {
  civic,
  dataset,
  firstPublished,
  pathRecords,
  pointFields,
  positiveNumber,
  published,
  regionOf,
  type CityFeature,
} from "./york-durham-shared.js";

/**
 * City of Markham open data, retrieved 2026-11-16.
 *
 * City Owned Facilities is a polygon layer with no accessibility column, so every
 * accessibility field stays UNKNOWN. The stored point is the vertex mean of the building
 * outline. It is not a surveyed entrance.
 */
export function mapMarkhamFacility(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  return buildRecord(
    "venue",
    `${ctx.source_id}:${row.OBJECTID}`,
    regionOf(feature),
    {
      name: firstPublished(row, ["LABEL", "NAME"], ctx),
      category: published(row, "TYPE", ctx),
      category_group: dataset("civic_facility", ctx),
      ...pointFields(feature, ctx),
      ...civic(row, "ADDRESS", ctx),
    },
    ctx,
  );
}

/**
 * Trails. Only segments the City marks PUBLIC_ = Yes are imported (others return null).
 * MATERIAL is a short code (ASPH, CONC, GRAV, LMST, BDWK, INTR, NTRL) with no published
 * code list, so the code is stored unchanged. LENGTH is stored as metres: on the segments
 * checked it matched the length of the drawn line in metres. A feature drawn in several
 * parts gives one record per part, and the whole-feature LENGTH is not repeated on them.
 */
export function mapMarkhamTrail(feature: CityFeature, ctx: Provenance): DataRecord[] | null {
  const row = feature.attributes;
  if ((row.PUBLIC_ ?? "").trim().toLowerCase() !== "yes") return null;
  return pathRecords(feature, ctx, `${ctx.source_id}:${row.OBJECTID}`, (singlePart) => ({
    kind: dataset("trail", ctx),
    surface: published(row, "MATERIAL", ctx),
    length_m: singlePart ? positiveNumber(row, "LENGTH", ctx) : unknownField(ctx, { source_key: "LENGTH" }),
  }));
}
