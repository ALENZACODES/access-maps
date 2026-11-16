import { describe, expect, it } from "vitest";
import { mapOxfordTrail } from "../../src/municipal/cities/oxford-county.js";
import { expectNoDerivedWheelchair, expectValid, feature, provenance } from "./g3-helpers.js";

/** Features below are copied from the County of Oxford OpenData map service as retrieved on 2026-11-16, cut to the columns read. */
const ctx = provenance("oxford-county-trails", "owner-permission-2026-11-16");

describe("County of Oxford trails", () => {
  it("keeps the County's Difficulty text as a published pair and never sets wheelchair", () => {
    const record = mapOxfordTrail(
      feature(
        { OBJECTID: 13, TYPE: "Park", FEATURE: "Loop", Status: "Existing", Material: "Natural (soil/mulch)", Difficulty: "Easy, wheelchair" },
        { paths: [[[-80.776876, 43.064167], [-80.778171, 43.064729], [-80.778896, 43.064926]]] },
      ),
      ctx,
    );
    expect(record?.fields.wheelchair_description?.value).toBe("Difficulty=Easy, wheelchair");
    expect(record?.fields.surface?.value).toBe("Natural (soil/mulch)");
    expect(record?.fields.kind?.value).toBe("TYPE=Park; FEATURE=Loop");
    expect(record?.region).toBe("n43.0_w081.0");
    if (record) {
      expectNoDerivedWheelchair(record);
      expectValid(record);
    }
  });

  it("leaves out the Road and Bike Lane lines and rows not published as Existing", () => {
    const line = { paths: [[[-80.767972, 43.145217], [-80.767816, 43.145062]]] };
    const road = { OBJECTID: 2, TYPE: "Park", FEATURE: "Road", Status: "Existing", Material: "Gravel, Paved, Natural", Difficulty: "Easy" };
    expect(mapOxfordTrail(feature(road, line), ctx)).toBeNull();
    const bikeLane = { OBJECTID: 39, TYPE: "Bike Lane", FEATURE: "Linear", Status: "Existing", Material: "Paved", Difficulty: null };
    expect(mapOxfordTrail(feature(bikeLane, line), ctx)).toBeNull();
    expect(mapOxfordTrail(feature({ ...road, FEATURE: "Loop", Status: "Proposed" }, line), ctx)).toBeNull();
  });
});
