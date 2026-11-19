/** Ontario route geometry. All quantities are metres unless explicitly stated. */
const RAD = Math.PI / 180;
const EARTH = 6371008.8;
export const ONTARIO_LIMITS = Object.freeze({ west: -95.2, east: -74.0, south: 41.6, north: 57.0 });

export function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function point(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const { lat, lon } = input;
  if (!finite(lat) || !finite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return Object.freeze({ lat, lon });
}

export function inOntario(input, margin = 0) {
  const p = point(input);
  if (!p || !finite(margin) || margin < 0 || margin > 1) return false;
  return p.lat >= ONTARIO_LIMITS.south - margin && p.lat <= ONTARIO_LIMITS.north + margin &&
    p.lon >= ONTARIO_LIMITS.west - margin && p.lon <= ONTARIO_LIMITS.east + margin;
}

export function radians(value) {
  return value * RAD;
}

export function distance(a, b) {
  const p = point(a);
  const q = point(b);
  if (!p || !q) return null;
  const dLat = radians(q.lat - p.lat);
  const dLon = radians(q.lon - p.lon);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(p.lat)) * Math.cos(radians(q.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH * Math.atan2(Math.sqrt(Math.min(1, x)), Math.sqrt(Math.max(0, 1 - x)));
}

export function polyline(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10000) return null;
  const points = value.map(point);
  if (points.some(p => p === null)) return null;
  return Object.freeze(points);
}

export function pathLength(value) {
  const points = polyline(value);
  if (!points) return null;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

export function bounds(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const items = values.map(point);
  if (items.some(p => p === null)) return null;
  const latitudes = items.map(p => p.lat);
  const longitudes = items.map(p => p.lon);
  return Object.freeze({
    south: Math.min(...latitudes), north: Math.max(...latitudes),
    west: Math.min(...longitudes), east: Math.max(...longitudes),
  });
}

export function insideBounds(value, region, margin = 0) {
  const p = point(value);
  if (!p || !region || !finite(margin) || margin < 0) return false;
  const { north, south, west, east } = region;
  if (![north, south, west, east].every(finite) || north < south || east < west) return false;
  return p.lat >= south - margin && p.lat <= north + margin &&
    p.lon >= west - margin && p.lon <= east + margin;
}

export function azimuth(a, b) {
  const p = point(a);
  const q = point(b);
  if (!p || !q) return null;
  const lat1 = radians(p.lat);
  const lat2 = radians(q.lat);
  const lon = radians(q.lon - p.lon);
  const y = Math.sin(lon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export function coordinateAt(a, b, ratio) {
  const p = point(a);
  const q = point(b);
  if (!p || !q || !finite(ratio) || ratio < 0 || ratio > 1) return null;
  return point({ lat: p.lat + (q.lat - p.lat) * ratio, lon: p.lon + (q.lon - p.lon) * ratio });
}

/** Flat local projection is used only for short subsegments, never network distance. */
export function closestOnSegment(candidate, a, b) {
  const p = point(candidate);
  const x = point(a);
  const y = point(b);
  if (!p || !x || !y) return null;
  const scale = Math.max(0.01, Math.cos(radians((x.lat + y.lat) / 2)));
  const ax = x.lon * scale;
  const bx = y.lon * scale;
  const px = p.lon * scale;
  const vx = bx - ax;
  const vy = y.lat - x.lat;
  const d = vx * vx + vy * vy;
  const fraction = d === 0 ? 0 : Math.max(0, Math.min(1,
    ((px - ax) * vx + (p.lat - x.lat) * vy) / d));
  const projected = coordinateAt(x, y, fraction);
  return Object.freeze({ fraction, point: projected, distanceMetres: distance(p, projected) });
}

export function closestOnPath(candidate, geometry) {
  const points = polyline(geometry);
  if (!points || !point(candidate)) return null;
  let best = null;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const part = closestOnSegment(candidate, points[i - 1], points[i]);
    if (part && (!best || part.distanceMetres < best.distanceMetres)) {
      best = { ...part, segmentIndex: i - 1, alongMetres: total + distance(points[i - 1], points[i]) * part.fraction };
    }
    total += distance(points[i - 1], points[i]);
  }
  return best ? Object.freeze(best) : null;
}

export function lengthGrade(horizontalMetres, riseMetres) {
  if (!finite(horizontalMetres) || !finite(riseMetres) || horizontalMetres <= 0) return null;
  return Object.freeze({ percent: Math.abs(riseMetres) / horizontalMetres * 100,
    direction: riseMetres === 0 ? 'level' : riseMetres > 0 ? 'up' : 'down' });
}

export function geometryGrade(points, heights) {
  const line = polyline(points);
  if (!line || !Array.isArray(heights) || heights.length !== line.length ||
      !heights.every(finite)) return null;
  const intervals = [];
  let maximum = 0;
  let totalRise = 0;
  for (let i = 1; i < line.length; i++) {
    const horizontalMetres = distance(line[i - 1], line[i]);
    if (horizontalMetres === 0) return null;
    const riseMetres = heights[i] - heights[i - 1];
    const grade = lengthGrade(horizontalMetres, riseMetres);
    intervals.push(Object.freeze({ ...grade, horizontalMetres, riseMetres }));
    maximum = Math.max(maximum, grade.percent);
    totalRise += Math.max(0, riseMetres);
  }
  return Object.freeze({ maximumPercent: maximum, totalRiseMetres: totalRise, intervals });
}

export function decimate(geometry, maximumPoints) {
  const values = polyline(geometry);
  if (!values || !Number.isSafeInteger(maximumPoints) || maximumPoints < 2) return null;
  if (values.length <= maximumPoints) return values;
  const chosen = [];
  for (let i = 0; i < maximumPoints; i++) {
    const index = Math.round(i * (values.length - 1) / (maximumPoints - 1));
    chosen.push(values[index]);
  }
  return Object.freeze(chosen);
}

export function geometrySummary(geometry) {
  const line = polyline(geometry);
  if (!line) return null;
  const lengthMetres = pathLength(line);
  const region = bounds(line);
  const bearings = [];
  for (let i = 1; i < line.length; i++) bearings.push(azimuth(line[i - 1], line[i]));
  return Object.freeze({ lengthMetres, bounds: region, bearings, start: line[0], end: line.at(-1) });
}

export function routeBounds(routes) {
  if (!Array.isArray(routes)) return null;
  const all = [];
  for (const route of routes) {
    const line = polyline(route);
    if (!line) return null;
    all.push(...line);
  }
  return all.length ? bounds(all) : null;
}
