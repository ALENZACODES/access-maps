import { describe, expect, it } from "vitest";
import { mapLambtonAccessibleFacility } from "../../src/municipal/cities/lambton.js";
import { expectNoDerivedWheelchair, expectValid, feature, provenance } from "./g3-helpers.js";

/** Features below are copied from the County of Lambton service as retrieved on 2026-11-16, cut to the columns read. */
const ctx = provenance("lambton-accessible-facilities", "OGL-Lambton-2.0");

const sarnia = {
  Facility: "Sarnia Library",
  OBJECTID: 2,
  ACCOutsideBike: "Bicycle Rack",
  ACCOutsideParking: "Accessible Designated Parking",
  ACCEntranceDistance: "Parking Lot Entrance - Less Than 20 Metres",
  ACCEntranceAccess: "Ground Level Access",
  ACCEntranceStairs: "No Entry Stairs",
  ACCInsideResourcesLargePrint: "Large Print Books",
  ACCInsideResourcesSpokenBook: "Spoken Word Books",
  ACCInsideResourcesRollator: "Rollator",
  ACCInsideResourcesElevator: "Elevator Access",
  ACCInsideResourcesWheelchair: "Wheelchair Available",
  ACCInsideResourcesMagnifier: "Magnifier Reader",
  ACCWashroomsAccessible: "Accessible Washroom",
  ACCWashroomsBabyChangeTable: "Baby Change Table",
  ACCWashroomsAdultChangeTable: "Adult Change Table",
  ACCEntranceRamp: "Accessible Entrance",
  Address: "124 Christina Street South",
  City: "Sarnia",
  ACCInsideResourcesMobilityCharg: "Mobility Scooter Charging Station",
  Desc_: "https://www.lclibrary.ca/index.php?option=com_mtree&task=viewlink&link_id=20&Itemid=598",
  Facility_ID: 2,
};
const point = { x: -82.4077866448738, y: 42.969830227557495 };

describe("Lambton accessible facilities", () => {
  it("keeps every listed feature as the County's own phrase and derives no wheelchair value", () => {
    const [venue, washroom] = mapLambtonAccessibleFacility(feature(sarnia, point), ctx);
    expect(venue?.tranche).toBe("venue");
    expect(venue?.id).toBe("lambton-accessible-facilities:2");
    expect(venue?.region).toBe("n42.5_w082.5");
    expect(venue?.fields.name?.value).toBe("Sarnia Library");
    expect(venue?.fields.addr_housenumber?.value).toBe("124");
    expect(venue?.fields.addr_city?.value).toBe("Sarnia");
    expect(venue?.fields.wheelchair_description?.value).toBe(
      "ACCOutsideParking=Accessible Designated Parking; ACCEntranceDistance=Parking Lot Entrance - Less Than 20 Metres; " +
        "ACCEntranceAccess=Ground Level Access; ACCEntranceStairs=No Entry Stairs; ACCEntranceRamp=Accessible Entrance; " +
        "ACCInsideResourcesElevator=Elevator Access; ACCInsideResourcesWheelchair=Wheelchair Available; " +
        "ACCInsideResourcesRollator=Rollator; ACCInsideResourcesMobilityCharg=Mobility Scooter Charging Station; " +
        "ACCInsideResourcesLargePrint=Large Print Books; ACCInsideResourcesSpokenBook=Spoken Word Books; " +
        "ACCInsideResourcesMagnifier=Magnifier Reader; ACCOutsideBike=Bicycle Rack",
    );
    expect(venue?.fields.elevator?.value).toBe("UNKNOWN");
    expect(venue?.fields.ramp?.value).toBe("UNKNOWN");
    expect(venue?.fields.capacity_disabled?.value).toBe("UNKNOWN");
    expectNoDerivedWheelchair(venue!);
    expectValid(venue!);

    expect(washroom?.tranche).toBe("washroom");
    expect(washroom?.id).toBe("lambton-accessible-facilities:2:washroom");
    expect(washroom?.fields.published_accessibility?.value).toBe("ACCWashroomsAccessible=Accessible Washroom");
    expect(washroom?.fields.changing_table?.value).toBe("yes");
    expect(washroom?.fields.adult_changing_table?.value).toBe("yes");
    expect(washroom?.fields.lat?.derived).toBe(true);
    expect(washroom?.fields.parent_id?.value).toBe("lambton-accessible-facilities:2");
    expectNoDerivedWheelchair(washroom!);
    expectValid(washroom!);
  });

  it("does not read an empty column as no", () => {
    const row = {
      ...sarnia,
      ACCEntranceDistance: "",
      ACCInsideResourcesElevator: null,
      ACCWashroomsBabyChangeTable: null,
      ACCWashroomsAdultChangeTable: null,
    };
    const [venue, washroom] = mapLambtonAccessibleFacility(feature(row, point), ctx);
    expect(String(venue?.fields.wheelchair_description?.value)).not.toContain("Elevator");
    expect(String(venue?.fields.wheelchair_description?.value)).not.toContain("ACCEntranceDistance");
    expect(washroom?.fields.changing_table?.value).toBe("UNKNOWN");
    expect(washroom?.fields.adult_changing_table?.value).toBe("UNKNOWN");
  });

  it("adds no washroom record when the County lists no washroom feature", () => {
    const row = { ...sarnia, ACCWashroomsAccessible: "", ACCWashroomsBabyChangeTable: null, ACCWashroomsAdultChangeTable: null };
    expect(mapLambtonAccessibleFacility(feature(row, point), ctx)).toHaveLength(1);
  });

  it("leaves the description UNKNOWN when no feature is listed", () => {
    const row: Record<string, unknown> = { Facility: "Example Hall", OBJECTID: 99, Address: null, City: null, Desc_: null, Facility_ID: 99 };
    const [venue] = mapLambtonAccessibleFacility(feature(row, point), ctx);
    expect(venue?.fields.wheelchair_description?.value).toBe("UNKNOWN");
    expect(venue?.fields.addr_street?.value).toBe("UNKNOWN");
  });
});
