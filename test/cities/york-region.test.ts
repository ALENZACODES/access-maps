import { describe, expect, it } from "vitest";
import { mapYorkBusStop } from "../../src/municipal/cities/york-region.js";
import { cityFeature } from "../../src/municipal/cities/york-durham-shared.js";
import { expectValid, provenance } from "./york-durham-helpers.js";

/** Rows are copied from the layer retrieved on 2026-11-16, cut to the columns read. */
const ctx = provenance("york-region-yrt-bus-stops", "York-Region-Open-Data-Licence-1.0", 1);

describe("York Region bus stops", () => {
  const no = cityFeature({
    attributes: {
      OBJECTID: 72,
      WHEELCHAIR_BOARDING: "No",
      STOP_ID: "9797",
      CODE: "9797",
      STOP_NAME: "YONGE / BLOOMINGTON",
      DESCRIPTION: "13720 Yonge St YONGE ST & BLOOMINGTON RD",
    },
    geometry: { x: -79.45905099999999, y: 43.96316900000005 },
  });
  const yesPart = cityFeature({
    attributes: {
      OBJECTID: 1,
      WHEELCHAIR_BOARDING: "Yes / Part",
      STOP_ID: "9700",
      CODE: "9700",
      STOP_NAME: "HWY 7 / MARTIN GROVE",
      DESCRIPTION: "5601 Highway 7 HIGHWAY 7 & MARTIN GROVE RD",
    },
    geometry: { x: -79.60865299999995, y: 43.77592500000003 },
  });

  it("stores the published No as wheelchair_boarding no, as a tier 1 operator claim", () => {
    const record = mapYorkBusStop(no, ctx)!;
    expect(record.tranche).toBe("transit");
    expect(record.id).toBe("york-region-yrt-bus-stops:9797");
    expect(record.region).toBe("n43.5_w079.5");
    expect(record.fields.wheelchair_boarding?.value).toBe("no");
    expect(record.fields.wheelchair_boarding?.raw).toBe("No");
    expect(record.fields.name?.value).toBe("YONGE / BLOOMINGTON");
    expect(record.fields.stop_code?.value).toBe("9797");
    expect(record.fields.lat?.value).toBe(43.963169);
    expectValid(record, 1);
  });

  it("keeps Yes / Part as the published label and does not turn it into yes", () => {
    const record = mapYorkBusStop(yesPart, ctx)!;
    expect(record.fields.wheelchair_boarding?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_boarding?.raw).toBe("Yes / Part");
    expect(record.fields.description?.value).toBe(
      "DESCRIPTION=5601 Highway 7 HIGHWAY 7 & MARTIN GROVE RD; WHEELCHAIR_BOARDING=Yes / Part",
    );
    expectValid(record, 1);
  });

  it("leaves a blank flag UNKNOWN and skips a row with no stop id", () => {
    const blank = cityFeature({ attributes: { ...no.attributes, WHEELCHAIR_BOARDING: null }, geometry: { x: -79.4, y: 43.9 } });
    expect(mapYorkBusStop(blank, ctx)!.fields.wheelchair_boarding?.value).toBe("UNKNOWN");
    expect(mapYorkBusStop(cityFeature({ attributes: { STOP_ID: "" }, geometry: { x: -79.4, y: 43.9 } }), ctx)).toBeNull();
  });
});
