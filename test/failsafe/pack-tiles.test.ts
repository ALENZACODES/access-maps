import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";
import schema from "../../src/pack/manifest.schema.json";
import { buildWebPack } from "../../src/pack/build.js";
import { verifyWebPack } from "../../src/pack/verify.js";
import { collectFile } from "../../scripts/build-pmtiles.js";
import { cleanup, ctx, quarantineLines, tempRoot, washroom } from "./helpers.js";

afterEach(cleanup);

const commit = "2c01751faf39854bb849dae00b804cf881e72287";
const OTHER = "n43.0_w079.5";

function packFixture(badPart: Buffer | null, extra?: (data: string) => void) {
  const env = tempRoot();
  mkdirSync(path.join(env.root, "sources"), { recursive: true });
  cpSync(path.join(process.cwd(), "sources", "registry.json"), path.join(env.root, "sources", "registry.json"));
  const dir = path.join(env.data, "washrooms", ctx.source_id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "n43.5_w079.5.ndjson.gz"), gzipSync([washroom("good1"), washroom("good2")].map((r) => JSON.stringify(r)).join("\n") + "\n"));
  if (badPart) writeFileSync(path.join(dir, `${OTHER}.ndjson.gz`), badPart);
  extra?.(env.data);
  return env;
}

async function build(env: ReturnType<typeof packFixture>) {
  const out = path.join(env.root, "pack", "v1");
  const manifest = await buildWebPack({ data: env.data, out, repoRoot: env.root, builtAt: "2026-11-16T00:00:00.000Z", sourceCommit: commit });
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const valid = ajv.compile(schema);
  expect(valid(manifest), JSON.stringify(valid.errors)).toBe(true);
  await verifyWebPack({ data: env.data, out });
  return manifest;
}

const otherRecord = () => washroom("other1", 43.2, -79.2, OTHER);

describe("one bad part never breaks the pack", () => {
  const faults: Array<[string, Buffer, RegExp]> = [
    ["malformed JSON line", gzipSync(`${JSON.stringify(otherRecord())}\n{not json\n`), /not JSON/],
    ["truncated gzip", gzipSync(`${JSON.stringify(otherRecord())}\n`).subarray(0, 20), /gzip/],
    ["empty file", Buffer.alloc(0), /empty/],
    ["unknown tranche in a record", gzipSync(`${JSON.stringify({ ...otherRecord(), tranche: "shop" })}\n`), /unknown_tranche/],
    ["record in the wrong cell", gzipSync(`${JSON.stringify(washroom("misfiled"))}\n`), /bad_region/],
    ["out-of-range coordinate", gzipSync(`${JSON.stringify(washroom("far", 4320, -79.2, OTHER))}\n`), /coordinate_range/],
    ["missing licence", gzipSync(`${JSON.stringify({ ...otherRecord(), fields: { ...otherRecord().fields, name: { ...otherRecord().fields.name, licence: "" } } })}\n`), /licence/],
  ];
  for (const [label, bytes, reason] of faults) {
    it(`${label}: that part is withheld with a reason, the good part is packed`, async () => {
      const env = packFixture(bytes);
      const manifest = await build(env);
      expect(manifest.counts.records).toBe(2);
      expect(manifest.withheld).toHaveLength(1);
      expect(manifest.withheld?.[0]).toMatchObject({ path: `washrooms/${ctx.source_id}/${OTHER}.ndjson.gz`, sourceId: ctx.source_id, cell: OTHER });
      expect(manifest.withheld?.[0]?.reason).toMatch(reason);
      expect(manifest.tranches.washroom?.cells[OTHER]).toBeUndefined();
      expect(manifest.search[OTHER]).toBeUndefined();
      expect(env.log.report.outcomes.some((outcome) => outcome.status === "withheld")).toBe(true);
    });
  }

  it("alert snapshots next to the partitions do not stop the build", async () => {
    const env = packFixture(null, (data) => {
      mkdirSync(path.join(data, "alerts", "fixture-alerts"), { recursive: true });
      writeFileSync(path.join(data, "alerts", "fixture-alerts", "alerts.ndjson.gz"), gzipSync("{}\n"));
    });
    const manifest = await build(env);
    expect(manifest.counts.records).toBe(2);
    expect(manifest.withheld).toEqual([]);
  });

  it("an overlay tile over the size limit is left out, the records are still packed", async () => {
    const env = packFixture(null, (data) => {
      mkdirSync(path.join(data, "tiles", "open"), { recursive: true });
      writeFileSync(path.join(data, "tiles", "open", "places.pmtiles"), Buffer.alloc(25 * 1024 * 1024 + 1));
    });
    const manifest = await build(env);
    expect(manifest.counts.records).toBe(2);
    expect(manifest.tiles).toEqual({});
    expect(manifest.withheld?.[0]).toMatchObject({ path: "tiles/open/places.pmtiles", sourceId: null, cell: null });
    expect(manifest.withheld?.[0]?.reason).toMatch(/over the 26214400 byte limit/);
  });

  it("a source missing from the registry is withheld, not shipped and not fatal", async () => {
    const env = packFixture(null, (data) => {
      mkdirSync(path.join(data, "washrooms", "unregistered-fixture"), { recursive: true });
      writeFileSync(path.join(data, "washrooms", "unregistered-fixture", "n43.5_w079.5.ndjson.gz"), gzipSync("{}\n"));
    });
    const manifest = await build(env);
    expect(manifest.withheld?.[0]).toMatchObject({ sourceId: "unregistered-fixture" });
    expect(manifest.withheld?.[0]?.reason).toMatch(/no licence/);
    expect(manifest.counts.bySource).toEqual({ [ctx.source_id]: 2 });
  });
});

describe("one bad file or record never breaks the tiles", () => {
  it("a truncated file adds nothing and is reported", async () => {
    const env = tempRoot();
    const file = path.join(env.data, "washrooms", ctx.source_id, `${OTHER}.ndjson.gz`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, gzipSync(`${JSON.stringify(otherRecord())}\n`).subarray(0, 20));
    expect(await collectFile(file, "washroom", true)).toEqual([]);
    expect(env.log.report.outcomes[0]).toMatchObject({ step: "tiles", status: "withheld" });
  });

  it("a malformed line drops that file and is reported", async () => {
    const env = tempRoot();
    const file = path.join(env.data, "washrooms", ctx.source_id, `${OTHER}.ndjson.gz`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, gzipSync(`${JSON.stringify(otherRecord())}\n{oops\n`));
    expect(await collectFile(file, "washroom", true)).toEqual([]);
    expect(env.log.report.outcomes[0]?.reason).toMatch(/line 2 is not JSON/);
  });

  it("an invalid record is skipped and quarantined, the rest of the file is drawn", async () => {
    const env = tempRoot();
    const file = path.join(env.data, "washrooms", ctx.source_id, `${OTHER}.ndjson.gz`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, gzipSync([otherRecord(), washroom("far", 4320, -79.2, OTHER), washroom("other2", 43.3, -79.3, OTHER)].map((r) => JSON.stringify(r)).join("\n") + "\n"));
    const features = await collectFile(file, "washroom", true);
    expect(features.map((feature) => feature.props.id)).toEqual(["other1", "other2"]);
    expect(quarantineLines(env.log).map((line) => [line.stage, line.id, line.code])).toEqual([["tiles", "far", "coordinate_range"]]);
  });
});
