import { planJourney } from "@access-maps/journey";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { JourneyResult, RouteEvidencePanel, buildRouteEvidence, EVIDENCE_COPY } from "../src/index.js";
import { scenarioBus, scenarioUnknowns } from "../../journey/test/scenarios.js";

afterEach(() => cleanup());

describe("P15AB live journey integration", () => {
  it("exports RouteEvidencePanel from the map-ui barrel", () => {
    expect(typeof RouteEvidencePanel).toBe("function");
  });

  it("exports the pure model from the map-ui barrel", () => {
    expect(typeof buildRouteEvidence).toBe("function");
  });

  it("exports bilingual copy with the same keys", () => {
    expect(Object.keys(EVIDENCE_COPY.en).sort()).toEqual(Object.keys(EVIDENCE_COPY.fr).sort());
  });

  it("mounts the review directly inside journey results", () => {
    const actual = planJourney(scenarioBus());
    const view = render(<JourneyResult plan={actual} />);
    expect(within(view.container).getByRole("heading", { name: EVIDENCE_COPY.en.heading })).toBeTruthy();
  });

  it("retains the emergency link immediately after the results heading", () => {
    const actual = planJourney(scenarioBus());
    const view = render(<JourneyResult plan={actual} />);
    const heading = within(view.container).getByRole("heading", { name: "Journey results" });
    const emergency = within(view.container).getByRole("link", { name: "911" });
    expect(heading.nextElementSibling).toBe(emergency.parentElement);
  });

  it("does not expand the review without a user interaction", () => {
    const view = render(<JourneyResult plan={planJourney(scenarioUnknowns())} />);
    const panel = within(view.container).getByRole("region", { name: EVIDENCE_COPY.en.heading });
    expect(within(panel).getByRole("button", { name: EVIDENCE_COPY.en.review }).getAttribute("aria-expanded")).toBe("false");
  });

  it("offers a keyboard-operable review within a real plan", async () => {
    const user = userEvent.setup();
    const view = render(<JourneyResult plan={planJourney(scenarioBus())} />);
    const panel = within(view.container).getByRole("region", { name: EVIDENCE_COPY.en.heading });
    const button = within(panel).getByRole("button", { name: EVIDENCE_COPY.en.review });
    button.focus();
    await user.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows the evidence review even when the planner returns no routes", () => {
    const planned = planJourney(scenarioUnknowns());
    const actual = { ...planned, journeys: [], blocked: [] };
    const view = render(<JourneyResult plan={actual} />);
    const panel = within(view.container).getByRole("region", { name: EVIDENCE_COPY.en.heading });
    expect(within(panel).getByRole("button", { name: EVIDENCE_COPY.en.review })).toBeTruthy();
  });

  it("keeps the main map feature list available after adding the evidence panel", () => {
    const actual = planJourney(scenarioBus());
    const view = render(<JourneyResult plan={actual} />);
    expect(within(view.container).getByRole("list", { name: "Map features" })).toBeTruthy();
  });

  it("renders the review heading in French when the plan locale is French", () => {
    const actual = planJourney(scenarioBus({ locale: "fr" }));
    const view = render(<JourneyResult plan={actual} />);
    expect(within(view.container).getByRole("heading", { name: EVIDENCE_COPY.fr.heading })).toBeTruthy();
  });

  it("keeps the UNKNOWN token when reviewing unresolved routes", async () => {
    const actual = planJourney(scenarioUnknowns());
    render(<JourneyResult plan={actual} />);
    const panel = screen.getByRole("region", { name: EVIDENCE_COPY.en.heading });
    const button = within(panel).getByRole("button", { name: EVIDENCE_COPY.en.review });
    await userEvent.setup().click(button);
    expect(panel.textContent).toContain("UNKNOWN");
  });
});
