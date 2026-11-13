import { utm17nToWgs84, webMercatorToWgs84 } from "../geo/project.js";
import { cell } from "../io/csv.js";
import { buildRecord, coordinateField, regionFromPoint, roundCoord, type DataRecord } from "../model/records.js";
import { fv, unknownField, type FieldValue, type Provenance } from "../model/provenance.js";

const BLANK = new Set(["", "none", "unknown", "n/a", "na", "null"]);

export function mapTorontoParkWashroom(row: Record<string, string>, ctx: Provenance): DataRecord {
  const point = parsePointGeometry(cell(row, "geometry"));
  const id = cell(row, "ASSET_ID") || cell(row, "_id");
  return buildRecord(
    "washroom",
    `toronto-park-washrooms:${id}`,
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    {
      name: firstText(row, ["ALTERNATIVE_NAME", "LOCATION", "AssetName"], ctx),
      lat: coordinateField(point?.lat ?? null, ctx, "geometry"),
      lon: coordinateField(point?.lon ?? null, ctx, "geometry"),
      facility_type: published(row, "TYPE", ctx, BLANK),
      opening_hours: published(row, "HOURS", ctx, BLANK),
      location: published(row, "LOCATION_DETAILS", ctx, BLANK),
      website: published(row, "URL", ctx, BLANK),
      address: published(row, "ADDRESS", ctx, BLANK),
      description: joinColumns(row, ["Comments", "Reason"], ctx, BLANK),
      status: published(row, "Status", ctx, new Set()),
      published_accessibility: published(row, "ACCESSIBLE_FEATURES", ctx, new Set(["", "unknown", "n/a", "na", "null"])),
    },
    ctx,
  );
}

export function mapTorontoStreetWashroom(row: Record<string, string>, ctx: Provenance): DataRecord {
  const point = parsePointGeometry(cell(row, "geometry"));
  const id = cell(row, "ID") || cell(row, "_id");
  return buildRecord(
    "washroom",
    `toronto-street-washrooms:${id}`,
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    {
      lat: coordinateField(point?.lat ?? null, ctx, "geometry"),
      lon: coordinateField(point?.lon ?? null, ctx, "geometry"),
      facility_type: published(row, "ASSETTYPE", ctx, BLANK),
      addr_housenumber: published(row, "ADDRESSNUMBERTEXT", ctx, BLANK),
      addr_street: published(row, "ADDRESSSTREET", ctx, BLANK),
      status: published(row, "STATUS", ctx, BLANK),
    },
    ctx,
  );
}

export function mapTorontoCremWashroom(row: Record<string, string>, ctx: Provenance): DataRecord {
  const point = parsePointGeometry(cell(row, "geometry"));
  return buildRecord(
    "washroom",
    `toronto-crem-washrooms:${cell(row, "_id")}`,
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    {
      name: published(row, "Building Description", ctx, BLANK),
      lat: coordinateField(point?.lat ?? null, ctx, "geometry"),
      lon: coordinateField(point?.lon ?? null, ctx, "geometry"),
      facility_type: published(row, "Washroom Info", ctx, BLANK),
      building: published(row, "Building Type", ctx, BLANK),
      address: published(row, "Address", ctx, BLANK),
      opening_hours: published(row, "Hours Available", ctx, BLANK),
      location: published(row, "Location Details", ctx, BLANK),
      status: published(row, "Washroom Status", ctx, BLANK),
      unisex: yesNo(row, "Gender Inclusive", ctx),
      wheelchair: yesNo(row, "Accessible Washroom", ctx),
    },
    ctx,
  );
}

export function parsePointGeometry(raw: string): { lon: number; lat: number } | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const geometry = parsed as { type?: unknown; coordinates?: unknown };
  let pair: unknown;
  if (geometry.type === "Point") pair = geometry.coordinates;
  else if (geometry.type === "MultiPoint" && Array.isArray(geometry.coordinates)) pair = geometry.coordinates[0];
  else return null;
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const lon = Number(pair[0]);
  const lat = Number(pair[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lon: roundCoord(lon), lat: roundCoord(lat) };
}

function published(
  row: Record<string, string>,
  key: string,
  ctx: Provenance,
  missing: Set<string>,
): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = row[key] ?? "";
  const trimmed = raw.trim();
  if (missing.has(trimmed.toLowerCase())) return unknownField(ctx, { source_key: key, raw });
  return fv(trimmed, ctx, { source_key: key });
}

function firstText(row: Record<string, string>, keys: string[], ctx: Provenance): FieldValue {
  for (const key of keys) {
    const value = published(row, key, ctx, BLANK);
    if (value.value !== "UNKNOWN") return value;
  }
  return unknownField(ctx);
}

function joinColumns(row: Record<string, string>, keys: string[], ctx: Provenance, missing: Set<string>): FieldValue {
  const present = keys
    .map((key) => ({ key, raw: (row[key] ?? "").trim() }))
    .filter((item) => item.raw !== "" && !missing.has(item.raw.toLowerCase()));
  if (present.length === 0) return unknownField(ctx);
  if (present.length === 1) {
    const item = present[0] as { key: string; raw: string };
    return fv(item.raw, ctx, { source_key: item.key });
  }
  const joined = present.map((item) => `${item.key}=${item.raw}`).join(";");
  return fv(joined, ctx, { source_key: present.map((item) => item.key).join(","), raw: joined });
}

const KINGSTON_WASHROOM_TYPES = new Set([
  "Accessible Mens Washroom",
  "Accessible Womens Washroom",
  "Accessible Family Washroom",
]);

const KINGSTON_TYPE_FIELD: Record<string, "kerb" | "ramp" | "automatic_door" | "elevator" | "speech_output" | "access" | "hearing_loop"> = {
  "Sidewalk Curb Cut": "kerb",
  Ramp: "ramp",
  "Automated Door Opener": "automatic_door",
  "Entrance to Access Interior Elevator": "elevator",
  "Audible Traffic Control": "speech_output",
  "Barrier-Free Routes": "access",
  "Assistive Listening": "hearing_loop",
};

export function mapKingstonPublicWashroom(row: Record<string, string>, ctx: Provenance): DataRecord {
  const point = webMercatorCell(row);
  const address = splitCivicAddress(cell(row, "Address"));
  const id = cell(row, "POI ID") || cell(row, "Object ID");
  return buildRecord(
    "washroom",
    `kingston-public-washrooms:${id}`,
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    {
      name: published(row, "POI Name", ctx, BLANK),
      lat: coordinateField(point?.lat ?? null, ctx, "x,y"),
      lon: coordinateField(point?.lon ?? null, ctx, "x,y"),
      facility_type: published(row, "POI Type Description", ctx, BLANK),
      addr_housenumber: address.housenumber ? fv(address.housenumber, ctx, { source_key: "Address" }) : unknownField(ctx),
      addr_street: address.street ? fv(address.street, ctx, { source_key: "Address" }) : unknownField(ctx),
      operator: published(row, "Ownership", ctx, BLANK),
      website: published(row, "URL", ctx, BLANK),
      description: published(row, "Global ID", ctx, BLANK),
    },
    ctx,
  );
}

export function mapKingstonAccessibleFeature(row: Record<string, string>, ctx: Provenance): DataRecord {
  const point = webMercatorCell(row);
  const type = cell(row, "Type");
  const address = splitCivicAddress(cell(row, "Address"));
  const comment = cell(row, "Comment");
  const hours = /\b(a\.m\.|p\.m\.|open)\b/i.test(comment) ? comment.trim() : "";
  const id = cell(row, "OBJECTID") || cell(row, "GlobalID");
  if (KINGSTON_WASHROOM_TYPES.has(type)) {
    return buildRecord(
      "washroom",
      `kingston-accessible-features:${id}`,
      regionFromPoint(point?.lat ?? null, point?.lon ?? null),
      {
        name: published(row, "Facility Name", ctx, BLANK),
        lat: coordinateField(point?.lat ?? null, ctx, "x,y"),
        lon: coordinateField(point?.lon ?? null, ctx, "x,y"),
        facility_type: fv(type, ctx, { source_key: "Type" }),
        published_accessibility: fv(type, ctx, { source_key: "Type" }),
        male: type === "Accessible Mens Washroom" ? fv("yes", ctx, { source_key: "Type", raw: type }) : unknownField(ctx),
        female: type === "Accessible Womens Washroom" ? fv("yes", ctx, { source_key: "Type", raw: type }) : unknownField(ctx),
        addr_housenumber: address.housenumber ? fv(address.housenumber, ctx, { source_key: "Address" }) : unknownField(ctx),
        addr_street: address.street ? fv(address.street, ctx, { source_key: "Address" }) : unknownField(ctx),
        opening_hours: hours ? fv(hours, ctx, { source_key: "Comment" }) : unknownField(ctx),
        description: !hours && comment.trim() ? fv(comment.trim(), ctx, { source_key: "Comment" }) : unknownField(ctx),
        status: published(row, "Status", ctx, BLANK),
      },
      ctx,
    );
  }
  const accessField = KINGSTON_TYPE_FIELD[type];
  const partial: Record<string, FieldValue> = {
    name: published(row, "Facility Name", ctx, BLANK),
    lat: coordinateField(point?.lat ?? null, ctx, "x,y"),
    lon: coordinateField(point?.lon ?? null, ctx, "x,y"),
    category: fv(type, ctx, { source_key: "Type" }),
    category_group: fv("municipal_feature", ctx, { source_key: "dataset" }),
    addr_housenumber: address.housenumber ? fv(address.housenumber, ctx, { source_key: "Address" }) : unknownField(ctx),
    addr_street: address.street ? fv(address.street, ctx, { source_key: "Address" }) : unknownField(ctx),
    opening_hours: hours ? fv(hours, ctx, { source_key: "Comment" }) : unknownField(ctx),
    ref: published(row, "GlobalID", ctx, BLANK),
  };
  if (accessField) partial[accessField] = fv(type, ctx, { source_key: "Type" });
  return buildRecord(
    "venue",
    `kingston-accessible-features:${id}`,
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    partial,
    ctx,
  );
}

export function mapBramptonRecreationCentre(row: Record<string, string>, ctx: Provenance): DataRecord {
  const point = webMercatorCell(row);
  const address = splitCivicAddress(cell(row, "ADDRESS"));
  return buildRecord(
    "venue",
    `brampton-recreation-centres:${cell(row, "OBJECTID")}`,
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    {
      name: published(row, "FACILITY NAME", ctx, BLANK),
      lat: coordinateField(point?.lat ?? null, ctx, "x,y"),
      lon: coordinateField(point?.lon ?? null, ctx, "x,y"),
      category: published(row, "TYPE", ctx, BLANK),
      category_group: fv("recreation_facility", ctx, { source_key: "dataset" }),
      addr_housenumber: address.housenumber ? fv(address.housenumber, ctx, { source_key: "ADDRESS" }) : unknownField(ctx),
      addr_street: address.street ? fv(address.street, ctx, { source_key: "ADDRESS" }) : unknownField(ctx),
      website: published(row, "WEBSITE", ctx, BLANK),
    },
    ctx,
  );
}

export function mapSudburyFieldhouse(row: Record<string, string>, ctx: Provenance): DataRecord {
  const easting = Number(cell(row, "X"));
  const northing = Number(cell(row, "Y"));
  const projected =
    Number.isFinite(easting) && Number.isFinite(northing) && (easting !== 0 || northing !== 0)
      ? utm17nToWgs84(easting, northing)
      : null;
  const point = projected && inOntario(projected.lon, projected.lat) ? projected : null;
  const address = splitCivicAddress(cell(row, "ADDRESS") || cell(row, "FULL_ADDRE"));
  return buildRecord(
    "venue",
    `sudbury-fieldhouses:${cell(row, "OBJECTID")}`,
    regionFromPoint(point?.lat ?? null, point?.lon ?? null),
    {
      name: published(row, "FACILITY_N", ctx, BLANK),
      lat: coordinateField(point?.lat ?? null, ctx, "X,Y"),
      lon: coordinateField(point?.lon ?? null, ctx, "X,Y"),
      category: published(row, "OCCUPANCY", ctx, BLANK),
      category_group: fv("city_facility", ctx, { source_key: "dataset" }),
      addr_housenumber: address.housenumber ? fv(address.housenumber, ctx, { source_key: "ADDRESS" }) : unknownField(ctx),
      addr_street: address.street ? fv(address.street, ctx, { source_key: "ADDRESS" }) : unknownField(ctx),
      ref: published(row, "FAC___", ctx, BLANK),
    },
    ctx,
  );
}

export function mapMtoPicnicPark(
  attributes: Record<string, string>,
  lon: number,
  lat: number,
  ctx: Provenance,
): DataRecord {
  const code = stableNumber(cell(attributes, "MTOCODE"));
  return buildRecord(
    "venue",
    `mto-picnic-parks:${code || "unknown"}`,
    regionFromPoint(lat, lon),
    {
      name: published(attributes, "NAME", ctx, BLANK),
      lat: coordinateField(lat, ctx, "shp"),
      lon: coordinateField(lon, ctx, "shp"),
      category: fv("picnic park", ctx, { source_key: "dataset" }),
      category_group: fv("provincial", ctx, { source_key: "dataset" }),
      ref: code ? fv(code, ctx, { source_key: "MTOCODE", raw: cell(attributes, "MTOCODE") }) : unknownField(ctx),
    },
    ctx,
  );
}

export function splitCivicAddress(raw: string): { housenumber?: string; street: string } {
  const trimmed = raw.trim();
  const match = /^(\d+[A-Za-z]?)\s+(.+)$/.exec(trimmed);
  if (!match) return { street: trimmed };
  return { housenumber: match[1], street: match[2] ?? "" };
}

function webMercatorCell(row: Record<string, string>): { lon: number; lat: number } | null {
  const xRaw = cell(row, "x") || cell(row, "X");
  const yRaw = cell(row, "y") || cell(row, "Y");
  if (!xRaw || !yRaw) return null;
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const point = Math.abs(x) <= 180 && Math.abs(y) <= 90 ? { lon: x, lat: y } : webMercatorToWgs84(x, y);
  return inOntario(point.lon, point.lat) ? point : null;
}

function inOntario(lon: number, lat: number): boolean {
  return lat >= 41 && lat <= 57.5 && lon >= -96 && lon <= -73.5;
}

function stableNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return trimmed;
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-6) return String(rounded);
  return String(value);
}

function yesNo(row: Record<string, string>, key: string, ctx: Provenance): FieldValue {
  if (!(key in row)) return unknownField(ctx);
  const raw = (row[key] ?? "").trim();
  const lowered = raw.toLowerCase();
  if (raw === "" || lowered === "unknown" || lowered === "n/a" || lowered === "na" || lowered === "null") {
    return unknownField(ctx, { source_key: key, raw });
  }
  if (lowered === "yes" || lowered === "y") return fv("yes", ctx, { source_key: key, raw });
  if (lowered === "no" || lowered === "n") return fv("no", ctx, { source_key: key, raw });
  return fv(raw, ctx, { source_key: key, raw });
}
