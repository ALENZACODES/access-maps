import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { acceptId, commitRecord, resetSourceDirs } from "../src/io/commit.js";
import { cell, parseCsv } from "../src/io/csv.js";
import { PartitionWriter } from "../src/io/partition-writer.js";
import { readPointShapefileZip } from "../src/io/shp-points.js";
import {
  mapBramptonRecreationCentre,
  mapKingstonAccessibleFeature,
  mapKingstonPublicWashroom,
  mapMtoPicnicPark,
  mapSudburyFieldhouse,
} from "../src/municipal/map.js";
import type { DataRecord } from "../src/model/records.js";
import type { Provenance } from "../src/model/provenance.js";
import type { Tranche } from "../src/model/records.js";
import { readRegistry, requireSource } from "../src/registry.js";
import { compileValidators } from "../src/validate/ajv.js";

const USER_AGENT = "access-maps-pipeline/1.0 (Ontario open-data import; licence checked)";

const JOBS: {
  id: string;
  tranches: Tranche[];
  load: (file: Buffer, ctx: Provenance) => DataRecord[] | Promise<DataRecord[]>;
  alternate?: () => Promise<Buffer>;
}[] = [
  {
    id: "kingston-public-washrooms",
    tranches: ["washroom"],
    load: (file, ctx) => parseCsv(file.toString("utf8")).rows.map((row) => mapKingstonPublicWashroom(row, ctx)),
  },
  {
    id: "kingston-accessible-features",
    tranches: ["venue", "washroom"],
    load: (file, ctx) => parseCsv(file.toString("utf8")).rows.map((row) => mapKingstonAccessibleFeature(row, ctx)),
    alternate: kingstonFeaturesFromService,
  },
  {
    id: "brampton-recreation-centres",
    tranches: ["venue"],
    load: (file, ctx) => parseCsv(file.toString("utf8")).rows.map((row) => mapBramptonRecreationCentre(row, ctx)),
  },
  {
    id: "sudbury-fieldhouses",
    tranches: ["venue"],
    load: async (file, ctx) => {
      const rows = parseCsv(file.toString("utf8")).rows;
      const service = await sudburyServiceGeometry();
      return rows.map((row) => mapSudburyFieldhouse(row, ctx, service.get(cell(row, "OBJECTID")) ?? null));
    },
  },
  {
    id: "mto-picnic-parks",
    tranches: ["venue"],
    load: (file, ctx) => readPointShapefileZip(file).map((row) => mapMtoPicnicPark(row.attributes, row.lon, row.lat, ctx)),
  },
];

export async function importMoreMunicipal(repoRoot: string): Promise<{ sources: { source_id: string; records: number }[] }> {
  const registry = readRegistry(repoRoot);
  const validators = compileValidators(path.join(repoRoot, "schema"));
  const writer = new PartitionWriter(path.join(repoRoot, "data"));
  const sources: { source_id: string; records: number }[] = [];
  for (const job of JOBS) {
    const source = requireSource(registry, job.id);
    if (source.tier !== 0) throw new Error(`${job.id} must be tier 0`);
    const file = await download(repoRoot, source.id, source.download_url, job.alternate);
    resetSourceDirs(path.join(repoRoot, "data"), source.id, job.tranches);
    const ctx: Provenance = {
      source_id: source.id,
      licence: source.licence_id,
      retrieved_at: source.retrieved_at,
      tier: 0,
    };
    const seen = new Set<string>();
    let records = 0;
    for (const record of await job.load(file, ctx)) {
      let next = record;
      if (!acceptId(seen, next.id)) {
        let suffix = 2;
        while (!acceptId(seen, `${record.id}#${suffix}`)) suffix += 1;
        next = { ...record, id: `${record.id}#${suffix}` };
      }
      await commitRecord(next, source.id, writer, validators);
      records += 1;
    }
    sources.push({ source_id: source.id, records });
  }
  await writer.close();
  console.log(JSON.stringify({ sources }));
  return { sources };
}

const SUDBURY_GEOMETRY =
  "https://services.arcgis.com/q3mIlR87lZlZsds3/ArcGIS/rest/services/AGOL_Recreation_Bilingual_For_Web_FGDB_V_3/FeatureServer/3/query";

async function sudburyServiceGeometry(): Promise<Map<string, { lon: number; lat: number }>> {
  const points = new Map<string, { lon: number; lat: number }>();
  const query = new URL(SUDBURY_GEOMETRY);
  query.searchParams.set("where", "1=1");
  query.searchParams.set("outFields", "OBJECTID");
  query.searchParams.set("returnGeometry", "true");
  query.searchParams.set("outSR", "4326");
  query.searchParams.set("f", "json");
  const response = await fetch(query, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!response.ok) return points;
  const body = (await response.json()) as {
    features?: { attributes?: { OBJECTID?: number | string }; geometry?: { x?: number; y?: number } }[];
  };
  for (const feature of body.features ?? []) {
    const id = feature.attributes?.OBJECTID;
    const lon = feature.geometry?.x;
    const lat = feature.geometry?.y;
    if (id === undefined || lon === undefined || lat === undefined) continue;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    points.set(String(id), { lon, lat });
  }
  return points;
}

async function kingstonFeaturesFromService(): Promise<Buffer> {
  const endpoint =
    "https://services1.arcgis.com/5GRYvurYYUwAecLQ/arcgis/rest/services/Accessible_Features_at_Kingston_Facilities/FeatureServer/0/query";
  const rows: Record<string, string>[] = [];
  let offset = 0;
  for (;;) {
    const query = new URL(endpoint);
    query.searchParams.set("where", "1=1");
    query.searchParams.set("outFields", "*");
    query.searchParams.set("returnGeometry", "true");
    query.searchParams.set("outSR", "4326");
    query.searchParams.set("resultOffset", String(offset));
    query.searchParams.set("resultRecordCount", "1000");
    query.searchParams.set("f", "json");
    const response = await fetch(query, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`);
    const body = (await response.json()) as {
      features?: { attributes?: Record<string, unknown>; geometry?: { x?: number; y?: number } }[];
      exceededTransferLimit?: boolean;
    };
    const features = body.features ?? [];
    for (const feature of features) {
      const attributes = feature.attributes ?? {};
      rows.push({
        OBJECTID: text(attributes.OBJECTID),
        Type: text(attributes.Type),
        Status: text(attributes.Status),
        "Facility Name": text(attributes.FacilityName),
        Comment: text(attributes.Comment),
        GlobalID: text(attributes.GlobalID),
        Address: text(attributes.Address),
        x: text(feature.geometry?.x),
        y: text(feature.geometry?.y),
      });
    }
    offset += features.length;
    if (features.length === 0 || body.exceededTransferLimit !== true) break;
  }
  if (rows.length === 0) throw new Error("Kingston feature service returned no features");
  const headers = ["OBJECTID", "Type", "Status", "Facility Name", "Comment", "GlobalID", "Address", "x", "y"];
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header] ?? "")).join(","));
  return Buffer.from(`${lines.join("\n")}\n`);
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

async function download(repoRoot: string, id: string, url: string, alternate?: () => Promise<Buffer>): Promise<Buffer> {
  const directory = path.join(repoRoot, ".cache", "municipal");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${id}${url.includes(".zip") ? ".zip" : ".csv"}`);
  let last = "";
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
    if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length < 32) throw new Error(`${url} returned ${body.length} bytes`);
    if (!url.includes(".zip") && body[0] === 0x7b) {
      last = body.subarray(0, 180).toString("utf8");
      if (/Pending|being generated/i.test(last)) {
        if (alternate && attempt >= 2) return saveDownload(file, await alternate());
        if (attempt < 8) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
          continue;
        }
      }
      throw new Error(`${url} returned JSON instead of a file: ${last}`);
    }
    return saveDownload(file, body);
  }
  if (alternate) return saveDownload(file, await alternate());
  throw new Error(`${url} returned JSON instead of a file: ${last}`);
}

function saveDownload(file: string, body: Buffer): Buffer {
  writeFileSync(file, body);
  return body;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importMoreMunicipal(process.cwd());
}
