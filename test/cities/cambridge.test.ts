import { describe, expect, it } from "vitest";
import { mapCambridgePlayStructure } from "../../src/municipal/cities/cambridge.js";
import { expectNoDerivedWheelchair, expectValid, feature, provenance } from "./g3-helpers.js";

/** The feature below is copied from the City of Cambridge service as retrieved on 2026-11-16, cut to the columns read. */
const ctx = provenance("cambridge-play-structures", "OGL-Cambridge-2.0");

describe("Cambridge play structures", () => {
  const row = {
    OBJECTID: 5,
    ASSET_ID: "PS10178",
    STREET_NUMBER: 200,
    STREET_NAME: "CHRISTOPHER DR",
    PARK_NAME: "CHURCHILL PARK",
    PLAY_STRUCTURE_TYPE: "JR SR ADA SWING",
  };
  const point = { x: -80.309741, y: 43.343364 };

  it("stores the City's structure label unchanged and no wheelchair value", () => {
    const record = mapCambridgePlayStructure(feature(row, point), ctx);
    expect(record.id).toBe("cambridge-play-structures:5");
    expect(record.fields.category?.value).toBe("JR SR ADA SWING");
    expect(record.fields.name?.value).toBe("CHURCHILL PARK");
    expect(record.fields.addr_housenumber?.value).toBe("200");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(record.region).toBe("n43.0_w080.5");
    expectNoDerivedWheelchair(record);
    expectValid(record);
  });

  it("keeps a blank type UNKNOWN and leaves out a feature with no point", () => {
    const record = mapCambridgePlayStructure(feature({ ...row, PLAY_STRUCTURE_TYPE: null }, null), ctx);
    expect(record.fields.category?.value).toBe("UNKNOWN");
    expect(record.region).toBe("unknown");
  });
});
