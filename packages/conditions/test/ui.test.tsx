import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import reportFixture from "../fixtures/synthetic-route-reports.json";
import wavFixture from "../fixtures/synthetic-wav-services.json";
import { corroborateReports, validateReport } from "../src/reports";
import {
  EMPTY_REPORT_FORM,
  RouteReportForm,
  RouteReportFormView,
  RouteReportsList,
  localInputToIso,
  submitReportForm,
} from "../src/RouteReports";
import { ConditionsList } from "../src/ConditionsList";
import { strings } from "../src/strings";
import type { ConditionRecord, ObstacleDraft } from "../src/types";
import { WavFinder, WavFinderView } from "../src/WavFinder";
import { loadWavDataset, searchWav, wavMunicipalities } from "../src/wav";
import { reportStrings } from "../src/reportStrings";
import { wavStrings } from "../src/wavStrings";
import { reportGroupViews, wavItemViews } from "../src/viewModels";
import type { PhotoMeta, RouteReport } from "../src/reportTypes";
import type { WavFilter } from "../src/wavTypes";

// All records rendered here are synthetic fixtures.
const NOW = new Date("2026-11-15T12:00:00.000Z");
const LANGUAGES = ["en", "fr"] as const;
/** A local time that is before NOW in every time zone. */
const SEEN_LOCAL = "2026-11-14T05:30";

const reports: RouteReport[] = (reportFixture as unknown[]).map((item) => {
  const result = validateReport(item);
  if (!result.ok) throw new Error("fixture");
  return result.report;
});
const groups = corroborateReports(reports, NOW);
const wavRecords = loadWavDataset(wavFixture, "fixture");

afterEach(() => cleanup());

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

/**
 * Runs axe on the rendered markup. Colour contrast cannot be computed
 * without a layout engine, so that rule is off here.
 */
async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  expect(
    results.violations.map((violation) => `${violation.id}: ${violation.help}`),
  ).toEqual([]);
}

/** Every form control must have an accessible name from a label. */
function unnamedControls(container: HTMLElement): Element[] {
  return [...container.querySelectorAll("input, select, textarea")].filter(
    (control) => {
      const labels = (control as HTMLInputElement).labels;
      const named = labels && [...labels].some((label) => (label.textContent ?? "").trim());
      return !named && !control.getAttribute("aria-label");
    },
  );
}

function describedBy(element: Element): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? `missing:${id}`)
    .join(" | ");
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
      // Nothing a person reads about route reports uses the word.
      const all = leaves(reportStrings[language]).join(" ").toLowerCase();
      expect(all).not.toContain("verified");
      expect(all).not.toContain("v\u00e9rifi\u00e9");
      expect(reportStrings[language].tiers[0]).toMatch(/unconfirmed|non confirmé/);
      expect(reportStrings[language].tiers[2]).toMatch(/confirmed by|confirmé par/);
      expect(wavStrings[language].tiers[0]).toMatch(/not verified|non vérifié/);
      expect(wavStrings[language].tiers[1]).toMatch(/not verified|non vérifié/);
    }
  });
});

describe("route report list", () => {
  it.each(LANGUAGES)("renders state, tier and provenance as text (%s)", async (language) => {
    const t = reportStrings[language];
    const view = render(<RouteReportsList groups={groups} language={language} />);
    const section = screen.getByRole("region", { name: t.heading });
    expect(section.getAttribute("lang")).toBe(language);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(t.heading);
    const items = [...section.querySelectorAll(":scope > ul > li")];
    expect(items).toHaveLength(2);
    const bodies = items.map((item) => item.textContent ?? "");
    const snow = bodies.find((value) => value.startsWith(t.kinds.snowbank)) ?? "";
    expect(snow).toContain(t.states.active);
    expect(snow).toContain(t.tiers[2]);
    expect(snow).toContain(t.confirmedBy(2));
    expect(snow).toContain(t.sample);
    expect(snow).toContain("synthetic-test");
    expect(snow).toContain("CC0-1.0");
    expect(snow).toContain(t.photoAttached);
    expect(snow).toContain(t.confidenceNote);
    const ice = bodies.find((value) => value.startsWith(t.kinds.ice)) ?? "";
    expect(ice).toContain(t.states.expired);
    expect(ice).toContain(t.tiers[0]);
    expect(ice).not.toContain(t.confidence);
    expect(ice).not.toContain(t.confirmedBy(1).split(" ")[0]);
    expect(section.textContent).toContain(t.notCounted);
    expect((section.textContent ?? "").toLowerCase()).not.toMatch(/verified|vérifié/);
    expect(section.textContent).toContain(t.intro);
    await expectNoAxeViolations(view.container);
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
    const view = render(<RouteReportsList groups={[]} language={language} />);
    expect(view.container.textContent).toContain(reportStrings[language].empty);
    expect(view.container.querySelectorAll("ul")).toHaveLength(0);
  });
});

const context = {
  id: "form-ui-1",
  location: { type: "segment" as const, segment_id: "synthetic-segment-1" },
  source_id: "synthetic-test",
  licence: "CC0-1.0",
  reporter_ref: null,
  now: NOW,
};

describe("route report form view", () => {
  it.each(LANGUAGES)("names every control and groups the radios (%s)", (language) => {
    const t = reportStrings[language];
    const view = render(
      <RouteReportFormView
        language={language}
        locationLabel="SYNTHETIC corner"
        fields={EMPTY_REPORT_FORM}
        onChange={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByRole("form", { name: t.formHeading }).getAttribute("lang")).toBe(language);
    expect(unnamedControls(view.container)).toEqual([]);
    const group = screen.getByRole("group", { name: t.observationLegend });
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    const observed = screen.getByLabelText(t.observedLabel) as HTMLInputElement;
    expect(observed.type).toBe("datetime-local");
    expect(describedBy(observed)).toBe(t.observedHelp);
    const submit = screen.getByRole("button", { name: t.submit }) as HTMLButtonElement;
    expect(submit.type).toBe("submit");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
    expect(view.container.textContent).toContain(t.formIntro);
  });

  it("keeps targets at least 24 pixels", () => {
    const view = render(
      <RouteReportFormView
        locationLabel="SYNTHETIC corner"
        fields={EMPTY_REPORT_FORM}
        onChange={() => {}}
        onSubmit={() => {}}
      />,
    );
    const controls = [...view.container.querySelectorAll<HTMLElement>("input, select, button")];
    expect(controls.length).toBeGreaterThanOrEqual(6);
    for (const control of controls) {
      const size = Number.parseFloat(control.style.minHeight || control.style.height || "0");
      expect(size).toBeGreaterThanOrEqual(24);
    }
  });

  it.each(LANGUAGES)("announces a saved report and any warning (%s)", (language) => {
    const t = reportStrings[language];
    render(
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
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain(t.saved);
    expect(status.textContent).toContain(t.warnings.photo_time_differs);
  });

  it("turns a completed form into a tier 0 report with the stated time", () => {
    const result = submitReportForm(
      { kind: "snowbank", observation: "cleared", observedLocal: SEEN_LOCAL, role: "passerby", note: "" },
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.observed_at).toBe(new Date(SEEN_LOCAL).toISOString());
    expect(result.report.observation).toMatchObject({ value: "cleared", tier: 0 });
    expect(result.report).not.toHaveProperty("note");
  });

  it("does not guess a time from an unreadable control value", () => {
    expect(localInputToIso("")).toBe("");
    expect(localInputToIso("15/11/2026 05:30")).toBe("");
    expect(localInputToIso("2026-13-45T05:30")).toBe("");
  });
});

describe("route report form, operated end to end", () => {
  function mount(language: "en" | "fr", photo?: PhotoMeta) {
    const onSave = vi.fn<(report: RouteReport) => void>();
    let serial = 0;
    const view = render(
      <RouteReportForm
        language={language}
        location={context.location}
        locationLabel="SYNTHETIC corner"
        sourceId="synthetic-test"
        licence="CC0-1.0"
        reporterRef={null}
        {...(photo ? { photo } : {})}
        newId={() => `form-ui-${++serial}`}
        now={() => NOW}
        onSave={onSave}
      />,
    );
    return { view, onSave, user: userEvent.setup(), t: reportStrings[language] };
  }

  it.each(LANGUAGES)("reaches every control in reading order with Tab (%s)", async (language) => {
    const { user, t } = mount(language);
    const order: (Element | null)[] = [];
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      order.push(document.activeElement);
    }
    const group = screen.getByRole("group", { name: t.observationLegend });
    expect(order[0]).toBe(screen.getByLabelText(t.kindLabel));
    expect(group.contains(order[1] ?? null)).toBe(true);
    expect((order[1] as HTMLInputElement).type).toBe("radio");
    expect(order[2]).toBe(screen.getByLabelText(t.observedLabel));
    expect(order[3]).toBe(screen.getByLabelText(t.roleLabel));
    expect(order[4]).toBe(screen.getByLabelText(t.noteLabel));
    expect(order[5]).toBe(screen.getByRole("button", { name: t.submit }));
  });

  it.each(LANGUAGES)(
    "rejects an empty submission, announces the errors and moves focus to them (%s)",
    async (language) => {
      const { view, onSave, user, t } = mount(language);
      const submit = screen.getByRole("button", { name: t.submit });
      submit.focus();
      await user.keyboard("{Enter}");

      expect(onSave).not.toHaveBeenCalled();
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain(t.errorSummary);
      expect(alert.textContent).toContain(`${t.kindLabel}: ${t.errors.unknown_kind}`);
      expect(alert.textContent).toContain(
        `${t.observationLegend}: ${t.errors.unknown_observation}`,
      );
      expect(alert.textContent).toContain(`${t.observedLabel}: ${t.errors.invalid_time}`);
      expect(document.activeElement).toBe(alert);

      const kind = screen.getByLabelText(t.kindLabel);
      expect(kind.getAttribute("aria-invalid")).toBe("true");
      expect(describedBy(kind)).toBe(t.errors.unknown_kind);
      const observed = screen.getByLabelText(t.observedLabel);
      expect(observed.getAttribute("aria-invalid")).toBe("true");
      expect(describedBy(observed)).toBe(`${t.observedHelp} | ${t.errors.invalid_time}`);
      expect(describedBy(screen.getByRole("group", { name: t.observationLegend }))).toBe(
        t.errors.unknown_observation,
      );
      // Fields without an error are not marked.
      expect(screen.getByLabelText(t.roleLabel).getAttribute("aria-invalid")).toBeNull();
      expect(screen.getByLabelText(t.noteLabel).getAttribute("aria-invalid")).toBeNull();
      expect(screen.getByRole("status").textContent).toBe("");

      // The first field is the next Tab stop after the summary.
      await user.tab();
      expect(document.activeElement).toBe(kind);
      await expectNoAxeViolations(view.container);
    },
  );

  it.each(LANGUAGES)("moves focus to the summary again on a second rejection (%s)", async (language) => {
    const { onSave, user, t } = mount(language);
    const submit = screen.getByRole("button", { name: t.submit });
    submit.focus();
    await user.keyboard("{Enter}");
    await user.selectOptions(screen.getByLabelText(t.kindLabel), "ice");
    expect(screen.getByRole("alert").textContent).toContain(t.errors.unknown_kind);
    submit.focus();
    await user.keyboard("{Enter}");
    const alert = screen.getByRole("alert");
    expect(document.activeElement).toBe(alert);
    expect(alert.textContent).not.toContain(t.errors.unknown_kind);
    expect(alert.textContent).toContain(t.errors.unknown_observation);
    expect(screen.getByLabelText(t.kindLabel).getAttribute("aria-invalid")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each(LANGUAGES)(
    "saves a tier 0 report filled in from the keyboard and announces it (%s)",
    async (language) => {
      const { view, onSave, user, t } = mount(language);
      const kind = screen.getByLabelText(t.kindLabel) as HTMLSelectElement;
      await user.tab();
      expect(document.activeElement).toBe(kind);
      await user.selectOptions(kind, "snowbank");
      await user.tab();
      await user.keyboard(" ");
      const present = screen.getByRole("radio", { name: t.observations.present }) as HTMLInputElement;
      expect(present.checked).toBe(true);
      await user.tab();
      const observed = screen.getByLabelText(t.observedLabel) as HTMLInputElement;
      expect(document.activeElement).toBe(observed);
      // A date-and-time control has no typed-text form in this DOM; its
      // value is set the way the control itself reports a completed entry.
      fireEvent.change(observed, { target: { value: SEEN_LOCAL } });
      await user.tab();
      await user.selectOptions(screen.getByLabelText(t.roleLabel), "wheelchair_user");
      await user.tab();
      await user.keyboard("SYNTHETIC note  ");
      await user.tab();
      const submit = screen.getByRole("button", { name: t.submit });
      expect(document.activeElement).toBe(submit);
      await user.keyboard("{Enter}");

      expect(onSave).toHaveBeenCalledTimes(1);
      const report = onSave.mock.calls[0]?.[0];
      expect(validateReport(report).ok).toBe(true);
      expect(report).toMatchObject({
        id: "form-ui-1",
        kind: "snowbank",
        location: context.location,
        observed_at: new Date(SEEN_LOCAL).toISOString(),
        observation: {
          value: "present",
          source_id: "synthetic-test",
          licence: "CC0-1.0",
          retrieved_at: NOW.toISOString(),
          tier: 0,
        },
        reporter: { role: "wheelchair_user", ref: null },
        note: "SYNTHETIC note",
      });

      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("status").textContent).toBe(t.saved);
      // Focus stays on the button that was used; it is not lost to the page.
      expect(document.activeElement).toBe(submit);
      // The form is ready for another report.
      expect(kind.value).toBe("");
      expect(present.checked).toBe(false);
      expect(observed.value).toBe("");
      expect((screen.getByLabelText(t.noteLabel) as HTMLTextAreaElement).value).toBe("");
      await expectNoAxeViolations(view.container);

      // Editing again withdraws the saved message.
      await user.selectOptions(kind, "ice");
      expect(screen.getByRole("status").textContent).toBe("");
    },
  );

  it.each(LANGUAGES)("clears the errors once a corrected report is saved (%s)", async (language) => {
    const { onSave, user, t } = mount(language);
    const submit = screen.getByRole("button", { name: t.submit });
    submit.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(t.kindLabel), "obstruction");
    await user.click(screen.getByRole("radio", { name: t.observations.cleared }));
    fireEvent.change(screen.getByLabelText(t.observedLabel), { target: { value: SEEN_LOCAL } });
    await user.click(submit);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      kind: "obstruction",
      observation: { value: "cleared", tier: 0 },
      reporter: { role: "UNKNOWN" },
    });
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("note");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText(t.kindLabel).getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(t.saved);
  });

  it.each(LANGUAGES)("rejects a time after the moment of saving (%s)", async (language) => {
    const { onSave, user, t } = mount(language);
    await user.selectOptions(screen.getByLabelText(t.kindLabel), "ice");
    await user.click(screen.getByRole("radio", { name: t.observations.present }));
    fireEvent.change(screen.getByLabelText(t.observedLabel), {
      target: { value: "2026-11-17T05:30" },
    });
    await user.click(screen.getByRole("button", { name: t.submit }));
    expect(onSave).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t.errors.saved_before_observed);
    expect(document.activeElement).toBe(alert);
    // What the person entered is kept so it can be corrected.
    expect((screen.getByLabelText(t.kindLabel) as HTMLSelectElement).value).toBe("ice");
    expect((screen.getByLabelText(t.observedLabel) as HTMLInputElement).value).toBe(
      "2026-11-17T05:30",
    );
  });

  it.each(LANGUAGES)("keeps the stated time and warns when a photo time differs (%s)", async (language) => {
    const photo: PhotoMeta = {
      handle: "local-photo-9",
      media_type: "image/jpeg",
      captured_at: "2026-11-10T00:00:00.000Z",
      width_px: 800,
      height_px: 600,
    };
    const { onSave, user, t } = mount(language, photo);
    await user.selectOptions(screen.getByLabelText(t.kindLabel), "surface");
    await user.click(screen.getByRole("radio", { name: t.observations.present }));
    fireEvent.change(screen.getByLabelText(t.observedLabel), { target: { value: SEEN_LOCAL } });
    await user.click(screen.getByRole("button", { name: t.submit }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0].observed_at).toBe(new Date(SEEN_LOCAL).toISOString());
    const status = screen.getByRole("status").textContent ?? "";
    expect(status).toContain(t.saved);
    expect(status).toContain(t.warnings.photo_time_differs);
  });

  it.each(LANGUAGES)("has no axe violations before any input (%s)", async (language) => {
    const { view } = mount(language);
    await expectNoAxeViolations(view.container);
  });
});

describe("WAV finder view", () => {
  function show(filter: WavFilter, language: "en" | "fr", onFilterChange = vi.fn()) {
    return render(
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
    const view = show({}, language);
    const section = screen.getByRole("region", { name: t.heading });
    expect(section.getAttribute("lang")).toBe(language);
    expect(unnamedControls(view.container)).toEqual([]);
    const items = [...section.querySelectorAll(":scope > ul > li")];
    expect(items).toHaveLength(4);
    const body = items.map((item) => item.textContent ?? "");
    expect(body.every((value) => value.includes(t.sample))).toBe(true);
    expect(body[0]).toContain(t.availability.advance_booking_only);
    expect(body[1]).toContain(`${t.fields.availability}: ${t.unknown}`);
    expect(body[2]).toContain(t.availability.effectively_unavailable);
    expect(body[2]).toContain(t.datedSource);
    expect(body[3]).toContain(t.staleAvailability);
    expect(body[0]).not.toContain(t.staleAvailability);
    for (const item of items) {
      const rows = [...item.querySelectorAll("dd")];
      expect(rows).toHaveLength(7);
      for (const row of rows) {
        const value = row.textContent ?? "";
        expect(value).toContain(`${t.source}: synthetic-test`);
        expect(value).toContain(`${t.licence}: CC0-1.0`);
        expect(value).toContain(t.retrieved);
        expect(value).toContain(t.tiers[1]);
      }
    }
    expect(screen.getByRole("status").textContent).toBe(t.resultCount(4));
  });

  it("links only a stated https booking address", () => {
    show({}, "en");
    const links = screen.getAllByRole("link") as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://synthetic.invalid/book",
    ]);
    const views = wavItemViews(searchWav(wavRecords, {}, NOW).items, "en");
    expect(views[1]?.fields.find((field) => field.name === "booking_url")).toMatchObject({
      value: "Unknown",
      href: null,
    });
  });

  it("offers no control that selects Unknown as a positive filter", () => {
    const t = wavStrings.en;
    show({}, "en");
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    const type = screen.getByLabelText(t.typeFilter) as HTMLSelectElement;
    expect([...type.options].map((option) => option.value)).toEqual([
      "",
      "accessible_taxi",
      "on_demand_wav",
    ]);
  });

  it("keeps targets at least 24 pixels", () => {
    const view = show({}, "en");
    for (const control of view.container.querySelectorAll<HTMLElement>("input, select")) {
      const size = Number.parseFloat(control.style.minHeight || control.style.height || "0");
      expect(size).toBeGreaterThanOrEqual(24);
    }
  });
});

describe("WAV finder, operated end to end", () => {
  function mount(language: "en" | "fr") {
    const view = render(<WavFinder records={wavRecords} language={language} now={NOW} />);
    const t = wavStrings[language];
    const section = screen.getByRole("region", { name: t.heading });
    const names = () =>
      [...section.querySelectorAll(":scope > ul > li > h3")].map((item) => item.textContent);
    return { view, t, names, user: userEvent.setup() };
  }

  it.each(LANGUAGES)("lists every record before any filter, with no axe violations (%s)", async (language) => {
    const { view, t, names } = mount(language);
    expect(names()).toEqual([
      "SYNTHETIC Sample Cab A",
      "SYNTHETIC Sample Cab B",
      "SYNTHETIC Sample Cab C",
      "SYNTHETIC Sample Cab D",
    ]);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe(t.resultCount(4));
    await expectNoAxeViolations(view.container);
  });

  it.each(LANGUAGES)("reaches every filter in reading order with Tab (%s)", async (language) => {
    const { t, user } = mount(language);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText(t.municipalityFilter));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText(t.typeFilter));
    for (const value of ["on_demand", "advance_booking_only", "limited"] as const) {
      await user.tab();
      expect(document.activeElement).toBe(
        screen.getByRole("checkbox", { name: t.usableFilter[value] }),
      );
    }
    const group = screen.getByRole("group", { name: t.availabilityLegend });
    expect(describedBy(group)).toBe(t.availabilityHelp);
  });

  it.each(LANGUAGES)(
    "filters by availability from the keyboard and announces each result (%s)",
    async (language) => {
      const { view, t, names, user } = mount(language);
      const status = screen.getByRole("status");
      const advance = screen.getByRole("checkbox", {
        name: t.usableFilter.advance_booking_only,
      }) as HTMLInputElement;
      advance.focus();
      await user.keyboard(" ");
      expect(advance.checked).toBe(true);
      expect(names()).toEqual(["SYNTHETIC Sample Cab A"]);
      expect(status.textContent).toBe(t.resultCount(1));
      // Focus stays on the control that was used.
      expect(document.activeElement).toBe(advance);

      // The only "on demand" statement is out of date: it never matches.
      const onDemand = screen.getByRole("checkbox", {
        name: t.usableFilter.on_demand,
      }) as HTMLInputElement;
      await user.keyboard(" ");
      expect(advance.checked).toBe(false);
      onDemand.focus();
      await user.keyboard(" ");
      expect(onDemand.checked).toBe(true);
      expect(names()).toEqual([]);
      expect(status.textContent).toBe(t.noRecords);
      expect(view.container.querySelectorAll("ul")).toHaveLength(0);
      expect(document.activeElement).toBe(onDemand);
      await expectNoAxeViolations(view.container);

      // Clearing the box brings back every record, unknown ones included.
      await user.keyboard(" ");
      expect(names()).toHaveLength(4);
      expect(status.textContent).toBe(t.resultCount(4));
    },
  );

  it.each(LANGUAGES)("combines municipality, type and availability filters (%s)", async (language) => {
    const { t, names, user } = mount(language);
    const place = screen.getByLabelText(t.municipalityFilter) as HTMLSelectElement;
    const type = screen.getByLabelText(t.typeFilter) as HTMLSelectElement;
    expect([...place.options].map((option) => option.value)).toEqual([
      "",
      ...wavMunicipalities(wavRecords),
    ]);
    await user.selectOptions(place, "SYNTHETIC Testville");
    expect(names()).toEqual([
      "SYNTHETIC Sample Cab A",
      "SYNTHETIC Sample Cab B",
      "SYNTHETIC Sample Cab D",
    ]);
    expect(screen.getByRole("status").textContent).toBe(t.resultCount(3));
    await user.selectOptions(type, "on_demand_wav");
    expect(names()).toEqual(["SYNTHETIC Sample Cab B"]);
    // Cab B's availability is unknown, so a positive filter leaves it out.
    await user.click(screen.getByRole("checkbox", { name: t.usableFilter.limited }));
    expect(names()).toEqual([]);
    expect(screen.getByRole("status").textContent).toBe(t.noRecords);
    await user.click(screen.getByRole("checkbox", { name: t.usableFilter.limited }));
    await user.selectOptions(type, "");
    await user.selectOptions(place, "");
    expect(names()).toHaveLength(4);
    expect(place.value).toBe("");
    expect(type.value).toBe("");
  });
});

describe("conditions list, operated end to end", () => {
  const fetched = "2026-11-15T11:00:00.000Z";
  const fact = { source_id: "synthetic-test", licence: "CC0" as const, retrieved_at: fetched, tier: 1 as const };
  const records: ConditionRecord[] = [
    {
      id: "synthetic-test:1",
      type: "ice",
      point: { lat: 43.85, lon: -79.45 },
      fact: { ...fact, value: "SYNTHETIC ice" },
      last_fetched: fetched,
      last_checked: null,
      expiry_hours: 3,
    },
    {
      id: "synthetic-test:2",
      type: "construction",
      point: { lat: 43.86, lon: -79.45 },
      fact: { ...fact, value: "UNKNOWN" },
      last_fetched: "2026-11-10T11:00:00.000Z",
      last_checked: null,
      expiry_hours: 3,
    },
  ];
  const drafts: ObstacleDraft[] = [
    {
      id: "synthetic-draft:1",
      type: "snowbank",
      point: { lat: 43.85, lon: -79.45 },
      note: "SYNTHETIC draft",
      observed_at: fetched,
      verified_by_person: false,
      tier: 0,
    },
  ];

  it.each(LANGUAGES)("filters by type, marks old records and refuses an unchecked export (%s)", async (language) => {
    const t = strings[language];
    const user = userEvent.setup();
    const view = render(
      <ConditionsList records={records} drafts={drafts} language={language} now={NOW} />,
    );
    const section = screen.getByRole("region", { name: t.heading });
    expect(section.getAttribute("lang")).toBe(language);
    const items = () => [...section.querySelectorAll(":scope > ul > li")].map((item) => item.textContent ?? "");
    expect(items()).toHaveLength(2);
    expect(items()[0]).toContain("SYNTHETIC ice");
    expect(items()[0]).not.toContain(t.needsCheck);
    expect(items()[0]).toContain("synthetic-test");
    expect(items()[0]).toContain("CC0");
    expect(items()[1]).toContain(t.needsCheck);
    expect(items()[1]).toContain(t.unknown);
    await expectNoAxeViolations(view.container);

    await user.selectOptions(screen.getByLabelText(t.filter), "construction");
    expect(items()).toHaveLength(1);
    expect(items()[0]).toContain(t.types.construction);
    await user.selectOptions(screen.getByLabelText(t.filter), "snowbank");
    expect(items()).toHaveLength(0);
    expect(section.textContent).toContain(t.empty);

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    expect((screen.getByRole("checkbox", { name: t.verify }) as HTMLInputElement).checked).toBe(false);
    const button = screen.getByRole("button", { name: t.export });
    button.focus();
    await user.keyboard("{Enter}");
    expect(status.textContent).toBe(t.noVerified);
    expect(document.activeElement).toBe(button);
  });
});
