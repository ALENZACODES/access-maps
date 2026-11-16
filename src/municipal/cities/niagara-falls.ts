import type { DataRecord } from "../../model/records.js";
import type { Provenance } from "../../model/provenance.js";
import {
  dataset,
  objectId,
  pathRecord,
  positiveNumber,
  present,
  published,
  venueRecord,
  yesNo,
  type GeoFeature,
} from "./west-gta-shared.js";

/**
 * Mappers for City of Niagara Falls open-data layers retrieved on 2026-11-16 under the Open
 * Government Licence – Niagara Falls. Coded-domain columns are stored as the code the
 * service returns.
 */

/** Sidewalks. Material is stored as surface; a published UNKNOWN material stays UNKNOWN. */
export function mapNiagaraFallsSidewalk(feature: GeoFeature, ctx: Provenance): DataRecord {
  const row = feature.properties;
  return pathRecord(
    feature,
    objectId(row, ctx),
    {
      kind: dataset("sidewalk", ctx),
      footway: dataset("sidewalk", ctx),
      surface: published(row, "Material", ctx),
    },
    ctx,
  );
}

/**
 * Community Public Trails. Only rows whose STATUS is EXISTING are imported (others return
 * null): a row with no status is not stated to be an open trail. TYPE, SURFACE, LIGHTING
 * and LENGTH_M are stored as published.
 */
export function mapNiagaraFallsTrail(feature: GeoFeature, ctx: Provenance): DataRecord | null {
  const row = feature.properties;
  if (present(row, "STATUS").toLowerCase() !== "existing") return null;
  return pathRecord(
    feature,
    objectId(row, ctx),
    {
      kind: published(row, "TYPE", ctx),
      surface: published(row, "SURFACE", ctx),
      lit: yesNo(row, "LIGHTING", ctx),
      length_m: positiveNumber(row, "LENGTH_M", ctx),
    },
    ctx,
  );
}

/**
 * Playgrounds. Surface is the published play surface (artificial turf, wood fibre, sand,
 * gravel or rubber). The layer has no accessibility column, so wheelchair stays UNKNOWN.
 * The point is the vertex mean of the playground outline.
 */
export function mapNiagaraFallsPlayground(feature: GeoFeature, ctx: Provenance): DataRecord {
  const row = feature.properties;
  return venueRecord(
    feature,
    objectId(row, ctx),
    {
      category: published(row, "UnitType", ctx),
      category_group: dataset("playground", ctx),
      surface: published(row, "Surface", ctx),
      ref: published(row, "FeatureID", ctx),
    },
    ctx,
  );
}
