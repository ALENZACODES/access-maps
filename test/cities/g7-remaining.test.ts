import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { registry, root } from "./g7-support.js";

interface Remaining {
  summary: { municipalities: number; imported: number; gap: number; pending: number };
  municipalities: { dguid: string; status: string; gap?: string; municipal_records?: Record<string, number> }[];
}

const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(root, "sources", file), "utf8")) as T;

describe("sources/ontario-municipalities-remaining.json", () => {
  const remaining = read<Remaining>("ontario-municipalities-remaining.json");
  const gaps = new Set(read<{ name: string }[]>("gaps.json").map((gap) => gap.name));
  const sources = new Map(registry.sources.map((source) => [source.id, source]));
  const listed = [
    ...read<{ municipalities: { dguid: string }[] }>("ontario-top-50-municipalities.json").municipalities,
    ...read<{ municipalities: { dguid: string }[] }>("ontario-municipalities-51-75.json").municipalities,
  ].map((entry) => entry.dguid);

  it("with the 77 largest, lists each of Ontario's 414 lower- and single-tier municipalities once", () => {
    const dguids = remaining.municipalities.map((entry) => entry.dguid);
    expect(new Set(dguids).size).toBe(dguids.length);
    expect(dguids.filter((dguid) => listed.includes(dguid))).toEqual([]);
    expect(dguids.length + new Set(listed).size).toBe(414);
  });

  it("ends every municipality as imported, with municipal records, or as a gap that names a sources/gaps.json record", () => {
    for (const entry of remaining.municipalities) {
      if (entry.status === "imported") {
        const records = Object.entries(entry.municipal_records ?? {});
        expect(records.length, entry.dguid).toBeGreaterThan(0);
        for (const [id, count] of records) {
          expect(sources.get(id)?.kind, id).toBe("municipal");
          expect(count).toBeGreaterThan(0);
        }
      } else {
        expect(entry.status, entry.dguid).toBe("gap");
        expect(gaps.has(entry.gap ?? ""), entry.gap).toBe(true);
      }
    }
    const count = (status: string) => remaining.municipalities.filter((entry) => entry.status === status).length;
    expect(remaining.summary).toEqual({ municipalities: remaining.municipalities.length, imported: count("imported"), gap: count("gap"), pending: 0 });
  });
});
