/**
 * Master plan, Part 5, Days 4 and 5: screen checks for the journey result.
 * Each test title starts with its check id from the access-help day catalogue.
 * Plans come from the labelled fixture scenarios in packages/journey/test/scenarios.ts.
 */
import { planJourney, type JourneyPlan } from "@access-maps/journey";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { JourneyResult } from "../src/index.js";
import { scenarioBus, scenarioStep, scenarioUnknowns } from "../../journey/test/scenarios.js";

afterEach(() => cleanup());

/** A minimal planner screen: a step-free switch, a Plan button, and the result. */
function Planner({ build }: { build: (required: boolean) => JourneyPlan }) {
  const [required, setRequired] = useState(true);
  const [plan, setPlan] = useState<JourneyPlan | null>(null);
  return (
    <main>
      <h1>Plan a journey</h1>
      <label>
        <input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /> Step-free required
      </label>
      <button type="button" onClick={() => setPlan(build(required))}>
        Plan
      </button>
      {plan ? <JourneyResult plan={plan} /> : null}
    </main>
  );
}

describe("Day 4 screen", () => {
  it("D04-3 the step-free setting is shown with the result, and says when it changes nothing", () => {
    const view = render(<JourneyResult plan={planJourney(scenarioStep({ stepFreeRequired: true }))} />);
    expect(screen.getByText(/^Step-free required: on\./)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Blocked options" })).toBeTruthy();
    expect(screen.queryByText(/does not change them/)).toBeNull();
    view.unmount();

    render(<JourneyResult plan={planJourney(scenarioStep({ stepFreeRequired: false }))} />);
    expect(screen.getByText(/^Step-free required: off\./)).toBeTruthy();
    expect(screen.getAllByText("▲ Not step-free").length).toBeGreaterThan(0);
    cleanup();

    render(<JourneyResult plan={planJourney(scenarioBus({ stepFreeRequired: true }))} />);
    expect(screen.getByText(/so this setting does not change them/)).toBeTruthy();
    cleanup();

    const french = render(<JourneyResult plan={planJourney(scenarioBus({ stepFreeRequired: true, locale: "fr" }))} />);
    expect(french.container.querySelector(".step-free-setting")?.textContent).toMatch(/^Sans marches exigé\u00A0: activé\./);
  });

  it("D04-5 planning works by keyboard, and focus moves to the results when they load", async () => {
    const user = userEvent.setup();
    render(<Planner build={(required) => planJourney(scenarioBus({ stepFreeRequired: required }))} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "Step-free required" }));
    await user.keyboard(" ");
    expect((screen.getByRole("checkbox", { name: "Step-free required" }) as HTMLInputElement).checked).toBe(false);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Plan" }));
    await user.keyboard("{Enter}");
    const results = screen.getByRole("heading", { name: "Journey results" });
    expect(document.activeElement).toBe(results);
    expect(results.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByText(/^Step-free required: off\./)).toBeTruthy();
  });
});

describe("Day 5 screen", () => {
  it("D05-5 the journey warning is reachable by keyboard and is announced", async () => {
    const input = scenarioUnknowns();
    const plan = planJourney({ ...input, data: { ...input.data, washrooms: [] } });
    const view = render(<JourneyResult plan={plan} />);
    const heading = screen.getByRole("heading", { name: "Journey results" });
    expect(document.activeElement).toBe(heading);

    // The live region is in the page before it is filled, then filled after mount.
    const region = view.container.querySelector('[role="status"]');
    expect(region).toBeTruthy();
    expect(region?.textContent).toBe("");
    await waitFor(() => expect(region?.textContent).toMatch(/washroom/i));

    // The warning section follows the focused heading in reading order and has its own heading.
    const warnings = screen.getByRole("region", { name: "Before you go" });
    expect(heading.compareDocumentPosition(warnings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warnings.textContent).toMatch(/washroom/i);

    // A screen reader user reaches it with heading navigation; a keyboard user reaches the next control after it.
    const after = view.container.querySelectorAll("a, button");
    const firstAfter = Array.from(after).find((node) => warnings.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(firstAfter).toBeTruthy();

    await act(async () => {});
    document.documentElement.lang = "en";
    const results = await axe.run(view.container, { rules: { region: { enabled: false } } });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
