import type { Point } from "./types";
import { validPoint } from "./types";
import { distanceM } from "./query";
import type {
  AssessedReport,
  CorroborationConfig,
  DecayConfig,
  Freshness,
  GroupState,
  LocationRef,
  PhotoMeta,
  ReportGroup,
  ReportIssue,
  ReportPart,
  ReportValidation,
  ReportWarningCode,
  RouteReport,
} from "./reportTypes";
import { REPORT_COUNTING } from "./reportTypes";
import {
  PHOTO_MEDIA_TYPES,
  REPORTER_ROLES,
  REPORT_KINDS,
  REPORT_OBSERVATIONS,
} from "./reportTypes";

const HOUR_MS = 3600000;
/** Allowance for a device clock that runs slightly ahead. */
export const CLOCK_TOLERANCE_MS = 5 * 60000;
export const NOTE_MAX_LENGTH = 500;
const PHOTO_TIME_WARNING_MS = HOUR_MS;

const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Parses an ISO date-time that states its offset. Anything else is NaN. */
export function parseDateTime(value: unknown): number {
  if (typeof value !== "string" || !DATE_TIME.test(value)) return NaN;
  return Date.parse(value);
}

/**
 * Default decay per kind. These are adjustable product settings, not measured
 * facts about how long any condition lasts.
 */
export const DEFAULT_DECAY: DecayConfig = {
  snowbank: { curve: "exponential", half_life_hours: 24, expiry_hours: 72 },
  curb_cut_blocked: { curve: "exponential", half_life_hours: 16, expiry_hours: 48 },
  ice: { curve: "exponential", half_life_hours: 6, expiry_hours: 24 },
  surface: { curve: "linear", half_life_hours: 84, expiry_hours: 168 },
  gradient: { curve: "step", half_life_hours: 360, expiry_hours: 720 },
  obstruction: { curve: "exponential", half_life_hours: 8, expiry_hours: 24 },
  other: { curve: "exponential", half_life_hours: 8, expiry_hours: 24 },
};

export const DEFAULT_CORROBORATION: CorroborationConfig = {
  radius_m: 15,
  min_independent: 2,
  dispute_window_hours: 2,
  disputed_factor: 0.5,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pointOf(value: unknown): Point | null {
  if (!isRecord(value)) return null;
  const { lat, lon } = value;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  const point = { lat, lon };
  return validPoint(point) ? point : null;
}

function locationOf(value: unknown): LocationRef | null {
  if (!isRecord(value)) return null;
  const point = value.point === undefined ? undefined : pointOf(value.point);
  if (point === null) return null;
  if (value.type === "point") {
    return point ? { type: "point", point } : null;
  }
  if (value.type === "segment" && nonEmpty(value.segment_id)) {
    return point
      ? { type: "segment", segment_id: value.segment_id, point }
      : { type: "segment", segment_id: value.segment_id };
  }
  if (value.type === "feature" && nonEmpty(value.feature_id)) {
    return point
      ? { type: "feature", feature_id: value.feature_id, point }
      : { type: "feature", feature_id: value.feature_id };
  }
  return null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function photoOf(value: unknown): PhotoMeta | null {
  if (!isRecord(value) || !nonEmpty(value.handle)) return null;
  const mediaType = PHOTO_MEDIA_TYPES.find((item) => item === value.media_type);
  if (!mediaType) return null;
  if (value.captured_at !== null && !Number.isFinite(parseDateTime(value.captured_at))) {
    return null;
  }
  const photo: PhotoMeta = {
    handle: value.handle,
    media_type: mediaType,
    captured_at: typeof value.captured_at === "string" ? value.captured_at : null,
  };
  if (value.width_px !== undefined) {
    if (!positiveInteger(value.width_px)) return null;
    photo.width_px = value.width_px;
  }
  if (value.height_px !== undefined) {
    if (!positiveInteger(value.height_px)) return null;
    photo.height_px = value.height_px;
  }
  if (value.alt_text !== undefined) {
    if (typeof value.alt_text !== "string") return null;
    photo.alt_text = value.alt_text;
  }
  return photo;
}

/**
 * Checks one report. A valid report is returned as a fresh object holding
 * only known fields; `observed_at` is kept exactly as supplied.
 */
export function validateReport(input: unknown): ReportValidation {
  if (!isRecord(input)) {
    return { ok: false, errors: [{ field: "report", code: "not_an_object" }] };
  }
  const errors: ReportIssue[] = [];
  const warnings: ReportWarningCode[] = [];

  if (!nonEmpty(input.id)) errors.push({ field: "id", code: "missing" });

  const kind = REPORT_KINDS.find((item) => item === input.kind);
  if (!kind) errors.push({ field: "kind", code: "unknown_kind" });

  const location = locationOf(input.location);
  if (!location) errors.push({ field: "location", code: "invalid_location" });

  const observedMs = parseDateTime(input.observed_at);
  if (!Number.isFinite(observedMs)) {
    errors.push({ field: "observed_at", code: "invalid_time" });
  }

  const observation = isRecord(input.observation) ? input.observation : null;
  if (!observation) errors.push({ field: "observation", code: "missing" });
  const value = REPORT_OBSERVATIONS.find((item) => item === observation?.value);
  let savedMs = NaN;
  if (observation) {
    if (!value) {
      errors.push({ field: "observation.value", code: "unknown_observation" });
    }
    if (!nonEmpty(observation.source_id)) {
      errors.push({ field: "observation.source_id", code: "missing" });
    }
    if (!nonEmpty(observation.licence)) {
      errors.push({ field: "observation.licence", code: "missing" });
    }
    savedMs = parseDateTime(observation.retrieved_at);
    if (!Number.isFinite(savedMs)) {
      errors.push({ field: "observation.retrieved_at", code: "invalid_time" });
    } else if (
      Number.isFinite(observedMs) &&
      savedMs + CLOCK_TOLERANCE_MS < observedMs
    ) {
      errors.push({
        field: "observation.retrieved_at",
        code: "saved_before_observed",
      });
    }
    if (observation.tier !== 0) {
      errors.push({ field: "observation.tier", code: "tier_must_be_zero" });
    }
  }

  const reporter = isRecord(input.reporter) ? input.reporter : null;
  const role = REPORTER_ROLES.find((item) => item === reporter?.role);
  if (!reporter) {
    errors.push({ field: "reporter", code: "missing" });
  } else {
    if (!role) errors.push({ field: "reporter.role", code: "unknown_role" });
    if (reporter.ref !== null && !nonEmpty(reporter.ref)) {
      errors.push({ field: "reporter.ref", code: "invalid" });
    }
  }

  let photo: PhotoMeta | undefined;
  if (input.photo !== undefined) {
    const parsed = photoOf(input.photo);
    if (!parsed) {
      errors.push({ field: "photo", code: "invalid_photo" });
    } else {
      photo = parsed;
      const captured = parseDateTime(parsed.captured_at);
      if (
        Number.isFinite(captured) &&
        Number.isFinite(observedMs) &&
        Math.abs(captured - observedMs) > PHOTO_TIME_WARNING_MS
      ) {
        warnings.push("photo_time_differs");
      }
    }
  }

  if (input.note !== undefined) {
    if (typeof input.note !== "string") {
      errors.push({ field: "note", code: "invalid" });
    } else if (input.note.length > NOTE_MAX_LENGTH) {
      errors.push({ field: "note", code: "note_too_long" });
    }
  }
  if (input.synthetic !== undefined && typeof input.synthetic !== "boolean") {
    errors.push({ field: "synthetic", code: "invalid" });
  }

  if (
    errors.length ||
    !kind ||
    !location ||
    !observation ||
    !value ||
    !reporter ||
    !role
  ) {
    return { ok: false, errors };
  }
  const report: RouteReport = {
    id: input.id as string,
    kind,
    location,
    observed_at: input.observed_at as string,
    observation: {
      value,
      source_id: observation.source_id as string,
      licence: observation.licence as string,
      retrieved_at: observation.retrieved_at as string,
      tier: 0,
    },
    reporter: { role, ref: reporter.ref as string | null },
  };
  if (photo) report.photo = photo;
  if (typeof input.note === "string" && input.note) report.note = input.note;
  if (input.synthetic === true) report.synthetic = true;
  return { ok: true, report, warnings };
}

function requireDate(now: Date): number {
  const time = now.getTime();
  if (!Number.isFinite(time)) throw new RangeError("Invalid date");
  return time;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Confidence falls with the age of the observation on the curve set for the
 * report's kind. An expired report stays in the result as expired with zero
 * confidence. A report dated in the future, or with an unreadable time, needs
 * a check and is never treated as current.
 */
export function reportFreshness(
  report: RouteReport,
  now: Date,
  config: DecayConfig = DEFAULT_DECAY,
): Freshness {
  const time = requireDate(now);
  const rule = config[report.kind];
  if (
    !(rule.expiry_hours > 0) ||
    !Number.isFinite(rule.expiry_hours) ||
    (rule.curve === "exponential" && !(rule.half_life_hours > 0))
  ) {
    throw new RangeError("Invalid decay rule");
  }
  const observed = parseDateTime(report.observed_at);
  if (!Number.isFinite(observed) || observed - time > CLOCK_TOLERANCE_MS) {
    return {
      status: "needs_check",
      confidence: 0,
      age_hours: null,
      expires_at: null,
    };
  }
  const ageHours = Math.max(0, time - observed) / HOUR_MS;
  const expiresAt = new Date(observed + rule.expiry_hours * HOUR_MS).toISOString();
  if (ageHours >= rule.expiry_hours) {
    return {
      status: "expired",
      confidence: 0,
      age_hours: round(ageHours),
      expires_at: expiresAt,
    };
  }
  let confidence = 1;
  if (rule.curve === "exponential") {
    confidence = 0.5 ** (ageHours / rule.half_life_hours);
  } else if (rule.curve === "linear") {
    confidence = 1 - ageHours / rule.expiry_hours;
  }
  return {
    status: "active",
    confidence: round(confidence),
    age_hours: round(ageHours),
    expires_at: expiresAt,
  };
}

function sameLocation(a: LocationRef, b: LocationRef, radiusM: number): boolean {
  if (a.type === "segment" && b.type === "segment") {
    return a.segment_id === b.segment_id;
  }
  if (a.type === "feature" && b.type === "feature") {
    return a.feature_id === b.feature_id;
  }
  if (a.type === "point" && b.type === "point") {
    return distanceM(a.point, b.point) <= radiusM;
  }
  return false;
}

function observedOrder(a: RouteReport, b: RouteReport): number {
  const left = parseDateTime(a.observed_at);
  const right = parseDateTime(b.observed_at);
  const l = Number.isFinite(left) ? left : Infinity;
  const r = Number.isFinite(right) ? right : Infinity;
  if (l !== r) return l - r;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function assessGroup(
  members: RouteReport[],
  now: Date,
  decay: DecayConfig,
  config: CorroborationConfig,
): ReportGroup {
  const anchor = members[0] as RouteReport;
  const fresh = members.map((report) => ({
    report,
    freshness: reportFreshness(report, now, decay),
    observed: parseDateTime(report.observed_at),
  }));
  const active = fresh.filter((item) => item.freshness.status === "active");
  const clearing = active.filter(
    (item) => item.report.observation.value === "cleared",
  );
  const lastCleared = clearing.reduce(
    (latest, item) => Math.max(latest, item.observed),
    -Infinity,
  );
  const latestClearing = clearing.filter((item) => item.observed === lastCleared);
  const supporting = active.filter(
    (item) =>
      item.report.observation.value === "present" && item.observed > lastCleared,
  );

  const namedClearers = new Set(
    latestClearing
      .map((item) => item.report.reporter.ref)
      .filter((ref): ref is string => ref !== null),
  );
  const disputed =
    supporting.length > 0 &&
    Number.isFinite(lastCleared) &&
    supporting.some(
      (item) =>
        item.observed - lastCleared <= config.dispute_window_hours * HOUR_MS &&
        (item.report.reporter.ref === null ||
          !namedClearers.has(item.report.reporter.ref)),
    );

  // One voice per reporter. Reports without a reporter reference cannot be
  // shown to be independent of anyone, so together they add at most one.
  const best = new Map<string, number>();
  let anonymousBest = -1;
  for (const item of supporting) {
    const ref = item.report.reporter.ref;
    if (ref === null) {
      anonymousBest = Math.max(anonymousBest, item.freshness.confidence);
    } else {
      best.set(ref, Math.max(best.get(ref) ?? 0, item.freshness.confidence));
    }
  }
  const voices = [...best.values()];
  if (voices.length === 0 && anonymousBest >= 0) voices.push(anonymousBest);
  const independent = voices.length;

  let state: GroupState;
  if (supporting.length > 0) state = disputed ? "disputed" : "active";
  else if (clearing.length > 0) state = "reported_cleared";
  else if (fresh.some((item) => item.freshness.status === "expired")) {
    state = "expired";
  } else state = "needs_check";

  let confidence = 0;
  if (state === "active" || state === "disputed") {
    confidence = 1 - voices.reduce((miss, c) => miss * (1 - c), 1);
    if (state === "disputed") confidence *= config.disputed_factor;
  }

  const counted =
    state === "reported_cleared" ? latestClearing : supporting;
  const expiry = counted.reduce(
    (latest, item) =>
      Math.max(latest, Date.parse(item.freshness.expires_at ?? "")),
    -Infinity,
  );
  const observedTimes = fresh
    .map((item) => item.observed)
    .filter((time) => Number.isFinite(time));

  const reports: AssessedReport[] = fresh.map((item) => {
    let part: ReportPart;
    if (item.freshness.status !== "active") part = item.freshness.status;
    else if (supporting.includes(item)) part = "supporting";
    else if (latestClearing.includes(item)) part = "clearing";
    else part = "superseded";
    return { report: item.report, freshness: item.freshness, part };
  });

  return {
    id: `group:${anchor.id}`,
    kind: anchor.kind,
    location: anchor.location,
    source_id: anchor.observation.source_id,
    licence: anchor.observation.licence,
    state,
    tier:
      state === "active" && independent >= config.min_independent ? 2 : 0,
    counting: REPORT_COUNTING,
    confidence: round(confidence),
    independent_reporters: independent,
    has_photo: counted.some((item) => item.report.photo !== undefined),
    latest_observed_at: observedTimes.length
      ? new Date(Math.max(...observedTimes)).toISOString()
      : null,
    expires_at: Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,
    reports,
  };
}

/**
 * Groups reports of the same kind at the same place and applies the
 * corroboration rules:
 *
 * - enough independent current "present" reports raise the group to tier 2,
 *   which never makes it a piece or part of a verified total, and never
 *   extends any report's expiry;
 * - a later "cleared" report supersedes earlier "present" reports;
 * - a "present" soon after someone else's "cleared" is a dispute, which
 *   keeps tier 0 and lowers confidence;
 * - expired reports remain listed and never count.
 *
 * Reports under different sources or licences are never merged.
 */
export function corroborateReports(
  reports: readonly RouteReport[],
  now: Date,
  options: {
    decay?: DecayConfig;
    corroboration?: Partial<CorroborationConfig>;
  } = {},
): ReportGroup[] {
  requireDate(now);
  const config = { ...DEFAULT_CORROBORATION, ...options.corroboration };
  if (
    !(config.radius_m >= 0) ||
    !(config.min_independent >= 2) ||
    !(config.dispute_window_hours >= 0) ||
    !(config.disputed_factor >= 0 && config.disputed_factor <= 1)
  ) {
    throw new RangeError("Invalid corroboration settings");
  }
  const decay = options.decay ?? DEFAULT_DECAY;
  const buckets: RouteReport[][] = [];
  for (const report of [...reports].sort(observedOrder)) {
    const bucket = buckets.find((members) => {
      const anchor = members[0] as RouteReport;
      return (
        anchor.kind === report.kind &&
        anchor.observation.source_id === report.observation.source_id &&
        anchor.observation.licence === report.observation.licence &&
        sameLocation(anchor.location, report.location, config.radius_m)
      );
    });
    if (bucket) bucket.push(report);
    else buckets.push([report]);
  }
  return buckets.map((members) => assessGroup(members, now, decay, config));
}
