/**
 * Accessible taxi and on-demand wheelchair-accessible vehicle (WAV) services.
 * Every descriptive field is a field-value object with its own source,
 * licence, retrieval date and tier. UNKNOWN is a value, not an omission.
 */

export const WAV_UNKNOWN = "UNKNOWN" as const;
export type Unknown = typeof WAV_UNKNOWN;

/** Closed availability vocabulary. */
export const WAV_AVAILABILITY = [
  "on_demand",
  "advance_booking_only",
  "limited",
  "effectively_unavailable",
  "UNKNOWN",
] as const;
export type WavAvailability = (typeof WAV_AVAILABILITY)[number];

/** Values a positive availability filter may ask for. Never UNKNOWN. */
export const WAV_USABLE_AVAILABILITY = [
  "on_demand",
  "advance_booking_only",
  "limited",
] as const;
export type WavUsableAvailability = (typeof WAV_USABLE_AVAILABILITY)[number];

export const WAV_SERVICE_TYPES = [
  "accessible_taxi",
  "on_demand_wav",
  "UNKNOWN",
] as const;
export type WavServiceType = (typeof WAV_SERVICE_TYPES)[number];

export type WavTier = 0 | 1 | 2 | 3 | 4;

export interface WavField<T extends string = string> {
  value: T | Unknown;
  source_id: string;
  /** licence_id from the source registry. */
  licence: string;
  /** YYYY-MM-DD: the day the source was read. */
  retrieved_at: string;
  tier: WavTier;
  source_key?: string;
  /**
   * YYYY-MM-DD: the date the source itself carries for this statement.
   * Required for "effectively_unavailable".
   */
  source_dated?: string;
}

export const WAV_FIELD_NAMES = [
  "municipality",
  "service_name",
  "service_type",
  "availability",
  "booking_phone",
  "booking_url",
  "service_hours",
] as const;
export type WavFieldName = (typeof WAV_FIELD_NAMES)[number];

export interface WavServiceRecord {
  id: string;
  municipality: WavField;
  service_name: WavField;
  service_type: WavField<Exclude<WavServiceType, Unknown>>;
  availability: WavField<Exclude<WavAvailability, Unknown>>;
  booking_phone: WavField;
  booking_url: WavField;
  service_hours: WavField;
  /** True only for labelled test fixtures. Never allowed in the dataset. */
  synthetic?: boolean;
}

export interface WavDataset {
  format: "access-maps-wav-services";
  version: 1;
  records: WavServiceRecord[];
}

export type WavIssueCode =
  | "not_an_object"
  | "missing"
  | "invalid"
  | "not_in_vocabulary"
  | "invalid_date"
  | "invalid_tier"
  | "unavailable_needs_dated_source"
  | "source_dated_after_retrieval"
  | "duplicate_id"
  | "synthetic_not_allowed"
  | "synthetic_label_required";

export interface WavIssue {
  record: string;
  field: string;
  code: WavIssueCode;
}

export interface WavFilter {
  /** Exact municipality name, compared without case or accents. */
  municipality?: string;
  serviceType?: Exclude<WavServiceType, Unknown>;
  /** Positive availability values wanted. UNKNOWN cannot be requested. */
  availability?: readonly WavUsableAvailability[];
}

export type WavAvailabilityStatus =
  /** A dated, in-window claim other than UNKNOWN. */
  | "stated"
  /** The source did not say. */
  | "unknown"
  /** A claim older than the review window: shown, never matched as current. */
  | "stale";

export interface WavSearchItem {
  record: WavServiceRecord;
  availability_status: WavAvailabilityStatus;
  /** Fields whose retrieval date is outside the review window or unreadable. */
  stale_fields: WavFieldName[];
}

export interface WavSearchResult {
  items: WavSearchItem[];
  /**
   * "no_records" means the list holds nothing for the filter. It is never
   * evidence that no service exists.
   */
  coverage: "records_found" | "no_records";
}
