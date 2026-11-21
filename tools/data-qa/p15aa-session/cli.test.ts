import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "./cli.js";
import { parseInput, readJson, readShard } from "./io.js";
import type { LocatedEvidence } from "./evidence.js";
import type { ReviewerDesk, SessionAudit, SessionFile } from "./session.js";
import { exampleInputs } from "./test-data.js";

const commandPath = fileURLToPath(new URL("./cli.ts", import.meta.url));
const repo = fileURLToPath(new URL("../../../", import.meta.url));

function runProcess(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", commandPath, ...args], {
      cwd: repo,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", status => resolve({ status, stdout, stderr }));
  });
}

describe("offline session CLI", { timeout: 15_000 }, () => {
  let dir: string;
  let evidenceFiles: string[];

  function write(name: string, value: unknown): string {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(value));
    return path;
  }

  function call(command: string, ...options: string[]) {
    return runCli([command, ...evidenceFiles, ...options]);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "maps-governance-"));
    const { registry, selections } = exampleInputs();
    evidenceFiles = ["--registry", write("registry.json", registry), "--selections", write("selections.json", selections)];
  });

  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("takes a reviewed case from selection through sealed assignment, coordinator merge and ruling", async () => {
    const prepare = await runProcess(["prepare", ...evidenceFiles]);
    expect(prepare.status).toBe(0);
    const draft = JSON.parse(prepare.stdout) as SessionFile;
    expect(draft.cases).toHaveLength(1);
    expect(draft.cases[0]?.conflictsChecked).toBe(false);
    draft.cases[0]!.conflictsChecked = true;
    draft.reviewers = [{ reviewerId: "r-001", capacity: 1 }, { reviewerId: "r-002", capacity: 1 }];
    draft.adjudicators = ["r-003"];
    const configured = write("configured.json", draft);
    expect(JSON.parse(call("plan", "--session", configured))).toMatchObject({ complete: true });
    const base = join(dir, "sealed.json");
    expect(call("seal", "--session", configured, "--out", base)).toBe("");

    function submitVote(reviewer: string, choice: "ready" | "hold", output: string) {
      const desk = JSON.parse(call("desk", "--session", base, "--reviewer", reviewer)) as ReviewerDesk;
      const record = desk.cases[0]!;
      expect(record.ownChoice).toBeNull();
      const response = write("response-" + reviewer + ".json", {
        sessionId: desk.sessionId, caseId: record.evidence.id, revision: record.revision, actor: reviewer,
        previous: record.previous, kind: "vote", choice,
      });
      call("submit", "--session", base, "--response", response, "--out", output);
    }
    const local = join(dir, "local.json");
    const returned = join(dir, "returned.json");
    submitVote("r-001", "ready", local);
    submitVote("r-002", "hold", returned);

    const blind = call("desk", "--session", local, "--reviewer", "r-002");
    expect(blind).not.toContain("r-001");
    expect(blind).not.toContain('"ready"');
    const deskHtml = join(dir, "desk-fr.html");
    expect(call("desk", "--session", local, "--reviewer", "r-002", "--lang", "fr", "--format", "html",
      "--out", deskHtml)).toBe("");
    const french = readFileSync(deskHtml, "utf8");
    expect(french).toContain('<html lang="fr">');
    expect(french).toContain("Révision indépendante");
    expect(french).toContain("© OpenStreetMap contributors");
    expect(french).not.toContain("r-001");

    const merged = join(dir, "merged.json");
    call("merge", "--base", base, "--session", local, "--returned", returned, "--out", merged);
    const audit = JSON.parse(call("audit", "--session", merged)) as SessionAudit;
    const row = audit.cases[0]!;
    expect(row.ballot).toMatchObject({ status: "disputed", counts: { ready: 1, hold: 1 } });
    const ruling = write("ruling.json", {
      sessionId: audit.sessionId, caseId: row.evidence.id, revision: row.revision, previous: row.historyHead,
      actor: "r-003", kind: "adjudicate", choice: "hold",
    });
    const closed = join(dir, "closed.json");
    call("submit", "--session", merged, "--response", ruling, "--out", closed);
    const final = JSON.parse(call("audit", "--session", closed)) as SessionAudit;
    expect(final.cases[0]).toMatchObject({
      evidence: { state: "unknown", value: "UNKNOWN" }, outcome: "hold", ballot: { adjudicated: true },
    });
    expect(call("audit", "--session", closed, "--format", "html")).toContain("r-003 — Ruling");
    expect(call("desk", "--session", closed, "--reviewer", "r-001", "--format", "html"))
      .toContain("Closed by adjudication");
    const retry = JSON.parse(call("submit", "--session", closed, "--response", ruling));
    expect(retry).toEqual(readJson(closed));
  });

  it("allows exactly one process to export a new file and never exposes partial JSON", async () => {
    const output = join(dir, "report.json");
    const args = ["intake", ...evidenceFiles, "--out", output];
    const results = await Promise.all([runProcess(args), runProcess(args)]);
    expect(results.map(child => child.status).sort()).toEqual([0, 1]);
    expect(results.every(child => child.stdout === "")).toBe(true);
    expect(results.find(child => child.status === 1)?.stderr).toMatch(/P15 output-exists\n$/u);
    expect(readJson(output)).toEqual(JSON.parse(call("intake")));
    expect(readdirSync(dir).sort()).toEqual(["registry.json", "report.json", "selections.json"]);
  });

  it("preserves inputs if an output aliases the coordinator's evidence file", () => {
    const input = evidenceFiles[1]!;
    const before = readFileSync(input);
    expect(() => call("prepare", "--out", input)).toThrowError(expect.objectContaining({ code: "EEXIST" }));
    expect(readFileSync(input)).toEqual(before);
    expect(readdirSync(dir).sort()).toEqual(["registry.json", "selections.json"]);
  });

  it("returns a stable failure and keeps file paths, raw input and stack traces out of process output", async () => {
    const privateLabel = "private-working-copy";
    const malformed = join(dir, privateLabel + ".json");
    const destination = join(dir, "unwritten.json");
    writeFileSync(malformed, '{"field":"' + privateLabel + '","field":1}');
    const result = await runProcess(["intake", "--registry", evidenceFiles[1]!, "--selections", malformed,
      "--out", destination]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim().split("\n").at(-1)).toBe("P15 duplicate-json-key");
    expect(result.stderr).not.toContain(privateLabel);
    expect(result.stderr).not.toContain(dir);
    expect(result.stderr).not.toMatch(/\n\s+at\s+/u);
    expect(existsSync(destination)).toBe(false);
  });

  it("uses equivalent raw and compressed NDJSON input without relying on filename extensions", () => {
    const { selections } = exampleInputs();
    const line = JSON.stringify(selections[0]!.record) + "\r\n";
    const expected = call("intake");
    for (const [name, bytes] of [["plain.dat", Buffer.from(line)], ["gzip.dat", gzipSync(line)]] as const) {
      const path = join(dir, name);
      writeFileSync(path, bytes);
      expect(runCli(["intake", "--registry", evidenceFiles[1]!, "--shard", path, "--field", "wheelchair"]))
        .toBe(expected);
    }
  });

  it("locates cases in source-row order without forwarding raw record IDs", () => {
    const row = exampleInputs().selections[0]!.record;
    const other = { ...row, id: "osm:node/900000000000002" };
    const path = join(dir, "lookup.ndjson");
    const args = ["--registry", evidenceFiles[1]!, "--shard", path, "--field", "wheelchair"];
    const index = () => JSON.parse(runCli(["locate", ...args])) as LocatedEvidence[];
    writeFileSync(path, [row, other].map(entry => JSON.stringify(entry)).join("\n"));
    const original = index();
    writeFileSync(path, [other, row].map(entry => JSON.stringify(entry)).join("\n"));
    const reversed = index();
    expect(reversed.map(entry => entry.selectionNumber)).toEqual([1, 2]);
    expect(reversed.map(entry => entry.evidence)).toEqual(original.map(entry => entry.evidence).reverse());
    expect(JSON.stringify(reversed)).not.toContain("osm:node/");
    expect(new Set(reversed.map(entry => entry.evidence.id)).size).toBe(2);
  });

  it("requires the chosen field in every shard row", () => {
    const row = exampleInputs().selections[0]!.record;
    const path = join(dir, "rows");
    writeFileSync(path, [row, { ...row, fields: {} }].map(record => JSON.stringify(record)).join("\n"));
    expect(() => runCli(["intake", "--registry", evidenceFiles[1]!, "--shard", path, "--field", "wheelchair"]))
      .toThrow("evidence/field-missing");
  });

  it("rejects an empty selection even when the registry and JSON are valid", () => {
    const empty = write("empty.json", []);
    expect(() => runCli(["intake", "--registry", evidenceFiles[1]!, "--selections", empty])).toThrow("empty-review");
  });

  it.each([
    [[], "invalid-operation"],
    [["__proto__"], "invalid-operation"],
    [["help", "--help"], "invalid-operation"],
    [["plan", "--session"], "invalid-option"],
    [["prepare", "--lang", "fr"], "invalid-option"],
    [["intake", "--registry", "x", "--registry", "x"], "invalid-option"],
    [["prepare", "--registry", "x", "--field", "x", "--selections", "x"], "choose-one-evidence-input"],
    [["prepare", "--shard", "x", "--field", "x", "--selections", "x"], "choose-one-evidence-input"],
    [["prepare", "--shard", "x"], "choose-one-evidence-input"],
    [["prepare", "--selections", "x"], "missing-registry"],
    [["desk", "--selections", "x", "--lang", "eng"], "invalid-language"],
    [["audit", "--selections", "x", "--format", "csv"], "invalid-format"],
  ] as const)("rejects ambiguous or unsupported invocations", (args, error) => {
    expect(() => runCli(args)).toThrow(error);
  });

  it("checks per-operation input requirements and renders help without evidence files", () => {
    expect(() => call("seal")).toThrow("missing-session");
    expect(runCli(["-h"])).toBe(runCli(["--help"]));
    expect(runCli(["--help"])).toContain("--base FILE --returned FILE");
  });

  it("decodes UTF-8 strictly with and without gzip and leaves malformed input untouched", () => {
    const malformed = Buffer.from([0x22, 0xc3, 0x28, 0x22]);
    const ordinary = join(dir, "invalid.json");
    const compressed = join(dir, "rows.ndjson.gz");
    writeFileSync(ordinary, malformed);
    writeFileSync(compressed, gzipSync(malformed));
    expect(() => readJson(ordinary)).toThrow("invalid-utf8");
    expect(() => readShard(compressed, "wheelchair")).toThrow("invalid-utf8");
    expect(readFileSync(ordinary)).toEqual(malformed);
    expect(() => readJson(dir)).toThrow("input-file-limit");
  });

  it("checks row count at the boundary and keeps blank interior lines invalid", () => {
    const path = join(dir, "rows.ndjson");
    writeFileSync(path, "{}\n".repeat(4096));
    expect(readShard(path, "ramp")).toHaveLength(4096);
    writeFileSync(path, "{}\n".repeat(4097));
    expect(() => readShard(path, "ramp")).toThrow("shard-row-limit");
    writeFileSync(path, "{}\n\n{}\n");
    expect(() => readShard(path, "ramp")).toThrow("invalid-json");
    writeFileSync(path, "");
    expect(() => readShard(path, "ramp")).toThrow("shard-row-limit");
  });

  it("rejects corrupt and oversized compressed data before accepting a handoff", () => {
    const path = join(dir, "rows.ndjson.gz");
    writeFileSync(path, gzipSync("{}\n").subarray(0, -3));
    expect(() => readShard(path, "ramp")).toThrow("invalid-or-oversize-gzip");
    writeFileSync(path, gzipSync(Buffer.alloc(16 * 1024 * 1024 + 1, 0x20)));
    expect(() => readShard(path, "ramp")).toThrow("invalid-or-oversize-gzip");
  });
});

describe("strict JSON intake", () => {
  it("rejects duplicate keys even when nested or escaped", () => {
    for (const source of [
      '{"caseId":1,"caseId":2}', '[{"context":{"v":0,"\\u0076":1}}]', '{"__proto__":1,"__proto__":2}',
    ]) {
      expect(() => parseInput(source)).toThrow("duplicate-json-key");
    }
  });

  it("tracks names by object and ignores key-like syntax inside strings", () => {
    const maliciousLookingText = '{"same":1,"same":2}';
    const value = { rows: [{ same: true }, { same: false }], same: maliciousLookingText, q: "\\\"[]{}:" };
    expect(parseInput(JSON.stringify(value))).toEqual(value);
  });

  it("admits exactly 64 container levels and still delegates syntax validity to JSON.parse", () => {
    function nested(level: number) { return "[".repeat(level) + "false" + "]".repeat(level); }
    expect(Array.isArray(parseInput(nested(64)))).toBe(true);
    expect(() => parseInput(nested(65))).toThrow("json-nesting-limit");
    expect(() => parseInput('{"k":1,}')).toThrow("invalid-json");
  });
});
