import { buildRecord, type DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import { labelled, pointFields, published, regionOf, type CityFeature, type Row } from "./york-durham-shared.js";

/**
 * The Regional Municipality of York, "Bus Stops from GTFS", retrieved 2026-11-16.
 *
 * The layer is the Region's own point layer of York Region Transit stops. Its
 * WHEELCHAIR_BOARDING column holds two labels: "No" and "Yes / Part". "No" is stored as
 * wheelchair_boarding no. "Yes / Part" does not say whether boarding is possible or partly
 * possible, so wheelchair_boarding stays UNKNOWN with the label on `raw`, and the label is
 * also kept, with its column name, in the description. Every field is a tier 1 operator claim.
 */
export function mapYorkBusStop(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  const stopId = (row.STOP_ID ?? "").trim();
  if (stopId === "") return null;
  return buildRecord(
    "transit",
    `${ctx.source_id}:${stopId}`,
    regionOf(feature),
    {
      name: published(row, "STOP_NAME", ctx),
      ...pointFields(feature, ctx),
      stop_code: published(row, "CODE", ctx),
      location_type: fv("stop", ctx, { source_key: "layer" }),
      wheelchair_boarding: yorkWheelchairBoarding(row, ctx),
      description: labelled(row, ["DESCRIPTION", "WHEELCHAIR_BOARDING"], ctx),
    },
    ctx,
  );
}

function yorkWheelchairBoarding(row: Row, ctx: Provenance): FieldValue {
  const key = "WHEELCHAIR_BOARDING";
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  if (raw.toLowerCase() === "no") return fv("no", ctx, { source_key: key, raw });
  return unknownField(ctx, { source_key: key, raw });
}
