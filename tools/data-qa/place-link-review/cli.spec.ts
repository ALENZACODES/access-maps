import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync, gzipSync } from "node:zlib";
import { run } from "./cli.ts";
import { DECISION_SCHEMA } from "./decisions.ts";
import { writeReviewFixture, type FixturePaths } from "./fixture.ts";
import type { CasePage, ReviewPage } from "./view.ts";

async function scenario(context: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "place-link-operator-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const paths = await writeReviewFixture(dir);
  return {
    ...paths, dir,
    json: ["--candidate", paths.afterRoot, "--previous", paths.beforeRoot, "--format", "json"],
    async decision(name: string, row: CasePage, disposition: "reviewed" | "follow-up", fingerprint = row.fingerprint) {
      const path = join(dir, name);
      await writeFile(path, JSON.stringify({ schema: DECISION_SCHEMA,
        entries: [{ id: row.id, fingerprint, decision: disposition }] }));
      return path;
    },
  };
}

async function invoke(...args: string[]) {
  let output = "";
  let errors = "";
  const code = await run(args, value => { output += value; }, value => { errors += value; });
  return { code, output, errors };
}

async function pageFor(args: string[], ...extra: string[]): Promise<ReviewPage> {
  const result = await invoke(...args, ...extra);
  assert.equal(result.code, 0, result.errors);
  assert.equal(result.errors, "");
  const page: ReviewPage = JSON.parse(result.output);
  assert.equal(page.schema, "place-link-page/v1");
  return page;
}

function findKind(page: ReviewPage, kind: string) {
  const selected = page.cases.find(row => row.kind === kind);
  assert.ok(selected, kind);
  return selected;
}

async function updateRegistry(path: string, source: string, patch: Record<string, unknown>) {
  const raw = JSON.parse(await readFile(path, "utf8")) as { sources: Array<Record<string, unknown>> };
  const row = raw.sources.find(entry => entry.id === source);
  assert.ok(row);
  Object.assign(row, patch);
  await writeFile(path, JSON.stringify(raw));
}

function partition(paths: FixturePaths, sourceId: string, cell: string) {
  return join(paths.afterData, "venues", sourceId, cell + ".ndjson.gz");
}

test("the native Node entrypoint reads a single candidate inventory with no external runtime imports", async t => {
  const release = await scenario(t);
  const bin = fileURLToPath(new URL("./cli.ts", import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--experimental-strip-types", bin, "--candidate", release.afterRoot, "--format", "json",
  ]);
  const page: ReviewPage = JSON.parse(stdout);
  assert.equal(page.mode, "inventory");
  assert.equal(page.previous, null);
  assert.equal(page.totalCases, 0);
  assert.ok(page.candidate.groups > 0 && page.candidate.possiblePairs > 0);
  assert.equal(page.candidate.inputs, null);
});

test("locale selection applies to help and to malformed operator options", async () => {
  for (const lang of ["en", "fr"]) {
    const result = await invoke("--lang", lang, "--help");
    assert.equal(result.code, 0);
    assert.match(result.output, /--candidate/u);
    assert.match(result.output, /--decisions/u);
    assert.equal(result.errors, "");
  }
  const english = await invoke("--candidate");
  const french = await invoke("--lang", "fr", "--candidate");
  assert.equal(english.code, 2);
  assert.equal(french.code, 2);
  assert.notEqual(english.errors.trim(), french.errors.trim());
  assert.equal(english.output + french.output, "");
});

test("silent input omissions, duplicate single-value options and unrecognised formats are rejected", async t => {
  const release = await scenario(t);
  const required = ["--candidate", release.afterRoot];
  for (const args of [[], ["--format", "json"], [...required, "--candidate", release.afterRoot],
    [...required, "--lang", "xx"], [...required, "--format", "binary"],
    [...required, "--family", "record"], [...required, "--priority", "urgent"],
    [...required, "--state", "accepted"], [...required, "--decisions"], [...required, "surprise"]]) {
    const result = await invoke(...args);
    assert.equal(result.code, 2, args.join(" "));
    assert.equal(result.output, "");
    assert.ok(result.errors.trim());
  }
});

test("the CLI intersects filters and pages member evidence without changing case fingerprints", async t => {
  const release = await scenario(t);
  const all = await pageFor(release.json);
  const row = findKind(all, "split");
  const scoped = await pageFor(release.json, "--source", "fixture-alpha", "--family", "group",
    "--priority", "identity", "--cell", "n45.0_w080.0", "--state", "open", "--page", "1", "--per-page", "1");
  assert.equal(scoped.page, 1);
  assert.equal(scoped.perPage, 1);
  assert.equal(scoped.cases.length, 1);
  assert.ok(scoped.matchedCases >= 2);
  assert.equal(scoped.totalCases, all.totalCases);
  const detail = await pageFor(release.json, "--case", row.id, "--member-limit", "1", "--member-offset", "2");
  assert.equal(detail.cases.length, 1);
  assert.equal(detail.cases[0]?.fingerprint, row.fingerprint);
  assert.equal(detail.cases[0]?.memberCount, row.memberCount);
  assert.deepEqual(detail.cases[0]?.members, [row.members[2]]);
});

test("out-of-range case and page selections return input errors without producing a misleading empty report", async t => {
  const release = await scenario(t);
  for (const flags of [
    ["--case", "0".repeat(64)], ["--page", "99999"], ["--per-page", "201"],
    ["--member-offset", "2"], ["--member-limit", "251"], ["--inspect-members"],
  ]) {
    const result = await invoke(...release.json, ...flags);
    assert.equal(result.code, 2, flags.join(" "));
    assert.equal(result.output, "");
  }
});

test("multiple local handoffs surface stale, current and conflicting reviews without applying older votes", async t => {
  const release = await scenario(t);
  const selected = findKind(await pageFor(release.json), "split");
  const stale = await release.decision("stale.json", selected, "reviewed", "0".repeat(64));
  const current = await release.decision("current.json", selected, "follow-up");
  const other = await release.decision("other.json", selected, "reviewed");
  const pick = ["--case", selected.id];
  const oldPage = await pageFor(release.json, ...pick, "--decisions", stale);
  assert.equal(oldPage.cases[0]?.state, "stale");
  const retained = await pageFor(release.json, ...pick, "--decisions", current, "--decisions", stale);
  assert.equal(retained.cases[0]?.state, "follow-up");
  const conflict = await pageFor(release.json, ...pick, "--decisions", current, "--decisions", other, "--state", "conflict");
  assert.equal(conflict.cases[0]?.state, "conflict");
  assert.equal(conflict.orphanDecisions, 0);
  assert.equal(conflict.counts.conflict, 1);
});

test("disclosure-only changes restrict linked record IDs in structured, text and HTML reports", async t => {
  const release = await scenario(t);
  const old = findKind(await pageFor(release.json), "split");
  const named = old.members.find(row => row.id.includes("fixture-alpha:split"));
  assert.ok(named);
  await updateRegistry(release.afterRegistry, "fixture-alpha", { tier_note: "held for legal review" });
  const status = await pageFor(release.json, "--case", old.id);
  assert.equal(status.cases[0]?.state, "restricted");
  assert.deepEqual(status.cases[0]?.cells, []);
  assert.deepEqual(status.cases[0]?.members, []);
  assert.equal(status.cases[0]?.memberCount, 0);
  assert.ok(!JSON.stringify(status).includes(named.id));
  for (const format of ["text", "html"]) {
    const report = await invoke("--previous", release.beforeRoot, "--candidate", release.afterRoot,
      "--case", old.id, "--format", format, "--lang", "fr");
    assert.equal(report.code, 0, report.errors);
    assert.ok(!report.output.includes(named.id));
    assert.ok(report.output.includes("fixture-alpha"));
  }
});

test("HTML escapes submitted registry text in a complete French offline document", async t => {
  const release = await scenario(t);
  const value = '<img src="external-test" onerror="bad()">';
  await updateRegistry(release.afterRegistry, "fixture-alpha", { name: value });
  const result = await invoke("--candidate", release.afterRoot, "--format", "html", "--lang", "fr");
  assert.equal(result.code, 0);
  assert.match(result.output, /<html lang="fr">/u);
  assert.match(result.output, /Content-Security-Policy/u);
  assert.match(result.output, /&lt;img src=&quot;external-test&quot;/u);
  assert.ok(!result.output.includes(value));
  assert.doesNotMatch(result.output, /<script\s+src=|<link\s+[^>]*href="https?:/iu);
});

test("requested input checks report both clean inputs and changed compressed bytes", async t => {
  const release = await scenario(t);
  const initial = await pageFor(release.json, "--check-inputs");
  assert.equal(initial.previous?.inputs?.status, "matches");
  assert.equal(initial.candidate.inputs?.status, "matches");
  const declaredDigest = initial.candidate.inputDigest;
  const sample = findKind(initial, "split").members.find(x => x.candidate);
  assert.ok(sample?.candidate);
  await appendFile(partition(release, sample.candidate.sourceId, sample.candidate.cell), Buffer.from([0]));
  const changed = await invoke(...release.json, "--check-inputs");
  assert.equal(changed.code, 1);
  const page: ReviewPage = JSON.parse(changed.output);
  assert.equal(page.candidate.inputs?.status, "differs");
  assert.equal(page.candidate.inputs?.declaredDigest, declaredDigest);
  assert.notEqual(page.candidate.inputs?.observedDigest, declaredDigest);
  assert.equal(page.previous?.inputs?.status, "matches");
});

test("a requested member inspection reports provenance mismatch at the record partition", async t => {
  const release = await scenario(t);
  const selected = findKind(await pageFor(release.json), "split");
  const inspected = await pageFor(release.json, "--case", selected.id, "--inspect-members");
  assert.equal(inspected.inspection?.caseId, selected.id);
  assert.equal(inspected.inspection?.previous.length, selected.members.length);
  assert.ok(inspected.inspection?.candidate.every(row => row.status === "matched" && row.accessibility === "UNKNOWN"));
  const sample = selected.members[0]!;
  assert.ok(sample.candidate);
  const path = partition(release, sample.candidate.sourceId, sample.candidate.cell);
  const raw = gunzipSync(await readFile(path)).toString("utf8").trimEnd().split("\n");
  let changed = false;
  const next = raw.map(line => {
    const record = JSON.parse(line);
    if (record.id === sample.id) {
      changed = true;
      record.fields.name.tier = 3;
    }
    return JSON.stringify(record);
  });
  assert.equal(changed, true);
  await writeFile(path, gzipSync(next.join("\n") + "\n"));
  const result = await invoke(...release.json, "--case", selected.id, "--inspect-members");
  assert.equal(result.code, 1);
  const report: ReviewPage = JSON.parse(result.output);
  assert.ok(report.inspection?.candidate.some(row => row.status === "mismatch" && row.reason === "field-provenance"));
  assert.ok(report.inspection?.previous.every(row => row.status === "matched"));
});

test("malformed decisions, truncation and soft links to input files fail before report publication", async t => {
  const release = await scenario(t);
  const bad = join(release.dir, "bad.json");
  const out = join(release.dir, "report.json");
  const shortcut = join(release.dir, "shortcut.json");
  await writeFile(bad, JSON.stringify({ schema: DECISION_SCHEMA, entries: [], "internal-test-marker": 1 }));
  await symlink(bad, shortcut);
  const invalid = await invoke(...release.json, "--decisions", bad, "--out", out);
  assert.equal(invalid.code, 2);
  assert.ok(!invalid.errors.includes("internal-test-marker"));
  await writeFile(bad, JSON.stringify({ schema: DECISION_SCHEMA, entries: [] }));
  const linked = await invoke(...release.json, "--decisions", shortcut, "--out", out);
  assert.equal(linked.code, 2);
  await writeFile(release.afterRegistry, "{");
  const broken = await invoke(...release.json, "--out", out);
  assert.equal(broken.code, 2);
  assert.equal(broken.output, "");
  assert.ok(!(await readdir(release.dir)).includes("report.json"));
});

test("concurrent outputs publish one complete document and preserve pre-existing report paths", async t => {
  const release = await scenario(t);
  const exportDir = join(release.dir, "exports");
  await mkdir(exportDir);
  const path = join(exportDir, "review.json");
  const args = [...release.json, "--out", path];
  const results = await Promise.all([invoke(...args), invoke(...args)]);
  assert.deepEqual(results.map(result => result.code).sort(), [0, 2]);
  assert.equal(results.map(result => result.output).join(""), "");
  assert.equal(JSON.parse(await readFile(path, "utf8")).schema, "place-link-page/v1");
  assert.deepEqual(await readdir(exportDir), ["review.json"]);
  const original = await readFile(release.beforeRegistry);
  assert.equal((await invoke(...release.json, "--out", release.beforeRegistry)).code, 2);
  assert.deepEqual(await readFile(release.beforeRegistry), original);
});

test("a requested pack audit distinguishes unavailable, undeclared and withheld link publications", async t => {
  const release = await scenario(t);
  const pack = join(release.dir, "staged-pack");
  const unchecked = await pageFor(release.json);
  assert.equal(unchecked.publication, null);
  const absent = await invoke(...release.json, "--pack", pack);
  assert.equal(absent.code, 1);
  const unavailable: ReviewPage = JSON.parse(absent.output);
  assert.equal(unavailable.publication?.audit.status, "issues");
  assert.ok(unavailable.publication?.audit.issues.includes("manifest-unavailable"));
  const inventory = {
    version: 1, sources: unchecked.candidate.sourceIds.map(sourceId => ({ sourceId, inWebPack: true })),
  };
  await mkdir(pack);
  const manifest = join(pack, "manifest.json");
  await writeFile(manifest, JSON.stringify(inventory));
  const result = await invoke(...release.json, "--pack", pack);
  assert.equal(result.code, 1);
  const undeclared: ReviewPage = JSON.parse(result.output);
  assert.equal(undeclared.publication?.audit.status, "undeclared");
  await writeFile(manifest, JSON.stringify({ ...inventory,
    withheld: [{ path: "links/index.json", cell: null, reason: "Synthetic fixture hold" }],
  }));
  const held = await invoke(...release.json, "--pack", pack);
  assert.equal(held.code, 1);
  const withheld: ReviewPage = JSON.parse(held.output);
  assert.equal(withheld.publication?.audit.status, "withheld");
  assert.deepEqual(withheld.publication?.sources, []);
  assert.deepEqual(withheld.cases, unchecked.cases);
  for (const [lang, words] of [["fr", "Publication suspendue"], ["en", "Publication withheld"]] as const) {
    for (const format of ["text", "html"]) {
      const report = await invoke("--candidate", release.afterRoot, "--previous", release.beforeRoot,
        "--pack", pack, "--lang", lang, "--format", format);
      assert.equal(report.code, 1);
      assert.ok(report.output.includes(words));
    }
  }
});

test("a hash-matched shard with malformed member identity returns a neutral diagnostic in either language", async t => {
  const release = await scenario(t);
  const indexPath = join(release.afterData, "links", "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as {
    files: Array<{ path: string; bytes: number; sha256: string }>;
  };
  const shard = index.files.find(file => file.path.startsWith("links/possible-duplicates/"));
  assert.ok(shard);
  const path = join(release.afterData, shard.path);
  const lines = gunzipSync(await readFile(path)).toString("utf8").trimEnd().split("\n");
  const broken = JSON.parse(lines[0]!);
  const marker = "redacted-fixture-identifier";
  broken.a.id = marker + "\u202e";
  lines[0] = JSON.stringify(broken);
  const bytes = gzipSync(lines.join("\n") + "\n");
  // The correct fingerprint forces the review to encounter the rejected field itself.
  shard.bytes = bytes.length;
  shard.sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(path, bytes);
  await writeFile(indexPath, JSON.stringify(index));
  for (const lang of ["en", "fr"]) {
    const result = await invoke(...release.json, "--lang", lang);
    assert.equal(result.code, 2);
    assert.equal(result.output, "");
    assert.ok(result.errors.trim());
    assert.ok(!result.errors.includes(marker));
    assert.ok(!result.errors.includes(path));
  }
});
