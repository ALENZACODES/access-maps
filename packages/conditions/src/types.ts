export const CONDITION_TYPES = [
  "snowbank",
  "ice",
  "construction",
  "road_restriction",
  "curb_blocked",
  "other",
] as const;

export type ConditionType = (typeof CONDITION_TYPES)[number];
export type OpenLicence =
  | "ODbL"
  | "OGL-Ontario"
  | "OGL-Canada"
  | "CC-BY"
  | "CC0";

export type ExpiryHours = 1 | 3 | 6 | 12 | 24 | 48;

export interface Point {
  lat: number;
  lon: number;
}

export interface Geometry {
  type:
    | "Point"
    | "MultiPoint"
    | "LineString"
    | "MultiLineString"
    | "Polygon"
    | "MultiPolygon";
  coordinates: unknown[];
}

export interface ConditionFact {
  value: string | number | boolean | "UNKNOWN";
  source_id: string;
  licence: OpenLicence;
  retrieved_at: string;
  tier: 1;
  source_key?: string;
  raw?: unknown;
  derived?: unknown;
}

export interface ConditionRecord {
  id: string;
  type: ConditionType;
  point?: Point;
  cell?: string;
  geometry?: Geometry;
  fact: ConditionFact;
  last_fetched: string;
  last_checked: string | null;
  expiry_hours: ExpiryHours;
}

export interface SourceRegistryEntry {
  sourceId: string;
  licence: OpenLicence | null;
  licenceUrl: string | null;
  status: "confirmed" | "held";
  heldReason?: string;
  sourceName: string;
  synthetic?: boolean;
}

export interface ObstacleDraft {
  id: string;
  type: ConditionType;
  point: Point;
  photo_handle?: string;
  note: string;
  observed_at: string;
  verified_by_person: boolean;
  tier: 0;
}

export interface NearbyCondition {
  record: ConditionRecord;
  status: "last_fetched" | "needs_check";
  distanceM: number;
}

export function validPoint(point: Point): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  );
}
