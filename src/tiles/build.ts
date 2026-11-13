import { gzipSync } from "node:zlib";
import { zxyToTileId } from "pmtiles";
import { encodeMvt, type MvtFeature } from "./mvt.js";

export const MAX_PMTILES_BYTES = 50 * 1024 * 1024;
const HEADER_BYTES = 127;
const ROOT_LIMIT = 16384;
const EXTENT = 4096;
const TILE_CAP = 1500;

export class TileSizeError extends Error {
  constructor(readonly bytes: number) {
    super(`PMTiles archive is ${bytes} bytes, which is over the ${MAX_PMTILES_BYTES} byte file cap`);
    this.name = "TileSizeError";
  }
}

export interface MapFeature {
  lon: number;
  lat: number;
  line?: [number, number][];
  props: Record<string, string>;
  licenceFamily: "odbl" | "other";
}

export interface ArchiveOptions {
  family: "odbl" | "other";
  attribution: string;
  name: string;
  description: string;
  minZoom?: number;
  maxZoom?: number;
}

export function buildPmtiles(features: MapFeature[], options: ArchiveOptions): Buffer {
  for (const feature of features) {
    if (feature.licenceFamily !== options.family) {
      throw new Error(`refusing to put a ${feature.licenceFamily} feature in the ${options.family} archive`);
    }
  }
  if (features.length === 0) throw new Error("no features to tile");
  const minZoom = options.minZoom ?? 0;
  const maxZoom = options.maxZoom ?? 12;
  const tiles = tileFeatures(features, minZoom, maxZoom);
  const bounds = boundsOf(features);
  const metadata = {
    name: options.name,
    description: options.description,
    attribution: options.attribution,
    type: "overlay",
    version: "1.0.0",
    vector_layers: [
      {
        id: "access",
        description:
          options.family === "odbl"
            ? "OpenStreetMap-derived points and short path segments. ODbL. Kept separate from other licences."
            : "Points and short path segments from non-ODbL open data. This archive contains no OpenStreetMap data.",
        minzoom: minZoom,
        maxzoom: maxZoom,
        fields: {
          id: "String",
          name: "String",
          tranche: "String",
          source_id: "String",
        },
      },
    ],
  };
  return writeArchive(tiles, metadata, bounds, minZoom, maxZoom);
}

function tileFeatures(features: MapFeature[], minZoom: number, maxZoom: number): { z: number; x: number; y: number; mvt: Buffer }[] {
  const tiles: { z: number; x: number; y: number; mvt: Buffer }[] = [];
  for (let z = minZoom; z <= maxZoom; z += 1) {
    const groups = new Map<string, { x: number; y: number; features: MvtFeature[] }>();
    for (const feature of features) {
      const placed = placeFeature(feature, z);
      if (!placed) continue;
      const key = `${placed.x}/${placed.y}`;
      let group = groups.get(key);
      if (!group) {
        group = { x: placed.x, y: placed.y, features: [] };
        groups.set(key, group);
      }
      if (group.features.length >= TILE_CAP) {
        if (!hasAccessProp(feature.props)) continue;
        const drop = group.features.findIndex((item) => !hasAccessProp(item.props));
        if (drop === -1) continue;
        group.features.splice(drop, 1);
      }
      group.features.push(placed.mvt);
    }
    for (const group of groups.values()) {
      if (group.features.length === 0) continue;
      tiles.push({ z, x: group.x, y: group.y, mvt: encodeMvt(group.features) });
    }
  }
  return tiles;
}

function placeFeature(feature: MapFeature, z: number): { x: number; y: number; mvt: MvtFeature } | null {
  if (feature.line && feature.line.length >= 2) {
    const projected = feature.line.map(([lon, lat]) => project(lon, lat, z));
    const x = projected[0]?.x;
    const y = projected[0]?.y;
    if (x === undefined || y === undefined) return null;
    if (projected.some((point) => point.x !== x || point.y !== y)) return null;
    return {
      x,
      y,
      mvt: {
        kind: "line",
        pixels: projected.map((point) => [point.px, point.py]),
        props: feature.props,
      },
    };
  }
  if (!Number.isFinite(feature.lon) || !Number.isFinite(feature.lat)) return null;
  const point = project(feature.lon, feature.lat, z);
  return { x: point.x, y: point.y, mvt: { kind: "point", pixels: [[point.px, point.py]], props: feature.props } };
}

function hasAccessProp(props: Record<string, string>): boolean {
  return ["wheelchair", "ramp", "kerb", "surface", "incline", "elevator", "changing_table", "step_count", "door_width", "automatic_door"].some(
    (key) => props[key] !== undefined && props[key] !== "",
  );
}

export function project(lon: number, lat: number, z: number): { x: number; y: number; px: number; py: number } {
  const n = 2 ** z;
  const gx = ((lon + 180) / 360) * n;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  const gy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  let x = Math.floor(gx);
  let y = Math.floor(gy);
  if (x >= n) x = n - 1;
  if (y >= n) y = n - 1;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  const px = gx >= n ? EXTENT : clampPixel(Math.round((gx - Math.floor(gx)) * EXTENT));
  const py = gy >= n ? EXTENT : clampPixel(Math.round((gy - Math.floor(gy)) * EXTENT));
  return { x, y, px, py };
}

function clampPixel(value: number): number {
  if (value < 0) return 0;
  if (value > EXTENT) return EXTENT;
  return value;
}

function boundsOf(features: MapFeature[]): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  for (const feature of features) {
    const points = feature.line ?? [[feature.lon, feature.lat]];
    for (const [lon, lat] of points) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return { minLon, minLat, maxLon, maxLat };
}

interface DirectoryEntry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

function writeArchive(
  tiles: { z: number; x: number; y: number; mvt: Buffer }[],
  metadata: Record<string, unknown>,
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  minZoom: number,
  maxZoom: number,
): Buffer {
  const blobs = tiles
    .map((tile) => ({ tileId: zxyToTileId(tile.z, tile.x, tile.y), gzip: gzipSync(tile.mvt) }))
    .sort((a, b) => a.tileId - b.tileId);
  let offset = 0;
  const tileEntries: DirectoryEntry[] = blobs.map((blob) => {
    const entry = { tileId: blob.tileId, offset, length: blob.gzip.length, runLength: 1 };
    offset += blob.gzip.length;
    return entry;
  });
  const { rootGzip, leafBytes } = packDirectories(tileEntries);
  const metaGzip = gzipSync(Buffer.from(JSON.stringify(metadata)));
  const tileBytes = Buffer.concat(blobs.map((blob) => blob.gzip));
  const rootOffset = HEADER_BYTES;
  const metaOffset = rootOffset + rootGzip.length;
  const leafOffset = metaOffset + metaGzip.length;
  const tileOffset = leafOffset + leafBytes.length;
  if (rootOffset + rootGzip.length > ROOT_LIMIT) {
    throw new Error("PMTiles root directory does not fit in the first 16384 bytes");
  }
  const header = Buffer.alloc(HEADER_BYTES);
  header.write("PMTiles", 0, "ascii");
  header.writeUInt8(3, 7);
  writeU64(header, 8, rootOffset);
  writeU64(header, 16, rootGzip.length);
  writeU64(header, 24, metaOffset);
  writeU64(header, 32, metaGzip.length);
  writeU64(header, 40, leafBytes.length === 0 ? 0 : leafOffset);
  writeU64(header, 48, leafBytes.length);
  writeU64(header, 56, tileOffset);
  writeU64(header, 64, tileBytes.length);
  writeU64(header, 72, tileEntries.length);
  writeU64(header, 80, tileEntries.length);
  writeU64(header, 88, blobs.length);
  header.writeUInt8(1, 96);
  header.writeUInt8(2, 97);
  header.writeUInt8(2, 98);
  header.writeUInt8(1, 99);
  header.writeUInt8(minZoom, 100);
  header.writeUInt8(maxZoom, 101);
  header.writeInt32LE(Math.round(bounds.minLon * 1e7), 102);
  header.writeInt32LE(Math.round(bounds.minLat * 1e7), 106);
  header.writeInt32LE(Math.round(bounds.maxLon * 1e7), 110);
  header.writeInt32LE(Math.round(bounds.maxLat * 1e7), 114);
  header.writeUInt8(Math.min(maxZoom, Math.max(minZoom, Math.round((minZoom + maxZoom) / 2))), 118);
  header.writeInt32LE(Math.round(((bounds.minLon + bounds.maxLon) / 2) * 1e7), 119);
  header.writeInt32LE(Math.round(((bounds.minLat + bounds.maxLat) / 2) * 1e7), 123);
  const archive = Buffer.concat([header, rootGzip, metaGzip, leafBytes, tileBytes]);
  assertArchiveSize(archive.length);
  return archive;
}

export function assertArchiveSize(bytes: number): void {
  if (bytes >= MAX_PMTILES_BYTES) throw new TileSizeError(bytes);
}

function packDirectories(tileEntries: DirectoryEntry[]): { rootGzip: Buffer; leafBytes: Buffer } {
  const single = gzipSync(encodeDirectory(tileEntries));
  if (HEADER_BYTES + single.length <= ROOT_LIMIT) return { rootGzip: single, leafBytes: Buffer.alloc(0) };
  const chunkSize = 200;
  const leaves: Buffer[] = [];
  const pointers: DirectoryEntry[] = [];
  let leafOffset = 0;
  for (let i = 0; i < tileEntries.length; i += chunkSize) {
    const chunk = tileEntries.slice(i, i + chunkSize);
    const gzip = gzipSync(encodeDirectory(chunk));
    const first = chunk[0];
    if (!first) continue;
    pointers.push({ tileId: first.tileId, offset: leafOffset, length: gzip.length, runLength: 0 });
    leaves.push(gzip);
    leafOffset += gzip.length;
  }
  const rootGzip = gzipSync(encodeDirectory(pointers));
  if (HEADER_BYTES + rootGzip.length > ROOT_LIMIT) throw new Error("PMTiles root directory is too large");
  return { rootGzip, leafBytes: Buffer.concat(leaves) };
}

function encodeDirectory(entries: DirectoryEntry[]): Buffer {
  const bytes: number[] = [];
  writeVarint(bytes, entries.length);
  let last = 0;
  for (const entry of entries) {
    if (entry.tileId < last) throw new Error("directory tile ids must be sorted");
    writeVarint(bytes, entry.tileId - last);
    last = entry.tileId;
  }
  for (const entry of entries) writeVarint(bytes, entry.runLength);
  for (const entry of entries) writeVarint(bytes, entry.length);
  let next = 0;
  entries.forEach((entry, index) => {
    if (index > 0 && entry.offset === next) writeVarint(bytes, 0);
    else writeVarint(bytes, entry.offset + 1);
    next = entry.offset + entry.length;
  });
  return Buffer.from(bytes);
}

function writeVarint(out: number[], value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`varint out of range: ${value}`);
  let n = value;
  while (n > 127) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

function writeU64(header: Buffer, offset: number, value: number): void {
  header.writeBigUInt64LE(BigInt(value), offset);
}
