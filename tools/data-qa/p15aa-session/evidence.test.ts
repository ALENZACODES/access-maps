import { describe, expect, it } from "vitest";
import osmRegistryEntry from "../../../packages/places-shell/test/fixtures/source.osm-ontario.json" with { type: "json" };
import { buildReviewEvidence, locateReviewEvidence, type EvidenceCase } from "./evidence.js";

type Dictionary = Record<string, unknown>;
const osm = { sources: [osmRegistryEntry] };
const torontoCredit = "Contains information licensed under the Open Government Licence – Toronto.";
const gtfs = {
  id: "gtfs-ttc",
  name: "Transit schedule test",
  kind: "gtfs",
  tier: 1,
  retrieved_at: "2024-02-29",
  licence_id: "OGL-Toronto-1.0",
  attribution: torontoCredit,
};
const syntheticId = "osm:node/900000000000001";

function osmField(value: unknown = "UNKNOWN", extra: Dictionary = {}): Dictionary {
  return {
    value,
    source_id: osmRegistryEntry.id,
    licence: osmRegistryEntry.licence_id,
    tier: osmRegistryEntry.tier,
    retrieved_at: osmRegistryEntry.retrieved_at,
    ...extra,
  };
}

function selection(
  field = "wheelchair",
  data = osmField(),
  record: Dictionary = {},
): { field: string; record: Dictionary } {
  return {
    field,
    record: {
      id: syntheticId,
      tranche: "venue",
      region: "n43.5_w079.5",
      fields: { [field]: data },
      ...record,
    },
  };
}

function one(chosen: unknown, registry: unknown = osm): EvidenceCase {
  const [result] = buildReviewEvidence(registry, [chosen]);
  if (!result) throw new Error("fixture case missing");
  return result;
}

function sourceChange(change: Dictionary) {
  return { sources: [{ ...osmRegistryEntry, ...change }] };
}

function transit(value: unknown, extra: Dictionary = {}) {
  return selection("wheelchair_boarding", {
    source_id: gtfs.id,
    tier: gtfs.tier,
    licence: gtfs.licence_id,
    retrieved_at: gtfs.retrieved_at,
    value,
    ...extra,
  }, { tranche: "transit", id: "gtfs:gtfs-ttc:example-stop" });
}

describe("reviewable field projections", () => {
  it("retains the full published provenance and the explicit unknown on the real source fixture", () => {
    const projected = one(selection());
    expect(projected).toEqual({
      id: expect.stringMatching(/^c-[a-f0-9]{32}$/u),
      revision: expect.stringMatching(/^[a-f0-9]{64}$/u),
      source: "osm-ontario",
      licence: "ODbL-1.0",
      retrievedOn: osmRegistryEntry.retrieved_at,
      verificationTier: 0,
      tranche: "venue",
      field: "wheelchair",
      attribution: "© OpenStreetMap contributors",
      state: "unknown",
      reasons: [],
      value: "UNKNOWN",
    });
  });

  it("preserves a source's qualified wording as a controlled token", () => {
    const result = one(selection("wheelchair", osmField("limited")));
    expect(result).toMatchObject({ value: "limited", state: "recorded", verificationTier: 0, reasons: [] });
  });

  it("keeps an entrance and a boarding claim distinct on a GTFS record", () => {
    const entrance = one(transit("entrance_not_accessible"), { sources: [gtfs] });
    const boarding = one(transit("boarding_not_possible"), { sources: [gtfs] });
    expect(entrance.id).toBe(boarding.id);
    expect(entrance.revision).not.toBe(boarding.revision);
    expect(entrance.value).toBe("entrance_not_accessible");
    expect(boarding.value).toBe("boarding_not_possible");
    expect(boarding).toMatchObject({ verificationTier: 1, licence: gtfs.licence_id, attribution: torontoCredit });
  });

  it("keeps an inherited GTFS value under a hold", () => {
    const result = one(transit("accessible_path", { derived: true, raw: "0" }), { sources: [gtfs] });
    expect(result).toMatchObject({ state: "held", value: "UNKNOWN", reasons: ["derived-copy"] });
  });

  it("does not treat zero or an accessible-looking raw token as a GTFS claim", () => {
    const zero = one(transit("0"), { sources: [gtfs] });
    const unknown = one(transit("UNKNOWN", { raw: "1" }), { sources: [gtfs] });
    expect(zero).toMatchObject({ state: "held", value: "UNKNOWN", reasons: ["unsupported-value"] });
    expect(unknown).toMatchObject({ state: "unknown", value: "UNKNOWN", reasons: [] });
  });

  it("requires the selected ontology field to exist on this tranche", () => {
    expect(() => one(selection("wheelchair_boarding", osmField("accessible_path"))))
      .toThrowError("evidence/field-unsupported");
    expect(() => one(selection("name", osmField("UNKNOWN")))).toThrowError("evidence/field-unsupported");
    expect(() => one(selection("wheelchair", osmField(), { fields: {} }))).toThrowError("evidence/field-missing");
  });

  it("handles the washroom subrecord of a parent feature without mixing their cases", () => {
    const toilet = one(selection("wheelchair", osmField(), {
      tranche: "washroom",
      id: "osm:toilets-at:node/900000000000001",
    }));
    const parent = one(selection());
    expect(toilet.id).not.toBe(parent.id);
    expect(toilet.tranche).toBe("washroom");
  });

  it("accepts local-government records bearing their registered public source prefix", () => {
    const source = { ...gtfs, id: "toronto-library-branches", kind: "municipal", tier: 0 };
    const result = one(selection("ramp", osmField("UNKNOWN", {
      source_id: source.id,
      licence: source.licence_id,
      retrieved_at: source.retrieved_at,
    }), { id: source.id + ":fictional-identifier" }), { sources: [source] });
    expect(result).toMatchObject({ state: "unknown", verificationTier: 0, source: source.id, attribution: torontoCredit });
  });

  it("accepts a GTFS pathway in an unknown region without resolving any coordinates", () => {
    const path = selection("stair_count", {
      source_id: gtfs.id,
      licence: gtfs.licence_id,
      tier: gtfs.tier,
      retrieved_at: gtfs.retrieved_at,
      value: 0,
    }, { id: "gtfs:gtfs-ttc:pathway:synthetic-path", tranche: "path", region: "unknown" });
    const result = one(path, { sources: [gtfs] });
    expect(result).toMatchObject({ tranche: "path", value: "0", state: "recorded" });
    expect(result).not.toHaveProperty("region");
  });

  it.each([0, "12", 9999])("preserves a bounded count %s", (value) => {
    const result = one(selection("step_count", osmField(value)));
    expect(result).toMatchObject({ value: String(value), reasons: [], state: "recorded" });
  });

  it.each([-1, 0.5, "01", "0 to 12", 10000])("holds counts outside the display vocabulary (%s)", (value) => {
    expect(one(selection("step_count", osmField(value)))).toMatchObject({
      state: "held", reasons: ["unsupported-value"], value: "UNKNOWN",
    });
  });
});

describe("integrity and rights gates", () => {
  it("keeps every independent hold in stable order without allowing a value through", () => {
    const registry = sourceChange({
      attribution: "private draft",
      notes: "Held for legal review.",
    });
    const result = one(selection("wheelchair", osmField("almost accessible", {
      licence: gtfs.licence_id, tier: 4, retrieved_at: "2024-01-02", derived: true,
    })), registry);
    expect(result).toMatchObject({
      state: "held",
      value: "UNKNOWN",
      licence: gtfs.licence_id,
      verificationTier: 4,
      retrievedOn: "2024-01-02",
      attribution: "© OpenStreetMap contributors",
      reasons: [
        "licence-mismatch", "tier-mismatch", "date-mismatch", "credit-mismatch",
        "source-held", "derived-copy", "unsupported-value",
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/private draft|almost accessible/u);
  });

  it("keeps transaction-local source disagreements even if field and registry match each other", () => {
    const changed = one(selection("wheelchair", osmField("yes", { tier: 3 })), sourceChange({ tier: 3 }));
    expect(changed).toMatchObject({ state: "held", value: "UNKNOWN", reasons: ["tier-mismatch"] });
  });

  it("never copies an unrecognised licence identifier to a report", () => {
    const result = one(selection("wheelchair", osmField("yes", { licence: "private draft terms" })));
    expect(result).toMatchObject({ state: "held", licence: "UNKNOWN", reasons: ["licence-mismatch"] });
    expect(JSON.stringify(result)).not.toContain("private draft terms");
  });

  it("holds a different terms location even when the original licence ID is present", () => {
    const registry = sourceChange({ licence_url: "https://example.invalid/private-terms" });
    const result = one(selection("wheelchair", osmField("yes")), registry);
    expect(result).toMatchObject({ state: "held", value: "UNKNOWN", reasons: ["licence-mismatch"] });
    expect(JSON.stringify(result)).not.toContain("private-terms");
  });

  it("preserves safe field metadata while withholding unexpected registry terms and credit", () => {
    const result = one(selection("wheelchair", osmField("yes")), sourceChange({
      attribution: "text-for-internal-review",
      licence_id: "text-for-internal-review",
    }));
    expect(result).toMatchObject({
      licence: "ODbL-1.0", attribution: "© OpenStreetMap contributors", value: "UNKNOWN",
      state: "held", reasons: ["licence-mismatch", "credit-mismatch"],
    });
    expect(JSON.stringify(result)).not.toContain("text-for-internal-review");
  });

  it("uses the source's native credit verbatim even while the registry credit is being corrected", () => {
    const result = one(selection(), sourceChange({ attribution: "© OpenStreetMap" }));
    expect(result.attribution).toBe("© OpenStreetMap contributors");
    expect(result.reasons).toContain("credit-mismatch");
  });

  it("requires a release review when notes, tier notes or source kind qualify the registry entry", () => {
    for (const change of [
      { notes: "Licence terms have not been reconciled" },
      { tier_note: "Legal review is still required" },
      { kind: "aggregator" },
    ]) {
      const result = one(selection("wheelchair", osmField("yes")), sourceChange(change));
      expect(result).toMatchObject({ state: "held", reasons: ["source-held"], value: "UNKNOWN" });
    }
  });

  it("rejects unknown providers even when they copy an allowed source's terms and attribution", () => {
    const sourceId = "unregistered-feed";
    const record = selection("wheelchair", osmField("yes", { source_id: sourceId }));
    expect(() => one(record, sourceChange({ id: sourceId }))).toThrowError("evidence/source-unsupported");
    expect(() => one(selection(), { sources: [] })).toThrowError("evidence/source-missing");
  });

  it("rejects ambiguous registry identities even when duplicate entries have matching content", () => {
    const sources = [osmRegistryEntry, { ...osmRegistryEntry }];
    expect(() => one(selection(), { sources })).toThrowError("evidence/source-ambiguous");
  });

  it.each([
    ["gtfs:another-feed:example", "transit", "wheelchair_boarding"],
    ["gtfs:gtfs-ttc:pathway:example", "transit", "wheelchair_boarding"],
    ["gtfs:gtfs-ttc:example", "path", "stair_count"],
    ["gtfs:gtfs-ttc:pathway:", "path", "stair_count"],
  ])("requires the GTFS namespace and row type to agree for %s", (id, tranche, field) => {
    const record = selection(field, {
      source_id: gtfs.id, licence: gtfs.licence_id, tier: gtfs.tier,
      retrieved_at: gtfs.retrieved_at, value: "UNKNOWN",
    }, { id, tranche });
    expect(() => one(record, { sources: [gtfs] })).toThrowError("evidence/record-source-mismatch");
  });

  it("rejects an OSM source attached to a different feature namespace", () => {
    expect(() => one(selection("wheelchair", osmField(), { id: "another-source:record" })))
      .toThrowError("evidence/record-source-mismatch");
  });

  it.each(["2023-02-29", "2024-02-30", "2024-1-01", "2024-01-01T00:00:00Z", ""])(
    "rejects a malformed retrieval day %s", (retrieved_at) => {
      expect(() => one(selection("wheelchair", osmField("UNKNOWN", { retrieved_at })))).toThrowError("evidence/date-invalid");
    },
  );

  it.each(["0", 5, -1, 1.5, null])("rejects an invalid verification tier %s", (tier) => {
    expect(() => one(selection("wheelchair", osmField("UNKNOWN", { tier })))).toThrowError("evidence/tier-invalid");
  });

  it.each([
    [{ raw: {} }, "raw-invalid"],
    [{ derived: 1 }, "derived-invalid"],
    [{ source_key: [] }, "source-key-invalid"],
    [{ value: ["yes"] }, "value-invalid"],
    [{ value: null }, "value-invalid"],
    [{ value: Infinity }, "value-invalid"],
    [{ privateMessage: "private" }, "field-invalid"],
    [{ licence: " " }, "licence-invalid"],
  ] as const)("rejects malformed field metadata without including it in the diagnostic", (extra, code) => {
    expect(() => one(selection("wheelchair", osmField("yes", extra)))).toThrowError(new Error("evidence/" + code));
  });

  it("checks required registry metadata before accepting an explicit unknown", () => {
    for (const key of ["name", "kind", "licence_id", "attribution", "tier", "retrieved_at"]) {
      const source: Dictionary = { ...osmRegistryEntry };
      delete source[key];
      expect(() => one(selection(), { sources: [source] })).toThrowError(/^evidence\//u);
    }
  });
});

describe("revision binding and minimal disclosure", () => {
  it("binds each field's evidence and the notice version without changing the case identity", () => {
    const field = selection("wheelchair", osmField("yes"));
    const baseline = one(field);
    const changes = [
      one(selection("wheelchair", osmField("no"))),
      one(selection("wheelchair", osmField("yes", { raw: "Y" }))),
      one(selection("wheelchair", osmField("yes", { source_key: "toilets:wheelchair" }))),
      one(selection("wheelchair", osmField("yes", { derived: true }))),
      one(selection("wheelchair", osmField("yes", { retrieved_at: "2024-12-31" }))),
      one(selection("wheelchair", osmField("yes", { tier: 2 }))),
      one(selection("wheelchair", osmField("yes", { licence: gtfs.licence_id }))),
      one(selection("wheelchair", osmField("yes"), { region: "unknown" })),
      one(field, sourceChange({ retrieved_at: "2024-12-31" })),
      one(field, sourceChange({ licence_url: "https://example.invalid/changed" })),
      one(field, sourceChange({ url: "https://example.invalid/other-origin" })),
      one(field, sourceChange({ download_url: "https://example.invalid/other-shard" })),
      one(field, sourceChange({ name: "Changed publisher label" })),
      one(field, sourceChange({ licence_name: "Changed terms label" })),
      one(field, sourceChange({ notes: "Held for legal review" })),
      one(field, sourceChange({ attribution: "changed credit" })),
    ];
    for (const entry of changes) expect(entry.id).toBe(baseline.id);
    expect(new Set([baseline, ...changes].map(({ revision }) => revision)).size).toBe(changes.length + 1);
  });

  it("ignores source member order, non-evidence notes and unrelated unselected fields", () => {
    const field = osmField("limited", { source_key: "wheelchair", raw: "limited" });
    const first = one(selection("wheelchair", field));
    const fields = {
      name: { value: "fixture name" },
      wheelchair: Object.fromEntries(Object.entries(field).reverse()),
      wheelchair_description: { raw: "private context" },
    };
    const shuffled = one(selection("wheelchair", field, { fields }), sourceChange({ notes: "ordinary release note" }));
    expect(shuffled).toEqual(first);
    expect(JSON.stringify(shuffled)).not.toMatch(/fixture name|private context|ordinary release note/u);
  });

  it("hashes untrusted raw strings and drops notes, record IDs and unused registry members", () => {
    const source = sourceChange({ notes: "internal-only", extra: "internal-source-field" });
    const chosen = selection("wheelchair", osmField("internal-value", {
      raw: "internal-raw",
      source_key: "internal-column",
    }));
    const result = one(chosen, source);
    expect(result).toMatchObject({ state: "held", value: "UNKNOWN" });
    const encoded = JSON.stringify(result);
    expect(encoded).not.toContain("internal");
    expect(encoded).not.toContain(syntheticId);
    expect(encoded).not.toContain("n43.5_w079.5");
  });

  it("keeps cases separate across fields and tranches even when they share one OSM object", () => {
    const wheelchair = selection();
    const ramp = selection("ramp");
    const path = selection("wheelchair", osmField(), { tranche: "path" });
    const forward = buildReviewEvidence(osm, [ramp, path, wheelchair]);
    const reverse = buildReviewEvidence(osm, [wheelchair, path, ramp]);
    expect(forward).toEqual(reverse);
    const ids = forward.map(({ id }) => id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(3);
  });

  it("maps case IDs back to a local selection position independently of stable display order", () => {
    const first = selection("wheelchair", osmField("yes"));
    const second = selection("ramp", osmField("UNKNOWN"));
    const rows = [first, second];
    if (one(first).id < one(second).id) rows.reverse();
    const located = locateReviewEvidence(osm, rows);
    expect(located).toEqual(rows.map((row, index) => ({ selectionNumber: index + 1, evidence: one(row) })));
    expect(located.map(row => row.evidence).reverse()).toEqual(buildReviewEvidence(osm, rows));
    expect(JSON.stringify(located)).not.toContain(syntheticId);
    expect(() => locateReviewEvidence(osm, [first, first])).toThrowError("evidence/case-ambiguous");
  });

  it("rejects two different revisions of the same field in one input", () => {
    const first = selection();
    const second = selection("wheelchair", osmField("no"));
    expect(() => buildReviewEvidence(osm, [first, second])).toThrowError("evidence/case-ambiguous");
    expect(() => buildReviewEvidence(osm, [first, first])).toThrowError("evidence/case-ambiguous");
  });

  it("rejects an invalid selection anywhere in the batch without mutating its valid neighbour", () => {
    const first = selection("wheelchair", osmField("limited"));
    const before = structuredClone(first);
    expect(() => buildReviewEvidence(osm, [first, { field: "wheelchair" }])).toThrowError("evidence/record-invalid");
    expect(first).toEqual(before);
    expect(one(first)).toMatchObject({ value: "limited", reasons: [] });
  });

  it("allows an empty worklist, rejects nonarrays and oversized batches before reading any item", () => {
    expect(buildReviewEvidence(osm, [])).toEqual([]);
    expect(() => buildReviewEvidence(osm, {})).toThrowError("evidence/selections-invalid");
    expect(() => buildReviewEvidence(osm, new Array(4097))).toThrowError("evidence/selections-invalid");
    expect(() => buildReviewEvidence({ sources: new Array(8193) }, [])).toThrowError("evidence/registry-invalid");
  });
});
