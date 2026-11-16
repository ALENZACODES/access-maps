import { describe, expect, it, vi } from "vitest";

// No React runtime is installed where these tests run. See jsx-stand-in.ts.
vi.mock("react", () => import("./jsx-stand-in"));
vi.mock("react/jsx-runtime", () => import("./jsx-stand-in"));
vi.mock("react/jsx-dev-runtime", () => import("./jsx-stand-in"));

import reportFixture from "../fixtures/synthetic-route-reports.json";
import wavFixture from "../fixtures/synthetic-wav-services.json";
import { corroborateReports, validateReport } from "../src/reports";
import {
  EMPTY_REPORT_FORM,
  RouteReportFormView,
  RouteReportsList,
  localInputToIso,
  submitReportForm,
} from "../src/RouteReports";
import { WavFinderView } from "../src/WavFinder";
import { loadWavDataset, searchWav, wavMunicipalities } from "../src/wav";
import { reportStrings } from "../src/reportStrings";
import { wavStrings } from "../src/wavStrings";
import { reportGroupViews, wavItemViews } from "../src/viewModels";
import type { RouteReport } from "../src/reportTypes";
import type { WavFilter } from "../src/wavTypes";
import type { HostNode } from "./tree";
import { all, byId, byType, expand, text } from "./tree";

// All records rendered here are synthetic fixtures.
const NOW = new Date("2026-11-15T12:00:00.000Z");
const LANGUAGES = ["en", "fr"] as const;

const reports: RouteReport[] = (reportFixture as unknown[]).map((item) => {
  const result = validateReport(item);
  if (!result.ok) throw new Error("fixture");
  return result.report;
});
const groups = corroborateReports(reports, NOW);
const wavRecords = loadWavDataset(wavFixture, "fixture");

function leaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [String((value as (n: number) => string)(2))];
  if (value && typeof value === "object") return Object.values(value).flatMap(leaves);
  return [];
}

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, item]) => keys(item, `${prefix}.${key}`));
}

/** Every form control must have a programmatic name. */
function unnamedControls(tree: (HostNode | string)[]): HostNode[] {
  const labels = byType(tree, "label");
  const labelled = new Set(labels.map((label) => label.props.htmlFor));
  const wrapped = new Set(
    labels.flatMap((label) => all(label.children)),
  );
  return all(tree).filter(
    (node) =>
      ["input", "select", "textarea"].includes(node.type) &&
      !labelled.has(node.props.id) &&
      !wrapped.has(node) &&
      !node.props["aria-label"],
  );
}

describe("string catalogues", () => {
  it("have the same keys and no empty text in English and French", () => {
    for (const catalogue of [reportStrings, wavStrings]) {
      expect(keys(catalogue.fr).sort()).toEqual(keys(catalogue.en).sort());
      for (const language of LANGUAGES) {
        expect(leaves(catalogue[language]).every((value) => value.trim().length > 0)).toBe(true);
      }
    }
  });

  it("never describe a report or an unverified tier as verified", () => {
    for (const language of LANGUAGES) {
      const t = reportStrings[language];
      const labels = [...leaves(t.tiers), ...leaves(t.states), ...leaves(t.parts)]
        .join(" ")
        .toLowerCase();
      expect(labels).not.toContain("verified");
      expect(labels).not.toContain("v\u00e9rifi\u00e9");
      expect(reportStrings[language].tiers[0]).toMatch(/unconfirmed|non confirmé/);
      expect(wavStrings[language].tiers[0]).toMatch(/not verified|non vérifié/);
      expect(wavStrings[language].tiers[1]).toMatch(/not verified|non vérifié/);
    }
  });
});

describe("route report list", () => {
  it.each(LANGUAGES)("renders state, tier and provenance as text (%s)", (language) => {
    const t = reportStrings[language];
    const tree = expand(<RouteReportsList groups={groups} language={language} />);
    const section = byType(tree, "section")[0];
    expect(section?.props.lang).toBe(language);
    expect(section?.props["aria-labelledby"]).toBe("route-reports-heading");
    expect(text(byId(tree, "route-reports-heading") ?? "")).toBe(t.heading);
    const items = byType(tree, "ul")[0]?.children.filter(
      (node): node is HostNode => typeof node !== "string",
    );
    expect(items).toHaveLength(2);
    const bodies = (items ?? []).map((item) => text(item));
    const snow = bodies.find((value) => value.startsWith(t.kinds.snowbank)) ?? "";
    expect(snow).toContain(t.kinds.snowbank);
    expect(snow).toContain(t.states.active);
    expect(snow).toContain(t.tiers[2]);
    expect(snow).toContain(t.sample);
    expect(snow).toContain("synthetic-test");
    expect(snow).toContain("CC0-1.0");
    expect(snow).toContain(t.photoAttached);
    expect(snow).toContain(t.confidenceNote);
    const ice = bodies.find((value) => value.startsWith(t.kinds.ice)) ?? "";
    expect(ice).toContain(t.states.expired);
    expect(ice).toContain(t.tiers[0]);
    expect(ice).not.toContain(t.confidence);
    expect(text(tree)).toContain(t.intro);
  });

  it("shows an expired group as expired with no weight", () => {
    const views = reportGroupViews(groups, "en");
    const ice = views.find((view) => view.heading === "Ice");
    expect(ice).toMatchObject({
      current: false,
      confidence: null,
      expiryLabel: "Expired",
      state: "Expired — not a current condition",
    });
    expect(ice?.expiry).toContain("2026");
    expect(ice?.reports[0]?.part).toBe("Expired");
  });

  it.each(LANGUAGES)("says an empty list is not a clear way (%s)", (language) => {
    const tree = expand(<RouteReportsList groups={[]} language={language} />);
    expect(text(tree)).toContain(reportStrings[language].empty);
    expect(byType(tree, "ul")).toHaveLength(0);
  });
});

describe("route report form", () => {
  const context = {
    id: "form-ui-1",
    location: { type: "segment" as const, segment_id: "synthetic-segment-1" },
    source_id: "synthetic-test",
    licence: "CC0-1.0",
    reporter_ref: null,
    now: NOW,
  };

  it.each(LANGUAGES)("names every control and groups the radios (%s)", (language) => {
    const t = reportStrings[language];
    const tree = expand(
      <RouteReportFormView
        language={language}
        locationLabel="SYNTHETIC corner"
        fields={EMPTY_REPORT_FORM}
        onChange={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(unnamedControls(tree)).toEqual([]);
    expect(text(byType(tree, "legend")[0] ?? "")).toBe(t.observationLegend);
    const radios = byType(tree, "input").filter((node) => node.props.type === "radio");
    expect(radios).toHaveLength(2);
    expect(new Set(radios.map((node) => node.props.name)).size).toBe(1);
    const observed = byId(tree, "route-report-observed");
    expect(observed?.props.type).toBe("datetime-local");
    expect(observed?.props["aria-describedby"]).toBe("route-report-observed-help");
    expect(text(byId(tree, "route-report-observed-help") ?? "")).toBe(t.observedHelp);
    const submit = byType(tree, "button")[0];
    expect(submit?.props.type).toBe("submit");
    expect(text(submit ?? "")).toBe(t.submit);
    expect(all(tree).some((node) => node.props.role === "alert")).toBe(false);
    expect(all(tree).some((node) => node.props.role === "status")).toBe(true);
    expect(text(tree)).toContain(t.formIntro);
  });

  it("keeps targets at least 24 pixels", () => {
    const tree = expand(
      <RouteReportFormView
        locationLabel="SYNTHETIC corner"
        fields={EMPTY_REPORT_FORM}
        onChange={() => {}}
        onSubmit={() => {}}
      />,
    );
    for (const node of all(tree)) {
      if (!["input", "select", "button"].includes(node.type)) continue;
      const style = (node.props.style ?? {}) as { minHeight?: number; height?: number };
      expect(style.minHeight ?? style.height ?? 0).toBeGreaterThanOrEqual(24);
    }
  });

  it.each(LANGUAGES)("links each error to its field and summarises them (%s)", (language) => {
    const t = reportStrings[language];
    const result = submitReportForm(EMPTY_REPORT_FORM, context);
    expect(result.ok).toBe(false);
    const tree = expand(
      <RouteReportFormView
        language={language}
        locationLabel="SYNTHETIC corner"
        fields={EMPTY_REPORT_FORM}
        issues={result.ok ? [] : result.errors}
        onChange={() => {}}
        onSubmit={() => {}}
      />,
    );
    const alert = all(tree).find((node) => node.props.role === "alert");
    expect(text(alert ?? "")).toContain(t.errorSummary);
    expect(text(alert ?? "")).toContain(t.errors.unknown_kind);
    const kind = byId(tree, "route-report-kind");
    expect(kind?.props["aria-invalid"]).toBe(true);
    expect(kind?.props["aria-describedby"]).toBe("route-report-kind-error");
    expect(text(byId(tree, "route-report-kind-error") ?? "")).toBe(t.errors.unknown_kind);
    const observed = byId(tree, "route-report-observed");
    expect(observed?.props["aria-describedby"]).toBe(
      "route-report-observed-help route-report-observed-error",
    );
    expect(text(byId(tree, "route-report-observed-error") ?? "")).toBe(t.errors.invalid_time);
    expect(text(byId(tree, "route-report-observation-error") ?? "")).toBe(
      t.errors.unknown_observation,
    );
  });

  it("passes edits and submission to the host", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const tree = expand(
      <RouteReportFormView
        locationLabel="SYNTHETIC corner"
        fields={EMPTY_REPORT_FORM}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    );
    const kind = byId(tree, "route-report-kind");
    (kind?.props.onChange as (event: unknown) => void)({ target: { value: "ice" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_REPORT_FORM, kind: "ice" });
    const preventDefault = vi.fn();
    (byType(tree, "form")[0]?.props.onSubmit as (event: unknown) => void)({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalled();
  });

  it("turns a completed form into a tier 0 report with the stated time", () => {
    const local = "2026-11-15T05:30";
    const result = submitReportForm(
      { kind: "snowbank", observation: "cleared", observedLocal: local, role: "passerby", note: "" },
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.observed_at).toBe(new Date(local).toISOString());
    expect(result.report.observation).toMatchObject({ value: "cleared", tier: 0 });
    expect(result.report).not.toHaveProperty("note");
  });

  it("does not guess a time from an unreadable control value", () => {
    expect(localInputToIso("")).toBe("");
    expect(localInputToIso("15/11/2026 05:30")).toBe("");
    expect(localInputToIso("2026-13-45T05:30")).toBe("");
  });

  it.each(LANGUAGES)("announces a saved report and any warning (%s)", (language) => {
    const t = reportStrings[language];
    const tree = expand(
      <RouteReportFormView
        language={language}
        locationLabel="SYNTHETIC corner"
        fields={EMPTY_REPORT_FORM}
        saved
        warnings={["photo_time_differs"]}
        onChange={() => {}}
        onSubmit={() => {}}
      />,
    );
    const status = all(tree).find((node) => node.props.role === "status");
    expect(text(status ?? "")).toContain(t.saved);
    expect(text(status ?? "")).toContain(t.warnings.photo_time_differs);
  });
});

describe("WAV finder", () => {
  function render(filter: WavFilter, language: "en" | "fr", onFilterChange = vi.fn()) {
    return expand(
      <WavFinderView
        result={searchWav(wavRecords, filter, NOW)}
        municipalities={wavMunicipalities(wavRecords)}
        filter={filter}
        onFilterChange={onFilterChange}
        language={language}
      />,
    );
  }

  it.each(LANGUAGES)("labels availability, staleness and provenance per field (%s)", (language) => {
    const t = wavStrings[language];
    const tree = render({}, language);
    expect(byType(tree, "section")[0]?.props.lang).toBe(language);
    expect(unnamedControls(tree)).toEqual([]);
    const items = (byType(tree, "ul")[0]?.children ?? []).filter(
      (node): node is HostNode => typeof node !== "string",
    );
    expect(items).toHaveLength(4);
    const body = items.map((item) => text(item));
    expect(body.every((value) => value.includes(t.sample))).toBe(true);
    expect(body[0]).toContain(t.availability.advance_booking_only);
    expect(body[1]).toContain(`${t.fields.availability}: ${t.unknown}`);
    expect(body[2]).toContain(t.availability.effectively_unavailable);
    expect(body[2]).toContain(t.datedSource);
    expect(body[3]).toContain(t.staleAvailability);
    expect(body[0]).not.toContain(t.staleAvailability);
    for (const item of items) {
      const rows = byType([item], "dd");
      expect(rows).toHaveLength(7);
      for (const row of rows) {
        const value = text(row);
        expect(value).toContain(`${t.source}: synthetic-test`);
        expect(value).toContain(`${t.licence}: CC0-1.0`);
        expect(value).toContain(t.retrieved);
        expect(value).toContain(t.tiers[1]);
      }
    }
    expect(text(all(tree).find((node) => node.props.role === "status") ?? "")).toBe(
      t.resultCount(4),
    );
  });

  it("links only a stated https booking address", () => {
    const links = byType(render({}, "en"), "a");
    expect(links.map((link) => link.props.href)).toEqual(["https://synthetic.invalid/book"]);
    const views = wavItemViews(searchWav(wavRecords, {}, NOW).items, "en");
    expect(views[1]?.fields.find((field) => field.name === "booking_url")).toMatchObject({
      value: "Unknown",
      href: null,
    });
  });

  it.each(LANGUAGES)("describes an empty result as unknown (%s)", (language) => {
    const t = wavStrings[language];
    const tree = render({ availability: ["on_demand"] }, language);
    expect(text(all(tree).find((node) => node.props.role === "status") ?? "")).toBe(t.noRecords);
    expect(byType(tree, "ul")).toHaveLength(0);
    expect(text(tree)).toContain(t.availabilityHelp);
  });

  it("offers no control that selects Unknown as a positive filter", () => {
    const tree = render({}, "en");
    const boxes = byType(tree, "input").filter((node) => node.props.type === "checkbox");
    expect(boxes).toHaveLength(3);
    const typeOptions = byType([byId(tree, "wav-type") as HostNode], "option");
    expect(typeOptions.map((option) => option.props.value)).toEqual([
      "",
      "accessible_taxi",
      "on_demand_wav",
    ]);
  });

  it("reports filter changes to the host and can clear them", () => {
    const onFilterChange = vi.fn();
    const tree = render({ availability: ["limited"] }, "en", onFilterChange);
    const boxes = byType(tree, "input").filter((node) => node.props.type === "checkbox");
    expect(boxes.map((node) => node.props.checked)).toEqual([false, false, true]);
    (boxes[0]?.props.onChange as (event: unknown) => void)({ target: { checked: true } });
    expect(onFilterChange).toHaveBeenLastCalledWith({ availability: ["limited", "on_demand"] });
    (boxes[2]?.props.onChange as (event: unknown) => void)({ target: { checked: false } });
    expect(onFilterChange).toHaveBeenLastCalledWith({});
    const place = byId(tree, "wav-municipality");
    (place?.props.onChange as (event: unknown) => void)({
      target: { value: "SYNTHETIC Testville" },
    });
    expect(onFilterChange).toHaveBeenLastCalledWith({
      availability: ["limited"],
      municipality: "SYNTHETIC Testville",
    });
  });
});
