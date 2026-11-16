import type { DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import { labelled, pathRecord, present, published, type CityFeature } from "./g3-shared.js";

/**
 * County of Oxford Trails (OXFORD_OpenData/MapServer/17), retrieved on 2026-11-16. The layer
 * covers trails in Woodstock and the other Oxford County municipalities. Its catalogue
 * record states no licence; the basis for including it is the repository owner's statement
 * of 2026-11-16, recorded in sources/registry.json.
 *
 * Difficulty is the County's own description, such as "Easy, wheelchair" or "Moderate to
 * steep grades", and is kept unchanged as the pair `Difficulty=<text>` in
 * wheelchair_description. It is not turned into a wheelchair yes or no. Material is the
 * surface; TYPE and FEATURE are kept together as the kind. Only rows with Status Existing
 * are imported, and the Road and Bike Lane lines are left out. The COMMENT, Image and
 * editor columns are not requested.
 */
export function mapOxfordTrail(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (present(row, "Status").toLowerCase() !== "existing") return null;
  if (present(row, "FEATURE").toLowerCase() === "road") return null;
  if (present(row, "TYPE").toLowerCase() === "bike lane") return null;
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    {
      kind: labelled(row, ["TYPE", "FEATURE"], ctx),
      surface: published(row, "Material", ctx),
      wheelchair_description: labelled(row, ["Difficulty"], ctx),
    },
    ctx,
  );
}
