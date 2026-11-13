import { hoursBetween } from "./geo.js";
import { barrier, unknownAssessment } from "./stepfree.js";
import type { ElevatorAsset } from "./catalog.js";
import type { StepFreeAssessment, Warning } from "./types.js";
import { copy, type Copy } from "./explain.js";
import type { Locale } from "./types.js";

const FRESH_HOURS = 1;
const STALE_HOURS = 4;
const CORRELATION_WINDOW_MINUTES = 30;
const CORRELATION_COUNT = 3;

export interface StopAccessResult {
  assessment: StepFreeAssessment;
  singlePointOfFailure: boolean;
  warnings: Warning[];
  note: string;
  phones: string[];
  /** Network ids whose elevators were out and fresh enough to count. */
  outNetworkIds: string[];
}

export interface EffectiveElevator {
  asset: ElevatorAsset;
  state: "working" | "out" | "unknown";
  stale: boolean;
  lastChecked: boolean;
  conflict: boolean;
}

export function effectiveElevator(asset: ElevatorAsset, nowIso: string): EffectiveElevator {
  const status = asset.status;
  if (!status || status.source === "none" || status.state === "unknown") {
    return { asset, state: "unknown", stale: false, lastChecked: false, conflict: false };
  }
  const age = hoursBetween(status.observedAt, nowIso);
  if (age === null || age > STALE_HOURS) {
    return { asset, state: "unknown", stale: true, lastChecked: false, conflict: false };
  }
  const conflict = Boolean(
    status.userReport && status.userReport.state !== status.state,
  );
  return {
    asset,
    state: status.state,
    stale: false,
    lastChecked: age > FRESH_HOURS,
    conflict,
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

  if (working.length === 0 && out.length > 0) {
    const named = out.map((item) => item.asset.name).join(", ");
    return {
      assessment: barrier("elevator-out", out[0]?.asset.provenance.tier ?? 4, [`elevators-out:${named}`]),
      singlePointOfFailure: single,
      warnings,
      note: `${text.elevatorOut} ${named}. ${phoneNote} ${text.alternateMissing}`,
      phones,
      outNetworkIds,
    };
  }

  if (working.length === 0) {
    const stale = effective.some((item) => item.stale);
    return {
      assessment: unknownAssessment(stale ? "elevator-stale" : "elevator-unknown", [], effective[0]?.asset.provenance.tier ?? null),
      singlePointOfFailure: single,
      warnings,
      note: `${stale ? text.elevatorStale : text.elevatorUnknown} ${phoneNote}`,
      phones,
      outNetworkIds,
    };
  }

  const lastChecked = working.some((item) => item.lastChecked);
  const when = working[0]?.asset.status?.observedAt ?? "";
  const names = working.map((item) => `${item.asset.name}: ${text.inService}`).join("; ");
  const outNames = out.map((item) => `${item.asset.name}: ${text.outOfService}`).join("; ");
  const note = [
    names,
    outNames,
    lastChecked ? text.elevatorLastChecked(when) : "",
    phoneNote,
    text.notAppVerified,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    assessment: {
      status: "step-free",
      appVerified: false,
      tier: working[0]?.asset.status?.provenance.tier ?? 4,
      reasons: ["operator-claim"],
      evidence: working.map((item) => `elevator-working:${item.asset.id}`),
    },
    singlePointOfFailure: single,
    warnings,
    note,
    phones,
    outNetworkIds,
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
    .filter((item) => item.effective.state === "out" && !item.effective.stale);

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
