import type {
  ConditionRecord,
  Geometry,
  NearbyCondition,
  Point,
} from "./types";
import { validPoint } from "./types";

const EARTH_RADIUS_M = 6371008.8;

export function distanceM(a: Point, b: Point): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * radians) *
      Math.cos(b.lat * radians) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

function geometryPoints(geometry: Geometry): Point[] {
  const points: Point[] = [];
  function visit(value: unknown): void {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      const point = { lon: value[0], lat: value[1] };
      if (validPoint(point)) points.push(point);
      return;
    }
    for (const item of value) visit(item);
  }
  visit(geometry.coordinates);
  return points;
}

function pointInRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    if (
      (a.lat > point.lat) !== (b.lat > point.lat) &&
      point.lon <
        ((b.lon - a.lon) * (point.lat - a.lat)) /
          (b.lat - a.lat) +
          a.lon
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function coordinatesToRing(value: unknown): Point[] {
  if (!Array.isArray(value)) return [];
  const points: Point[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || typeof item[0] !== "number" || typeof item[1] !== "number") continue;
    const candidate = { lon: item[0], lat: item[1] };
    if (validPoint(candidate)) points.push(candidate);
  }
  return points;
}

function containsPoint(point: Point, geometry: Geometry): boolean {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates.map(coordinatesToRing);
    const outer = rings[0];
    return (
      outer !== undefined &&
      pointInRing(point, outer) &&
      !rings.slice(1).some((ring) => pointInRing(point, ring))
    );
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) =>
      containsPoint(point, {
        type: "Polygon",
        coordinates: Array.isArray(polygon) ? polygon : [],
      }),
    );
  }
  return false;
}

function recordDistance(point: Point, record: ConditionRecord): number {
  const candidates: Point[] = [];
  if (record.point && validPoint(record.point)) {
    candidates.push(record.point);
  }
  if (record.geometry) {
    if (containsPoint(point, record.geometry)) return 0;
    candidates.push(...geometryPoints(record.geometry));
  }
  // A cell without coordinates cannot establish proximity.
  return candidates.length
    ? Math.min(...candidates.map((candidate) => distanceM(point, candidate)))
    : Infinity;
}

export function conditionsNear(
  point: Point,
  radiusM: number,
  records: readonly ConditionRecord[],
  now: Date = new Date(),
): NearbyCondition[] {
  if (!validPoint(point) || !Number.isFinite(radiusM) || radiusM < 0) {
    throw new RangeError("Invalid location or radius");
  }
  const time = now.getTime();
  if (!Number.isFinite(time)) throw new RangeError("Invalid date");
  return records
    .map((record) => {
      const distance = recordDistance(point, record);
      const fetched = Date.parse(record.last_fetched);
      const checked = record.last_checked
        ? Date.parse(record.last_checked)
        : NaN;
      const latest = Number.isFinite(checked)
        ? Math.max(fetched, checked)
        : fetched;
      const current =
        Number.isFinite(latest) &&
        latest <= time &&
        time - latest < record.expiry_hours * 3600000;
      return {
        record,
        distanceM: distance,
        status: current
          ? ("last_fetched" as const)
          : ("needs_check" as const),
      };
    })
    .filter((result) => result.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}
