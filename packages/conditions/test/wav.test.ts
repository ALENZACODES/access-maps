import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../schema/wav-service.schema.json";
import dataset from "../datasets/wav-services.json";
import fixture from "../fixtures/synthetic-wav-services.json";
import {
  loadWavDataset,
  parseDay,
  searchWav,
  validateWavDataset,
  validateWavRecord,
  wavMunicipalities,
} from "../src/wav";
import type { WavFilter, WavServiceRecord } from "../src/wavTypes";
import { WAV_AVAILABILITY } from "../src/wavTypes";

// The fixture holds synthetic services only. It is never the dataset.
const NOW = new Date("2026-11-15T12:00:00.000Z");
const records = loadWavDataset(fixture, "fixture");

function clone(index: number): WavServiceRecord {
  return JSON.parse(JSON.stringify(records[index])) as WavServiceRecord;
}

describe("WAV dataset and schema", () => {
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  it("ships a valid dataset file with no synthetic records", () => {
    expect(validate(dataset), JSON.stringify(validate.errors)).toBe(true);
    expect(validateWavDataset(dataset, "dataset")).toEqual([]);
    const shipped = loadWavDataset(dataset);
    expect(shipped.some((record) => record.synthetic === true)).toBe(false);
  });

  it("accepts the fixture only as a labelled fixture", () => {
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    expect(validateWavDataset(fixture, "fixture")).toEqual([]);
    const asDataset = validateWavDataset(fixture, "dataset");
    expect(asDataset).toHaveLength(records.length);
    expect(asDataset.every((issue) => issue.code === "synthetic_not_allowed")).toBe(true);
    expect(() => loadWavDataset(fixture)).toThrow(/synthetic_not_allowed/);
  });

  it("requires a synthetic label on every fixture record", () => {
    const unlabelled = clone(0);
    delete unlabelled.synthetic;
    expect(
      validateWavDataset(
        { format: "access-maps-wav-services", version: 1, records: [unlabelled] },
        "fixture",
      ),
    ).toEqual([
      { record: "synthetic-wav:1", field: "synthetic", code: "synthetic_label_required" },
    ]);
  });

  it("includes Unknown and effectively unavailable in the closed vocabulary", () => {
    expect(WAV_AVAILABILITY).toContain("UNKNOWN");
    expect(WAV_AVAILABILITY).toContain("effectively_unavailable");
    const record = clone(0);
    (record.availability as { value: string }).value = "usually fine";
    expect(validate({ format: "access-maps-wav-services", version: 1, records: [record] })).toBe(false);
    expect(validateWavRecord(record)).toEqual([
      { record: "synthetic-wav:1", field: "availability.value", code: "not_in_vocabulary" },
    ]);
  });

  it("accepts effectively unavailable only with a dated source", () => {
    const record = clone(2);
    expect(validateWavRecord(record)).toEqual([]);
    delete record.availability.source_dated;
    expect(validate({ format: "access-maps-wav-services", version: 1, records: [record] })).toBe(false);
    expect(validateWavRecord(record)).toEqual([
      {
        record: "synthetic-wav:3",
        field: "availability.source_dated",
        code: "unavailable_needs_dated_source",
      },
    ]);
    record.availability.source_dated = "2026-12-25";
    expect(validateWavRecord(record).map((issue) => issue.code)).toEqual([
      "source_dated_after_retrieval",
    ]);
  });

  it("requires source, licence, date and tier on every field", () => {
    const record = clone(0) as unknown as Record<string, Record<string, unknown>>;
    record.booking_phone = { value: "UNKNOWN" };
    record.service_hours = {
      value: "",
      source_id: "synthetic-test",
      licence: "CC0-1.0",
      retrieved_at: "2026-02-30",
      tier: 5,
      verified: true,
    };
    delete record.booking_url;
    expect(
      validateWavRecord(record).map((issue) => `${issue.field}:${issue.code}`),
    ).toEqual([
      "booking_phone.source_id:missing",
      "booking_phone.licence:missing",
      "booking_phone.retrieved_at:invalid_date",
      "booking_phone.tier:invalid_tier",
      "booking_url:missing",
      "service_hours.value:missing",
      "service_hours.retrieved_at:invalid_date",
      "service_hours.tier:invalid_tier",
      "service_hours.verified:invalid",
    ]);
    expect(validate({ format: "access-maps-wav-services", version: 1, records: [record] })).toBe(false);
  });

  it("rejects duplicate ids, unknown record keys and a wrong envelope", () => {
    const issues = validateWavDataset(
      {
        format: "access-maps-wav-services",
        version: 1,
        records: [clone(0), { ...clone(0), rating: 5 }],
      },
      "fixture",
    );
    expect(issues.map((issue) => `${issue.field}:${issue.code}`)).toEqual([
      "rating:invalid",
      "id:duplicate_id",
    ]);
    expect(validateWavDataset({ records: [] }, "dataset")).toEqual([
      { record: "", field: "dataset", code: "invalid" },
    ]);
  });

  it("parses only real calendar dates", () => {
    expect(Number.isFinite(parseDay("2026-11-01"))).toBe(true);
    expect(parseDay("2026-02-30")).toBeNaN();
    expect(parseDay("2026-11-01T00:00:00Z")).toBeNaN();
    expect(parseDay(20261101)).toBeNaN();
  });
});

describe("WAV search", () => {
  const ids = (filter: WavFilter, now: Date = NOW): string[] =>
    searchWav(records, filter, now).items.map((item) => item.record.id);

  it("lists everything without a filter, labelled by availability status", () => {
    const result = searchWav(records, {}, NOW);
    expect(result.coverage).toBe("records_found");
    expect(
      result.items.map((item) => [item.record.id, item.availability_status]),
    ).toEqual([
      ["synthetic-wav:1", "stated"],
      ["synthetic-wav:2", "unknown"],
      ["synthetic-wav:3", "stated"],
      ["synthetic-wav:4", "stale"],
    ]);
  });

  it("never matches Unknown availability with a positive filter", () => {
    for (const value of ["on_demand", "advance_booking_only", "limited"] as const) {
      expect(ids({ availability: [value] })).not.toContain("synthetic-wav:2");
    }
    expect(
      ids({ availability: ["on_demand", "advance_booking_only", "limited"] }),
    ).toEqual(["synthetic-wav:1"]);
  });

  it("never matches effectively unavailable with a positive filter", () => {
    expect(
      ids({ availability: ["on_demand", "advance_booking_only", "limited"] }),
    ).not.toContain("synthetic-wav:3");
  });

  it("does not treat an out-of-date claim as current", () => {
    expect(ids({ availability: ["on_demand"] })).toEqual([]);
    expect(ids({ availability: ["on_demand"] }, new Date("2025-02-01T00:00:00.000Z"))).toEqual([
      "synthetic-wav:4",
    ]);
    const stale = searchWav(records, {}, NOW).items.find(
      (item) => item.record.id === "synthetic-wav:4",
    );
    expect(stale?.stale_fields).toContain("availability");
  });

  it("refuses a filter that asks for Unknown or a negative value", () => {
    for (const value of ["UNKNOWN", "effectively_unavailable"]) {
      expect(() =>
        searchWav(records, { availability: [value] } as unknown as WavFilter, NOW),
      ).toThrow(RangeError);
    }
    expect(() =>
      searchWav(records, { serviceType: "UNKNOWN" } as unknown as WavFilter, NOW),
    ).toThrow(RangeError);
  });

  it("filters by municipality without case or accents, and never matches Unknown", () => {
    expect(ids({ municipality: "synthetic echantillon" })).toEqual(["synthetic-wav:3"]);
    const unknownPlace = clone(1);
    unknownPlace.municipality.value = "UNKNOWN";
    const result = searchWav([unknownPlace], { municipality: "UNKNOWN" }, NOW);
    expect(result.items).toEqual([]);
    expect(wavMunicipalities([...records, unknownPlace])).toEqual([
      "SYNTHETIC Échantillon",
      "SYNTHETIC Testville",
    ]);
  });

  it("filters by service type, never matching Unknown", () => {
    expect(ids({ serviceType: "on_demand_wav" })).toEqual(["synthetic-wav:2"]);
    const unknownType = clone(1);
    unknownType.service_type.value = "UNKNOWN";
    expect(
      searchWav([unknownType], { serviceType: "on_demand_wav" }, NOW).items,
    ).toEqual([]);
  });

  it("reports an empty result as no records, not as no service", () => {
    expect(searchWav(records, { municipality: "Nowhere" }, NOW)).toEqual({
      items: [],
      coverage: "no_records",
    });
    expect(searchWav(loadWavDataset(dataset), {}, NOW).coverage).toBe("no_records");
  });

  it("rejects an invalid clock", () => {
    expect(() => searchWav(records, {}, new Date(NaN))).toThrow(RangeError);
  });
});
