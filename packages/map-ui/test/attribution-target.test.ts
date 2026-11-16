import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/styles.css"),
  "utf8",
);

describe("journey-result attribution link targets", () => {
  it("gives .journey-result a a 44px minimum target", () => {
    const blocks = css.match(/\.journey-result a\s*\{[^}]+\}/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).toMatch(/min-height:\s*44px/);
      expect(block).toMatch(/min-width:\s*44px/);
      expect(block).not.toMatch(/min-height:\s*24px/);
      expect(block).not.toMatch(/min-width:\s*24px/);
    }
  });
});
