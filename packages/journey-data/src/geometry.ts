import type { PackRecord, FieldValue } from "./pack-types.js";

export interface Point { lat: number; lon: number }
export function distance(a: Point, b: Point): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) *
    Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function value(record: PackRecord, key: string): string | number | undefined {
  const data = record.fields[key]?.value;
  if (typeof data !== "string" && typeof data !== "number") return undefined;
  if (String(data).trim() === "" || String(data).trim().toUpperCase() === "UNKNOWN") return undefined;
  return data;
}
export function text(record: PackRecord, key: string): string | undefined {
  const found = value(record, key);
  return found === undefined ? undefined : String(found);
}
export function position(record: PackRecord): Point | null {
  const lat = Number(value(record, "lat"));
  const lon = Number(value(record, "lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
export function geometry(record: PackRecord): Point[] | null {
  const field: FieldValue | undefined = record.fields.geometry;
  if (!field || !Array.isArray(field.value)) return null;
  const points: Point[] = [];
  for (const pair of field.value) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite)) return null;
    const [lon, lat] = pair;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    points.push({ lon, lat });
  }
  return points.length > 1 ? points : null;
}
export function widthMm(input: string | undefined): number | null {
  if (!input) return null;
  const match = /^(\d+(?:\.\d+)?)\s*(mm|cm|m)?$/i.exec(input.trim());
  if (!match) return null;
  const number = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  return unit === "mm" ? number : unit === "cm" ? number * 10 : unit === "m" || number <= 20 ? number * 1000 : number;
}
export function gradePercent(input: string | undefined): number | null {
  if (!input) return null;
  const match = /^(-?\d+(?:\.\d+)?)\s*%?$/.exec(input.trim());
  return match ? Number(match[1]) : null;
}
