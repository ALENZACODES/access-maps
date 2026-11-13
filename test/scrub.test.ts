import { describe, expect, it } from "vitest";
import { fv } from "../src/model/provenance.js";
import { buildRecord } from "../src/model/records.js";
import { containsPersonalContact, scrubRecord } from "../src/privacy/scrub.js";
import type { Provenance } from "../src/model/provenance.js";

const ctx: Provenance = {
  source_id: "osm-ontario",
  licence: "ODbL-1.0",
  retrieved_at: "2026-11-13",
  tier: 0,
};

describe("personal contact scrub", () => {
  it("strips emails and phone numbers from field values and does not keep them in raw", () => {
    expect(containsPersonalContact("ben@example.com")).toBe(true);
    expect(containsPersonalContact("+1 519 555 0100")).toBe(true);
    expect(containsPersonalContact("City Hall")).toBe(false);
    const record = buildRecord(
      "venue",
      "osm:node/1",
      "n43.5_w079.5",
      {
        operator: fv("ben@example.com", ctx, { source_key: "operator", raw: "ben@example.com" }),
        addr_unit: fv("+1 519 555 0100", ctx, { source_key: "addr:unit" }),
        website: fv("person@gmail.com", ctx, { source_key: "website" }),
        name: fv("Tim Hortons", ctx, { source_key: "name" }),
        wheelchair: fv("yes", ctx, { source_key: "wheelchair" }),
      },
      ctx,
    );
    const clean = scrubRecord(record);
    const encoded = JSON.stringify(clean);
    expect(encoded).not.toContain("ben@example.com");
    expect(encoded).not.toContain("519 555 0100");
    expect(encoded).not.toContain("gmail.com");
    expect(clean.fields.operator?.value).toBe("UNKNOWN");
    expect(clean.fields.operator?.raw).toBeUndefined();
    expect(clean.fields.addr_unit?.value).toBe("UNKNOWN");
    expect(clean.fields.website?.value).toBe("UNKNOWN");
    expect(clean.fields.name?.value).toBe("Tim Hortons");
    expect(clean.fields.wheelchair?.value).toBe("yes");
  });

  it("replaces unicode line separators so a value stays on one NDJSON line", () => {
    const record = buildRecord(
      "venue",
      "osm:node/2",
      "n43.5_w079.5",
      { addr_housenumber: fv("8\u2028444", ctx, { source_key: "addr:housenumber" }) },
      ctx,
    );
    const clean = scrubRecord(record);
    expect(clean.fields.addr_housenumber?.value).toBe("8 444");
    expect(String(clean.fields.addr_housenumber?.value)).not.toContain("\u2028");
  });
});
