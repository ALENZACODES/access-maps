import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { runMatch } from "../../scripts/match-places.js";
import { countDistinctPlaces } from "../../src/count/distinct.js";
import { readClusters, readLinksIndex, LINK_FILE_PATTERN, memberKey } from "../../src/places/links.js";
import { matchRecords } from "../../src/places/match.js";
import { fixture, metresLat } from "./helpers.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const TRANCHE_DIR = { venue: "venues", washroom: "washrooms", transit: "transit" } as const;

function writeData(root: string, records: ReturnType<typeof fixture>[]): string[] {
  const groups = new Map<string, string[]>();
  for (const record of records) {
    const source = record.fields.lat!.source_id;
    const file = path.join(root, "data", TRANCHE_DIR[record.tranche], source, `${record.region}.ndjson.gz`);
    groups.set(file, [...(groups.get(file) ?? []), JSON.stringify(record)]);
  }
  for (const [file, lines] of groups) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, gzipSync(`${lines.join("\n")}\n`));
  }
  return [...groups.keys()].sort();
}

function sample() {
  const lat = 43.7;
  const lon = -79.4;
  return [
    fixture({ source: "fixture-a", id: "1", lat, lon, name: "Example Park", category: "park", wheelchair: "yes" }),
    fixture({ source: "fixture-b", id: "1", lat: lat + metresLat(20), lon, name: "EXAMPLE PARK", category: "Park" }),
    fixture({ source: "fixture-c", id: "1", lat: lat + metresLat(30), lon, name: "Parc Example", category: "park" }),
    fixture({ source: "fixture-a", id: "2", lat: lat + 0.01, lon, name: "Sample Library", category: "library" }),
    fixture({ source: "fixture-b", id: "2", lat: lat + 0.01 + metresLat(5), lon, name: "Sample Library", category: "library" }),
    fixture({ source: "fixture-a", id: "3", lat: lat + 0.02, lon, name: "Only Here Cafe", category: "cafe" }),
    fixture({ source: "fixture-b", id: "3", tranche: "transit", lat: lat + 0.03, lon, name: "Main at King", stopCode: "1234", wheelchair: "accessible" }),
    fixture({ source: "fixture-c", id: "3", tranche: "washroom", lat: lat + 0.04, lon, name: "Example Washroom" }),
  ];
}

describe("streaming run and distinct-place count", () => {
  it("writes the same clusters as the in-memory matcher, with an index that checks every file", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "places-run-"));
    dirs.push(root);
    const records = sample();
    writeData(root, records);
    const index = await runMatch({ dataRoot: path.join(root, "data"), workDir: path.join(root, ".cache") });
    expect(index.places_read).toBe(records.length);
    expect(index.clusters).toBe(2);
    expect(index.records_in_clusters).toBe(5);
    for (const file of index.files) expect(LINK_FILE_PATTERN.test(path.basename(file.path))).toBe(true);
    const written = [];
    for await (const line of readClusters(path.join(root, "data"))) written.push(line.members.map(memberKey));
    const memory = matchRecords(records);
    expect(written).toEqual(memory.clusters.map((cluster) => cluster.members));
    // Source records are untouched.
    const again = await runMatch({ dataRoot: path.join(root, "data"), workDir: path.join(root, ".cache") });
    expect(again).toEqual(index);
  });

  it("counts distinct places, per-source contributions and places with an accessibility fact", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "places-count-"));
    dirs.push(root);
    const files = writeData(root, sample());
    await runMatch({ dataRoot: path.join(root, "data"), workDir: path.join(root, ".cache") });
    const report = await countDistinctPlaces(path.join(root, "data"), files);
    expect(report.place_records).toBe(8);
    // Park (3 records) + library (2) + cafe + stop + washroom.
    expect(report.distinct_places).toBe(5);
    expect(report.clusters).toBe(2);
    expect(report.records_joined_by_links).toBe(5);
    // The park (one record says wheelchair yes) and the stop (wheelchair_boarding) have a fact.
    expect(report.with_known_accessibility_fact).toBe(2);
    expect(report.by_source["fixture-a"]).toEqual({ records: 3, only_in_this_source: 1, shared_with_other_sources: 2 });
    expect(report.by_source["fixture-b"]).toEqual({ records: 3, only_in_this_source: 1, shared_with_other_sources: 2 });
    expect(report.by_source["fixture-c"]).toEqual({ records: 2, only_in_this_source: 1, shared_with_other_sources: 1 });
    expect(report.links.current).toBe(true);
  });

  it("says when the links are older than the data and counts new records as their own places", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "places-stale-"));
    dirs.push(root);
    writeData(root, sample());
    await runMatch({ dataRoot: path.join(root, "data"), workDir: path.join(root, ".cache") });
    const extra = fixture({ source: "fixture-d", id: "1", lat: 43.7, lon: -79.4, name: "Example Park", category: "park" });
    const files = writeData(root, [...sample(), extra]);
    const report = await countDistinctPlaces(path.join(root, "data"), files);
    expect(report.links.current).toBe(false);
    expect(report.distinct_places).toBe(6);
  });

  it("refuses to count from a link file that does not match its index", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "places-tamper-"));
    dirs.push(root);
    const files = writeData(root, sample());
    const index = await runMatch({ dataRoot: path.join(root, "data"), workDir: path.join(root, ".cache") });
    const target = path.join(root, "data", index.files.find((file) => file.path.includes("same-place"))!.path);
    appendFileSync(target, Buffer.from([0x1f, 0x8b, 0x00]));
    await expect(countDistinctPlaces(path.join(root, "data"), files)).rejects.toThrow(/does not match/);
    expect(readLinksIndex(path.join(root, "data"))?.clusters).toBe(2);
    expect(readFileSync(path.join(root, "data", "links", "index.json"), "utf8")).toContain("same-place-v1");
  });

  it("counts every record as its own place when there are no links", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "places-nolinks-"));
    dirs.push(root);
    const files = writeData(root, sample());
    const report = await countDistinctPlaces(path.join(root, "data"), files);
    expect(report.distinct_places).toBe(8);
    expect(report.links.method).toBeNull();
  });
});
