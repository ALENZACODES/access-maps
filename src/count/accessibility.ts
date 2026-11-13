import { FIELD_LIST, TRANCHES, type Tranche } from "../model/records.js";

/**
 * Physical access conditions and aids.
 * Legal access, crossing type, lighting, fees, and washroom audience are context fields.
 * Names, categories, addresses, coordinates, hours, and geometry are in neither set.
 * toilets:wheelchair is stored on washroom.wheelchair.
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
    "surface",
    "smoothness",
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
    "changing_table_location",
    "adult_changing_table",
    "published_accessibility",
  ],
  path: [
    "surface",
    "smoothness",
    "incline",
    "width",
    "kerb",
    "tactile_paving",
    "wheelchair",
    "wheelchair_description",
    "step_count",
    "handrail",
    "max_slope",
    "min_width",
    "stair_count",
    "ramp",
  ],
  transit: ["wheelchair_boarding"],
};

/** Populated values that are not a physical measurement or aid. Reported on their own line. */
export const CONTEXT_FIELDS: Record<Tranche, readonly string[]> = {
  venue: ["access", "lit"],
  washroom: ["access", "fee", "changing_table_fee", "unisex", "male", "female", "locked", "supervised"],
  path: ["foot", "access", "lit", "crossing"],
  transit: [],
};

const ACCESSIBILITY_SETS: Record<Tranche, ReadonlySet<string>> = {
  venue: new Set(ACCESSIBILITY_FIELDS.venue),
  washroom: new Set(ACCESSIBILITY_FIELDS.washroom),
  path: new Set(ACCESSIBILITY_FIELDS.path),
  transit: new Set(ACCESSIBILITY_FIELDS.transit),
};

const CONTEXT_SETS: Record<Tranche, ReadonlySet<string>> = {
  venue: new Set(CONTEXT_FIELDS.venue),
  washroom: new Set(CONTEXT_FIELDS.washroom),
  path: new Set(CONTEXT_FIELDS.path),
  transit: new Set(CONTEXT_FIELDS.transit),
};

export function assertAccessibilityFieldsMatchSchema(): void {
  for (const tranche of TRANCHES) {
    const known = new Set(FIELD_LIST[tranche]);
    for (const field of [...ACCESSIBILITY_FIELDS[tranche], ...CONTEXT_FIELDS[tranche]]) {
      if (!known.has(field)) throw new Error(`${tranche}.${field} is not a schema field`);
    }
    for (const field of ACCESSIBILITY_FIELDS[tranche]) {
      if (CONTEXT_SETS[tranche].has(field)) throw new Error(`${tranche}.${field} is both an accessibility fact and a context field`);
    }
  }
}

export function isAccessibilityField(tranche: Tranche, fieldName: string): boolean {
  return ACCESSIBILITY_SETS[tranche].has(fieldName);
}

export function isContextField(tranche: Tranche, fieldName: string): boolean {
  return CONTEXT_SETS[tranche].has(fieldName);
}

export const ACCESSIBILITY_DEFINITION =
  "An accessibility fact is a piece whose field is a physical access condition or aid: wheelchair, step count, ramp, door, door width, elevator, kerb, surface, smoothness, incline, slope, changing table, tactile paving, handrail, width, hearing loop, braille, speech output, or automatic door. toilets:wheelchair is stored on the washroom wheelchair field. Legal access, crossing, lighting, fees, foot permission, and washroom audience or supervision are context fields and are counted on their own line. Names, categories, addresses, hours, operators, coordinates, and geometry are counted apart from both.";

export const CONTEXT_DEFINITION =
  "Context fields are populated values that are not a physical access measurement: access, crossing, lit, foot, fee, changing_table_fee, unisex, male, female, locked, and supervised. They are not accessibility facts and they are not names or geometry.";
