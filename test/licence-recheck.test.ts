import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readRegistry, type SourceRegistry } from "../src/registry.js";
import {
  addDays,
  buildRegister,
  flagsFromText,
  isIsoDate,
  registerMarkdown,
  subjectsOf,
  validateLog,
  type GapEntry,
  type RecheckLogEntry,
} from "../src/licence/recheck.js";
import { run } from "../scripts/licence-recheck.js";
import { TILES_HELD_FOR_LEGAL_REVIEW } from "../scripts/build-pmtiles.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = readRegistry(root);
const gaps = JSON.parse(readFileSync(path.join(root, "sources/gaps.json"), "utf8")) as GapEntry[];

function source(id: string, notes: string, retrieved = "2026-11-13"): SourceRegistry["sources"][number] {
  return {
    id,
    name: id,
    kind: "municipal",
    url: "https://example.test/",
    download_url: "https://example.test/file",
    licence_name: "Test",
    licence_url: "https://example.test/licence",
    licence_id: "Test",
    attribution: "Test",
    retrieved_at: retrieved,
    tier: 0,
    notes,
  };
}

describe("flags", () => {
  it("quotes the sentence that raised each flag", () => {
    const flags = flagsFromText("The terms are revocable and include an indemnity. Legal review is required. The page returned HTTP 403.");
    expect(flags.map((flag) => flag.code)).toEqual(["revocable", "indemnity", "legal-review", "licence-page-unreachable"]);
    expect(flags[0]!.evidence).toBe("The terms are revocable and include an indemnity.");
  });

  it("does not flag a plain grant", () => {
    expect(flagsFromText("Licence PDF retrieved 2026-11-13. It grants a worldwide, royalty-free, perpetual, non-exclusive licence.")).toEqual([]);
  });
});

describe("register on the committed sources", () => {
  const register = buildRegister(registry, gaps, [], { asOf: "2026-11-14", heldFromTiles: TILES_HELD_FOR_LEGAL_REVIEW });

  it("has one row per registry source and per gap", () => {
    expect(register.rows).toHaveLength(registry.sources.length + gaps.length);
    expect(new Set(register.rows.map((row) => row.subject)).size).toBe(register.rows.length);
  });

  it("flags every source held from the open tiles", () => {
    for (const id of TILES_HELD_FOR_LEGAL_REVIEW) {
      const row = register.rows.find((item) => item.subject === id)!;
      expect(row.flagged, id).toBe(true);
      expect(row.flags.map((flag) => flag.code)).toContain("held-from-open-tiles");
    }
  });

  it("flags the Metrolinx and MiWay terms from their own notes", () => {
    const go = register.rows.find((row) => row.subject === "gtfs-go-transit")!;
    expect(go.flags.map((flag) => flag.code)).toEqual(expect.arrayContaining(["revocable", "not-reconciled", "not-plain-open-grant"]));
    const miway = register.rows.find((row) => row.subject === "gtfs-miway")!;
    expect(miway.flags.map((flag) => flag.code)).toEqual(expect.arrayContaining(["revocable", "indemnity"]));
  });

  it("keeps every not-imported dataset at licence UNKNOWN", () => {
    for (const row of register.rows.filter((item) => item.kind === "not imported")) {
      expect(row.licence_id).toBe("UNKNOWN");
    }
  });

  it("dates flagged rows 30 days and others 90 days from retrieval, with nothing re-checked yet", () => {
    const ttc = register.rows.find((row) => row.subject === "gtfs-ttc")!;
    expect(ttc).toMatchObject({ flagged: false, last_checked: "2026-11-13", due_on: "2027-02-11", state: "not due", last_result: "no re-check recorded" });
    const go = register.rows.find((row) => row.subject === "gtfs-go-transit")!;
    expect(go).toMatchObject({ due_on: "2026-12-13", interval_days: 30 });
  });

  it("treats an undated gap as overdue now, not as checked", () => {
    const yrt = register.rows.find((row) => row.subject === "York Region Transit GTFS")!;
    expect(yrt).toMatchObject({ last_checked: "no date recorded", due_on: null, state: "overdue" });
    expect(register.rows[0]!.state).toBe("overdue");
  });

  it("prints a register that names the evidence and makes no licence finding", () => {
    const markdown = registerMarkdown(register);
    expect(markdown).toContain("| gtfs-go-transit | yes |");
    expect(markdown).toContain("It does not say what a licence allows.");
    expect(markdown).toContain("listed in TILES_HELD_FOR_LEGAL_REVIEW");
    expect(markdown).not.toMatch(/\b(cleared|approved|compliant)\b/i);
  });
});

describe("re-check log", () => {
  const subjects = subjectsOf(registry, gaps);
  const good: RecheckLogEntry = {
    subject: "gtfs-ttc",
    checked_on: "2026-11-14",
    checker_role: "data lead",
    url_checked: "https://open.toronto.ca/open-data-licence/",
    result: "unchanged",
    note: "Licence page text matches the registry entry.",
  };

  it("accepts a complete entry and moves the due date from the check", () => {
    expect(validateLog([good], subjects, "2026-11-14")).toEqual([]);
    const register = buildRegister(registry, gaps, [good], { asOf: "2026-11-14" });
    const ttc = register.rows.find((row) => row.subject === "gtfs-ttc")!;
    expect(ttc).toMatchObject({ last_checked: "2026-11-14", last_checked_from: "re-check log", last_result: "unchanged", due_on: addDays("2026-11-14", 90) });
  });

  it("uses the newest entry for a dataset", () => {
    const older = { ...good, checked_on: "2026-11-01", result: "changed" as const };
    const register = buildRegister(registry, gaps, [good, older], { asOf: "2026-11-14" });
    expect(register.rows.find((row) => row.subject === "gtfs-ttc")!.last_result).toBe("unchanged");
  });

  it("rejects unknown subjects, future dates, missing roles, unreachable without status, and extra fields", () => {
    const issues = validateLog(
      [
        { ...good, subject: "not-a-source" },
        { ...good, checked_on: "2026-12-01" },
        { ...good, checker_role: "" },
        { ...good, result: "unreachable" },
        { ...good, reviewer_name: "Someone" },
        { ...good, checked_on: "2026-02-30" },
      ],
      subjects,
      "2026-11-14",
    );
    expect(issues.map((issue) => `${issue.index}:${issue.field}`)).toEqual([
      "0:subject",
      "1:checked_on",
      "2:checker_role",
      "3:http_status",
      "4:reviewer_name",
      "5:checked_on",
    ]);
    expect(validateLog({}, subjects, "2026-11-14")).toHaveLength(1);
  });

  it("validates real calendar dates", () => {
    expect(isIsoDate("2026-11-14")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(() => buildRegister(registry, gaps, [], { asOf: "14/11/2026" })).toThrow(/as-of/);
  });

  it("orders overdue, then due, then flagged rows first", () => {
    const local: SourceRegistry = {
      sources: [source("plain", "Grants a licence.", "2026-11-14"), source("flagged", "Revocable terms.", "2026-11-14"), source("old", "Grants a licence.", "2025-01-01")],
    };
    const register = buildRegister(local, [], [], { asOf: "2026-11-14" });
    expect(register.rows.map((row) => row.subject)).toEqual(["old", "flagged", "plain"]);
  });
});

describe("command", () => {
  function copyRepo(log: unknown): string {
    const dir = mkdtempSync(path.join(tmpdir(), "licence-"));
    mkdirSync(path.join(dir, "sources"));
    cpSync(path.join(root, "sources/registry.json"), path.join(dir, "sources/registry.json"));
    cpSync(path.join(root, "sources/gaps.json"), path.join(dir, "sources/gaps.json"));
    writeFileSync(path.join(dir, "sources/licence-rechecks.json"), JSON.stringify(log));
    return dir;
  }

  it("prints the register for the committed log", () => {
    const result = run(["--as-of", "2026-11-14"], root);
    expect(result.code).toBe(0);
    expect(result.out).toContain("# Licence re-check register");
  });

  it("fails on overdue rows only when asked", () => {
    expect(run(["--as-of", "2026-11-14", "--fail-on-overdue"], root).code).toBe(1);
  });

  it("stops on a bad log entry and names it", () => {
    const result = run(["--as-of", "2026-11-14", "--format", "json"], copyRepo([{ subject: "nope" }]));
    expect(result.code).toBe(1);
    expect(result.err).toContain("entry 0 subject");
  });

  it("rejects bad arguments", () => {
    expect(run(["--as-of", "soon"], root).code).toBe(2);
    expect(run(["--as-of", "2026-11-14", "--format", "xml"], root).code).toBe(2);
    expect(run(["--extra"], root).code).toBe(2);
  });
});
