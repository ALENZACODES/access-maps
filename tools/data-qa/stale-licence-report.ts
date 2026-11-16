/** Licence status for redistributed registry and pack sources. */
import { LICENCE_FINDINGS } from "./findings.js";
import { OPEN_LICENCES } from "./index.js";

export type ReportCode =
  | "RECORD_INVALID"
  | "SOURCE_MISSING"
  | "LICENCE_MISSING"
  | "LICENCE_UNSUPPORTED"
  | "LICENCE_EXPIRED"
  | "LICENCE_REVIEW_DUE"
  | "DATE_MISSING"
  | "DATE_INVALID"
  | "DATE_FUTURE";

/** fail: CI must fail, or the source must already be held. review: informational only. */
export type IssueSeverity = "fail" | "review";

export interface ReportIssue {
  readonly index: number;
  readonly code: ReportCode;
  readonly severity: IssueSeverity;
  readonly source: string;
  readonly en: string;
  readonly fr: string;
}

export interface DataQaReport {
  readonly checked: number;
  readonly asOf: string;
  readonly maxAgeDays: number;
  readonly issues: readonly ReportIssue[];
  readonly blocking: readonly ReportIssue[];
  readonly review: readonly ReportIssue[];
  readonly clean: boolean;
}

export interface LicencePolicy {
  readonly id: string;
  /** Inclusive UTC end date, or null when the licence has no expiry. */
  readonly expiresOn: string | null;
  readonly reviewEveryDays: number;
}

/** Default review window for a still-valid licence, in UTC calendar days. */
export const DEFAULT_REVIEW_EVERY_DAYS = 365;

const RECOGNIZED_LICENCES = new Set<string>([
  ...OPEN_LICENCES,
  ...LICENCE_FINDINGS.map((item) => item.licence),
]);

/** Per-licence expiry and review cadence. Missing entries use no expiry and the default review window. */
export const LICENCE_POLICIES: Readonly<Record<string, LicencePolicy>> = Object.freeze(
  Object.fromEntries(
    [...RECOGNIZED_LICENCES].map((id) => [
      id,
      { id, expiresOn: null, reviewEveryDays: DEFAULT_REVIEW_EVERY_DAYS },
    ]),
  ),
);

const MS_PER_DAY = 86_400_000;

function calendarDay(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) return null;
  return date.getTime() / MS_PER_DAY;
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Held feeds are already excluded from redistribution (currently MiWay). */
export function isHeldSource(value: string): boolean {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").includes("miway");
}

export function isRecognizedLicence(licence: string): boolean {
  return RECOGNIZED_LICENCES.has(licence);
}

const LABELS: Record<ReportCode, readonly [string, string]> = {
  RECORD_INVALID: ["Record is not an object.", "L’entrée n’est pas un objet."],
  SOURCE_MISSING: ["Source is missing.", "La source est manquante."],
  LICENCE_MISSING: ["Licence is missing.", "La licence est manquante."],
  LICENCE_UNSUPPORTED: [
    "Licence is invalid or is not a recognized redistribution licence.",
    "La licence est invalide ou n’est pas une licence de redistribution reconnue.",
  ],
  LICENCE_EXPIRED: [
    "The licence has expired and the source must be held or removed from redistribution.",
    "La licence est expirée. La source doit être retenue ou retirée de la redistribution.",
  ],
  LICENCE_REVIEW_DUE: [
    "Informational: the licence is still valid, but it is due for review.",
    "Information\u00a0: la licence est toujours valide, mais elle doit être revue.",
  ],
  DATE_MISSING: ["Observation date is missing.", "La date d’observation est manquante."],
  DATE_INVALID: [
    "Observation date must be a valid YYYY-MM-DD date.",
    "La date d’observation doit être une date valide au format AAAA-MM-JJ.",
  ],
  DATE_FUTURE: ["Observation date is in the future.", "La date d’observation est dans le futur."],
};

export interface ReportOptions {
  readonly asOf: string;
  readonly maxAgeDays: number;
  /** Optional per-record licence end dates, keyed like the licence field. */
  readonly policies?: Readonly<Record<string, LicencePolicy>>;
}

/**
 * Classify missing, invalid or expired licences (blocking) and review-due
 * dates for licences that are still valid (informational only).
 * Input values, including accessibility: "UNKNOWN", are never rewritten.
 */
export function reportStaleAndMissingLicences(
  input: unknown,
  options: ReportOptions,
): DataQaReport {
  const asOfDay = calendarDay(options.asOf);
  if (asOfDay === null) throw new RangeError("asOf must be a valid YYYY-MM-DD date");
  if (!Number.isSafeInteger(options.maxAgeDays) || options.maxAgeDays < 0) {
    throw new RangeError("maxAgeDays must be a non-negative safe integer");
  }
  if (!Array.isArray(input)) throw new TypeError("Expected a records array");

  const policies = options.policies ?? LICENCE_POLICIES;
  const issues: ReportIssue[] = [];
  function add(index: number, code: ReportCode, source: string, severity: IssueSeverity): void {
    const [en, fr] = LABELS[code];
    issues.push({ index, code, severity, source, en, fr });
  }

  input.forEach((value: unknown, index: number): void => {
    if (!objectRecord(value)) {
      add(index, "RECORD_INVALID", "", "fail");
      return;
    }
    const source = typeof value.source === "string" ? value.source.trim() : "";
    if (source === "") add(index, "SOURCE_MISSING", source, "fail");

    const licence = typeof value.licence === "string" ? value.licence.trim() : "";
    let licenceValid = false;
    if (licence === "") {
      add(index, "LICENCE_MISSING", source, "fail");
    } else if (!isRecognizedLicence(licence) && !policies[licence]) {
      add(index, "LICENCE_UNSUPPORTED", source, "fail");
    } else {
      const policy = policies[licence] ?? { id: licence, expiresOn: null, reviewEveryDays: options.maxAgeDays };
      const expiryDay = policy.expiresOn ? calendarDay(policy.expiresOn) : null;
      if (policy.expiresOn && expiryDay === null) {
        add(index, "LICENCE_UNSUPPORTED", source, "fail");
      } else if (expiryDay !== null && expiryDay < asOfDay) {
        add(index, "LICENCE_EXPIRED", source, "fail");
      } else {
        licenceValid = true;
      }
    }

    const observed = value.observedOn;
    const reviewEvery = licenceValid
      ? (policies[licence]?.reviewEveryDays ?? options.maxAgeDays)
      : options.maxAgeDays;
    if (observed === undefined || observed === null || observed === "") {
      add(index, "DATE_MISSING", source, "fail");
    } else {
      const observationDay = calendarDay(observed);
      if (observationDay === null) add(index, "DATE_INVALID", source, "fail");
      else if (observationDay > asOfDay) add(index, "DATE_FUTURE", source, "fail");
      else if (licenceValid && asOfDay - observationDay > reviewEvery) {
        add(index, "LICENCE_REVIEW_DUE", source, "review");
      }
    }
  });

  const blocking = issues.filter((issue) => issue.severity === "fail" && !isHeldSource(issue.source));
  const review = issues.filter((issue) => issue.severity === "review");
  return {
    checked: input.length,
    asOf: options.asOf,
    maxAgeDays: options.maxAgeDays,
    issues,
    blocking,
    review,
    clean: blocking.length === 0,
  };
}
