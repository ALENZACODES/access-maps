import type { Coord } from "./geo.js";
import type { Provenance, SurveyRecord, VerificationTier } from "./types.js";

/**
 * Field shape from the open-data lane (schema/field-value.schema.json on the data pull request).
 * UNKNOWN is a value. A missing key is also read as UNKNOWN. This package does not write data/.
 */
export interface FieldValue {
  value: string | number | Array<[number, number]>;
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: VerificationTier;
  /** Present only when a survey protocol, role, method, and date were recorded together. */
  survey?: SurveyRecord | null;
  source_key?: string;
  raw?: string | number | null;
  derived?: boolean;
}

export interface ImportedRecord {
  id: string;
  tranche: "venue" | "path" | "transit" | "washroom";
  region: string;
  fields: Partial<Record<string, FieldValue>>;
}

export const UNKNOWN = "UNKNOWN";

export function isUnknownValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || trimmed.toUpperCase() === "UNKNOWN";
  }
  return false;
}

export function readField(record: ImportedRecord | undefined, key: string): FieldValue | undefined {
  return record?.fields[key];
}

export function readString(record: ImportedRecord | undefined, key: string): string {
  const field = readField(record, key);
  if (!field || isUnknownValue(field.value)) return UNKNOWN;
  if (typeof field.value === "number") return String(field.value);
  if (typeof field.value === "string") return field.value.trim();
  return UNKNOWN;
}

export function readNumber(record: ImportedRecord | undefined, key: string): number | null {
  const field = readField(record, key);
  if (!field || isUnknownValue(field.value)) return null;
  if (typeof field.value === "number" && Number.isFinite(field.value)) return field.value;
  if (typeof field.value === "string") {
    const parsed = Number(field.value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** GTFS wheelchair_boarding / wheelchair_accessible: 0 and blank are no information. */
export function readBoarding(record: ImportedRecord | undefined, key: string): "yes" | "no" | "unknown" {
  const raw = readString(record, key).toLowerCase();
  if (raw === "1" || raw === "yes") return "yes";
  if (raw === "2" || raw === "no") return "no";
  return "unknown";
}

export function readCoord(record: ImportedRecord | undefined): Coord | null {
  const lat = readNumber(record, "lat");
  const lon = readNumber(record, "lon");
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function readGeometry(record: ImportedRecord | undefined): Coord[] | null {
  const field = readField(record, "geometry");
  if (!field || !Array.isArray(field.value)) return null;
  const coords: Coord[] = [];
  for (const pair of field.value) {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    const lon = pair[0];
    const lat = pair[1];
    if (typeof lon !== "number" || typeof lat !== "number") return null;
    coords.push({ lon, lat });
  }
  return coords.length >= 2 ? coords : null;
}

export function provenanceFromField(field: FieldValue | undefined, fallbackNote: string): Provenance {
  if (!field) {
    return {
      sourceId: UNKNOWN,
      licence: UNKNOWN,
      retrievedAt: UNKNOWN,
      tier: null,
      note: fallbackNote,
    };
  }
  return {
    sourceId: field.source_id,
    licence: field.licence,
    retrievedAt: field.retrieved_at,
    tier: field.tier,
    ...(field.survey ? { survey: field.survey } : {}),
    ...(field.source_key ? { note: field.source_key } : {}),
  };
}

export function asImportedRecord(value: unknown): ImportedRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Record is not an object.");
  }
  const record = value as Record<string, unknown>;
  const id = record.id;
  const tranche = record.tranche;
  const region = record.region;
  if (typeof id !== "string" || id.length === 0) throw new Error("Record is missing id.");
  if (tranche !== "venue" && tranche !== "path" && tranche !== "transit" && tranche !== "washroom") {
    throw new Error(`Record ${id} has an unknown tranche.`);
  }
  if (typeof region !== "string" || region.length === 0) throw new Error(`Record ${id} is missing region.`);
  const fields = record.fields;
  if (fields !== undefined && (typeof fields !== "object" || fields === null || Array.isArray(fields))) {
    throw new Error(`Record ${id} has invalid fields.`);
  }
  return {
    id,
    tranche,
    region,
    fields: (fields as ImportedRecord["fields"]) ?? {},
  };
}

/** Percent from an OSM-style incline token. "up" without a number stays unknown. */
export function parseInclinePercent(token: string): number | null {
  if (isUnknownValue(token)) return null;
  const match = token.trim().match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

/** Width in millimetres. Metres are assumed when the number is below 20. */
export function parseWidthMm(token: string): number | null {
  if (isUnknownValue(token)) return null;
  const lower = token.trim().toLowerCase();
  const match = lower.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)?$/);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "mm") return amount;
  if (unit === "cm") return amount * 10;
  if (unit === "m") return amount * 1000;
  if (amount <= 20) return amount * 1000;
  return amount;
}
