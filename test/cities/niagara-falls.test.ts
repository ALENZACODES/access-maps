import { describe, expect, it } from "vitest";
import {
  mapNiagaraFallsPlayground,
  mapNiagaraFallsSidewalk,
  mapNiagaraFallsTrail,
} from "../../src/municipal/cities/niagara-falls.js";
import { geoFeature } from "../../src/municipal/cities/west-gta-shared.js";
import { readRegistry } from "../../src/registry.js";
import { ctxFor, expectValid, root } from "./west-shared.js";

/**
 * Features below are copied from the City of Niagara Falls layers retrieved on 2026-11-16, cut to
 * the first points of each line or outline. Rows built with a changed column are variations for the test.
 */
const ctx = (id: string) => ctxFor(id, "OGL-Niagara-Falls-1.0");

describe("Niagara Falls sidewalks", () => {
  const feature = geoFeature({
    geometry: { type: "LineString", coordinates: [[-79.1289960829999, 43.0834781510001], [-79.128831366, 43.0834839410001]] },
    properties: { OBJECTID: 1, ID: "RSW_00970", Street: "SALISBURY PL", SideOfRoad: "NORTH", Material: "CAST-IN-PLACE CONCRETE", Status: "ACTIVE" },
  });

  it("stores the published material as surface", () => {
    const record = mapNiagaraFallsSidewalk(feature, ctx("niagara-falls-sidewalks"));
    expect(record.tranche).toBe("path");
    expect(record.fields.surface).toMatchObject({ value: "CAST-IN-PLACE CONCRETE", source_key: "Material" });
    expect(record.fields.footway?.value).toBe("sidewalk");
    expect(record.fields.width?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("keeps a published UNKNOWN material UNKNOWN", () => {
    const record = mapNiagaraFallsSidewalk({ ...feature, properties: { ...feature.properties, Material: "UNKNOWN" } }, ctx("niagara-falls-sidewalks"));
    expect(record.fields.surface).toMatchObject({ value: "UNKNOWN", raw: "UNKNOWN" });
  });

  it("gives a feature with no geometry no cell", () => {
    const record = mapNiagaraFallsSidewalk({ ...feature, geometry: null }, ctx("niagara-falls-sidewalks"));
    expect(record.region).toBe("unknown");
  });
});

describe("Niagara Falls trails", () => {
  const feature = geoFeature({
    geometry: { type: "MultiLineString", coordinates: [[[-79.0959116436212, 43.1043552060021], [-79.095639626529, 43.1045318185635]]] },
    properties: { OBJECTID: 1, TYPE: "MULTI-USE", STATUS: "EXISTING", SURFACE: "ASPHALT", LIGHTING: "NO", LENGTH_M: 1407.5 },
  });

  it("stores type, surface and lighting for an existing trail", () => {
    const record = mapNiagaraFallsTrail(feature, ctx("niagara-falls-trails"));
    expect(record?.fields.kind?.value).toBe("MULTI-USE");
    expect(record?.fields.surface?.value).toBe("ASPHALT");
    expect(record?.fields.lit?.value).toBe("no");
    expect(record?.fields.length_m?.value).toBe(1407.5);
    expectValid(record!);
  });

  it("leaves out a trail with no status", () => {
    expect(mapNiagaraFallsTrail({ ...feature, properties: { ...feature.properties, STATUS: "" } }, ctx("niagara-falls-trails"))).toBeNull();
  });
});

describe("Niagara Falls playgrounds", () => {
  it("stores the play surface and never sets wheelchair", () => {
    const record = mapNiagaraFallsPlayground(
      geoFeature({
        geometry: { type: "Polygon", coordinates: [[[-79.0597714689999, 43.052626176], [-79.059738868, 43.0526721530001], [-79.059760029, 43.052681089], [-79.0597714689999, 43.052626176]]] },
        properties: { OBJECTID: 1, FeatureID: "CPG_00001", ParkID: "CFP_00026", UnitType: "PLAYGROUND", Surface: "WOOD FIBRE", Status: "ACTIVE" },
      }),
      ctx("niagara-falls-playgrounds"),
    );
    expect(record.tranche).toBe("venue");
    expect(record.fields.surface?.value).toBe("WOOD FIBRE");
    expect(record.fields.category?.value).toBe("PLAYGROUND");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.lat?.source_key).toBe("geometry:vertex_mean");
    expectValid(record);
  });
});

describe("Niagara Falls registry entries", () => {
  it("uses the City's licence for every source", () => {
    const sources = readRegistry(root).sources.filter((entry) => entry.id.startsWith("niagara-falls-"));
    expect(sources.length).toBe(3);
    for (const source of sources) {
      expect(source.licence_id).toBe("OGL-Niagara-Falls-1.0");
      expect(source.tier).toBe(0);
      expect(source.retrieved_at).toBe("2026-11-16");
    }
  });
});
