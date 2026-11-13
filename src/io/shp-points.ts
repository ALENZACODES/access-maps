import { inflateRawSync } from "node:zlib";

export interface PointRow {
  attributes: Record<string, string>;
  lon: number;
  lat: number;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** Reads a zip of a point shapefile whose .prj is a geographic coordinate system. */
export function readPointShapefileZip(zip: Buffer): PointRow[] {
  const entries = readZip(zip);
  const shp = find(entries, ".shp");
  const dbf = find(entries, ".dbf");
  const prj = find(entries, ".prj").toString("latin1");
  if (/PROJCS/i.test(prj)) {
    throw new Error("shapefile is projected; this reader only accepts geographic lon/lat");
  }
  if (!/GEOGCS/i.test(prj) && !/GEOGCRS/i.test(prj)) {
    throw new Error("shapefile .prj did not declare a geographic coordinate system");
  }
  const points = readShpPoints(shp);
  const rows = readDbf(dbf);
  if (points.length !== rows.length) {
    throw new Error(`shapefile has ${points.length} points and ${rows.length} attribute rows`);
  }
  const out: PointRow[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const attributes = rows[index];
    const point = points[index];
    if (!attributes || !point) continue;
    out.push({ lon: point.lon, lat: point.lat, attributes });
  }
  return out;
}

function find(entries: ZipEntry[], suffix: string): Buffer {
  const entry = entries.find((item) => item.name.toLowerCase().endsWith(suffix));
  if (!entry) throw new Error(`zip has no ${suffix} file`);
  return entry.data;
}

function readShpPoints(shp: Buffer): { lon: number; lat: number }[] {
  if (shp.length < 100) throw new Error("shapefile header is short");
  const fileCode = shp.readInt32BE(0);
  if (fileCode !== 9994) throw new Error(`unexpected shapefile code ${fileCode}`);
  const shapeType = shp.readInt32LE(32);
  if (shapeType !== 1) throw new Error(`shapefile type ${shapeType} is not a point`);
  const points: { lon: number; lat: number }[] = [];
  let offset = 100;
  while (offset + 28 <= shp.length) {
    const contentWords = shp.readInt32BE(offset + 4);
    const contentBytes = contentWords * 2;
    if (offset + 8 + contentBytes > shp.length) break;
    const type = shp.readInt32LE(offset + 8);
    if (type === 1) {
      points.push({ lon: shp.readDoubleLE(offset + 12), lat: shp.readDoubleLE(offset + 20) });
    } else if (type !== 0) {
      throw new Error(`shapefile record type ${type} is not a point`);
    }
    offset += 8 + contentBytes;
  }
  return points;
}

function readDbf(dbf: Buffer): (Record<string, string> | null)[] {
  const count = dbf.readUInt32LE(4);
  const headerLength = dbf.readUInt16LE(8);
  const recordLength = dbf.readUInt16LE(10);
  const fields: { name: string; length: number }[] = [];
  let pos = 32;
  while (pos + 32 <= headerLength && dbf[pos] !== 0x0d) {
    const name = dbf.subarray(pos, pos + 11).toString("latin1").replace(/\0.*/, "").trim();
    const length = dbf[pos + 16] ?? 0;
    fields.push({ name, length });
    pos += 32;
  }
  const rows: (Record<string, string> | null)[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = headerLength + i * recordLength;
    if (dbf[start] === 0x2a) {
      rows.push(null);
      continue;
    }
    const attributes: Record<string, string> = {};
    let cursor = start + 1;
    for (const field of fields) {
      attributes[field.name] = dbf.subarray(cursor, cursor + field.length).toString("latin1").trim();
      cursor += field.length;
    }
    rows.push(attributes);
  }
  return rows;
}

function readZip(zip: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`unsupported zip method ${method} for ${name}`);
    entries.push({ name, data });
    offset = dataStart + compressedSize;
  }
  if (entries.length === 0) throw new Error("zip contained no files");
  return entries;
}
