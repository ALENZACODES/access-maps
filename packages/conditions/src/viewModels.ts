import type { Language } from "./strings";
import { reportStrings } from "./reportStrings";
import { wavStrings } from "./wavStrings";
import type { LocationRef, PhotoMeta, ReportGroup, ReportKind, ReportObservation, ReporterRole, ReportValidation } from "./reportTypes";
import { validateReport } from "./reports";
import type { WavFieldName, WavSearchItem } from "./wavTypes";
import { WAV_FIELD_NAMES, WAV_UNKNOWN } from "./wavTypes";

function locale(language: Language): string {
  return language === "fr" ? "fr-CA" : "en-CA";
}

/** Date and time in UTC, or null when the value cannot be read. */
export function formatDateTime(
  value: string | null,
  language: Language,
): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return (
    new Intl.DateTimeFormat(locale(language), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}

function formatDay(value: string | undefined, language: Language): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat(locale(language), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(time));
}

export interface ReportLineView {
  id: string;
  observed: string;
  observation: string;
  part: string;
  role: string;
  note: string | null;
}

export interface ReportGroupView {
  id: string;
  heading: string;
  state: string;
  /** False for expired, cleared and needs-check groups. */
  current: boolean;
  tier: string;
  lastObserved: string;
  /** Label and value for the expiry line; the label says "Expired" once past. */
  expiryLabel: string;
  expiry: string;
  /** Null when the group is not current: no weight is shown for it. */
  confidence: string | null;
  reporters: number;
  source: string;
  licence: string;
  photo: string;
  sample: boolean;
  reports: ReportLineView[];
}

export function reportGroupViews(
  groups: readonly ReportGroup[],
  language: Language,
): ReportGroupView[] {
  const t = reportStrings[language];
  return groups.map((group) => {
    const current = group.state === "active" || group.state === "disputed";
    return {
      id: group.id,
      heading: t.kinds[group.kind],
      state: t.states[group.state],
      current,
      tier: t.tiers[group.tier],
      lastObserved:
        formatDateTime(group.latest_observed_at, language) ?? t.unknown,
      expiryLabel: group.state === "expired" ? t.expired : t.expires,
      expiry:
        formatDateTime(
          group.state === "expired"
            ? group.reports.reduce<string | null>((latest, item) => {
                const value = item.freshness.expires_at;
                if (!value) return latest;
                return !latest || Date.parse(value) > Date.parse(latest)
                  ? value
                  : latest;
              }, null)
            : group.expires_at,
          language,
        ) ?? t.unknown,
      confidence: current
        ? new Intl.NumberFormat(locale(language), {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(group.confidence)
        : null,
      reporters: group.independent_reporters,
      source: group.source_id,
      licence: group.licence,
      photo: group.has_photo ? t.photoAttached : t.photoNone,
      sample: group.reports.some((item) => item.report.synthetic === true),
      reports: group.reports.map((item) => ({
        id: item.report.id,
        observed:
          formatDateTime(item.report.observed_at, language) ?? t.unknown,
        observation: t.observations[item.report.observation.value],
        part: t.parts[item.part],
        role: t.roles[item.report.reporter.role],
        note: item.report.note ?? null,
      })),
    };
  });
}

export interface ReportFormValues {
  kind: ReportKind | "";
  observation: ReportObservation | "";
  /** ISO date-time with offset: the time the person saw the condition. */
  observed_at: string;
  role: ReporterRole;
  note: string;
}

export interface ReportFormContext {
  id: string;
  location: LocationRef;
  source_id: string;
  licence: string;
  reporter_ref: string | null;
  photo?: PhotoMeta;
  now: Date;
}

/**
 * Builds a tier 0 report from form values. The person's stated time is kept
 * as `observed_at`; the save time goes to `observation.retrieved_at`.
 */
export function buildReport(
  values: ReportFormValues,
  context: ReportFormContext,
): ReportValidation {
  const candidate: Record<string, unknown> = {
    id: context.id,
    kind: values.kind,
    location: context.location,
    observed_at: values.observed_at,
    observation: {
      value: values.observation,
      source_id: context.source_id,
      licence: context.licence,
      retrieved_at: context.now.toISOString(),
      tier: 0,
    },
    reporter: { role: values.role, ref: context.reporter_ref },
  };
  if (values.note.trim()) candidate.note = values.note.trim();
  if (context.photo) candidate.photo = context.photo;
  return validateReport(candidate);
}

export interface WavFieldView {
  name: WavFieldName;
  label: string;
  value: string;
  /** Set only for a stated https booking address. */
  href: string | null;
  stale: boolean;
  source: string;
  licence: string;
  retrieved: string;
  tier: string;
}

export interface WavItemView {
  id: string;
  name: string;
  sample: boolean;
  availability: string;
  availabilityStale: boolean;
  /** The date carried by the source, when the record has one. */
  availabilityDated: string | null;
  fields: WavFieldView[];
}

export function wavItemViews(
  items: readonly WavSearchItem[],
  language: Language,
): WavItemView[] {
  const t = wavStrings[language];
  return items.map(({ record, availability_status, stale_fields }) => {
    const fields: WavFieldView[] = WAV_FIELD_NAMES.map((name) => {
      const field = record[name];
      const raw: string = field.value;
      let value = raw;
      if (raw === WAV_UNKNOWN) value = t.unknown;
      else if (name === "availability") value = t.availability[record.availability.value];
      else if (name === "service_type") value = t.serviceTypes[record.service_type.value];
      return {
        name,
        label: t.fields[name],
        value,
        href:
          name === "booking_url" && /^https:\/\/\S+$/.test(raw) ? raw : null,
        stale: stale_fields.includes(name),
        source: field.source_id,
        licence: field.licence,
        retrieved: formatDay(field.retrieved_at, language) ?? t.unknown,
        tier: t.tiers[field.tier],
      };
    });
    return {
      id: record.id,
      name:
        record.service_name.value === WAV_UNKNOWN
          ? t.unknown
          : record.service_name.value,
      sample: record.synthetic === true,
      availability: t.availability[record.availability.value],
      availabilityStale: availability_status === "stale",
      availabilityDated: formatDay(record.availability.source_dated, language),
      fields,
    };
  });
}
