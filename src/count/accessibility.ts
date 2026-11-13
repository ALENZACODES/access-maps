import { FIELD_LIST, TRANCHES, type Tranche } from "../model/records.js";

/**
 * Fields that state a physical access condition or aid.
 * Names, categories, addresses, coordinates, hours, and geometry are not in these sets.
 * The lists are the field names already on each tranche. toilets:wheelchair is stored on
 * washroom.wheelchair, so it is counted with wheelchair.
 */
export const ACCESSIBILITY_FIELDS: Record<Tranche, readonly string[]> = {
  venue: [
    "wheelchair",
    "wheelchair_description",
    "entrance",
    "automatic_door",
    "door",
    "door_width",
    "ramp",
    "ramp_wheelchair",
    "ramp_stroller",
    "step_count",
    "incline",
    "kerb",
    "kerb_height",
    "tactile_paving",
    "handrail",
    "width",
    "access",
    "surface",
    "smoothness",
    "lit",
    "braille",
    "hearing_loop",
    "speech_output",
    "stroller",
    "capacity_disabled",
    "elevator",
  ],
  washroom: [
    "wheelchair",
    "wheelchair_description",
    "changing_table",
    "changing_table_fee",
    "changing_table_location",
    "adult_changing_table",
    "access",
    "fee",
    "unisex",
    "male",
    "female",
    "locked",
    "supervised",
    "published_accessibility",
  ],
  path: [
    "foot",
    "surface",
    "smoothness",
    "incline",
    "width",
    "kerb",
    "tactile_paving",
    "lit",
    "wheelchair",
    "wheelchair_description",
    "step_count",
    "handrail",
    "access",
    "max_slope",
    "min_width",
    "stair_count",
    "crossing",
    "ramp",
  ],
  transit: ["wheelchair_boarding"],
};

const ACCESSIBILITY_SETS: Record<Tranche, ReadonlySet<string>> = {
  venue: new Set(ACCESSIBILITY_FIELDS.venue),
  washroom: new Set(ACCESSIBILITY_FIELDS.washroom),
  path: new Set(ACCESSIBILITY_FIELDS.path),
  transit: new Set(ACCESSIBILITY_FIELDS.transit),
};

export function assertAccessibilityFieldsMatchSchema(): void {
  for (const tranche of TRANCHES) {
    const known = new Set(FIELD_LIST[tranche]);
    for (const field of ACCESSIBILITY_FIELDS[tranche]) {
      if (!known.has(field)) throw new Error(`${tranche}.${field} is not a schema field`);
    }
  }
}

export function isAccessibilityField(tranche: Tranche, fieldName: string): boolean {
  return ACCESSIBILITY_SETS[tranche].has(fieldName);
}

export const ACCESSIBILITY_DEFINITION =
  "An accessibility fact is a piece whose field is a physical access condition or aid: wheelchair, step count, ramp, door, door width, elevator, kerb, surface, smoothness, incline, slope, changing table, tactile paving, handrail, width, hearing loop, braille, speech output, automatic door, and the other fields listed in this report. Names, categories, addresses, hours, operators, coordinates, and geometry are pieces too, and they are counted apart from accessibility facts. toilets:wheelchair is stored on the washroom wheelchair field.";
