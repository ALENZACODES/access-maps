import { describe, expect, it } from "vitest";
import { mapTorontoCremWashroom, mapTorontoParkWashroom, mapTorontoStreetWashroom } from "../src/municipal/map.js";
import type { Provenance } from "../src/model/provenance.js";

const ctx: Provenance = {
  source_id: "toronto-park-washrooms",
  licence: "OGL-Toronto-1.0",
  retrieved_at: "2026-11-13",
  tier: 0,
};

describe("municipal washroom mapping", () => {
  it("keeps park accessible-feature text and does not translate it into wheelchair", () => {
    const record = mapTorontoParkWashroom(
      {
        _id: "1",
        ASSET_ID: "29561",
        LOCATION: "Lithuania Park",
        ALTERNATIVE_NAME: "Lithuania Park Washroom",
        TYPE: "Washroom Building",
        ACCESSIBLE_FEATURES: "Accessible Stall, Entrance Access Ramp",
        HOURS: "None",
        LOCATION_DETAILS: "Northwest corner",
        URL: "https://www.toronto.ca/example",
        ADDRESS: "155 Oakmount Rd",
        Reason: "Closed for the Season",
        Comments: "None",
        Status: "0",
        PostedDate: "2026-11-12T08:46:41",
        geometry: '{"coordinates": [[-79.46403823, 43.65900803]], "type": "MultiPoint"}',
      },
      ctx,
    );
    expect(record.fields.name?.value).toBe("Lithuania Park Washroom");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.published_accessibility?.value).toBe("Accessible Stall, Entrance Access Ramp");
    expect(record.fields.opening_hours?.value).toBe("UNKNOWN");
    expect(record.fields.opening_hours?.raw).toBe("None");
    expect(record.fields.description?.value).toBe("Closed for the Season");
    expect(record.fields.status?.value).toBe("0");
    expect(record.fields.posted_date?.value).toBe("2026-11-12");
    expect(record.fields.posted_date?.source_key).toBe("PostedDate");
    expect(record.fields.lat?.value).toBeCloseTo(43.659008);
    expect(record.fields.lon?.value).toBeCloseTo(-79.464038);
    expect(record.fields.seasonal?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair?.tier).toBe(0);
  });

  it("preserves an explicit None in accessible features", () => {
    const record = mapTorontoParkWashroom(
      {
        ASSET_ID: "2",
        ALTERNATIVE_NAME: "Example Washroom",
        ACCESSIBLE_FEATURES: "None",
        TYPE: "All-Gender Washroom, Accessible Washroom",
        geometry: '{"type":"Point","coordinates":[-79.3,43.7]}',
      },
      ctx,
    );
    expect(record.fields.published_accessibility?.value).toBe("None");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.facility_type?.value).toBe("All-Gender Washroom, Accessible Washroom");
  });

  it("maps CREM yes/no columns and leaves the street-furniture wheelchair unknown", () => {
    const crem = mapTorontoCremWashroom(
      {
        _id: "4",
        "Building Description": "City Hall",
        Address: "100 Queen Street West",
        "Building Type": "Municipal Government Building",
        "Washroom Info": "Accessible Female Washroom",
        "Gender Inclusive": "No",
        "Accessible Washroom": "Yes",
        "Hours Available": "Mon-Fri 8:30am-4:30pm",
        "Location Details": "Centre Core - 1",
        "Washroom Status": "Open - Public Access",
        geometry: '{"coordinates": [[-79.38394919, 43.65343052]], "type": "MultiPoint"}',
      },
      { ...ctx, source_id: "toronto-crem-washrooms" },
    );
    expect(crem.fields.wheelchair?.value).toBe("yes");
    expect(crem.fields.wheelchair?.raw).toBe("Yes");
    expect(crem.fields.unisex?.value).toBe("no");
    expect(crem.fields.facility_type?.value).toBe("Accessible Female Washroom");
    expect(crem.fields.male?.value).toBe("UNKNOWN");
    expect(crem.fields.female?.value).toBe("UNKNOWN");

    const street = mapTorontoStreetWashroom(
      {
        ID: "PW-00001",
        ADDRESSNUMBERTEXT: "318",
        ADDRESSSTREET: "Queens Quay W",
        ASSETTYPE: "Standard",
        STATUS: "Existing",
        geometry: '{"coordinates": [[-79.38686284, 43.63901253]], "type": "MultiPoint"}',
      },
      { ...ctx, source_id: "toronto-street-washrooms" },
    );
    expect(street.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(street.fields.name?.value).toBe("UNKNOWN");
    expect(street.fields.addr_housenumber?.value).toBe("318");
    expect(street.fields.addr_city?.value).toBe("UNKNOWN");
  });
});
