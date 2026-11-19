import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouteEvidencePanel } from "../src/RouteEvidencePanel.js";
import { EVIDENCE_COPY } from "../src/routeEvidence.js";
import { barredLeg, journey, leg, plan, uncertainLeg, varyingPlan } from "./routeEvidenceFixtures.js";

afterEach(() => cleanup());

function reveal(): void {
  fireEvent.click(screen.getByRole("button", { name: "Inspect route evidence" }));
}

function renderOpen() {
  return render(<RouteEvidencePanel plan={varyingPlan()} initiallyOpen />);
}

describe("P15AB evidence panel accessibility", () => {
  it("is collapsed by default, preserving initial journey focus", () => {
    render(<RouteEvidencePanel plan={plan()} />);
    expect(screen.getByRole("button", { name: "Inspect route evidence" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Order options")).toBeNull();
  });

  it("opens when the heading's disclosure control is selected", () => {
    render(<RouteEvidencePanel plan={plan()} />);
    reveal();
    expect(screen.getByRole("button", { name: "Hide evidence details" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Order options")).toBeTruthy();
  });

  it("closes the evidence panel again without removing the heading", () => {
    render(<RouteEvidencePanel plan={plan()} />);
    reveal();
    fireEvent.click(screen.getByRole("button", { name: "Hide evidence details" }));
    expect(screen.getByRole("heading", { name: "Route evidence and uncertainty" })).toBeTruthy();
    expect(screen.queryByLabelText("Order options")).toBeNull();
  });

  it("can be opened from a keyboard activation", async () => {
    const user = userEvent.setup();
    render(<RouteEvidencePanel plan={plan()} />);
    const button = screen.getByRole("button", { name: "Inspect route evidence" });
    button.focus();
    await user.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("retains a readable section even when no options were produced", () => {
    render(<RouteEvidencePanel plan={plan([])} initiallyOpen />);
    expect(screen.getByText("No route options were provided.")).toBeTruthy();
  });

  it("explains that UNKNOWN is not a positive accessibility statement", () => {
    renderOpen();
    expect(screen.getByText(/UNKNOWN does not mean accessible/)).toBeTruthy();
  });

  it("includes an explicit non-advice limitation", () => {
    renderOpen();
    expect(screen.getByText(/not personal or medical recommendations/)).toBeTruthy();
  });

  it("labels filters as a group for assistive technology", () => {
    renderOpen();
    expect(screen.getByRole("group", { name: "Items needing a closer look" })).toBeTruthy();
  });

  it("labels each filter by a visible name", () => {
    renderOpen();
    expect(screen.getByLabelText("Direction")).toBeTruthy();
    expect(screen.getByLabelText("Issue level")).toBeTruthy();
    expect(screen.getByLabelText("Issue type")).toBeTruthy();
    expect(screen.getByLabelText("Search route issues")).toBeTruthy();
  });

  it("renders every route option as a named section", () => {
    renderOpen();
    expect(screen.getByRole("region", { name: "Options: Fictional route full" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Options: Fictional route conditional" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Options: Fictional route barrier" })).toBeTruthy();
  });

  it("includes explicit UNKNOWN text instead of relying on colour", () => {
    const view = renderOpen();
    expect(view.container.textContent).toContain("UNKNOWN");
  });

  it("supports reduced-motion friendly markup without forced scrolling", () => {
    const view = renderOpen();
    expect(view.container.querySelector(".route-evidence-option-list")).toBeTruthy();
    expect(view.container.querySelector(".route-evidence-scroll")).toBeTruthy();
  });
});

describe("P15AB issue filters", () => {
  it("offers both travel directions", () => {
    renderOpen();
    const select = screen.getByLabelText("Direction") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["all", "outbound", "return"]);
  });

  it("offers all issue severity levels", () => {
    renderOpen();
    const select = screen.getByLabelText("Issue level") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["all", "blocking", "caution", "information"]);
  });

  it("offers an access category for focused reviews", () => {
    renderOpen();
    const select = screen.getByLabelText("Issue type") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toContain("access");
  });

  it("filters cautions without removing route sections", () => {
    const view = renderOpen();
    fireEvent.change(screen.getByLabelText("Issue level"), { target: { value: "caution" } });
    expect(view.container.querySelectorAll(".route-evidence-option")).toHaveLength(4);
    expect(view.container.querySelectorAll(".route-evidence-blocking")).toHaveLength(0);
  });

  it("filters blocking findings independently", () => {
    const view = renderOpen();
    fireEvent.change(screen.getByLabelText("Issue level"), { target: { value: "blocking" } });
    expect(view.container.querySelectorAll(".route-evidence-caution")).toHaveLength(0);
    expect(view.container.querySelectorAll(".route-evidence-blocking").length).toBeGreaterThan(0);
  });

  it("filters by outbound direction", () => {
    const view = renderOpen();
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "outbound" } });
    expect(view.container.querySelectorAll(".route-evidence-issue").length).toBeGreaterThan(0);
    expect(Array.from(view.container.querySelectorAll(".route-evidence-issue")).every((item) => item.textContent?.includes("Outbound"))).toBe(true);
  });

  it("filters by return direction", () => {
    const view = renderOpen();
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "return" } });
    expect(view.container.querySelectorAll(".route-evidence-issue").length).toBeGreaterThan(0);
    expect(Array.from(view.container.querySelectorAll(".route-evidence-issue")).every((item) => item.textContent?.includes("Return"))).toBe(true);
  });

  it("searches issue codes and texts without network requests", () => {
    const view = renderOpen();
    fireEvent.change(screen.getByLabelText("Search route issues"), { target: { value: "GRADIENT_UNKNOWN" } });
    const findings = Array.from(view.container.querySelectorAll(".route-evidence-issue"));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((item) => item.textContent?.includes("gradient"))).toBe(true);
  });

  it("shows the no-match message when a filter matches no issue", () => {
    renderOpen();
    fireEvent.change(screen.getByLabelText("Search route issues"), { target: { value: "unrelated search" } });
    expect(screen.getAllByText("No issues match these filters.").length).toBeGreaterThan(0);
  });

  it("restores all filters after Clear filters", () => {
    renderOpen();
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "return" } });
    fireEvent.change(screen.getByLabelText("Issue level"), { target: { value: "blocking" } });
    fireEvent.change(screen.getByLabelText("Search route issues"), { target: { value: "missing" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect((screen.getByLabelText("Direction") as HTMLSelectElement).value).toBe("all");
    expect((screen.getByLabelText("Issue level") as HTMLSelectElement).value).toBe("all");
    expect((screen.getByLabelText("Search route issues") as HTMLInputElement).value).toBe("");
  });

  it("does not replace the underlying option summary when filtering", () => {
    const view = renderOpen();
    const before = view.container.querySelectorAll(".route-evidence-option").length;
    fireEvent.change(screen.getByLabelText("Issue level"), { target: { value: "information" } });
    expect(view.container.querySelectorAll(".route-evidence-option")).toHaveLength(before);
  });
});

describe("P15AB option comparisons", () => {
  it("provides a control to select each route option", () => {
    renderOpen();
    expect(screen.getAllByRole("button", { name: "Compare route options" })).toHaveLength(4);
  });

  it("marks a selected option with aria-pressed", () => {
    renderOpen();
    const buttons = screen.getAllByRole("button", { name: "Compare route options" });
    fireEvent.click(buttons[0]!);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
  });

  it("deselects an option on repeated activation", () => {
    renderOpen();
    const buttons = screen.getAllByRole("button", { name: "Compare route options" });
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[0]!);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a comparison when two distinct options are selected", () => {
    renderOpen();
    const buttons = screen.getAllByRole("button", { name: "Compare route options" });
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[1]!);
    expect(screen.getByRole("region", { name: "Why this option differs" })).toBeTruthy();
  });

  it("compares recorded option statuses", () => {
    renderOpen();
    const buttons = screen.getAllByRole("button", { name: "Compare route options" });
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[2]!);
    const region = screen.getByRole("region", { name: "Why this option differs" });
    expect(within(region).getByText("Recorded status")).toBeTruthy();
  });

  it("uses a selectable sort control", () => {
    renderOpen();
    fireEvent.change(screen.getByLabelText("Order options"), { target: { value: "uncertainty" } });
    expect((screen.getByLabelText("Order options") as HTMLSelectElement).value).toBe("uncertainty");
  });

  it("can return to original route order", () => {
    renderOpen();
    fireEvent.change(screen.getByLabelText("Order options"), { target: { value: "distance" } });
    fireEvent.change(screen.getByLabelText("Order options"), { target: { value: "original" } });
    expect(screen.getAllByRole("button", { name: "Compare route options" })).toHaveLength(4);
  });
});

describe("P15AB segment and provenance details", () => {
  it("starts detailed segments collapsed", () => {
    const view = renderOpen();
    expect(view.container.querySelectorAll("details[open]")).toHaveLength(0);
  });

  it("exposes local segment details using a native details element", () => {
    const view = render(<RouteEvidencePanel plan={plan([journey("one", [leg("ab")])])} initiallyOpen />);
    const details = view.container.querySelector("details");
    expect(details).toBeTruthy();
    expect(details?.querySelector("summary")?.textContent).toBe("Segment");
  });

  it("includes a source licence and observed date in segment details", () => {
    const view = render(<RouteEvidencePanel plan={plan([journey("one", [leg("ab")])])} initiallyOpen />);
    expect(view.container.textContent).toContain("OGL-ON-1.0");
    expect(view.container.textContent).toContain("2026-11-18");
  });

  it("shows a route barrier in both the summary and the segment", () => {
    const view = render(<RouteEvidencePanel plan={plan([journey("barrier", [barredLeg("stairs")])])} initiallyOpen />);
    expect(view.container.querySelector(".route-evidence-outcome-blocked")).toBeTruthy();
    expect(view.container.querySelector(".route-evidence-status-no")).toBeTruthy();
  });

  it("marks an unknown segment without pretending it is a positive fact", () => {
    const view = render(<RouteEvidencePanel plan={plan([journey("unknown", [uncertainLeg("missing")])])} initiallyOpen />);
    expect(view.container.querySelector(".route-evidence-status-unknown")).toBeTruthy();
    expect(view.container.textContent).toContain("UNKNOWN");
  });

  it("shows explicit unknown source dates", () => {
    const view = render(<RouteEvidencePanel plan={plan([journey("unknown", [uncertainLeg("missing")])])} initiallyOpen />);
    expect(view.container.textContent).toContain("UNKNOWN");
  });
});

describe("P15AB local JSON export", () => {
  it("emits JSON through an explicit callback", () => {
    const exported = vi.fn();
    render(<RouteEvidencePanel plan={plan()} initiallyOpen onExport={exported} />);
    fireEvent.click(screen.getByRole("button", { name: "Save local review JSON" }));
    expect(exported).toHaveBeenCalledOnce();
    expect(JSON.parse(exported.mock.calls[0]?.[0] as string)).toHaveProperty("schemaVersion", 1);
  });

  it("does not invoke export automatically when mounted", () => {
    const exported = vi.fn();
    render(<RouteEvidencePanel plan={plan()} initiallyOpen onExport={exported} />);
    expect(exported).not.toHaveBeenCalled();
  });

  it("does not require an export callback for local review", () => {
    render(<RouteEvidencePanel plan={plan()} initiallyOpen />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Save local review JSON" }))).not.toThrow();
  });

  it("announces that a local report is prepared", () => {
    render(<RouteEvidencePanel plan={plan()} initiallyOpen />);
    fireEvent.click(screen.getByRole("button", { name: "Save local review JSON" }));
    expect(screen.getByRole("status").textContent).toContain("Review prepared for local export");
  });

  it("does not include private profile information in the callback", () => {
    const exported = vi.fn();
    render(<RouteEvidencePanel plan={plan()} initiallyOpen onExport={exported} />);
    fireEvent.click(screen.getByRole("button", { name: "Save local review JSON" }));
    expect(exported.mock.calls[0]?.[0]).not.toContain("registrations");
  });

  it("does not upload or fetch during the user-triggered review", () => {
    const exported = vi.fn();
    render(<RouteEvidencePanel plan={plan()} initiallyOpen onExport={exported} />);
    fireEvent.click(screen.getByRole("button", { name: "Save local review JSON" }));
    expect(exported).toHaveBeenCalledOnce();
  });
});

describe("P15AB French interface", () => {
  const frenchPlan = plan([journey("fr", [uncertainLeg("missing")])], [], { locale: "fr" });

  it("has a French heading", () => {
    render(<RouteEvidencePanel plan={frenchPlan} />);
    expect(screen.getByRole("heading", { name: EVIDENCE_COPY.fr.heading })).toBeTruthy();
  });

  it("opens using a French-labelled button", () => {
    render(<RouteEvidencePanel plan={frenchPlan} />);
    fireEvent.click(screen.getByRole("button", { name: EVIDENCE_COPY.fr.review }));
    expect(screen.getByLabelText(EVIDENCE_COPY.fr.sort)).toBeTruthy();
  });

  it("shows UNKNOWN unchanged in the French details", () => {
    const view = render(<RouteEvidencePanel plan={frenchPlan} initiallyOpen />);
    expect(view.container.textContent).toContain("UNKNOWN");
  });

  it("uses French direction labels", () => {
    render(<RouteEvidencePanel plan={frenchPlan} initiallyOpen />);
    const select = screen.getByLabelText(EVIDENCE_COPY.fr.direction) as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(["Tous", "Aller", "Retour"]);
  });

  it("uses French issue severity labels", () => {
    render(<RouteEvidencePanel plan={frenchPlan} initiallyOpen />);
    const select = screen.getByLabelText(EVIDENCE_COPY.fr.severity) as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toContain("À examiner");
  });

  it("uses French export copy", () => {
    render(<RouteEvidencePanel plan={frenchPlan} initiallyOpen />);
    expect(screen.getByRole("button", { name: EVIDENCE_COPY.fr.save })).toBeTruthy();
  });

  it("does not replace the UNKNOWN data token with a positive status", () => {
    const view = render(<RouteEvidencePanel plan={frenchPlan} initiallyOpen />);
    expect(view.container.textContent).toContain("UNKNOWN");
    expect(view.container.textContent).not.toContain("Step-free");
  });
});
