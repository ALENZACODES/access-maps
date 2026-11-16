import { describe, expect, it } from "vitest";
import { mapCambridgeSidewalk, mapCambridgeTrail } from "../../src/municipal/cities/cambridge.js";
import { expectNoDerivedWheelchair, expectValid, feature, provenance } from "./g3-helpers.js";

/** Features below are copied from the City of Cambridge map services as retrieved on 2026-11-16, cut to the columns read. */
const LICENCE = "owner-permission-2026-11-16";

describe("Cambridge trails", () => {
  const ctx = provenance("cambridge-trails", LICENCE);
  const line = { paths: [[[-80.295055, 43.338455], [-80.295049, 43.338472], [-80.295041, 43.338487]]] };

  it("keeps ACCESSIBLE=YES as the City's flag and never sets wheelchair", () => {
    const record = mapCambridgeTrail(
      feature({ OBJECTID: 5, TRAIL_TYPE: "PARK", STATUS: "IN SERVICE", SURFACE_MATERIAL: "ASPHALT", WIDTH: 2.6, ACCESSIBLE: "YES" }, line),
      ctx,
    );
    expect(record?.id).toBe("cambridge-trails:5");
    expect(record?.fields.wheelchair_description?.value).toBe("ACCESSIBLE=YES");
    expect(record?.fields.width?.value).toBe(2.6);
    expect(record?.fields.surface?.value).toBe("ASPHALT");
    expect(record?.fields.kind?.value).toBe("PARK");
    expect(record?.region).toBe("n43.0_w080.5");
    if (record) {
      expectNoDerivedWheelchair(record);
      expectValid(record);
    }
  });

  it("keeps ACCESSIBLE=NO and leaves a blank flag UNKNOWN", () => {
    const no = mapCambridgeTrail(
      feature({ OBJECTID: 10, TRAIL_TYPE: "PARK", STATUS: "IN SERVICE", SURFACE_MATERIAL: "SOIL", WIDTH: 2, ACCESSIBLE: "NO" }, line),
      ctx,
    );
    expect(no?.fields.wheelchair_description?.value).toBe("ACCESSIBLE=NO");
    if (no) expectNoDerivedWheelchair(no);
    const blank = mapCambridgeTrail(
      feature({ OBJECTID: 11, TRAIL_TYPE: "PARK", STATUS: "IN SERVICE", SURFACE_MATERIAL: "SOIL", WIDTH: 0, ACCESSIBLE: null }, line),
      ctx,
    );
    expect(blank?.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(blank?.fields.width?.value).toBe("UNKNOWN");
  });

  it("leaves out parking-lot, road and out-of-service lines", () => {
    const row = { OBJECTID: 34, TRAIL_TYPE: "PARKING LOT", STATUS: "IN SERVICE", SURFACE_MATERIAL: "ASPHALT", WIDTH: 2.5, ACCESSIBLE: null };
    expect(mapCambridgeTrail(feature(row, line), ctx)).toBeNull();
    expect(mapCambridgeTrail(feature({ ...row, TRAIL_TYPE: "ROAD" }, line), ctx)).toBeNull();
    expect(mapCambridgeTrail(feature({ ...row, TRAIL_TYPE: "PARK", STATUS: "PLANNED" }, line), ctx)).toBeNull();
  });
});

describe("Cambridge pedestrian network sidewalks", () => {
  const ctx = provenance("cambridge-sidewalks", LICENCE);

  it("imports SIDE_WALK rows with their width and a blank surface UNKNOWN", () => {
    const record = mapCambridgeSidewalk(
      feature(
        { OBJECTID: 1, ASSET_TYPE: "SIDE_WALK", STATUS: "IN SERVICE", SURFACE_MATERIAL: null, WIDTH: 1.2 },
        { paths: [[[-80.294386, 43.342876], [-80.294418, 43.342962], [-80.294587, 43.343396]]] },
      ),
      ctx,
    );
    expect(record?.fields.kind?.value).toBe("sidewalk");
    expect(record?.fields.width?.value).toBe(1.2);
    expect(record?.fields.surface?.value).toBe("UNKNOWN");
    if (record) {
      expectNoDerivedWheelchair(record);
      expectValid(record);
    }
  });

  it("leaves out WALKWAY and TRAIL rows, which repeat lines in the Trails layer", () => {
    const line = { paths: [[[-80.331765, 43.345835], [-80.331844, 43.345897]]] };
    const row = { OBJECTID: 9690, ASSET_TYPE: "WALKWAY", STATUS: "IN SERVICE", SURFACE_MATERIAL: "CONCRETE", WIDTH: 1.6 };
    expect(mapCambridgeSidewalk(feature(row, line), ctx)).toBeNull();
    expect(mapCambridgeSidewalk(feature({ ...row, ASSET_TYPE: "TRAIL" }, line), ctx)).toBeNull();
  });
});
