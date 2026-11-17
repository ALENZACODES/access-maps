import { DatabaseSync } from "node:sqlite";

/**
 * Builds tiny GeoPackage and CSV fixtures shaped like the Statistics Canada LODE files.
 * Every value is a labelled test fixture, not a real place.
 */

/** ISO WKB point, little-endian. */
export function wkbPoint(x: number, y: number): Buffer {
  const out = Buffer.alloc(21);
  out.writeUInt8(1, 0);
  out.writeUInt32LE(1, 1);
  out.writeDoubleLE(x, 5);
  out.writeDoubleLE(y, 13);
  return out;
}

/** ISO WKB polygon with one ring, little-endian. */
export function wkbPolygon(ring: [number, number][]): Buffer {
  const out = Buffer.alloc(9 + 4 + ring.length * 16);
  out.writeUInt8(1, 0);
  out.writeUInt32LE(3, 1);
  out.writeUInt32LE(1, 5);
  out.writeUInt32LE(ring.length, 9);
  ring.forEach(([x, y], i) => {
    out.writeDoubleLE(x, 13 + i * 16);
    out.writeDoubleLE(y, 21 + i * 16);
  });
  return out;
}

/** ISO WKB line string, little-endian. */
export function wkbLine(points: [number, number][]): Buffer {
  const out = Buffer.alloc(9 + points.length * 16);
  out.writeUInt8(1, 0);
  out.writeUInt32LE(2, 1);
  out.writeUInt32LE(points.length, 5);
  points.forEach(([x, y], i) => {
    out.writeDoubleLE(x, 9 + i * 16);
    out.writeDoubleLE(y, 17 + i * 16);
  });
  return out;
}

/** A GeoPackage binary geometry: "GP", version 0, flags (little-endian, no envelope), srs id, WKB. */
export function gpkgBlob(wkb: Buffer, srs = 3347): Buffer {
  const header = Buffer.alloc(8);
  header.write("GP", 0, "ascii");
  header.writeUInt8(0, 2);
  header.writeUInt8(0x01, 3);
  header.writeInt32LE(srs, 4);
  return Buffer.concat([header, wkb]);
}

/** Writes a GeoPackage with one feature table whose geometry column is `geom`. */
export function writeGpkg(file: string, table: string, columns: string[], rows: Array<Record<string, string | Buffer | null>>, srs = 3347): void {
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, geometry_type_name TEXT, srs_id INTEGER, z INTEGER, m INTEGER)");
  db.prepare("INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', 'GEOMETRY', ?, 0, 0)").run(table, srs);
  db.exec(`CREATE TABLE "${table}" (fid INTEGER PRIMARY KEY, geom BLOB, ${columns.map((column) => `"${column}" TEXT`).join(", ")})`);
  const insert = db.prepare(`INSERT INTO "${table}" (geom, ${columns.map((column) => `"${column}"`).join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`);
  for (const row of rows) insert.run(row.geom ?? null, ...columns.map((column) => row[column] ?? null));
  db.close();
}

/** Statistics Canada Lambert (EPSG:3347) metres for reference points, computed with PROJ 9 (pyproj 3.8). */
export const LAMBERT_REFERENCE: ReadonlyArray<{ x: number; y: number; lon: number; lat: number }> = [
  { x: 7224817.495306485, y: 928699.0518283916, lon: -79.3832, lat: 43.6532 },
  { x: 7471241.788511825, y: 1190644.009622209, lon: -75.6972, lat: 45.4215 },
  { x: 6394417.7121460335, y: 1364061.2730337824, lon: -89.2477, lat: 48.3809 },
  { x: 6951564.223153092, y: 727487.0048135556, lon: -82.9987, lat: 42.3149 },
  { x: 7022167.725864143, y: 1727536.6787011533, lon: -80.0, lat: 51.0 },
];
