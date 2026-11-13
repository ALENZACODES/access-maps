import { hoursBetween } from "./geo.js";
import { barrier, unknownAssessment } from "./stepfree.js";
import type { ElevatorAsset } from "./catalog.js";
import type { Provenance, StepFreeAssessment, Warning } from "./types.js";
import { copy, type Copy } from "./explain.js";
import { UNKNOWN } from "./records.js";
import type { Locale } from "./types.js";

const FRESH_HOURS = 1;
const STALE_HOURS = 4;
const CORRELATION_WINDOW_MINUTES = 30;
const CORRELATION_COUNT = 3;

export interface StopAccessResult {
  assessment: StepFreeAssessment;
  /** Provenance of the observation that decided the status. Not the GTFS boarding field. */
  provenance: Provenance;
  singlePointOfFailure: boolean;
  warnings: Warning[];
  note: string;
  phones: string[];
  /** Network ids whose elevators were out and fresh enough to count. */
  outNetworkIds: string[];
}

type AgedState = "working" | "out" | "unknown";

export interface EffectiveElevator {
  asset: ElevatorAsset;
  state: AgedState;
  stale: boolean;
  future: boolean;
  lastChecked: boolean;
  conflict: boolean;
  /** True when an out state comes from an observation that is not future-dated and not older than four hours. */
  freshOut: boolean;
  provenance: Provenance;
  feedState: AgedState;
  reportState: AgedState | null;
}

function ageObservation(
  observedAt: string,
  raw: "working" | "out" | "unknown",
  nowIso: string,
): { state: AgedState; stale: boolean; future: boolean; lastChecked: boolean } {
  const age = hoursBetween(observedAt, nowIso);
  if (age === null || age < 0 || raw === "unknown") {
    return { state: "unknown", stale: false, future: age !== null && age < 0, lastChecked: false };
  }
  if (age > STALE_HOURS) {
    return { state: "unknown", stale: true, future: false, lastChecked: false };
  }
  return { state: raw, stale: false, future: false, lastChecked: age > FRESH_HOURS };
}

export function effectiveElevator(asset: ElevatorAsset, nowIso: string): EffectiveElevator {
  const status = asset.status;
  if (!status || status.source === "none") {
    return {
      asset,
      state: "unknown",
      stale: false,
      future: false,
      lastChecked: false,
      conflict: false,
      freshOut: false,
      provenance: asset.provenance,
      feedState: "unknown",
      reportState: null,
    };
  }
  const feed = ageObservation(status.observedAt, status.state, nowIso);
  const report = status.userReport
    ? ageObservation(status.userReport.observedAt, status.userReport.state, nowIso)
    : null;
  const reportSaysOut = report?.state === "out";
  const feedSaysOut = feed.state === "out";
  const state: AgedState = reportSaysOut || feedSaysOut ? "out" : feed.state === "working" && (!report || report.state === "working") ? "working" : "unknown";
  const conflict = Boolean(
    report &&
      ((feed.state === "working" && report.state === "out") ||
        (feed.state === "out" && report.state === "working") ||
        (feed.state !== "unknown" && report.state !== "unknown" && feed.state !== report.state)),
  );
  const provenance =
    reportSaysOut && status.userReport
      ? status.userReport.provenance
      : status.provenance;
  const freshOut =
    state === "out" &&
    ((feed.state === "out" && !feed.stale && !feed.future) ||
      (report?.state === "out" && !report.stale && !report.future));
  return {
    asset,
    state,
    stale: feed.stale || Boolean(report?.stale),
    future: feed.future || Boolean(report?.future),
    lastChecked: state === "working" && (feed.lastChecked || Boolean(report?.lastChecked)),
    conflict,
    freshOut,
    provenance,
    feedState: feed.state,
    reportState: report ? report.state : null,
  };
}

export function assessElevatorsAtStop(
  elevators: ElevatorAsset[],
  nowIso: string,
  locale: Locale,
): StopAccessResult {
  const text = copy(locale);
  if (elevators.length === 0) {
    return {
      assessment: unknownAssessment("elevator-unknown"),
      provenance: unknownProvenance(text.elevatorUnknown),
      singlePointOfFailure: false,
      warnings: [],
      note: text.elevatorUnknown,
      phones: [],
      outNetworkIds: [],
    };
  }

  const effective = elevators.map((asset) => effectiveElevator(asset, nowIso));
  const phones = unique(elevators.map((asset) => asset.helpPhone).filter((phone): phone is string => Boolean(phone)));
  const phoneNote = phones.length > 0 ? phones.join(", ") : text.phoneUnknown;
  const working = effective.filter((item) => item.state === "working");
  const out = effective.filter((item) => item.state === "out");
  const single = elevators.length === 1 && !elevators[0]?.alternateStepFree;

  const warnings: Warning[] = [];
  if (single) {
    warnings.push({
      code: "single-point-of-failure",
      beforeCommit: true,
      text: text.singleElevator,
      phones,
    });
  }
  for (const item of effective) {
    if (!item.conflict || !item.asset.status?.userReport) continue;
    warnings.push({
      code: "status-conflict",
      beforeCommit: true,
      text: text.conflict(item.asset.status.observedAt, item.asset.status.userReport.observedAt),
      phones,
    });
  }

  const outNetworkIds = out.map((item) => item.asset.networkId);
  const described = effective.map((item) => describeElevator(text, item)).join(" ");
  const deciding = out[0] ?? effective.find((item) => item.state !== "working") ?? effective[0];

  if (out.length > 0) {
    const conflict = effective.some((item) => item.conflict);
    return {
      assessment: barrier(
        conflict ? "status-conflict" : "elevator-out",
        deciding?.provenance.tier ?? null,
        out.map((item) => `elevator-out:${item.asset.id}`),
      ),
      provenance: deciding?.provenance ?? unknownProvenance(text.elevatorOut),
      singlePointOfFailure: single,
      warnings,
      note: `${text.elevatorOut} ${described} ${phoneNote} ${text.alternateMissing}`,
      phones,
      outNetworkIds,
    };
  }

  if (working.length !== elevators.length) {
    const future = effective.some((item) => item.future);
    const stale = effective.some((item) => item.stale);
    const reason = future ? "elevator-future" : stale ? "elevator-stale" : "elevator-unknown";
    const lead = future ? text.elevatorFuture : stale ? text.elevatorStale : text.elevatorUnknown;
    return {
      assessment: unknownAssessment(reason, [], deciding?.provenance.tier ?? null),
      provenance: deciding?.provenance ?? unknownProvenance(lead),
      singlePointOfFailure: single,
      warnings,
      note: `${lead} ${described} ${phoneNote}`,
      phones,
      outNetworkIds,
    };
  }

  const lastChecked = working.some((item) => item.lastChecked);
  const when = working[0]?.asset.status?.observedAt ?? "";
  return {
    assessment: {
      status: "step-free",
      appVerified: false,
      tier: deciding?.provenance.tier ?? null,
      reasons: ["operator-claim"],
      evidence: working.map((item) => `elevator-working:${item.asset.id}`),
    },
    provenance: deciding?.provenance ?? unknownProvenance(text.inService),
    singlePointOfFailure: single,
    warnings,
    note: [described, lastChecked ? text.elevatorLastChecked(when) : "", phoneNote, text.notAppVerified]
      .filter(Boolean)
      .join(" "),
    phones,
    outNetworkIds,
  };
}

function describeElevator(text: Copy, item: EffectiveElevator): string {
  const status = item.asset.status;
  const feedWhen = status?.observedAt ?? UNKNOWN;
  const feed = text.feedLine(item.asset.name, stateWord(text, item.feedState), feedWhen);
  if (!status?.userReport || item.reportState === null) return feed;
  const report = text.reportLine(stateWord(text, item.reportState), status.userReport.observedAt);
  return `${feed} ${report}`;
}

function stateWord(text: Copy, state: AgedState): string {
  if (state === "working") return text.inService;
  if (state === "out") return text.outOfService;
  return text.statusUnknown;
}

function unknownProvenance(note: string): Provenance {
  return {
    sourceId: UNKNOWN,
    licence: UNKNOWN,
    retrievedAt: UNKNOWN,
    tier: null,
    note,
  };
}

export interface SystemEvent {
  networkId: string;
  elevatorIds: string[];
  phones: string[];
}

/** Three or more fresh outages on one network, observed within 30 minutes of each other. */
export function detectSystemEvents(elevators: ElevatorAsset[], nowIso: string): SystemEvent[] {
  const freshOut = elevators
    .map((asset) => ({ asset, effective: effectiveElevator(asset, nowIso) }))
    .filter((item) => item.effective.freshOut);

  const byNetwork = new Map<string, typeof freshOut>();
  for (const item of freshOut) {
    const list = byNetwork.get(item.asset.networkId) ?? [];
    list.push(item);
    byNetwork.set(item.asset.networkId, list);
  }

  const events: SystemEvent[] = [];
  for (const [networkId, items] of byNetwork) {
    const times = items
      .map((item) => Date.parse(item.asset.status?.observedAt ?? ""))
      .filter((time) => !Number.isNaN(time))
      .sort((a, b) => a - b);
    if (times.length < CORRELATION_COUNT) continue;
    const windowMs = CORRELATION_WINDOW_MINUTES * 60_000;
    let clustered = false;
    for (let i = 0; i <= times.length - CORRELATION_COUNT; i += 1) {
      const start = times[i];
      const end = times[i + CORRELATION_COUNT - 1];
      if (start !== undefined && end !== undefined && end - start <= windowMs) {
        clustered = true;
        break;
      }
    }
    if (!clustered) continue;
    events.push({
      networkId,
      elevatorIds: items.map((item) => item.asset.id),
      phones: unique(items.map((item) => item.asset.helpPhone).filter((phone): phone is string => Boolean(phone))),
    });
  }
  return events;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function systemEventWarning(locale: Locale, phones: string[]): Warning {
  const text: Copy = copy(locale);
  return {
    code: "correlated-outage",
    beforeCommit: true,
    text: text.systemEvent,
    phones,
  };
}
