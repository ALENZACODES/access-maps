/**
 * Evaluation of the same-place matcher on a hand-labelled sample.
 *
 *   npx tsx scripts/places-eval.ts --sample 360 --out <file>
 *     Draws candidate pairs (records of different sources close together)
 *     stratified by urban/rural block and by score band, and writes them with
 *     the fields a person needs to judge them. The score is not written, so
 *     the label does not lean on it. The file is for labelling only and is
 *     not committed: it repeats source values.
 *
 *   npx tsx scripts/places-eval.ts --evaluate test/fixtures/places/labelled-pairs.jsonl
 *     Reads the labels (record keys and a label only) and the committed
 *     links, and prints precision and recall, per stratum and weighted by
 *     stratum size.
 */
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { pathToFileURL } from "node:url";
import { DEFAULT_PARAMS, recordKey, type Edge } from "../src/places/match.js";
import { CLUSTER_DIR, POSSIBLE_DIR, linkFiles, readClusters, readJsonlGz, memberKey, type PossibleLine } from "../src/places/links.js";
import { collectEdges } from "./match-places.js";

/** Urban: at least this many place records in the ~1.1 km square (0.01 by 0.014 degrees) around the first record. */
export const URBAN_SQUARE_RECORDS = 150;

class CoarseDensity {
  private readonly counts = new Map<string, number>();
  private key(lat: number, lon: number): string {
    return `${Math.floor(lat / 0.01)}:${Math.floor(lon / 0.014)}`;
  }
  add(lat: number, lon: number): void {
    const key = this.key(lat, lon);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  count(lat: number, lon: number): number {
    return this.counts.get(this.key(lat, lon)) ?? 0;
  }
}

export interface LabelledPair {
  a: string;
  b: string;
  stratum: string;
  label: "same" | "different" | "unsure";
  /** "tuning": the sample the rules were adjusted on. "held-out": drawn and labelled afterwards. */
  set: string;
}

export function band(edge: Edge): string {
  const e = edge.evidence;
  if (e.decision === "match") return e.score >= 0.85 ? "match-high" : "match-low";
  if (e.decision === "possible") return "possible";
  if (e.name !== null && e.name >= 0.4) return "rejected-similar-name";
  return "rejected-other";
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A pair is in the evaluation pool if a person could plausibly think it is one place. */
function inPool(edge: Edge): boolean {
  const e = edge.evidence;
  if (e.reason === "same source" || e.reason === "too far apart") return false;
  if (e.class_compat === 0) return false;
  if (e.name !== null) return e.name >= 0.25 || e.decision !== "none";
  return e.distance_m <= 30 || e.decision !== "none";
}

async function sample(dataRoot: string, size: number, out: string, seed: number): Promise<void> {
  const coarse = new CoarseDensity();
  const collected = await collectEdges({ onPoint: (point) => coarse.add(point.lat, point.lon), dataRoot, workDir: path.join(path.dirname(dataRoot), ".cache", "places-eval"), keep: (evidence) => inPool({ a: "", b: "", evidence }) });
  const run = { ...collected, coarse };
  const density = run.coarse;
  const strata = new Map<string, Edge[]>();
  for (const edge of run.edges) {
    if (!inPool(edge)) continue;
    const a = run.points.get(edge.a)!;
    const area = density.count(a.lat, a.lon) >= URBAN_SQUARE_RECORDS ? "urban" : "rural";
    const key = `${area}/${band(edge)}`;
    const list = strata.get(key) ?? [];
    list.push(edge);
    strata.set(key, list);
  }
  const random = rng(seed);
  const names = [...strata.keys()].sort();
  const per = Math.ceil(size / names.length);
  const picked: Array<{ edge: Edge; stratum: string }> = [];
  const sizes: Record<string, number> = {};
  for (const name of names) {
    const list = strata.get(name)!;
    sizes[name] = list.length;
    // Partial Fisher-Yates: deterministic for the seed.
    const copy = [...list];
    for (let i = 0; i < Math.min(per, copy.length); i += 1) {
      const j = i + Math.floor(random() * (copy.length - i));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      picked.push({ edge: copy[i]!, stratum: name });
    }
  }
  const wanted = new Set(picked.flatMap((item) => [item.edge.a, item.edge.b]));
  const display = await displayRecords(dataRoot, wanted);
  const lines = picked.map(({ edge, stratum }) => JSON.stringify({
    a: edge.a, b: edge.b, stratum, distance_m: edge.evidence.distance_m,
    A: display.get(edge.a), B: display.get(edge.b), label: null,
  }));
  writeFileSync(out, `${lines.join("\n")}\n`);
  console.log(JSON.stringify({ pool: sizes, picked: picked.length }, null, 2));
}

const DISPLAY_FIELDS = ["name", "category_group", "category", "facility_type", "addr_housenumber", "addr_street", "address", "stop_code", "description", "ref", "operator"];

async function displayRecords(dataRoot: string, wanted: Set<string>): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const dir of ["venues", "washrooms", "transit"]) {
    const { readdirSync } = await import("node:fs");
    for (const source of readdirSync(path.join(dataRoot, dir)).sort()) {
      for (const name of readdirSync(path.join(dataRoot, dir, source)).sort()) {
        const input = createReadStream(path.join(dataRoot, dir, source, name)).pipe(createGunzip());
        for await (const line of createInterface({ input, crlfDelay: Infinity })) {
          if (!line) continue;
          const record = JSON.parse(line) as { id: string; tranche: string; fields: Record<string, { value: unknown; source_id: string }> };
          const key = recordKey(record.tranche, record.id);
          if (!wanted.has(key)) continue;
          const view: Record<string, unknown> = { source: record.fields.lat?.source_id };
          for (const field of DISPLAY_FIELDS) {
            const value = record.fields[field]?.value;
            if (value !== undefined && value !== "UNKNOWN") view[field] = value;
          }
          out.set(key, view);
        }
      }
    }
  }
  return out;
}

export interface Metrics {
  pairs: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  /** True "same" pairs that were left separate but listed as a possible duplicate. */
  fn_listed_possible: number;
}

export function metrics(rows: Array<{ label: boolean; predicted: boolean; possible: boolean }>): Metrics {
  let tp = 0, fp = 0, fn = 0, tn = 0, listed = 0;
  for (const row of rows) {
    if (row.predicted && row.label) tp += 1;
    else if (row.predicted && !row.label) fp += 1;
    else if (!row.predicted && row.label) { fn += 1; if (row.possible) listed += 1; }
    else tn += 1;
  }
  return {
    pairs: rows.length, tp, fp, fn, tn,
    precision: tp + fp === 0 ? null : Math.round((tp / (tp + fp)) * 1000) / 1000,
    recall: tp + fn === 0 ? null : Math.round((tp / (tp + fn)) * 1000) / 1000,
    fn_listed_possible: listed,
  };
}

async function evaluate(dataRoot: string, labelsFile: string): Promise<void> {
  const labels = readFileSync(labelsFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as LabelledPair);
  const cluster = new Map<string, string>();
  for await (const line of readClusters(dataRoot)) for (const item of line.members) cluster.set(memberKey(item), line.cluster);
  const possible = new Set<string>();
  for (const file of linkFiles(dataRoot, POSSIBLE_DIR)) {
    for await (const line of readJsonlGz<PossibleLine>(path.join(dataRoot, file))) {
      const [x, y] = [memberKey(line.a), memberKey(line.b)].sort();
      possible.add(`${x}\u0000${y}`);
    }
  }
  const display = await displayRecords(dataRoot, new Set(labels.flatMap((item) => [item.a, item.b])));
  const named = (key: string): boolean => typeof display.get(key)?.name === "string";
  const rows = labels.filter((item) => item.label !== "unsure").map((item) => {
    const ca = cluster.get(item.a);
    const [x, y] = [item.a, item.b].sort();
    return {
      set: item.set,
      stratum: item.stratum,
      bothNamed: named(item.a) && named(item.b),
      label: item.label === "same",
      predicted: ca !== undefined && ca === cluster.get(item.b),
      possible: possible.has(`${x}\u0000${y}`),
    };
  });
  const report: Record<string, unknown> = { labelled: labels.length, unsure: labels.length - rows.length };
  for (const set of [...new Set(labels.map((item) => item.set))].sort()) {
    const mine = rows.filter((row) => row.set === set);
    const byStratum: Record<string, Metrics> = {};
    for (const name of [...new Set(mine.map((row) => row.stratum))].sort()) byStratum[name] = metrics(mine.filter((row) => row.stratum === name));
    const poolFile = path.join(path.dirname(labelsFile), `pool-${set}.json`);
    let weighted: { precision: number | null; recall: number | null } | null = null;
    if (existsSync(poolFile)) {
      // Each labelled pair stands for (pool size of its stratum / judged pairs in it).
      const pool = (JSON.parse(readFileSync(poolFile, "utf8")) as { pool: Record<string, number> }).pool;
      let tp = 0, fp = 0, fn = 0;
      for (const [name, m] of Object.entries(byStratum)) {
        const weight = (pool[name] ?? 0) / Math.max(1, m.pairs);
        tp += m.tp * weight; fp += m.fp * weight; fn += m.fn * weight;
      }
      weighted = {
        precision: tp + fp === 0 ? null : Math.round((tp / (tp + fp)) * 1000) / 1000,
        recall: tp + fn === 0 ? null : Math.round((tp / (tp + fn)) * 1000) / 1000,
      };
    }
    report[set] = {
      labelled: labels.filter((item) => item.set === set).length,
      judged: mine.length,
      overall: metrics(mine),
      urban: metrics(mine.filter((row) => row.stratum.startsWith("urban/"))),
      rural: metrics(mine.filter((row) => row.stratum.startsWith("rural/"))),
      both_named: metrics(mine.filter((row) => row.bothNamed)),
      a_side_unnamed: metrics(mine.filter((row) => !row.bothNamed)),
      weighted_by_pool: weighted,
      by_stratum: byStratum,
    };
  }
  report.all = metrics(rows);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dataRoot = path.join(process.cwd(), "data");
  const arg = (name: string): string | undefined => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
  };
  if (arg("--sample")) {
    await sample(dataRoot, Number(arg("--sample")), arg("--out") ?? "pairs.jsonl", Number(arg("--seed") ?? 20261116));
  } else if (arg("--evaluate")) {
    await evaluate(dataRoot, arg("--evaluate")!);
  } else {
    console.error("usage: --sample N --out FILE [--seed S] | --evaluate LABELS");
    process.exitCode = 2;
  }
}

void DEFAULT_PARAMS;
void CLUSTER_DIR;
