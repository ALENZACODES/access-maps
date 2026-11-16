import { describe, expect, it } from "vitest";
import { G5_LAYER_JOBS } from "../../scripts/import-cities-g5.js";
import { readRegistry } from "../../src/registry.js";
import { root } from "./g3-helpers.js";

const NEVER_REQUESTED = /phone|fax|email|e_mail|contact|^source$|creat|edit|user|inspect|comment|memorial|globalid|meterno/i;

describe("city import jobs included on the repository owner's permission of 2026-11-16", () => {
  const registry = readRegistry(root);

  it("each job has a tier 0 municipal registry entry that states the owner-permission basis exactly", () => {
    for (const job of G5_LAYER_JOBS) {
      const source = registry.sources.find((entry) => entry.id === job.id);
      expect(source, job.id).toBeDefined();
      expect(source?.kind).toBe("municipal");
      expect(source?.tier).toBe(0);
      expect(source?.retrieved_at).toBe("2026-11-16");
      expect(source?.licence_id).toBe("owner-permission-2026-11-16");
      expect(source?.licence_name).toMatch(/^Repository owner permission of 2026-11-16/);
      expect(source?.notes ?? "").toMatch(/repository owner stated in chat on 2026-11-16/);
      expect(source?.attribution.length).toBeGreaterThan(0);
      expect(source?.download_url).toMatch(/\/(?:FeatureServer|MapServer)\/\d+$/);
      // The registry must never claim an open licence it did not read.
      expect(`${source?.licence_name} ${source?.notes}`).not.toMatch(/Open Government Licence/);
    }
  });

  it("source ids start with the publisher slug and are unique", () => {
    const ids = G5_LAYER_JOBS.map((job) => job.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^(?:london|cambridge|oxford-county|haldimand)-[a-z-]+$/);
  });

  it("no job requests a contact, editor, inspector, comment or payment column", () => {
    for (const job of G5_LAYER_JOBS) {
      for (const field of job.fields) expect(NEVER_REQUESTED.test(field), `${job.id} ${field}`).toBe(false);
    }
  });
});
