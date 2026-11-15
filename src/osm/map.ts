import { buildRecord, coordinateField, regionFromPoint, type DataRecord } from "../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../model/provenance.js";
import { pathPositions, representativePoint, type OsmGeometry } from "./geometry.js";

export interface OsmElement {
  osmType: "node" | "way" | "relation";
  osmId: string;
  tags: Record<string, string>;
  geometry: OsmGeometry | null;
}

const VENUE_KEYS = ["amenity", "shop", "tourism", "leisure", "healthcare"] as const;
const PATH_HIGHWAYS = new Set(["footway", "path", "pedestrian", "steps", "corridor", "crossing"]);
const CONDITIONAL_PATHS = new Set(["cycleway", "bridleway"]);
const PRACTITIONER_AMENITY = new Set(["doctors", "dentist"]);
const PRACTITIONER_HEALTHCARE = new Set([
  "doctor",
  "dentist",
  "psychotherapist",
  "physiotherapist",
  "psychologist",
  "podiatrist",
  "occupational_therapist",
  "speech_therapist",
  "midwife",
  "nurse",
  "counsellor",
  "counselor",
  "alternative",
  "audiologist",
  "optometrist",
]);

const PERSONAL_KEYS = new Set([
  "phone",
  "email",
  "fax",
  "mobile",
  "contact:phone",
  "contact:email",
  "contact:fax",
  "contact:mobile",
  "contact:name",
]);

export function isPersonalTag(key: string): boolean {
  const lowered = key.toLowerCase();
  if (PERSONAL_KEYS.has(lowered)) return true;
  if (lowered === "user" || lowered === "uid") return true;
  return lowered.includes("email") || lowered.includes("phone");
}

export function publicTags(tags: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (key.startsWith("@") || isPersonalTag(key)) continue;
    out[key] = value;
  }
  return out;
}

export function mapOsmElement(element: OsmElement, ctx: Provenance): DataRecord[] {
  const tags = element.tags;
  if (tags.amenity === "toilets") return [toiletRecord(element, ctx)];
  const venueKey = firstVenueKey(tags);
  if (venueKey) {
    const venue = venueRecord(element, ctx, venueKey);
    const attached = attachedWashroom(element, ctx, venue.id);
    return attached ? [venue, attached] : [venue];
  }
  if (isPathElement(tags)) return [pathRecord(element, ctx)];
  if (tags.entrance) return [entranceRecord(element, ctx)];
  if ((tags.kerb || tags.tactile_paving) && element.osmType === "node") return [pathRecord(element, ctx)];
  return [];
}

function firstVenueKey(tags: Record<string, string>): (typeof VENUE_KEYS)[number] | null {
  for (const key of VENUE_KEYS) {
    const value = tags[key];
    if (value && value.trim() && value.trim() !== "toilets") return key;
  }
  return null;
}

function isPathElement(tags: Record<string, string>): boolean {
  const highway = tags.highway?.trim() ?? "";
  if (PATH_HIGHWAYS.has(highway)) return true;
  if (!CONDITIONAL_PATHS.has(highway)) return false;
  const foot = tags.foot?.trim();
  return foot === "yes" || foot === "designated";
}

function elementId(element: OsmElement): string {
  return `osm:${element.osmType}/${element.osmId}`;
}

function pointOf(element: OsmElement): { lon: number; lat: number } | null {
  return representativePoint(element.geometry);
}

function venueRecord(
  element: OsmElement,
  ctx: Provenance,
  categoryGroup: (typeof VENUE_KEYS)[number],
): DataRecord {
  const tags = element.tags;
  const category = tags[categoryGroup]?.trim() ?? "";
  const point = pointOf(element);
  const sourceKey = point && element.geometry?.type === "Point" ? "geometry" : "geometry:vertex_mean";
  const partial: Record<string, FieldValue> = {
    category_group: fv(categoryGroup, ctx, { source_key: categoryGroup }),
    category: fv(category, ctx, { source_key: categoryGroup }),
    lat: coordinateField(point?.lat ?? null, ctx, sourceKey),
    lon: coordinateField(point?.lon ?? null, ctx, sourceKey),
    name: textTag(tags, "name", ctx),
    addr_housenumber: textTag(tags, "addr:housenumber", ctx),
    addr_street: textTag(tags, "addr:street", ctx),
    addr_city: textTag(tags, "addr:city", ctx),
    addr_postcode: textTag(tags, "addr:postcode", ctx),
    addr_unit: textTag(tags, "addr:unit", ctx),
    opening_hours: textTag(tags, "opening_hours", ctx),
    level: numericTag(tags, "level", ctx),
    operator: textTag(tags, "operator", ctx),
    brand: firstTag(tags, ["brand", "brand:en"], ctx),
    website: firstTag(tags, ["website", "contact:website", "url"], ctx),
    wheelchair: textTag(tags, "wheelchair", ctx),
    wheelchair_description: textTag(tags, "wheelchair:description", ctx),
    entrance: textTag(tags, "entrance", ctx),
    automatic_door: textTag(tags, "automatic_door", ctx),
    door: textTag(tags, "door", ctx),
    door_width: textTag(tags, "door:width", ctx),
    ramp: textTag(tags, "ramp", ctx),
    ramp_wheelchair: textTag(tags, "ramp:wheelchair", ctx),
    ramp_stroller: textTag(tags, "ramp:stroller", ctx),
    step_count: numericTag(tags, "step_count", ctx),
    incline: textTag(tags, "incline", ctx),
    kerb: textTag(tags, "kerb", ctx),
    kerb_height: textTag(tags, "kerb:height", ctx),
    tactile_paving: textTag(tags, "tactile_paving", ctx),
    handrail: joinedTag(tags, ["handrail", "handrail:left", "handrail:right", "handrail:center"], ctx),
    width: textTag(tags, "width", ctx),
    access: textTag(tags, "access", ctx),
    surface: textTag(tags, "surface", ctx),
    smoothness: textTag(tags, "smoothness", ctx),
    lit: textTag(tags, "lit", ctx),
    braille: textTag(tags, "braille", ctx),
    hearing_loop: joinedTag(tags, ["hearing_loop", "deaf:hearing_loop"], ctx),
    speech_output: textTag(tags, "speech_output", ctx),
    stroller: textTag(tags, "stroller", ctx),
    capacity_disabled: numericTag(tags, "capacity:disabled", ctx),
    indoor: textTag(tags, "indoor", ctx),
    elevator: textTag(tags, "elevator", ctx),
    ref: textTag(tags, "ref", ctx),
  };
  if (isPractitioner(categoryGroup, category)) {
    for (const key of ["name", "operator", "brand", "website"]) {
      partial[key] = unknownField(ctx);
    }
  }
  return buildRecord(
    "venue",
    elementId(element),
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    partial,
    ctx,
  );
}

function entranceRecord(element: OsmElement, ctx: Provenance): DataRecord {
  const point = pointOf(element);
  const sourceKey = point && element.geometry?.type === "Point" ? "geometry" : "geometry:vertex_mean";
  return buildRecord(
    "venue",
    elementId(element),
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    {
      category_group: fv("entrance", ctx, { source_key: "entrance" }),
      category: textTag(element.tags, "entrance", ctx),
      lat: coordinateField(point?.lat ?? null, ctx, sourceKey),
      lon: coordinateField(point?.lon ?? null, ctx, sourceKey),
      name: textTag(element.tags, "name", ctx),
      entrance: textTag(element.tags, "entrance", ctx),
      wheelchair: textTag(element.tags, "wheelchair", ctx),
      wheelchair_description: textTag(element.tags, "wheelchair:description", ctx),
      automatic_door: textTag(element.tags, "automatic_door", ctx),
      door: textTag(element.tags, "door", ctx),
      door_width: textTag(element.tags, "door:width", ctx),
      ramp: textTag(element.tags, "ramp", ctx),
      ramp_wheelchair: textTag(element.tags, "ramp:wheelchair", ctx),
      step_count: numericTag(element.tags, "step_count", ctx),
      kerb: textTag(element.tags, "kerb", ctx),
      tactile_paving: textTag(element.tags, "tactile_paving", ctx),
      handrail: joinedTag(element.tags, ["handrail", "handrail:left", "handrail:right", "handrail:center"], ctx),
      width: textTag(element.tags, "width", ctx),
      access: textTag(element.tags, "access", ctx),
      level: numericTag(element.tags, "level", ctx),
      ref: textTag(element.tags, "ref", ctx),
    },
    ctx,
  );
}

function toiletRecord(element: OsmElement, ctx: Provenance): DataRecord {
  const tags = element.tags;
  const point = pointOf(element);
  const sourceKey = point && element.geometry?.type === "Point" ? "geometry" : "geometry:vertex_mean";
  const access = textTag(tags, "access", ctx);
  return buildRecord(
    "washroom",
    elementId(element),
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    {
      name: textTag(tags, "name", ctx),
      lat: coordinateField(point?.lat ?? null, ctx, sourceKey),
      lon: coordinateField(point?.lon ?? null, ctx, sourceKey),
      facility_type: fv("toilets", ctx, { source_key: "amenity" }),
      wheelchair: textTag(tags, "wheelchair", ctx),
      wheelchair_description: textTag(tags, "wheelchair:description", ctx),
      changing_table: textTag(tags, "changing_table", ctx),
      changing_table_fee: textTag(tags, "changing_table:fee", ctx),
      changing_table_location: textTag(tags, "changing_table:location", ctx),
      adult_changing_table: textTag(tags, "changing_table:adult", ctx),
      access: access.value === "UNKNOWN" ? toiletsAccess(tags, ctx) : access,
      fee: textTag(tags, "fee", ctx),
      opening_hours: textTag(tags, "opening_hours", ctx),
      unisex: textTag(tags, "unisex", ctx),
      male: textTag(tags, "male", ctx),
      female: textTag(tags, "female", ctx),
      supervised: textTag(tags, "supervised", ctx),
      level: numericTag(tags, "level", ctx),
      indoor: textTag(tags, "indoor", ctx),
      operator: textTag(tags, "operator", ctx),
      addr_housenumber: textTag(tags, "addr:housenumber", ctx),
      addr_street: textTag(tags, "addr:street", ctx),
      addr_city: textTag(tags, "addr:city", ctx),
      addr_postcode: textTag(tags, "addr:postcode", ctx),
      description: textTag(tags, "description", ctx),
      locked: textTag(tags, "locked", ctx),
      drinking_water: textTag(tags, "drinking_water", ctx),
      shower: textTag(tags, "shower", ctx),
      disposal: textTag(tags, "toilets:disposal", ctx),
      capacity: numericTag(tags, "capacity", ctx),
      seasonal: textTag(tags, "seasonal", ctx),
      location: textTag(tags, "location", ctx),
      building: textTag(tags, "building", ctx),
      website: firstTag(tags, ["website", "contact:website", "url"], ctx),
    },
    ctx,
  );
}

function attachedWashroom(element: OsmElement, ctx: Provenance, parentId: string): DataRecord | null {
  const tags = element.tags;
  const toilets = tags.toilets?.trim() ?? "";
  const hasToilet =
    (toilets !== "" && toilets !== "no") ||
    Boolean(tags["toilets:wheelchair"]?.trim()) ||
    Boolean(tags.changing_table?.trim()) ||
    Boolean(tags["changing_table:adult"]?.trim());
  if (!hasToilet) return null;
  const point = pointOf(element);
  const sourceKey = "parent_geometry";
  const accessValues = new Set(["customers", "public", "private"]);
  const facilityType =
    toilets && toilets !== "no" && !accessValues.has(toilets)
      ? fv(toilets, ctx, { source_key: "toilets" })
      : unknownField(ctx);
  return buildRecord(
    "washroom",
    `osm:toilets-at:${element.osmType}/${element.osmId}`,
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    {
      lat: coordinateField(point?.lat ?? null, ctx, sourceKey, true),
      lon: coordinateField(point?.lon ?? null, ctx, sourceKey, true),
      facility_type: facilityType,
      wheelchair: textTag(tags, "toilets:wheelchair", ctx),
      wheelchair_description: textTag(tags, "toilets:wheelchair:description", ctx),
      changing_table: textTag(tags, "changing_table", ctx),
      changing_table_fee: textTag(tags, "changing_table:fee", ctx),
      changing_table_location: textTag(tags, "changing_table:location", ctx),
      adult_changing_table: textTag(tags, "changing_table:adult", ctx),
      access: toiletsAccess(tags, ctx),
      disposal: textTag(tags, "toilets:disposal", ctx),
      description: textTag(tags, "toilets:description", ctx),
      parent_id: fv(parentId, ctx, { source_key: "osm_id" }),
    },
    ctx,
  );
}

function pathRecord(element: OsmElement, ctx: Provenance): DataRecord {
  const tags = element.tags;
  const drawn = pathPositions(element.geometry);
  const anchor = drawn?.positions[0];
  const kind = pathKind(tags);
  return buildRecord(
    "path",
    elementId(element),
    regionFromPoint(anchor ? anchor[1] : null, anchor ? anchor[0] : null),
    {
      kind: fv(kind.value, ctx, { source_key: kind.source_key }),
      footway: textTag(tags, "footway", ctx),
      foot: textTag(tags, "foot", ctx),
      surface: textTag(tags, "surface", ctx),
      smoothness: textTag(tags, "smoothness", ctx),
      incline: textTag(tags, "incline", ctx),
      width: textTag(tags, "width", ctx),
      kerb: textTag(tags, "kerb", ctx),
      tactile_paving: textTag(tags, "tactile_paving", ctx),
      lit: textTag(tags, "lit", ctx),
      wheelchair: textTag(tags, "wheelchair", ctx),
      wheelchair_description: textTag(tags, "wheelchair:description", ctx),
      step_count: numericTag(tags, "step_count", ctx),
      handrail: joinedTag(tags, ["handrail", "handrail:left", "handrail:right", "handrail:center"], ctx),
      access: textTag(tags, "access", ctx),
      length_m: numericTag(tags, "length", ctx),
      max_slope: numericTag(tags, "max_slope", ctx),
      crossing: textTag(tags, "crossing", ctx),
      oneway: textTag(tags, "oneway", ctx),
      ramp: textTag(tags, "ramp", ctx),
      indoor: textTag(tags, "indoor", ctx),
      geometry: drawn ? fv(drawn.positions, ctx, { source_key: "geometry" }) : unknownField(ctx),
      geometry_type: drawn ? fv(drawn.geometryType, ctx, { source_key: "geometry" }) : unknownField(ctx),
    },
    ctx,
  );
}

function pathKind(tags: Record<string, string>): { value: string; source_key: string } {
  const highway = tags.highway?.trim();
  if (highway && (PATH_HIGHWAYS.has(highway) || CONDITIONAL_PATHS.has(highway))) {
    return { value: highway, source_key: "highway" };
  }
  if (tags.kerb?.trim()) return { value: "kerb", source_key: "kerb" };
  return { value: "tactile_paving", source_key: "tactile_paving" };
}

function toiletsAccess(tags: Record<string, string>, ctx: Provenance): FieldValue {
  const value = tags.toilets?.trim() ?? "";
  if (value === "customers" || value === "public" || value === "private") {
    return fv(value, ctx, { source_key: "toilets" });
  }
  return unknownField(ctx);
}

function isPractitioner(group: string, category: string): boolean {
  if (group === "amenity" && PRACTITIONER_AMENITY.has(category)) return true;
  return group === "healthcare" && PRACTITIONER_HEALTHCARE.has(category);
}

function textTag(tags: Record<string, string>, key: string, ctx: Provenance): FieldValue {
  const raw = tags[key];
  if (raw === undefined) return unknownField(ctx);
  return fv(raw, ctx, { source_key: key, raw: raw.trim() === "" ? raw : undefined });
}

function numericTag(tags: Record<string, string>, key: string, ctx: Provenance): FieldValue {
  const raw = tags[key];
  if (raw === undefined) return unknownField(ctx);
  const trimmed = raw.trim();
  if (trimmed === "") return unknownField(ctx, { source_key: key, raw });
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return fv(Number(trimmed), ctx, { source_key: key, raw: trimmed });
  return fv(trimmed, ctx, { source_key: key });
}

function firstTag(tags: Record<string, string>, keys: string[], ctx: Provenance): FieldValue {
  for (const key of keys) {
    const raw = tags[key];
    if (raw !== undefined && raw.trim() !== "") return fv(raw, ctx, { source_key: key });
  }
  return unknownField(ctx);
}

function joinedTag(tags: Record<string, string>, keys: string[], ctx: Provenance): FieldValue {
  const present = keys.filter((key) => (tags[key] ?? "").trim() !== "");
  if (present.length === 0) return unknownField(ctx);
  if (present.length === 1) {
    const key = present[0] as string;
    return fv(tags[key] ?? "", ctx, { source_key: key });
  }
  const joined = present.map((key) => `${key}=${(tags[key] ?? "").trim()}`).join(";");
  return fv(joined, ctx, { source_key: present.join(","), raw: joined });
}
