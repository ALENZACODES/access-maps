import { roundCoord } from "../model/records.js";

export type Position = [number, number];

export type OsmGeometry =
  | { type: "Point"; coordinates: Position }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiLineString"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export interface LonLat {
  lon: number;
  lat: number;
}

export function representativePoint(geometry: OsmGeometry | null): LonLat | null {
  if (!geometry) return null;
  if (geometry.type === "Point") return pair(geometry.coordinates);
  if (geometry.type === "LineString") return vertexMean(geometry.coordinates);
  if (geometry.type === "MultiLineString") return vertexMean(longestLine(geometry.coordinates) ?? []);
  if (geometry.type === "Polygon") return vertexMean(openRing(geometry.coordinates[0] ?? []));
  const rings = geometry.coordinates.map((polygon) => openRing(polygon[0] ?? []));
  return vertexMean(longestLine(rings) ?? []);
}

/** Path geometry kept as published coordinates. Multipart features keep the longest part only. */
export function pathPositions(geometry: OsmGeometry | null): {
  geometryType: "Point" | "LineString";
  positions: Position[];
} | null {
  if (!geometry) return null;
  if (geometry.type === "Point") {
    const point = pair(geometry.coordinates);
    return point ? { geometryType: "Point", positions: [[point.lon, point.lat]] } : null;
  }
  const line =
    geometry.type === "LineString"
      ? geometry.coordinates
      : geometry.type === "MultiLineString"
        ? longestLine(geometry.coordinates)
        : geometry.type === "Polygon"
          ? openRing(geometry.coordinates[0] ?? [])
          : longestLine(geometry.coordinates.map((polygon) => openRing(polygon[0] ?? [])));
  if (!line || line.length === 0) return null;
  const positions = dedupe(line.map(roundPair).filter((position): position is Position => position !== null));
  if (positions.length === 0) return null;
  if (positions.length === 1) return { geometryType: "Point", positions };
  return { geometryType: "LineString", positions };
}

function pair(position: Position | undefined): LonLat | null {
  if (!position) return null;
  const lon = position[0];
  const lat = position[1];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lon: roundCoord(lon), lat: roundCoord(lat) };
}

function roundPair(position: Position): Position | null {
  const point = pair(position);
  return point ? [point.lon, point.lat] : null;
}

function openRing(ring: Position[]): Position[] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring;
}

function vertexMean(positions: Position[]): LonLat | null {
  let lon = 0;
  let lat = 0;
  let count = 0;
  for (const position of positions) {
    const point = pair(position);
    if (!point) continue;
    lon += point.lon;
    lat += point.lat;
    count += 1;
  }
  if (count === 0) return null;
  return { lon: roundCoord(lon / count), lat: roundCoord(lat / count) };
}

function longestLine(lines: Position[][]): Position[] | null {
  let best: Position[] | null = null;
  for (const line of lines) {
    if (!best || line.length > best.length) best = line;
  }
  return best;
}

function dedupe(positions: Position[]): Position[] {
  const out: Position[] = [];
  for (const position of positions) {
    const previous = out[out.length - 1];
    if (previous && previous[0] === position[0] && previous[1] === position[1]) continue;
    out.push(position);
  }
  return out;
}

export function parseGeometry(value: unknown): OsmGeometry | null {
  if (!value || typeof value !== "object") return null;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (typeof geometry.type !== "string") return null;
  if (geometry.type === "Point" && isPosition(geometry.coordinates)) {
    return { type: "Point", coordinates: geometry.coordinates };
  }
  if (geometry.type === "LineString" && isLine(geometry.coordinates)) {
    return { type: "LineString", coordinates: geometry.coordinates };
  }
  if (geometry.type === "Polygon" && isPolygon(geometry.coordinates)) {
    return { type: "Polygon", coordinates: geometry.coordinates };
  }
  if (geometry.type === "MultiLineString" && isPolygon(geometry.coordinates)) {
    return { type: "MultiLineString", coordinates: geometry.coordinates };
  }
  if (geometry.type === "MultiPolygon" && isMultiPolygon(geometry.coordinates)) {
    return { type: "MultiPolygon", coordinates: geometry.coordinates };
  }
  return null;
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 && value.every((item) => typeof item === "number");
}

function isLine(value: unknown): value is Position[] {
  return Array.isArray(value) && value.every((item) => isPosition(item));
}

function isPolygon(value: unknown): value is Position[][] {
  return Array.isArray(value) && value.every((item) => isLine(item));
}

function isMultiPolygon(value: unknown): value is Position[][][] {
  return Array.isArray(value) && value.every((item) => isPolygon(item));
}
