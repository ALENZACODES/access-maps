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

  it("keeps OSM ids and digit-heavy URLs, and still strips real phones and emails", () => {
    expect(containsPersonalContact("osm:node/1595860550")).toBe(false);
    expect(containsPersonalContact("https://www.walmart.ca/en/ip/6000206074206")).toBe(false);
    expect(containsPersonalContact("https://www.facebook.com/100064866123456")).toBe(false);
    expect(containsPersonalContact("1595860550")).toBe(false);
    expect(containsPersonalContact("+1 519 555 0100")).toBe(true);
    expect(containsPersonalContact("(519) 555-0100")).toBe(true);
    expect(containsPersonalContact("519-555-0100")).toBe(true);
    expect(containsPersonalContact("+15195550100")).toBe(true);
    expect(containsPersonalContact("ben@example.com")).toBe(true);

    const record = buildRecord(
      "washroom",
      "osm:node/1",
      "n43.5_w079.5",
      {
        parent_id: fv("osm:node/1595860550", ctx, { source_key: "osm_id" }),
        website: fv("https://www.walmart.ca/en/ip/6000206074206", ctx, { source_key: "website" }),
        operator: fv("ben@example.com", ctx, { source_key: "operator" }),
        opening_hours: fv("Mo-Fr 09:00-17:00; +1 519 555 0100", ctx, { source_key: "opening_hours", raw: "Mo-Fr 09:00-17:00; +1 519 555 0100" }),
      },
      ctx,
    );
    const clean = scrubRecord(record);
    const encoded = JSON.stringify(clean);
    expect(clean.fields.parent_id?.value).toBe("osm:node/1595860550");
    expect(clean.fields.website?.value).toBe("https://www.walmart.ca/en/ip/6000206074206");
    expect(clean.fields.operator?.value).toBe("UNKNOWN");
    expect(clean.fields.opening_hours?.value).toBe("Mo-Fr 09:00-17:00");
    expect(encoded).not.toContain("ben@example.com");
    expect(encoded).not.toContain("519 555 0100");
    expect(encoded).not.toContain("519-555-0100");
    expect(encoded).toContain("1595860550");
    expect(encoded).toContain("6000206074206");

    const disguised = buildRecord(
      "venue",
      "osm:node/4425602130",
      "n43.5_w079.5",
      {
        website: fv("https://goldenbeautydrybar@gmail.com", ctx, { source_key: "website" }),
        operator: fv("https://519-766-0055", ctx, { source_key: "contact:website" }),
      },
      ctx,
    );
    const stripped = scrubRecord(disguised);
    expect(stripped.fields.website?.value).toBe("UNKNOWN");
    expect(stripped.fields.operator?.value).toBe("UNKNOWN");
    expect(JSON.stringify(stripped)).not.toContain("gmail.com");
    expect(JSON.stringify(stripped)).not.toContain("519-766-0055");
  });

  it("scrubs a phone on a path record and keeps a long numeric identifier", () => {
    const record = buildRecord(
      "path",
      "osm:way/12345678901",
      "n43.5_w079.5",
      {
        signposted_as: fv("Trail +1-519-555-0100", ctx, { source_key: "name" }),
        from_ref: fv("osm:node/1595860550", ctx, { source_key: "osm_id" }),
      },
      ctx,
    );
    const clean = scrubRecord(record);
    expect(clean.fields.signposted_as?.value).toBe("Trail");
    expect(clean.fields.from_ref?.value).toBe("osm:node/1595860550");
    expect(JSON.stringify(clean)).not.toContain("519-555-0100");
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
