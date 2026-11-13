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
