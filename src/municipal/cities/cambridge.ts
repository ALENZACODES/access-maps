import type { DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import { civicColumns, dataset, featurePoint, pointFields, published, venueRecord, type CityFeature } from "./g3-shared.js";

/**
 * City of Cambridge Play Structures, retrieved on 2026-11-16 under the Open Government
 * Licence - City of Cambridge (Open Data Licence Version 2.0).
 *
 * PLAY_STRUCTURE_TYPE is the City's own label, such as JR SR SWING or JR SR ADA SWING, and
 * is stored unchanged as the category. The layer has no accessibility column, so a label
 * that mentions ADA is not turned into a wheelchair value.
 */
export function mapCambridgePlayStructure(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featurePoint(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "PARK_NAME", ctx),
      category: published(row, "PLAY_STRUCTURE_TYPE", ctx),
      category_group: dataset("playground", ctx),
      ...pointFields(point, ctx),
      ...civicColumns(row, "STREET_NUMBER", "STREET_NAME", ctx),
      ref: published(row, "ASSET_ID", ctx),
    },
    ctx,
  );
}
