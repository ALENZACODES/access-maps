import { buildRecord, type DataRecord } from "../../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../../model/provenance.js";
import { attributesOf, coded, dataset, lineFields, present, published, type RawFeature, type Row } from "./g4-helpers.js";
import { lineParts, partId } from "./g6-helpers.js";
import { pointVenueJob, type G7LayerJob } from "./g7-helpers.js";

/**
 * Central Lake Ontario Conservation Authority (CLOCA) layers retrieved on 2026-11-17 from
 * https://geo.cloca.com/swa/rest/services/CLOCA/OPENDATA/MapServer, listed on the CLOCA open
 * data hub (https://cloca-camaps.opendata.arcgis.com) under the CLOCA Open Data Licence v1
 * linked from each item's licence field. The trail layer stores coded values; they are
 * spelled out through the layer's own published domains. DIFFICULTY is kept as the
 * Authority's own `DIFFICULTY=<value>` text in wheelchair_description, not a wheelchair yes or no.
 */

/** Coded-value domains published on layer 20 (CLOCA_ExistingTrails), read 2026-11-17. */
export const CLOCA_SURFACE: Readonly<Record<string, string>> = {
  AS: "Asphalt",
  BV: "Boulevard",
  CC: "Concrete",
  CL: "Cycling Lane",
  WCL: "Wider Curb Lane",
  WPS: "Wider Paved Shoulder",
  BW: "Boardwalk",
  DT: "Dirt",
  GR: "Gravel",
  LS: "Limestone",
  WC: "Wood Chips",
  ST: "Stairs",
  BR: "Bridge",
};
export const CLOCA_DIFFICULTY: Readonly<Record<string, string>> = { D: "Difficult", E: "Easy", I: "Intermediate" };
/** Surfaces that are on the roadway are left out. */
const ON_ROAD_SURFACES = new Set(["CL", "WCL", "WPS"]);

/** The Authority's difficulty code spelled out through its domain, as `DIFFICULTY=<value>` text. */
function difficultyText(code: string, ctx: Provenance): FieldValue {
  const label = CLOCA_DIFFICULTY[code];
  if (label === undefined) return unknownField(ctx, { source_key: "DIFFICULTY", raw: code });
  return fv(`DIFFICULTY=${label}`, ctx, { source_key: "DIFFICULTY", raw: code });
}

/** Existing trails. Only DESIGNATION OF (Off Road) rows with STATUS 1 are imported. */
export function mapClocaTrail(feature: RawFeature, ctx: Provenance): DataRecord[] | null {
  const row: Row = attributesOf(feature);
  if (present(row, "DESIGNATION") !== "OF" || present(row, "STATUS") !== "1") return null;
  if (ON_ROAD_SURFACES.has(present(row, "SURFACE"))) return null;
  const key = present(row, "OBJECTID");
  if (key === "") return null;
  const difficulty = present(row, "DIFFICULTY");
  return lineParts(feature).map(({ feature: piece, part }) => {
    const line = lineFields(piece, ctx);
    return buildRecord(
      "path",
      partId(ctx.source_id, key, part),
      line.region,
      {
        kind: dataset("trail", ctx),
        signposted_as: published(row, "NAME", ctx),
        surface: coded(row, "SURFACE", CLOCA_SURFACE, ctx),
        wheelchair_description: difficultyText(difficulty, ctx),
        geometry: line.geometry,
        geometry_type: line.geometry_type,
      },
      ctx,
    );
  });
}

export const CENTRAL_LAKE_ONTARIO_CONSERVATION_JOBS: readonly G7LayerJob[] = [
  pointVenueJob("cloca-conservation-areas", {
    idKey: "Property_ID",
    idFrom: "name",
    name: "ConservationArea",
    fixedCategory: "conservation area",
    group: "park",
    anchor: "ring_mean",
  }),
  {
    id: "cloca-trails",
    tranches: ["path"],
    fields: ["OBJECTID", "NAME", "DESIGNATION", "STATUS", "SURFACE", "DIFFICULTY"],
    map: mapClocaTrail,
  },
];

export const CENTRAL_LAKE_ONTARIO_CONSERVATION_LAYERS: Readonly<Record<string, string>> = {
  "cloca-conservation-areas": "https://geo.cloca.com/swa/rest/services/CLOCA/OPENDATA/MapServer/1",
  "cloca-trails": "https://geo.cloca.com/swa/rest/services/CLOCA/OPENDATA/MapServer/20",
};
