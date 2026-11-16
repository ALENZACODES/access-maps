import type { DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import {
  dataset,
  featurePoint,
  pathRecord,
  pointFields,
  positiveNumber,
  present,
  published,
  venueRecord,
  washroomRecord,
  type CityFeature,
  type Row,
} from "./g3-shared.js";

/**
 * City of Windsor open-data layers retrieved on 2026-11-16 under the Open Government
 * Licence - The Corporation of the City of Windsor, version 1.0.
 */

/** Park washrooms. The layer gives the park and its address and no accessibility column. */
export function mapWindsorParkWashroom(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featurePoint(feature);
  return washroomRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "park_name", ctx),
      ...pointFields(point, ctx),
      facility_type: dataset("park washroom", ctx),
      address: published(row, "park_address", ctx),
    },
    ctx,
  );
}

/**
 * Playgrounds. asset_description is published as pairs such as
 * `SIZE=MEDIUM, ACCESSIBLE=NO`. The whole published text is kept in wheelchair_description
 * only when it carries an ACCESSIBLE pair. The City does not say what was assessed, so
 * wheelchair stays UNKNOWN.
 */
export function mapWindsorPlayground(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featurePoint(feature);
  const description = present(row, "asset_description");
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "park_name", ctx),
      category: dataset("playground", ctx),
      category_group: dataset("playground", ctx),
      ...pointFields(point, ctx),
      wheelchair_description: /\bACCESSIBLE=(?:YES|NO)\b/.test(description)
        ? fv(description, ctx, { source_key: "asset_description" })
        : unknownField(ctx, { source_key: "asset_description", raw: row.asset_description ?? "" }),
      ref: published(row, "gisid", ctx),
    },
    ctx,
  );
}

/** Drinking fountains in parks. The layer has no accessibility column. */
export function mapWindsorDrinkingFountain(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featurePoint(feature);
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name: published(row, "park_name", ctx),
      category: dataset("drinking fountain", ctx),
      category_group: dataset("drinking_water", ctx),
      ...pointFields(point, ctx),
      ref: published(row, "gisid", ctx),
    },
    ctx,
  );
}

/**
 * Bus stops (the City's asset layer, not the GTFS feed). has_full_access is the City's Y or
 * N flag and landing_type is the published landing surface; both are kept as published
 * pairs. The layer does not define has_full_access, so it is not turned into a wheelchair
 * value.
 */
export function mapWindsorBusStop(feature: CityFeature, ctx: Provenance): DataRecord {
  const row = feature.attributes;
  const point = featurePoint(feature);
  const streets = ["on_street", "at_street"].map((key) => ({ key, value: present(row, key) })).filter((part) => part.value !== "");
  const access = (row.has_full_access ?? "").trim().toUpperCase();
  const pairs: { key: string; value: string }[] = [];
  if (access === "Y" || access === "N") pairs.push({ key: "has_full_access", value: access });
  const landing = present(row, "landing_type");
  if (landing !== "") pairs.push({ key: "landing_type", value: landing });
  return venueRecord(
    `${ctx.source_id}:${row.OBJECTID}`,
    point,
    {
      name:
        streets.length === 0
          ? unknownField(ctx, { source_key: "on_street" })
          : fv(streets.map((part) => part.value).join(" / "), ctx, { source_key: streets.map((part) => part.key).join(",") }),
      category: dataset("bus stop", ctx),
      category_group: dataset("transit_stop", ctx),
      ...pointFields(point, ctx),
      wheelchair_description:
        pairs.length === 0
          ? unknownField(ctx, { source_key: "has_full_access,landing_type" })
          : fv(pairs.map((part) => `${part.key}=${part.value}`).join("; "), ctx, {
              source_key: pairs.map((part) => part.key).join(","),
            }),
      ref: published(row, "public_id", ctx),
    },
    ctx,
  );
}

function qualified(row: Row, key: string, ctx: Provenance): FieldValue {
  const raw = row[key] ?? "";
  if (raw.trim().toLowerCase() === "see qualifier for details") return unknownField(ctx, { source_key: key, raw });
  return published(row, key, ctx);
}

const NOT_A_SIDEWALK = new Set(["cycle", "paved shld"]);

/**
 * Sidewalks. sidewalk_type is Not Applicable for an ordinary sidewalk and otherwise mup
 * (multi-use path), walkwy (walkway), cycle (cycle track) or paved shld (paved shoulder).
 * Cycle tracks and paved shoulders are not sidewalks and return null, as do rows whose
 * service_status is not In Service or In Maintenance Period. sidewalk_width is the
 * published width; the layer does not state a unit for sidewalk_length, so no length is
 * stored.
 */
export function mapWindsorSidewalk(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  const status = (row.service_status ?? "").trim().toLowerCase();
  if (status !== "in service" && status !== "in maintenance period") return null;
  const type = present(row, "sidewalk_type");
  if (NOT_A_SIDEWALK.has(type.toLowerCase())) return null;
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    {
      kind: type === "" ? dataset("sidewalk", ctx) : fv(type, ctx, { source_key: "sidewalk_type" }),
      surface: qualified(row, "surface_type", ctx),
      width: positiveNumber(row, "sidewalk_width", ctx),
    },
    ctx,
  );
}

/**
 * Paths and trails. Only rows whose status starts with COMPLETE are imported; FUTURE,
 * PLANNED, IN PROGRESS and blank rows return null, as does the Roadway trail type, whose
 * line is a road. trail_type (Multi-use Trail, Walkway, Stairs, Pedestrian Bridge and so on)
 * is the kind. is_all_ages_and_abilities is the City's y or n flag and is kept as a
 * published pair.
 */
export function mapWindsorTrail(feature: CityFeature, ctx: Provenance): DataRecord | null {
  const row = feature.attributes;
  if (!(row.status ?? "").trim().toUpperCase().startsWith("COMPLETE")) return null;
  if ((row.trail_type ?? "").trim().toLowerCase() === "roadway") return null;
  const abilities = (row.is_all_ages_and_abilities ?? "").trim().toLowerCase();
  return pathRecord(
    feature,
    `${ctx.source_id}:${row.OBJECTID}`,
    {
      kind: published(row, "trail_type", ctx),
      surface: published(row, "surface_material_type", ctx),
      width: positiveNumber(row, "trail_width", ctx),
      wheelchair_description:
        abilities === "y" || abilities === "n"
          ? fv(`is_all_ages_and_abilities=${abilities}`, ctx, { source_key: "is_all_ages_and_abilities", raw: row.is_all_ages_and_abilities ?? "" })
          : unknownField(ctx, { source_key: "is_all_ages_and_abilities", raw: row.is_all_ages_and_abilities ?? "" }),
    },
    ctx,
  );
}

