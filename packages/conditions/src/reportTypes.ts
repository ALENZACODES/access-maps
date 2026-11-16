import type { Point } from "./types";

/** Kinds of route condition a person can report. Closed vocabulary. */
export const REPORT_KINDS = [
  "snowbank",
  "curb_cut_blocked",
  "ice",
  "surface",
  "gradient",
  "obstruction",
  "other",
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** What the person saw: the condition was there, or it was gone. */
export const REPORT_OBSERVATIONS = ["present", "cleared"] as const;
export type ReportObservation = (typeof REPORT_OBSERVATIONS)[number];

/** Self-declared role. It is recorded, never checked, and never raises a tier. */
export const REPORTER_ROLES = [
  "wheelchair_user",
  "mobility_aid_user",
  "companion",
  "passerby",
  "site_staff",
  "UNKNOWN",
] as const;
export type ReporterRole = (typeof REPORTER_ROLES)[number];

export const PHOTO_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type PhotoMediaType = (typeof PHOTO_MEDIA_TYPES)[number];

/**
 * Where the report applies. A segment or feature id refers to a record the
 * host already holds; a point is a coordinate the person chose on the map.
 * No device location is read by this package.
 */
export type LocationRef =
  | { type: "point"; point: Point }
  | { type: "segment"; segment_id: string; point?: Point }
  | { type: "feature"; feature_id: string; point?: Point };

/**
 * Photo metadata only. The handle is a local identifier; no image bytes and
 * no embedded position are stored here. `captured_at` never replaces the
 * report's `observed_at`.
 */
export interface PhotoMeta {
  handle: string;
  media_type: PhotoMediaType;
  captured_at: string | null;
  width_px?: number;
  height_px?: number;
  alt_text?: string;
}

/**
 * The observation in the shared field-value shape. `retrieved_at` is when the
 * report was saved on the device; the time the person saw the condition is
 * `RouteReport.observed_at`. A single report is always tier 0.
 */
export interface ReportObservationFact {
  value: ReportObservation;
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: 0;
}

export interface RouteReport {
  id: string;
  kind: ReportKind;
  location: LocationRef;
  /** The time the person observed the condition, exactly as they gave it. */
  observed_at: string;
  observation: ReportObservationFact;
  reporter: {
    role: ReporterRole;
    /** Opaque local reference. Null means independence cannot be shown. */
    ref: string | null;
  };
  photo?: PhotoMeta;
  note?: string;
  /** True for test fixtures and samples. Never an observation. */
  synthetic?: boolean;
}

export type ReportIssueCode =
  | "not_an_object"
  | "missing"
  | "invalid"
  | "unknown_kind"
  | "unknown_observation"
  | "unknown_role"
  | "invalid_time"
  | "saved_before_observed"
  | "invalid_location"
  | "tier_must_be_zero"
  | "note_too_long"
  | "invalid_photo";

export interface ReportIssue {
  field: string;
  code: ReportIssueCode;
}

export type ReportWarningCode = "photo_time_differs";

export type ReportValidation =
  | { ok: true; report: RouteReport; warnings: ReportWarningCode[] }
  | { ok: false; errors: ReportIssue[] };

export type DecayCurve = "exponential" | "linear" | "step";

export interface DecayRule {
  curve: DecayCurve;
  /** Used by the exponential curve only. */
  half_life_hours: number;
  /** At and after this age the report is expired. */
  expiry_hours: number;
}

export type DecayConfig = Record<ReportKind, DecayRule>;

export type FreshnessStatus = "active" | "expired" | "needs_check";

export interface Freshness {
  status: FreshnessStatus;
  /** Relative weight from 0 to 1. Not a probability. Zero unless active. */
  confidence: number;
  age_hours: number | null;
  expires_at: string | null;
}

export interface CorroborationConfig {
  /** Two point reports of the same kind within this distance are grouped. */
  radius_m: number;
  /** Distinct reporters needed before the tier rises above 0. */
  min_independent: number;
  /** A "present" this soon after someone else's "cleared" is a dispute. */
  dispute_window_hours: number;
  /** Confidence multiplier while a group is disputed. */
  disputed_factor: number;
}

export type ReportPart =
  | "supporting"
  | "clearing"
  | "superseded"
  | "expired"
  | "needs_check";

export interface AssessedReport {
  report: RouteReport;
  freshness: Freshness;
  part: ReportPart;
}

export type GroupState =
  | "active"
  | "disputed"
  | "reported_cleared"
  | "expired"
  | "needs_check";

/**
 * Tier 0: unconfirmed user observation. Tier 2: the same condition reported
 * by enough independent people (peer verification of an observation). This
 * package never assigns tier 1, 3 or 4 to a report.
 */
export type ReportTier = 0 | 2;

/**
 * How a route-condition report is treated by any count. A report is a
 * time-limited observation, not a standing accessibility fact: at every
 * tier it is not a piece and it adds nothing to a verified total. Both
 * flags are the literal `false`; there is no setting that changes them.
 */
export interface ReportCounting {
  readonly counts_as_piece: false;
  readonly counts_toward_verified: false;
}

export const REPORT_COUNTING: ReportCounting = Object.freeze({
  counts_as_piece: false,
  counts_toward_verified: false,
});

export interface ReportGroup {
  id: string;
  kind: ReportKind;
  location: LocationRef;
  source_id: string;
  licence: string;
  state: GroupState;
  tier: ReportTier;
  /** Always {@link REPORT_COUNTING}: never a piece, never verified. */
  counting: ReportCounting;
  confidence: number;
  independent_reporters: number;
  has_photo: boolean;
  latest_observed_at: string | null;
  expires_at: string | null;
  reports: AssessedReport[];
}

export type RoutingHint = "avoid_if_possible" | "penalty" | "none";

export type RoutingClaim =
  | "reported_condition"
  | "reported_cleared"
  | "no_current_report";

export interface RoutingWeights {
  /** Base penalty weight per kind, 0 to 1. */
  weight: Record<ReportKind, number>;
  /** Kinds that may produce an avoid hint once corroborated. */
  may_avoid: readonly ReportKind[];
  /** Minimum confidence for an avoid hint. */
  avoid_threshold: number;
}

export interface RoutingFact {
  id: string;
  kind: ReportKind;
  location: LocationRef;
  state: GroupState;
  claim: RoutingClaim;
  hint: RoutingHint;
  /** 0 to 1. Zero whenever the hint is "none". */
  penalty: number;
  /**
   * Always UNKNOWN. Reports can make a way less attractive; they never
   * establish that a way can or cannot be used.
   */
  passable: "UNKNOWN";
  fact: {
    value: ReportKind;
    source_id: string;
    licence: string;
    retrieved_at: string;
    tier: ReportTier;
    derived: true;
  };
  /** Always {@link REPORT_COUNTING}: never a piece, never verified. */
  counting: ReportCounting;
  provenance: {
    report_ids: string[];
    counted_report_ids: string[];
    independent_reporters: number;
    confidence: number;
    latest_observed_at: string | null;
    expires_at: string | null;
    has_photo: boolean;
  };
}
