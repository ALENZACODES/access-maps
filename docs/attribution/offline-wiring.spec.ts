import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAttributionPage, METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR } from "./index.js";
import { auditOfflineBundle, parseOfflineBundle } from "./offline-bundle.js";
import { executeOfflineCli } from "./offline-cli.js";
import { makeOfflineReport } from "./offline-report.js";
import { fixtureBundle } from "./offline-fixtures.js";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory,"../..");

test("offline gate is named in the root test command", async () => {
  const manifest = JSON.parse(await readFile(resolve(root,"package.json"),"utf8")) as {
    scripts: Record<string,string>;
  };
  assert.match(manifest.scripts.test ?? "",/tsx --test docs\/attribution\/offline-\*\.spec\.ts/u);
  assert.equal(manifest.scripts["test:offline-attribution"],"tsx --test docs/attribution/offline-*.spec.ts");
});

test("offline CLI has an explicit repository script", async () => {
  const manifest = JSON.parse(await readFile(resolve(root,"package.json"),"utf8")) as {
    scripts: Record<string,string>;
  };
  assert.equal(manifest.scripts["audit:offline-attribution"],"tsx docs/attribution/offline-cli.ts");
});

test("existing map attribution catalogue remains the single source", () => {
  const en = buildAttributionPage("en",["osm","metrolinx","ltc"]);
  const fr = buildAttributionPage("fr",["osm","metrolinx","ltc"]);
  assert.deepEqual(en.entries.map((entry) => entry.id),["osm","metrolinx","ltc"]);
  assert.deepEqual(fr.entries.map((entry) => entry.id),["osm","metrolinx","ltc"]);
  assert.ok(en.entries[1]?.notices.includes(METROLINX_AUA_END_USER_LAWS_EN));
  assert.ok(fr.entries[1]?.notices.includes(METROLINX_AUA_END_USER_LAWS_FR));
  assert.equal(en.entries[0]?.datasetAsOf,"UNKNOWN");
  assert.equal(fr.entries[2]?.datasetAsOf,"UNKNOWN");
});

test("the gate invokes the existing release evidence audit", () => {
  const bundle = parseOfflineBundle(fixtureBundle());
  const audited = auditOfflineBundle(bundle);
  assert.equal(audited.evidence.releaseId,bundle.release.releaseId);
  assert.equal(audited.evidence.sourceCount,bundle.release.sources.length);
});

test("report generation accepts exactly the audited bundle", () => {
  const bundle = parseOfflineBundle(fixtureBundle());
  const report = makeOfflineReport(bundle,auditOfflineBundle(bundle),"fr");
  assert.ok(report.text.includes("release-one"));
  assert.ok(report.text.includes("© OpenStreetMap contributors"));
  assert.equal(report.locale,"fr");
});

test("the CLI is importable without reading or mutating a file", async () => {
  const result = await executeOfflineCli([]);
  assert.equal(result.status,2);
  assert.ok(result.error.includes("Usage"));
});

test("the README names the actual executable module", async () => {
  const readme = await readFile(resolve(directory,"OFFLINE_BUNDLE_README.md"),"utf8");
  assert.ok(readme.includes("docs/attribution/offline-cli.ts"));
  assert.ok(readme.includes("--root"));
  assert.ok(readme.includes("npm run test:offline-attribution"));
});
