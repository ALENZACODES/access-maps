import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { importMunicipal } from "../../scripts/import-municipal.js";
import { importCityOpenData } from "../../scripts/import-city-open-data.js";
import { importGtfs } from "../../scripts/import-gtfs.js";
import { runLayerJobs, type LayerJob } from "../../scripts/import-cities-g3.js";
import { importStatcanLode } from "../../scripts/import-statcan-lode.js";
import { importOntarioGeohub } from "../../scripts/import-ontario-geohub.js";
import { gpkgBlob, wkbPoint, writeGpkg } from "../national/lode-fixtures.js";
import { PerSourceRun } from "../../src/failsafe/per-source.js";
import { commitRecord } from "../../src/io/commit.js";
import { fv } from "../../src/model/provenance.js";
import { buildRecord } from "../../src/model/records.js";
import { readRegistry } from "../../src/registry.js";
import { cleanup, CELL, idsIn, tempRoot, validators, washroom } from "./helpers.js";

/**
 * One source failing inside a multi-source importer: the other sources are
 * refreshed, the failed source keeps its last known-good files byte for byte,
 * and the failure is in the run report. Every value below is a labelled test
 * fixture, not a real place.
 */

afterEach(() => cleanup());

const repo = process.cwd();

function fixtureRepo() {
  const env = tempRoot();
  cpSync(path.join(repo, "schema"), path.join(env.root, "schema"), { recursive: true });
  mkdirSync(path.join(env.root, "sources"), { recursive: true });
  cpSync(path.join(repo, "sources", "registry.json"), path.join(env.root, "sources", "registry.json"));
  return env;
}

/** Writes `count` old records into data/<dir>/<source>/<cell>.ndjson.gz and returns the file. */
function seedSource(data: string, dir: string, sourceId: string, count: number, cell = CELL): string {
  const file = path.join(data, dir, sourceId, `${cell}.ndjson.gz`);
  mkdirSync(path.dirname(file), { recursive: true });
  const lines = Array.from({ length: count }, (_, i) => JSON.stringify(washroom(`${sourceId}:old${i}`)));
  writeFileSync(file, gzipSync(`${lines.join("\n")}\n`));
  return file;
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".ndjson.gz")).map((name) => path.join(dir, name));
}

function allIds(dir: string): string[] {
  return filesUnder(dir).flatMap((file) => idsIn(file)).sort();
}

const point = (lon: number, lat: number) => JSON.stringify({ type: "Point", coordinates: [lon, lat] });
const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

describe("one source failing inside an importer never holds back the others", () => {
  it("Toronto: a missing download for one dataset keeps its files; the other two are refreshed", async () => {
    const env = fixtureRepo();
    const park = seedSource(env.data, "washrooms", "toronto-park-washrooms", 3);
    const street = seedSource(env.data, "washrooms", "toronto-street-washrooms", 3);
    const crem = seedSource(env.data, "washrooms", "toronto-crem-washrooms", 3);
    const streetBefore = readFileSync(street);
    const cache = path.join(env.root, ".cache", "municipal");
    mkdirSync(cache, { recursive: true });
    writeFileSync(path.join(cache, "toronto-park-washrooms.csv"), `_id,ASSET_ID,geometry\n${[1, 2, 3, 4].map((n) => `${n},F${n},${csvCell(point(-79.38, 43.65))}`).join("\n")}\n`);
    writeFileSync(path.join(cache, "toronto-crem-washrooms.csv"), `_id,geometry\n${[1, 2].map((n) => `${n},${csvCell(point(-79.4, 43.7))}`).join("\n")}\n`);
    // toronto-street-washrooms.csv is missing: the download failed.

    await expect(importMunicipal(env.root)).rejects.toThrow(/importMunicipal: 1 of 3 sources failed.*toronto-street-washrooms/);

    expect(allIds(path.dirname(park))).toEqual(["toronto-park-washrooms:F1", "toronto-park-washrooms:F2", "toronto-park-washrooms:F3", "toronto-park-washrooms:F4"]);
    expect(allIds(path.dirname(crem))).toEqual(["toronto-crem-washrooms:1", "toronto-crem-washrooms:2"]);
    expect(readFileSync(street).equals(streetBefore)).toBe(true);
    const outcomes = env.log.report.outcomes;
    expect(outcomes.filter((o) => o.status === "replaced").map((o) => o.target).sort()).toEqual(["washrooms/toronto-crem-washrooms", "washrooms/toronto-park-washrooms"]);
    expect(outcomes).toContainEqual(expect.objectContaining({ step: "importMunicipal/toronto-street-washrooms", status: "step_failed", reason: expect.stringMatching(/ENOENT/) }));
    expect(outcomes).toContainEqual(expect.objectContaining({ source_id: "toronto-street-washrooms", target: "washrooms/toronto-street-washrooms", status: "kept_last_known_good" }));
    expect(env.log.report.status).toBe("contained");
  });

  it("Ottawa: a cut-short cache file for one layer keeps its files; the other layer is refreshed", async () => {
    const env = fixtureRepo();
    const washrooms = seedSource(env.data, "washrooms", "ottawa-public-washrooms", 2, "n45.0_w076.0");
    const parking = seedSource(env.data, "venues", "ottawa-park-parking", 2, "n45.0_w076.0");
    const parkingBefore = readFileSync(parking);
    const cache = path.join(env.root, ".cache", "municipal");
    mkdirSync(cache, { recursive: true });
    const features = [1, 2, 3].map((n) => ({ attributes: { OBJECTID: n, UNIQUE_ID: `FX${n}`, PUBLIC_TOILETS_YN: "1", NAME: `Fixture ${n}` }, geometry: { x: -75.7, y: 45.4 } }));
    writeFileSync(path.join(cache, "ottawa-public-washrooms.json"), JSON.stringify({ layers: [{ id: "", features }] }));
    writeFileSync(path.join(cache, "ottawa-park-parking.json"), JSON.stringify({ layers: [{ id: "", features }] }).slice(0, 40));

    await expect(importCityOpenData(env.root, ["ottawa-public-washrooms", "ottawa-park-parking"])).rejects.toThrow(/importCityOpenData: 1 of 2 sources failed.*ottawa-park-parking/);

    expect(allIds(path.dirname(washrooms))).toEqual(["ottawa-public-washrooms:FX1:1", "ottawa-public-washrooms:FX2:2", "ottawa-public-washrooms:FX3:3"]);
    expect(readFileSync(parking).equals(parkingBefore)).toBe(true);
    expect(env.log.report.outcomes).toContainEqual(expect.objectContaining({ target: "venues/ottawa-park-parking", status: "kept_last_known_good" }));
  });

  it("GTFS: a corrupt zip for one feed keeps its stops; the other feed is refreshed", async () => {
    const env = fixtureRepo();
    const good = seedSource(env.data, "transit", "gtfs-grt-bus", 2);
    const bad = seedSource(env.data, "transit", "gtfs-hsr", 2);
    const badBefore = readFileSync(bad);
    const gtfs = path.join(env.root, ".cache", "gtfs");
    mkdirSync(gtfs, { recursive: true });
    const stops = "stop_id,stop_name,stop_lat,stop_lon,wheelchair_boarding\nFX1,Fixture stop 1,43.45,-80.49,1\nFX2,Fixture stop 2,43.46,-80.5,0\nFX3,Fixture stop 3,43.47,-80.51,2\n";
    writeFileSync(path.join(gtfs, "grt1.zip"), storedZip("stops.txt", Buffer.from(stops)));
    writeFileSync(path.join(gtfs, "hsr.zip"), Buffer.from("<html>503 Service Unavailable</html>"));

    await expect(importGtfs(env.root, ["gtfs-grt-bus", "gtfs-hsr"])).rejects.toThrow(/importGtfs: 1 of 2 sources failed.*gtfs-hsr/);

    expect(readFileSync(bad).equals(badBefore)).toBe(true);
    // The refreshed stops sit in another cell, so the whole old directory was replaced.
    expect(existsSync(good)).toBe(false);
    const refreshed = allIds(path.join(env.data, "transit", "gtfs-grt-bus"));
    expect(refreshed).toHaveLength(3);
    expect(refreshed.some((id) => id.includes("old"))).toBe(false);
    expect(env.log.report.outcomes).toContainEqual(expect.objectContaining({ step: "importGtfs/gtfs-hsr", status: "step_failed" }));
    expect(env.log.report.outcomes.filter((o) => o.status === "kept_last_known_good").map((o) => o.target).sort()).toEqual(["paths/gtfs-hsr", "transit/gtfs-hsr"]);
  });

  it("layer jobs (cities g3/g5): a source that throws mid-import keeps its files, sources before and after it are refreshed", async () => {
    const env = fixtureRepo();
    const ids = ["kitchener-public-washrooms", "guelph-restrooms", "windsor-park-washrooms"];
    const before = ids.map((id) => seedSource(env.data, "washrooms", id, 4));
    const failedBefore = readFileSync(before[1] as string);
    const cache = path.join(env.root, ".cache", "municipal");
    mkdirSync(cache, { recursive: true });
    const features = [1, 2, 3].map((n) => ({ attributes: { OBJECTID: n }, geometry: { x: -79.38, y: 43.65 } }));
    for (const id of ids) writeFileSync(path.join(cache, `${id}.json`), JSON.stringify({ features }));
    const jobs: LayerJob[] = ids.map((id) => ({
      id,
      tranche: "washroom",
      fields: [],
      map: (feature, ctx) => {
        const objectId = String(feature.attributes.OBJECTID);
        // Injected fault: the second source fails after one record has been written.
        if (id === "guelph-restrooms" && objectId === "2") throw new Error("HTTP 503 after 1 of 3 features");
        const record = buildRecord("washroom", `${id}:${objectId}`, CELL, { name: fv(`Fixture ${objectId}`, ctx, { source_key: "OBJECTID" }) }, ctx);
        record.fields.lat = fv(43.65, ctx, { source_key: "geometry" });
        record.fields.lon = fv(-79.38, ctx, { source_key: "geometry" });
        return record;
      },
    }));

    await expect(runLayerJobs(env.root, jobs, [], "importFixtureCities")).rejects.toThrow(/importFixtureCities: 1 of 3 sources failed.*guelph-restrooms.*HTTP 503/);

    expect(allIds(path.join(env.data, "washrooms", "kitchener-public-washrooms"))).toEqual(["kitchener-public-washrooms:1", "kitchener-public-washrooms:2", "kitchener-public-washrooms:3"]);
    expect(allIds(path.join(env.data, "washrooms", "windsor-park-washrooms"))).toEqual(["windsor-park-washrooms:1", "windsor-park-washrooms:2", "windsor-park-washrooms:3"]);
    expect(readFileSync(before[1] as string).equals(failedBefore)).toBe(true);
    expect(allIds(path.join(env.data, "washrooms", "guelph-restrooms"))).toHaveLength(4);
    const statuses = env.log.report.outcomes.map((o) => `${o.status}:${o.target ?? o.step}`);
    expect(statuses).toEqual([
      "replaced:washrooms/kitchener-public-washrooms",
      "step_failed:importFixtureCities/guelph-restrooms",
      "kept_last_known_good:washrooms/guelph-restrooms",
      "replaced:washrooms/windsor-park-washrooms",
    ]);
    expect(readdirSync(path.join(env.root, ".cache", "failsafe", "staging"))).toEqual([]);
  });
});

describe("Statistics Canada LODE databases", () => {
  it("a corrupt zip for one database keeps its files; the GeoPackage and CSV databases are refreshed", async () => {
    const env = fixtureRepo();
    const odhf = seedSource(env.data, "venues", "statcan-odhf", 2);
    const odcaf = seedSource(env.data, "venues", "statcan-odcaf", 2);
    const odcafBefore = readFileSync(odcaf);
    const cache = path.join(env.root, ".cache", "lode");
    for (const id of ["statcan-odhf", "statcan-odef", "statcan-odcaf"]) mkdirSync(path.join(cache, id), { recursive: true });
    // Statistics Canada Lambert metres for a point in Toronto.
    writeGpkg(path.join(cache, "statcan-odhf", "odhf_v2.gpkg"), "odhf_v2", ["id", "name", "type", "provider", "prov_terr"], [1, 2, 3].map((n) => ({ id: `FX${n}`, name: `Fixture ${n}`, type: "Pharmacy", provider: "Government of Ontario", prov_terr: "ON", geom: gpkgBlob(wkbPoint(7224817.495306485, 928699.0518283916)) })));
    writeFileSync(path.join(cache, "statcan-odef", "odef_v3_0_1.csv"), `unique_id,province_code,facility_name,geometry\nFX1,ON,Fixture School,POINT (-79.38 43.65)\nFX2,QC,Fixture Ecole,POINT (-73.6 45.5)\n`);
    // The ODCAF download was cut short: the zip is an HTML error page and the CSV was never extracted.
    writeFileSync(path.join(cache, "statcan-odcaf", "statcan-odcaf.zip"), Buffer.from("<html>503 Service Unavailable</html>"));

    await expect(importStatcanLode(env.root, ["statcan-odhf", "statcan-odef", "statcan-odcaf"])).rejects.toThrow(/importStatcanLode: 1 of 3 sources failed.*statcan-odcaf/);

    expect(allIds(path.dirname(odhf))).toEqual(["statcan-odhf:FX1", "statcan-odhf:FX2", "statcan-odhf:FX3"]);
    expect(allIds(path.join(env.data, "venues", "statcan-odef"))).toEqual(["statcan-odef:FX1"]);
    expect(readFileSync(odcaf).equals(odcafBefore)).toBe(true);
    expect(env.log.report.outcomes).toContainEqual(expect.objectContaining({ step: "importStatcanLode/statcan-odcaf", status: "step_failed" }));
    expect(env.log.report.outcomes).toContainEqual(expect.objectContaining({ source_id: "statcan-odcaf", target: "venues/statcan-odcaf", status: "kept_last_known_good" }));
  });
});

describe("Ontario GeoHub layers", () => {
  it("a cut-short cache file for one layer keeps its files; the other layers are refreshed", async () => {
    const env = fixtureRepo();
    const parks = seedSource(env.data, "venues", "ontario-provincial-parks", 2);
    const stations = seedSource(env.data, "venues", "ontario-railway-stations", 2);
    const stationsBefore = readFileSync(stations);
    const cache = path.join(env.root, ".cache", "provincial");
    mkdirSync(cache, { recursive: true });
    const features = [1, 2, 3].map((n) => ({ attributes: { OBJECTID: String(n), OGF_ID: `FX${n}`, PROTECTED_AREA_NAME_ENG: `Fixture ${n}`, LOCATION_ACCURACY: "Within 10 metres" }, anchor: { lon: -79.38, lat: 43.65, key: "geometry" } }));
    writeFileSync(path.join(cache, "ontario-provincial-parks.json"), JSON.stringify({ features }));
    writeFileSync(path.join(cache, "ontario-otn-access-points.json"), JSON.stringify({ features }));
    writeFileSync(path.join(cache, "ontario-railway-stations.json"), JSON.stringify({ features }).slice(0, 50));

    await expect(importOntarioGeohub(env.root, ["ontario-provincial-parks", "ontario-otn-access-points", "ontario-railway-stations"])).rejects.toThrow(/importOntarioGeohub: 1 of 3 sources failed.*ontario-railway-stations/);

    expect(allIds(path.dirname(parks))).toEqual(["ontario-provincial-parks:FX1", "ontario-provincial-parks:FX2", "ontario-provincial-parks:FX3"]);
    expect(allIds(path.join(env.data, "venues", "ontario-otn-access-points"))).toHaveLength(3);
    expect(readFileSync(stations).equals(stationsBefore)).toBe(true);
    expect(env.log.report.outcomes).toContainEqual(expect.objectContaining({ step: "importOntarioGeohub/ontario-railway-stations", status: "step_failed" }));
    expect(env.log.report.outcomes).toContainEqual(expect.objectContaining({ target: "venues/ontario-railway-stations", status: "kept_last_known_good" }));
  });
});

describe("PerSourceRun", () => {
  it("reports a source that failed before it marked anything, and finish() passes when nothing failed", async () => {
    const env = tempRoot();
    const run = new PerSourceRun("importFixture", env.data, env.log);
    const value = await run.source("toronto-park-washrooms", ["washroom"], async (writer) => {
      await commitRecord(washroom("good1"), "toronto-park-washrooms", writer, validators);
      return 1;
    });
    expect(value).toBe(1);
    expect(() => run.finish()).not.toThrow();
    const failed = await run.source("toronto-street-washrooms", ["washroom"], async () => { throw new Error("download refused"); });
    expect(failed).toBeUndefined();
    expect(run.failures).toEqual([{ source_id: "toronto-street-washrooms", error: "download refused", kept: ["washrooms/toronto-street-washrooms"] }]);
    expect(() => run.finish()).toThrow(/importFixture: 1 of 2 sources failed.*toronto-street-washrooms \(download refused\)/);
  });

  it("every multi-source importer gives each source its own writer", () => {
    const scripts = path.join(repo, "scripts");
    const singleSource = new Set(["import-osm.ts"]);
    const plan = readFileSync(path.join(scripts, "import-all.ts"), "utf8");
    const importers = readdirSync(scripts).filter((name) => /^import-.*\.ts$/.test(name) && !["import-all.ts", "import-failsafe.ts"].includes(name));
    expect(importers.length).toBeGreaterThanOrEqual(10);
    for (const name of importers) {
      const source = readFileSync(path.join(scripts, name), "utf8");
      if (singleSource.has(name)) {
        expect(source.match(/resetSourceDirs\(/g), name).toHaveLength(1);
        continue;
      }
      expect(source, name).not.toMatch(/new PartitionWriter\(/);
      expect(source.includes("run.source(") || source.includes("runLayerJobs("), name).toBe(true);
      if (source.includes("resetSourceDirs(")) expect(source, name).toMatch(/run\.source\(/);
      const exported = /export async function (import\w+)/.exec(source)?.[1];
      if (exported && plan.includes(`await ${exported}(repoRoot)`)) expect(source, name).toMatch(/run\.finish\(\)|runLayerJobs\(/);
    }
    // The fixture sources used above are registered tier 0 or tier 1 sources.
    const registry = readRegistry(repo);
    for (const id of ["toronto-park-washrooms", "toronto-street-washrooms", "toronto-crem-washrooms", "ottawa-public-washrooms", "ottawa-park-parking", "gtfs-grt-bus", "gtfs-hsr", "kitchener-public-washrooms", "guelph-restrooms", "windsor-park-washrooms", "statcan-odhf", "statcan-odef", "statcan-odcaf", "ontario-provincial-parks", "ontario-otn-access-points", "ontario-railway-stations"]) {
      expect(registry.sources.some((entry) => entry.id === id), id).toBe(true);
    }
  });
});

/** A one-entry zip archive with the entry stored uncompressed. */
function storedZip(name: string, data: Buffer): Buffer {
  const nameBytes = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBytes.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBytes, data, central, nameBytes, end]);
}
