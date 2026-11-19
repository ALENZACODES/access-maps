import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeParityCli, parseParityCliArguments, ParityCliError, PARITY_USAGE } from "./offline-parity-cli.js";
import { parityBundle, parityPlan, paritySource, renamePlan, renameRelease, setSource } from "./offline-parity-fixtures.js";
import type { OfflineBundle } from "./offline-bundle.js";
import type { ParityPlan } from "./offline-parity.js";

async function temporary<T>(work: (path: string) => Promise<T>): Promise<T> {
  const path = await mkdtemp(join(tmpdir(), "attribution-parity-"));
  try { return await work(path); }
  finally { await rm(path, { recursive: true, force: true }); }
}
async function files(root: string, bundle: OfflineBundle = parityBundle(), plan: ParityPlan = parityPlan()): Promise<[string, string]> {
  const bundlePath = join(root, "bundle.json");
  const planPath = join(root, "pairs.json");
  await writeFile(bundlePath, JSON.stringify(bundle), "utf8");
  await writeFile(planPath, JSON.stringify(plan), "utf8");
  return [bundlePath, planPath];
}
/** Repository source is .ts; a compiled test uses .js. Never reference nonexistent .js in source runs. */
function processCli(args: readonly string[]) {
  const compiled = import.meta.url.endsWith(".js");
  const filename = fileURLToPath(new URL(compiled ? "./offline-parity-cli.js" : "./offline-parity-cli.ts", import.meta.url));
  const argv = compiled ? [filename, ...args] : ["--import", "tsx", filename, ...args];
  return spawnSync(process.execPath, argv, { encoding: "utf8", timeout: 10000 });
}

test("CLI has explicit two-file syntax and safe defaults", () => {
  const result = parseParityCliArguments(["release.json", "pairs.json"]);
  assert.deepEqual(result, {
    bundleFile: "release.json", parityFile: "pairs.json", beforeBundleFile: null,
    beforeParityFile: null, locale: "en", format: "text",
  });
});

test("CLI accepts ordered and interleaved options", () => {
  const a = parseParityCliArguments(["--lang", "fr", "release.json", "--format", "html", "pairs.json"]);
  const b = parseParityCliArguments(["release.json", "pairs.json", "--format", "html", "--lang", "fr"]);
  assert.deepEqual(a, b);
  assert.equal(a.locale, "fr");
  assert.equal(a.format, "html");
});

test("CLI accepts baseline bundle and plan only as a pair", () => {
  const result = parseParityCliArguments(["next.json", "next-pairs.json", "--before-bundle", "before.json", "--before-pairs", "before-pairs.json"]);
  assert.equal(result.beforeBundleFile, "before.json");
  assert.equal(result.beforeParityFile, "before-pairs.json");
});

test("CLI rejects incomplete baseline options", () => {
  for (const option of ["--before-bundle", "--before-pairs"]) {
    assert.throws(() => parseParityCliArguments(["next.json", "pairs.json", option, "old.json"]), ParityCliError);
  }
});

test("CLI rejects unexpected positional arguments", () => {
  for (const args of [[], ["bundle.json"], ["bundle.json", "pairs.json", "third.json"]]) {
    assert.throws(() => parseParityCliArguments(args), ParityCliError);
  }
});

test("CLI rejects repeated options", () => {
  for (const option of ["--lang", "--format", "--before-bundle", "--before-pairs"]) {
    const first = option === "--lang" ? "en" : option === "--format" ? "text" : "one.json";
    assert.throws(() => parseParityCliArguments(["bundle.json", "pairs.json", option, first, option, first]), /Repeated option/);
  }
});

test("CLI rejects unsupported languages", () => {
  for (const language of ["FR", "fr-CA", "en-CA", "es", "UNKNOWN", "", "fr "]) {
    assert.throws(() => parseParityCliArguments(["bundle.json", "pairs.json", "--lang", language]), ParityCliError);
  }
});

test("CLI rejects unsupported output formats", () => {
  for (const format of ["PDF", "csv", "markdown", "xml", "yaml", "", "HTML"]) {
    assert.throws(() => parseParityCliArguments(["bundle.json", "pairs.json", "--format", format]), ParityCliError);
  }
});

test("CLI rejects unknown flags and short flags", () => {
  for (const flag of ["-v", "--root", "--network", "--write", "--live", "--debug"]) {
    assert.throws(() => parseParityCliArguments(["bundle.json", "pairs.json", flag]), ParityCliError);
  }
});

test("CLI error for --help contains actionable syntax", async () => {
  const result = await executeParityCli(["--help"]);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes("Usage:"));
  assert.ok(result.stderr.includes("<bundle.json>"));
  assert.ok(PARITY_USAGE.includes("--before-pairs"));
  assert.equal(result.stdout, "");
  assert.equal(result.report, null);
});

test("valid bilingual JSON inputs return exit zero", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root);
    const result = await executeParityCli([bundle, plan]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes("release-one"));
    assert.equal(result.stderr, "");
    assert.equal(result.report?.blocked, false);
  });
});

test("French CLI output uses nonbreaking spaces", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root);
    const result = await executeParityCli([bundle, plan, "--lang", "fr"]);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes("Version\u00a0: release-one"));
    assert.ok(result.stdout.includes("Données en date du\u00a0: UNKNOWN"));
  });
});

test("HTML CLI output carries a restrictive CSP", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root);
    const result = await executeParityCli([bundle, plan, "--format", "html", "--lang", "fr"]);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('<html lang="fr">'));
    assert.ok(result.stdout.includes("default-src 'none'"));
    assert.equal(result.stdout.includes("<script"), false);
  });
});

test("JSON CLI output preserves UNKNOWN rather than inventing dates", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root);
    const result = await executeParityCli([bundle, plan, "--format", "json"]);
    assert.equal(result.status, 0);
    const value = JSON.parse(result.stdout) as {includedSources:Array<{datasetDate:string}>;report:{blocked:boolean}};
    assert.equal(value.includedSources[0]?.datasetDate, "UNKNOWN");
    assert.equal(value.report.blocked, false);
  });
});

test("a missing legal notice causes CLI exit one", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root, setSource(parityBundle(), paritySource({ attribution: "" })));
    const result = await executeParityCli([bundle, plan]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes("SOURCE_NOTICE_MISSING"));
    assert.equal(result.stderr, "");
  });
});

test("missing French route causes CLI exit one", async () => {
  await temporary(async (root) => {
    const bundle = { ...parityBundle(), routes: parityBundle().routes.filter((route) => route.locale === "en") };
    const [bundlePath, planPath] = await files(root, bundle);
    const result = await executeParityCli([bundlePath, planPath]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes("ROUTE_NOT_FOUND"));
  });
});

test("missing file returns exit two and no report", async () => {
  await temporary(async (root) => {
    const result = await executeParityCli([join(root, "absent.json"), join(root, "missing-pairs.json")]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.length > 0);
    assert.equal(result.report, null);
  });
});

test("invalid bundle JSON returns exit two", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root);
    await writeFile(bundle, "not json");
    const result = await executeParityCli([bundle, plan]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes("Invalid JSON"));
  });
});

test("invalid pair JSON returns exit two", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root);
    await writeFile(plan, "not json");
    const result = await executeParityCli([bundle, plan]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes("Invalid JSON"));
  });
});

test("mismatched release IDs return exit two, never a false success", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root, renameRelease(parityBundle(), "other-release"));
    const result = await executeParityCli([bundle, plan]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes("Release IDs differ"));
  });
});

test("input larger than the declared bound fails without allocating a report", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root);
    await writeFile(plan, "x".repeat(1_048_577));
    const result = await executeParityCli([bundle, plan]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.includes("limit"));
  });
});

test("baseline comparison with unchanged source evidence succeeds", async () => {
  await temporary(async (root) => {
    const [beforeBundle, beforePlan] = await files(root);
    const nextBundle = join(root, "next-bundle.json");
    const nextPlan = join(root, "next-pairs.json");
    await writeFile(nextBundle, JSON.stringify(renameRelease(parityBundle(), "release-next")));
    await writeFile(nextPlan, JSON.stringify(renamePlan(parityPlan(), "release-next")));
    const result = await executeParityCli([nextBundle, nextPlan, "--before-bundle", beforeBundle, "--before-pairs", beforePlan]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.comparison?.changes.length, 0);
  });
});

test("baseline comparison blocks a removed source credit", async () => {
  await temporary(async (root) => {
    const [beforeBundle, beforePlan] = await files(root);
    const nextBundle = join(root, "next-bundle.json");
    const nextPlan = join(root, "next-pairs.json");
    const bundle = renameRelease(setSource(parityBundle(), paritySource({ attribution: "" })), "release-next");
    await writeFile(nextBundle, JSON.stringify(bundle));
    await writeFile(nextPlan, JSON.stringify(renamePlan(parityPlan(), "release-next")));
    const result = await executeParityCli([nextBundle, nextPlan, "--before-bundle", beforeBundle, "--before-pairs", beforePlan]);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes("SOURCE_NOTICE_CHANGED"));
    assert.equal(result.comparison?.blocked, true);
  });
});

test("the CLI import is side-effect-free", async () => {
  const result = await executeParityCli([]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.includes("Usage:"));
});

test("compiled entry-point import produces no output and no exit failure", () => {
  const child = processCli(["--help"]);
  assert.equal(child.status, 2);
  assert.ok(child.stderr.includes("Usage:"));
});

test("CLI process succeeds with real local files", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root);
    const child = processCli([bundle, plan]);
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes("release-one"));
    assert.equal(child.stderr, "");
  });
});

test("CLI process blocks a missing licence notice", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root, setSource(parityBundle(), paritySource({ attribution: "" })));
    const child = processCli([bundle, plan]);
    assert.equal(child.status, 1, child.stderr);
    assert.ok(child.stdout.includes("SOURCE_NOTICE_MISSING"));
  });
});

test("CLI process returns two on absent files", () => {
  const child = processCli(["missing-bundle.json", "missing-pairs.json"]);
  assert.equal(child.status, 2);
  assert.ok(child.stderr.length > 0);
});

test("the CLI does not write an output file", async () => {
  await temporary(async (root) => {
    const [bundle, plan] = await files(root);
    const before = await import("node:fs/promises").then((fs) => fs.readdir(root));
    const result = await executeParityCli([bundle, plan, "--format", "html"]);
    assert.equal(result.status, 0);
    const after = await import("node:fs/promises").then((fs) => fs.readdir(root));
    assert.deepEqual(after, before);
  });
});

test("README and code stay under the expected attribution scope", async () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const readme = await readFile(resolve(dir, "OFFLINE_PARITY_README.md"), "utf8");
  assert.ok(readme.includes("offline-parity-cli.ts"));
  assert.ok(readme.includes("offline-*.spec.ts"));
  assert.ok(readme.includes("--before-bundle"));
});
