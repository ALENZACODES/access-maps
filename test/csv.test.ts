import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/io/csv.js";

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, commas, and a byte order mark", () => {
    const table = parseCsv('\uFEFFname,notes\r\n"Queen, St","He said ""hello"""\r\nPlain,value\r\n');
    expect(table.headers).toEqual(["name", "notes"]);
    expect(table.rows).toEqual([
      { name: "Queen, St", notes: 'He said "hello"' },
      { name: "Plain", notes: "value" },
    ]);
  });

  it("rejects a duplicate header", () => {
    expect(() => parseCsv("a,a\n1,2\n")).toThrow(/duplicate CSV header a/);
  });
});
