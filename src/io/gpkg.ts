import { DatabaseSync } from "node:sqlite";

/**
 * Reads GeoPackage feature tables with Node's built-in SQLite module, one row at a time,
 * so a national file is never held in memory. Geometry blobs are GeoPackage binary:
 * a "GP" header, an optional envelope, then standard (ISO) WKB.
 */

export type Coordinate = [number, number];

export type Geometry =
  | { type: "Point"; coordinates: Coordinate }
  | { type: "MultiPoint"; coordinates: Coordinate[] }
  | { type: "LineString"; coordinates: Coordinate[] }
  | { type: "MultiLineString"; coordinates: Coordinate[][] }
  | { type: "Polygon"; coordinates: Coordinate[][] }
  | { type: "MultiPolygon"; coordinates: Coordinate[][][] }
  | { type: "GeometryCollection"; geometries: Geometry[] };

export type GpkgRow = Record<string, string | number | bigint | Uint8Array | null>;

/**
 * Yields the rows of one feature table. `where` is a fixed SQL condition written in the
 * calling code (never data from a download); `params` are bound to its `?` markers.
 */
export function* readGpkgRows(file: string, table: string, where = "1=1", params: (string | number)[] = []): Generator<GpkgRow> {
  if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error(`unexpected GeoPackage table name ${table}`);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const statement = db.prepare(`SELECT * FROM "${table}" WHERE ${where}`);
    for (const row of statement.iterate(...params)) yield row as GpkgRow;
  } finally {
    db.close();
  }
}

/** The spatial reference id the GeoPackage declares for a table's geometry column. */
export function gpkgSrsId(file: string, table: string): number {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare("SELECT srs_id FROM gpkg_geometry_columns WHERE table_name = ?").get(table) as { srs_id?: number } | undefined;
    if (!row || typeof row.srs_id !== "number") throw new Error(`${table} has no gpkg_geometry_columns entry`);
    return row.srs_id;
  } finally {
    db.close();
  }
}

const ENVELOPE_BYTES: Readonly<Record<number, number>> = { 0: 0, 1: 32, 2: 48, 3: 48, 4: 64 };

/** Parses a GeoPackage geometry blob. Returns null for an empty geometry or a blob that is not GeoPackage binary. */
export function parseGpkgGeometry(blob: Uint8Array | null | undefined): Geometry | null {
  if (!blob || blob.length < 8 || blob[0] !== 0x47 || blob[1] !== 0x50) return null;
  const flags = blob[3] ?? 0;
  if ((flags & 0x10) !== 0) return null;
  const envelope = ENVELOPE_BYTES[(flags >> 1) & 0x07];
  if (envelope === undefined) throw new Error(`invalid GeoPackage envelope code ${(flags >> 1) & 0x07}`);
  const view = new DataView(blob.buffer, blob.byteOffset + 8 + envelope, blob.length - 8 - envelope);
  return new WkbReader(view).geometry();
}

class WkbReader {
  private offset = 0;

  constructor(private readonly view: DataView) {}

  geometry(): Geometry {
    const order = this.view.getUint8(this.offset);
    if (order !== 0 && order !== 1) throw new Error(`invalid WKB byte order ${order}`);
    const little = order === 1;
    this.offset += 1;
    const raw = this.view.getUint32(this.offset, little);
    this.offset += 4;
    // ISO WKB adds 1000 (Z), 2000 (M) or 3000 (ZM); EWKB sets high flag bits instead.
    let dims = 2;
    let base = raw;
    if ((raw & 0x80000000) !== 0 || (raw & 0x40000000) !== 0) {
      dims += ((raw & 0x80000000) !== 0 ? 1 : 0) + ((raw & 0x40000000) !== 0 ? 1 : 0);
      if ((raw & 0x20000000) !== 0) this.offset += 4;
      base = raw & 0x0fffffff;
    } else if (raw >= 1000) {
      const family = Math.floor(raw / 1000);
      dims = family === 3 ? 4 : 3;
      base = raw % 1000;
    }
    switch (base) {
      case 1:
        return { type: "Point", coordinates: this.position(little, dims) };
      case 2:
        return { type: "LineString", coordinates: this.positions(little, dims) };
      case 3:
        return { type: "Polygon", coordinates: this.rings(little, dims) };
      case 4:
        return { type: "MultiPoint", coordinates: this.parts(little).map((part) => this.expect(part, "Point").coordinates as Coordinate) };
      case 5:
        return { type: "MultiLineString", coordinates: this.parts(little).map((part) => this.expect(part, "LineString").coordinates as Coordinate[]) };
      case 6:
        return { type: "MultiPolygon", coordinates: this.parts(little).map((part) => this.expect(part, "Polygon").coordinates as Coordinate[][]) };
      case 7:
        return { type: "GeometryCollection", geometries: this.parts(little) };
      default:
        throw new Error(`unsupported WKB geometry type ${raw}`);
    }
  }

  private expect(part: Geometry, type: Geometry["type"]): Geometry & { coordinates: unknown } {
    if (part.type !== type || !("coordinates" in part)) throw new Error(`expected ${type} inside a multi geometry, found ${part.type}`);
    return part;
  }

  private count(little: boolean): number {
    const value = this.view.getUint32(this.offset, little);
    this.offset += 4;
    return value;
  }

  private position(little: boolean, dims: number): Coordinate {
    const x = this.view.getFloat64(this.offset, little);
    const y = this.view.getFloat64(this.offset + 8, little);
    this.offset += 8 * dims;
    return [x, y];
  }

  private positions(little: boolean, dims: number): Coordinate[] {
    const total = this.count(little);
    const out: Coordinate[] = [];
    for (let i = 0; i < total; i += 1) out.push(this.position(little, dims));
    return out;
  }

  private rings(little: boolean, dims: number): Coordinate[][] {
    const total = this.count(little);
    const out: Coordinate[][] = [];
    for (let i = 0; i < total; i += 1) out.push(this.positions(little, dims));
    return out;
  }

  private parts(little: boolean): Geometry[] {
    const total = this.count(little);
    const out: Geometry[] = [];
    for (let i = 0; i < total; i += 1) out.push(this.geometry());
    return out;
  }
}

/**
 * A map anchor for a place geometry, in the geometry's own coordinates:
 * - a point is used as published (`geometry`);
 * - a multi-point with one member uses that member (`geometry`); with several members
 *   it uses the first one (`geometry:first_point`);
 * - a polygon or multi-polygon uses the vertex mean of its largest outer ring by area
 *   (`geometry:vertex_mean`). That point is not a surveyed entrance.
 * Lines and collections return null: they are not anchored to one place.
 */
export function placeAnchor(geometry: Geometry | null): { x: number; y: number; key: string } | null {
  if (!geometry) return null;
  switch (geometry.type) {
    case "Point":
      return { x: geometry.coordinates[0], y: geometry.coordinates[1], key: "geometry" };
    case "MultiPoint": {
      const first = geometry.coordinates[0];
      if (!first) return null;
      return { x: first[0], y: first[1], key: geometry.coordinates.length === 1 ? "geometry" : "geometry:first_point" };
    }
    case "Polygon":
    case "MultiPolygon": {
      const outers = geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((polygon) => polygon[0]);
      let best: Coordinate[] | null = null;
      let bestArea = -1;
      for (const ring of outers) {
        if (!ring || ring.length === 0) continue;
        const area = Math.abs(ringArea(ring));
        if (area > bestArea) {
          best = ring;
          bestArea = area;
        }
      }
      if (!best) return null;
      const first = best[0]!;
      const last = best[best.length - 1]!;
      const open = best.length > 1 && first[0] === last[0] && first[1] === last[1] ? best.slice(0, -1) : best;
      let x = 0;
      let y = 0;
      for (const [px, py] of open) {
        x += px;
        y += py;
      }
      return { x: x / open.length, y: y / open.length, key: "geometry:vertex_mean" };
    }
    default:
      return null;
  }
}

function ringArea(ring: Coordinate[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}
