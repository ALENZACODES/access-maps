import { describe, expect, it } from "vitest";
import {
  arcFeature,
  mapOttawaParkFeature,
  mapOttawaParkParking,
  mapOttawaPublicWashroom,
  mapTorontoAccessibleStall,
  mapTorontoCommunityCentreWashroom,
  mapTorontoDrinkingFountain,
  mapTorontoLibraryBranch,
  mapTorontoParkFacility,
  mapTorontoPedestrianSegment,
  mapTorontoTrafficSignal,
  torontoSegmentHasWalkway,
} from "../src/municipal/city-open-data.js";
import { CITY_JOBS, OTTAWA_PARK_LAYERS } from "../scripts/import-city-open-data.js";
import { scrubRecord } from "../src/privacy/scrub.js";
import { readRegistry } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";
import type { Provenance } from "../src/model/provenance.js";
import type { DataRecord } from "../src/model/records.js";
import path from "node:path";

/** Rows below are copied from the publisher files retrieved on 2026-11-16, cut to the columns read. */
const toronto = (source_id: string): Provenance => ({ source_id, licence: "OGL-Toronto-1.0", retrieved_at: "2026-11-16", tier: 0 });
const ottawa = (source_id: string): Provenance => ({
  source_id,
  licence: "Ottawa-Open-Data-Licence-2.0",
  retrieved_at: "2026-11-16",
  tier: 0,
});

const root = path.resolve(import.meta.dirname, "..");
const validators = compileValidators(path.join(root, "schema"));

function expectValid(record: DataRecord): void {
  const clean = scrubRecord(record);
  const validate = validators.records[clean.tranche];
  expect(validate(clean), JSON.stringify(validate.errors)).toBe(true);
  for (const field of Object.values(clean.fields)) {
    expect(field.tier).toBe(0);
    expect(field.retrieved_at).toBe("2026-11-16");
  }
}

describe("Toronto accessible parking stalls", () => {
  const ctx = toronto("toronto-accessible-parking-stalls");
  const row = {
    _id: "1",
    CP_ID_TEXT: "852",
    CP_ID_NUM: "852",
    AODA_TYPE: "A",
    SOURCE: "2024 City of Toronto Aerial",
    NOTES: "None",
    geometry: '{"coordinates": [[-79.4192071666771, 43.6319378121579]], "type": "MultiPoint"}',
  };

  it("keeps the published stall type and never derives a count or a wheelchair value", () => {
    const record = mapTorontoAccessibleStall(row, ctx);
    expect(record.tranche).toBe("venue");
    expect(record.id).toBe("toronto-accessible-parking-stalls:1");
    expect(record.region).toBe("n43.5_w079.5");
    expect(record.fields.wheelchair_description?.value).toBe("AODA_TYPE=A; SOURCE=2024 City of Toronto Aerial");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.capacity_disabled?.value).toBe("UNKNOWN");
    expect(record.fields.ref?.value).toBe("852");
    expect(record.fields.lat?.value).toBe(43.631938);
    expectValid(record);
  });

  it("leaves the description UNKNOWN when the type is N/A and there is no note", () => {
    const record = mapTorontoAccessibleStall({ ...row, AODA_TYPE: "N/A" }, ctx);
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.raw).toBe("N/A");
  });

  it("keeps a published note when the type is not stated", () => {
    const record = mapTorontoAccessibleStall(
      { ...row, AODA_TYPE: "N/A", NOTES: "does not meet required minimum width for any accessible stall" },
      ctx,
    );
    expect(record.fields.wheelchair_description?.value).toBe(
      "NOTES=does not meet required minimum width for any accessible stall; SOURCE=2024 City of Toronto Aerial",
    );
  });
});

describe("Toronto traffic signals", () => {
  const ctx = toronto("toronto-traffic-signals");
  const row = {
    _id: "1",
    PX: "0002",
    MAIN_STREET: "JARVIS ST",
    MIDBLOCK_ROUTE: "None",
    SIDE1_STREET: "FRONT ST E",
    SIDE2_STREET: "None",
    APS_OPERATION: "None",
    AUDIBLEPEDSIGNAL: "",
    geometry: '{"coordinates": [[-79.37174554525774, 43.64747933881408]], "type": "MultiPoint"}',
  };

  it("keeps a blank audible-signal flag UNKNOWN", () => {
    const record = mapTorontoTrafficSignal(row, ctx);
    expect(record.id).toBe("toronto-traffic-signals:0002");
    expect(record.fields.name?.value).toBe("JARVIS ST / FRONT ST E");
    expect(record.fields.speech_output?.value).toBe("UNKNOWN");
    expect(record.fields.ref?.value).toBe("0002");
    expectValid(record);
  });

  it("maps only the two codes the readme defines", () => {
    expect(mapTorontoTrafficSignal({ ...row, AUDIBLEPEDSIGNAL: "1" }, ctx).fields.speech_output).toMatchObject({
      value: "yes",
      raw: "1",
      source_key: "AUDIBLEPEDSIGNAL",
      tier: 0,
    });
    expect(mapTorontoTrafficSignal({ ...row, AUDIBLEPEDSIGNAL: "0" }, ctx).fields.speech_output?.value).toBe("no");
    const undefinedCode = mapTorontoTrafficSignal({ ...row, AUDIBLEPEDSIGNAL: "-1" }, ctx).fields.speech_output;
    expect(undefinedCode?.value).toBe("UNKNOWN");
    expect(undefinedCode?.raw).toBe("-1");
  });
});

describe("Toronto library branches", () => {
  const ctx = toronto("toronto-library-branches");
  const row = {
    _id: "1",
    BranchCode: "AB",
    PhysicalBranch: "1",
    BranchName: "Albion",
    Address: "1515 Albion Road, Toronto, ON, M9V 1B2",
    PostalCode: "M9V 1B2",
    Website: "https://www.tpl.ca/albion",
    Telephone: "416-394-5170",
    PublicParking: "67",
    PublicWashroom: "1",
    Hours: "Mon 9 a.m. to 8:30 p.m.; Sun 12 p.m. to 5 p.m.",
    geometry: '{"coordinates": [[-79.5845, 43.73999]], "type": "MultiPoint"}',
  };

  it("imports the branch with every accessibility field UNKNOWN and no phone", () => {
    const records = mapTorontoLibraryBranch(row, ctx);
    expect(records).toHaveLength(2);
    const venue = records![0]!;
    expect(venue.tranche).toBe("venue");
    expect(venue.fields.name?.value).toBe("Albion");
    expect(venue.fields.addr_housenumber?.value).toBe("1515");
    expect(venue.fields.addr_street?.value).toBe("Albion Road");
    expect(venue.fields.addr_postcode?.value).toBe("M9V 1B2");
    for (const key of ["wheelchair", "wheelchair_description", "entrance", "elevator", "capacity_disabled", "automatic_door"]) {
      expect(venue.fields[key]?.value).toBe("UNKNOWN");
    }
    expect(JSON.stringify(records)).not.toContain("416-394-5170");
    expectValid(venue);
  });

  it("adds a washroom record with a derived coordinate when the file says there is a public washroom", () => {
    const washroom = mapTorontoLibraryBranch(row, ctx)![1]!;
    expect(washroom.tranche).toBe("washroom");
    expect(washroom.id).toBe("toronto-library-branches:AB:washroom");
    expect(washroom.fields.parent_id?.value).toBe("toronto-library-branches:AB");
    expect(washroom.fields.lat?.derived).toBe(true);
    expect(washroom.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(washroom);
  });

  it("adds no washroom when the column is blank, and skips a row that is not a physical branch", () => {
    expect(mapTorontoLibraryBranch({ ...row, PublicWashroom: "" }, ctx)).toHaveLength(1);
    expect(mapTorontoLibraryBranch({ ...row, PhysicalBranch: "0" }, ctx)).toBeNull();
  });
});

describe("Toronto drinking fountains and park facilities", () => {
  it("keeps None in ACCESSIBLE_FEATURES as UNKNOWN", () => {
    const record = mapTorontoDrinkingFountain(
      {
        _id: "1",
        ASSET_ID: "849310",
        LOCATION: "Holmes Park",
        ALTERNATIVE_NAME: "Holmes Park Drinking Water Station",
        TYPE: "Bottle Filling Station, Drinking Fountain",
        ACCESSIBLE_FEATURES: "None",
        HOURS: "None",
        URL: "https://www.toronto.ca/explore-enjoy/parks-recreation/places-spaces/parks-and-recreation-facilities/location/?id=3815",
        ADDRESS: "25 Holmes Ave",
        Status: "0",
        geometry: '{"coordinates": [[-79.41343458, 43.77796389]], "type": "MultiPoint"}',
      },
      toronto("toronto-drinking-fountains"),
    );
    expect(record.fields.name?.value).toBe("Holmes Park Drinking Water Station");
    expect(record.fields.category?.value).toBe("Bottle Filling Station, Drinking Fountain");
    expect(record.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(record.fields.wheelchair_description?.raw).toBe("None");
    expect(record.fields.opening_hours?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("imports a park with no accessibility value and does not store amenities or a phone", () => {
    const record = mapTorontoParkFacility(
      {
        _id: "1",
        LOCATIONID: "752",
        ASSET_ID: "936",
        ASSET_NAME: "SENTINEL PARK",
        TYPE: "Park",
        AMENITIES: "Ball Diamond, Playground, Washroom",
        ADDRESS: "295 Sentinel Rd",
        PHONE: "None",
        URL: "https://www.toronto.ca/explore-enjoy/parks-recreation/places-spaces/parks-and-recreation-facilities/location/?id=752",
        geometry: '{"coordinates": [[-79.4985517188061, 43.7552003461125]], "type": "MultiPoint"}',
      },
      toronto("toronto-parks-recreation-facilities"),
    );
    expect(record.id).toBe("toronto-parks-recreation-facilities:752");
    expect(record.fields.category?.value).toBe("Park");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(JSON.stringify(record)).not.toContain("Playground");
    expectValid(record);
  });
});

describe("Toronto community centre washrooms", () => {
  const ctx = toronto("toronto-community-centre-washrooms");
  const row = {
    _id: "1",
    "Association of Community Centre Name": "519 Church Street Community Centre (the 519)",
    Address: "519 Church Street, Toronto, ON",
    "Postal Code": "M4Y 2C9",
    Phone: "416-392-6874",
    Email: "info@the519.org",
    Website: '<a href="https://www.the519.org/">519 Church Street Community Centre (the 519)</a>',
    "AOCC ID": "1",
    "Public Washroom": "1",
    Accessible: "Yes",
    "All Gender Washrooms": "Yes",
    Hours: "Monday 9 a.m. to 10 p.m.",
    "Washroom Details": "All-gender washrooms are centrally located on each floor.",
    geometry: '{"coordinates": [[-79.3809426167157, 43.6665519590237]], "type": "MultiPoint"}',
  };

  it("keeps Accessible as the published flag and leaves wheelchair UNKNOWN", () => {
    const record = mapTorontoCommunityCentreWashroom(row, ctx)!;
    expect(record.tranche).toBe("washroom");
    expect(record.fields.published_accessibility?.value).toBe("Accessible=Yes");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.unisex?.value).toBe("yes");
    expect(record.fields.website?.value).toBe("https://www.the519.org/");
    expect(record.fields.address?.value).toBe("519 Church Street, Toronto, ON");
    const text = JSON.stringify(scrubRecord(record));
    expect(text).not.toContain("416-392-6874");
    expect(text).not.toContain("info@the519.org");
    expectValid(record);
  });

  it("skips a centre the file says has no public washroom", () => {
    expect(mapTorontoCommunityCentreWashroom({ ...row, "Public Washroom": "0" }, ctx)).toBeNull();
  });
});

describe("Toronto pedestrian network", () => {
  const ctx = toronto("toronto-pedestrian-network");
  const row = {
    _id: "3",
    OBJECTID: "3",
    ROAD_TYPE: "Local",
    SIDEWALK_CODE: "2",
    SIDEWALK_DESCRIPTION: "Sidewalk on north side only",
    CROSSWALK: "",
    CROSSWALK_TYPE: " ",
    PX: " ",
    PX_TYPE: " ",
    LENGTH: "117.6712",
    geometry: '{"coordinates": [[[-79.5639645086874, 43.737821014982], [-79.5629316779705, 43.7374296840512]]], "type": "MultiLineString"}',
  };

  it("imports a segment with a stated sidewalk and keeps unpublished path facts UNKNOWN", () => {
    const record = mapTorontoPedestrianSegment(row, ctx)!;
    expect(record.tranche).toBe("path");
    expect(record.fields.kind?.value).toBe("Local");
    expect(record.fields.footway?.value).toBe("Sidewalk on north side only");
    expect(record.fields.length_m?.value).toBe(117.67);
    expect(record.fields.crossing?.value).toBe("UNKNOWN");
    expect(record.fields.geometry_type?.value).toBe("LineString");
    expect(record.fields.geometry?.value).toEqual([
      [-79.563965, 43.737821],
      [-79.562932, 43.73743],
    ]);
    for (const key of ["surface", "width", "incline", "kerb", "wheelchair", "smoothness", "tactile_paving"]) {
      expect(record.fields[key]?.value).toBe("UNKNOWN");
    }
    expectValid(record);
  });

  it("keeps the crosswalk type code unchanged", () => {
    const record = mapTorontoPedestrianSegment(
      { ...row, ROAD_TYPE: "Walkway", SIDEWALK_DESCRIPTION: "City walkway", CROSSWALK: "1", CROSSWALK_TYPE: "ts" },
      ctx,
    )!;
    expect(record.fields.crossing?.value).toBe("ts");
  });

  it("does not import a roadway the publisher says has no full sidewalk", () => {
    for (const description of [
      "No sidewalk on either side",
      "No Sidewalk on either side",
      "Laneway without any sidewalks",
      "Partial sidewalk on at least one side",
      "Laneway with at least partial sidewalk on one side",
      "Roadway under development; some sidewalk present",
      "Not applicable",
      "",
    ]) {
      expect(mapTorontoPedestrianSegment({ ...row, SIDEWALK_DESCRIPTION: description }, ctx), description).toBeNull();
    }
    expect(torontoSegmentHasWalkway({ ROAD_TYPE: "Walkway", SIDEWALK_DESCRIPTION: "No sidewalk on either side" })).toBe(false);
  });

  it("imports trails, pathways and walkways by road type, and named-side sidewalks", () => {
    expect(torontoSegmentHasWalkway({ ROAD_TYPE: "Trail", SIDEWALK_DESCRIPTION: "Not applicable" })).toBe(true);
    expect(torontoSegmentHasWalkway({ ROAD_TYPE: "Pathway", SIDEWALK_DESCRIPTION: "N/A" })).toBe(true);
    expect(torontoSegmentHasWalkway({ ROAD_TYPE: "Collector", SIDEWALK_DESCRIPTION: "Sidewalk on both sides" })).toBe(true);
    expect(torontoSegmentHasWalkway({ ROAD_TYPE: "Local", SIDEWALK_DESCRIPTION: "Sidewalk on east side; partially on other side" })).toBe(true);
    expect(torontoSegmentHasWalkway({ ROAD_TYPE: "Laneway", SIDEWALK_DESCRIPTION: "Laneway with sidewalk on west side" })).toBe(true);
    expect(torontoSegmentHasWalkway({ ROAD_TYPE: "Other", SIDEWALK_DESCRIPTION: "Recreational Trail" })).toBe(true);
  });
});

describe("Ottawa public washrooms", () => {
  const ctx = ottawa("ottawa-public-washrooms");
  const feature = arcFeature({
    attributes: {
      OBJECTID: 1623,
      UNIQUE_ID: "11481000",
      NAME: "Churchill Senior Recreation Centre",
      FACILITY_GROUP_NAME: "RECREATION",
      PUBLIC_TOILETS_YN: "1",
      ADDRESS: "345 RICHMOND RD    ",
      SEASONAL: "0",
      HOURS_MONDAY_OPEN: "08:30",
      HOURS_MONDAY_CLOSED: "16:00",
      HOURS_TUESDAY_OPEN: "08:30",
      HOURS_TUESDAY_CLOSED: "16:00",
      HOURS_SUNDAY_OPEN: null,
      HOURS_SUNDAY_CLOSED: null,
      CHANGE_STATION_CHILD: "1",
      CHANGE_STATION_ADULT: "0",
      FAMILY_TOILET: "0",
      ACCESSIBILITY: 3,
      REPORT_TELEPHONE: "311",
    },
    geometry: { x: -75.754552, y: 45.392395 },
  });

  it("maps the coded change-station columns and keeps the rating as a label", () => {
    const record = mapOttawaPublicWashroom(feature, ctx)!;
    expect(record.id).toBe("ottawa-public-washrooms:11481000:1623");
    expect(record.region).toBe("n45.0_w076.0");
    expect(record.fields.changing_table?.value).toBe("yes");
    expect(record.fields.adult_changing_table).toMatchObject({ value: "no", raw: "0", tier: 0 });
    expect(record.fields.published_accessibility?.value).toBe("3 - Maximum Accessibility");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expect(record.fields.opening_hours?.value).toBe("Mo 08:30-16:00; Tu 08:30-16:00");
    expect(record.fields.seasonal?.value).toBe("no");
    expect(record.fields.addr_housenumber?.value).toBe("345");
    expect(record.fields.addr_street?.value).toBe("RICHMOND RD");
    expectValid(record);
  });

  it("keeps NA and blank codes UNKNOWN", () => {
    const record = mapOttawaPublicWashroom(
      { ...feature, attributes: { ...feature.attributes, CHANGE_STATION_ADULT: "NA", ACCESSIBILITY: "", SEASONAL: "" } },
      ctx,
    )!;
    expect(record.fields.adult_changing_table?.value).toBe("UNKNOWN");
    expect(record.fields.adult_changing_table?.raw).toBe("NA");
    expect(record.fields.published_accessibility?.value).toBe("UNKNOWN");
    expect(record.fields.seasonal?.value).toBe("UNKNOWN");
  });

  it("skips a building the layer does not mark as having a public toilet", () => {
    expect(mapOttawaPublicWashroom({ ...feature, attributes: { ...feature.attributes, PUBLIC_TOILETS_YN: "0" } }, ctx)).toBeNull();
    expect(mapOttawaPublicWashroom({ ...feature, attributes: { ...feature.attributes, PUBLIC_TOILETS_YN: "" } }, ctx)).toBeNull();
  });
});

describe("Ottawa parks inventory", () => {
  const ctx = ottawa("ottawa-parks-inventory");

  it("keeps the City flag as a description and leaves wheelchair UNKNOWN", () => {
    const record = mapOttawaParkFeature(
      arcFeature({
        attributes: { OBJECTID: 12, FACILITYID: 4411, NAME: "play structure", ACCESSIBLE: "yes/oui", PARKNAME: "Alexander Park" },
        geometry: { x: -75.7361, y: 45.3801 },
      }),
      15,
      "Play Area - Structures",
      ctx,
    );
    expect(record.id).toBe("ottawa-parks-inventory:15:12");
    expect(record.fields.category?.value).toBe("Play Area - Structures");
    expect(record.fields.wheelchair_description).toMatchObject({ value: "ACCESSIBLE=yes", raw: "yes/oui" });
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("reads the short y and n codes and keeps a blank flag UNKNOWN", () => {
    const make = (flag: string | null) =>
      mapOttawaParkFeature(arcFeature({ attributes: { OBJECTID: 1, ACCESSIBLE: flag }, geometry: { x: -75.7, y: 45.4 } }), 28, "Benches", ctx, []);
    expect(make("n").fields.wheelchair_description?.value).toBe("ACCESSIBLE=no");
    expect(make("y").fields.wheelchair_description?.value).toBe("ACCESSIBLE=yes");
    expect(make(null).fields.wheelchair_description?.value).toBe("UNKNOWN");
  });

  it("never stores a bench dedication name", () => {
    const bench = OTTAWA_PARK_LAYERS.find((layer) => layer.id === 28)!;
    expect(bench.nameKeys).toEqual([]);
    const record = mapOttawaParkFeature(
      arcFeature({
        attributes: { OBJECTID: 7, ACCESSIBLE: "y", NAME: "Sample Dedication Name", PLAQUE_TEXT: "In memory of Sample Dedication Name" },
        geometry: { x: -75.7, y: 45.4 },
      }),
      bench.id,
      bench.name,
      ctx,
      bench.nameKeys,
    );
    expect(record.fields.name?.value).toBe("UNKNOWN");
    expect(JSON.stringify(record)).not.toContain("Sample Dedication Name");
  });

  it("puts a feature with no usable coordinate in the unknown region", () => {
    const record = mapOttawaParkFeature(arcFeature({ attributes: { OBJECTID: 3, ACCESSIBLE: "y" } }), 3, "Basketball Courts", ctx);
    expect(record.region).toBe("unknown");
    expect(record.fields.lat?.value).toBe("UNKNOWN");
  });
});

describe("Ottawa park parking", () => {
  const ctx = ottawa("ottawa-park-parking");
  const feature = arcFeature({
    attributes: {
      OBJECTID: 6,
      FACILITYID: 4951,
      ADDRESS: "755 Somerset Street, Ottawa",
      SURFACE: "asphalt",
      CAPACITY: 13,
      ACCESSIBLE_PARKING_CAPACITY: 1,
      LIGHTING: "no/non",
      ACCESSIBLE: "yes/oui",
      PARKNAME: null,
    },
    geometry: { x: -75.70921666584961, y: 45.410383335667596 },
  });

  it("stores the published accessible-space count", () => {
    const record = mapOttawaParkParking(feature, ctx);
    expect(record.fields.capacity_disabled).toMatchObject({ value: 1, raw: "1", source_key: "ACCESSIBLE_PARKING_CAPACITY" });
    expect(record.fields.surface?.value).toBe("asphalt");
    expect(record.fields.lit?.value).toBe("no");
    expect(record.fields.addr_housenumber?.value).toBe("755");
    expect(record.fields.addr_street?.value).toBe("Somerset Street");
    expect(record.fields.wheelchair?.value).toBe("UNKNOWN");
    expectValid(record);
  });

  it("stores a published zero and keeps a blank count UNKNOWN", () => {
    const zero = mapOttawaParkParking({ ...feature, attributes: { ...feature.attributes, ACCESSIBLE_PARKING_CAPACITY: "0" } }, ctx);
    expect(zero.fields.capacity_disabled?.value).toBe(0);
    const blank = mapOttawaParkParking({ ...feature, attributes: { ...feature.attributes, ACCESSIBLE_PARKING_CAPACITY: "" } }, ctx);
    expect(blank.fields.capacity_disabled?.value).toBe("UNKNOWN");
  });
});

describe("city open-data registry entries", () => {
  const registry = readRegistry(root);

  it("has a tier 0 municipal entry retrieved 2026-11-16 for every job", () => {
    for (const job of CITY_JOBS) {
      const source = registry.sources.find((entry) => entry.id === job.id);
      expect(source, job.id).toBeDefined();
      expect(source!.kind).toBe("municipal");
      expect(source!.tier).toBe(0);
      expect(source!.retrieved_at).toBe("2026-11-16");
      expect(source!.download_url).toMatch(/^https:\/\/(ckan0\.cf\.opendata\.inter\.prod-toronto\.ca|maps\.ottawa\.ca)\//);
      expect(source!.attribution.length).toBeGreaterThan(20);
    }
  });

  it("uses the licence the publisher states for each city", () => {
    for (const job of CITY_JOBS) {
      const source = registry.sources.find((entry) => entry.id === job.id)!;
      expect(source.licence_id).toBe(job.id.startsWith("ottawa-") ? "Ottawa-Open-Data-Licence-2.0" : "OGL-Toronto-1.0");
    }
  });
});
