export interface Coord {
  lon: number;
  lat: number;
}

const EARTH_METRES = 6_371_000;

export function haversineMetres(a: Coord, b: Coord): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Node key for graph snapping. 20 m is enough for fixture chains and kerb gaps. */
export function coordKey(coord: Coord): string {
  const lat = Math.round(coord.lat * 5_000) / 5_000;
  const lon = Math.round(coord.lon * 5_000) / 5_000;
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

export function formatMetres(metres: number): string {
  if (!Number.isFinite(metres)) return "UNKNOWN";
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/** Civil month from an ISO string. The date portion is the clock the caller supplied. */
export function civilMonth(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return Number.NaN;
  return Number(match[2]);
}

/** November through April, matching the cited seasonal-eligibility windows. */
export function isWinterDate(iso: string): boolean {
  const month = civilMonth(iso);
  if (!Number.isFinite(month)) return false;
  return month === 11 || month === 12 || month <= 4;
}

export function hoursBetween(earlierIso: string, laterIso: string): number | null {
  const a = Date.parse(earlierIso);
  const b = Date.parse(laterIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / 3_600_000;
}

export function addHours(iso: string, hours: number): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + hours * 3_600_000).toISOString();
}

export function dateOnly(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return match?.[1] ?? iso;
}
