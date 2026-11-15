import { unknownField, type FieldValue, type Provenance } from "../model/provenance.js";
import type { DataRecord } from "../model/records.js";

/**
 * A real phone has a leading + or separators between groups.
 * A bare run of digits is an identifier, not a phone.
 */
const PHONE_SOURCE =
  "(?:\\+?1[\\s.-])?(?:\\(\\d{3}\\)|\\d{3})[\\s.-]\\d{3}[\\s.-]\\d{4}\\b|(?<![\\w/])\\+\\d{10,15}\\b";
const EMAIL_SOURCE = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}";

const PROTECTED_SOURCES = [
  "https?:\\/\\/[^\\s/@]+\\.[^\\s/@]+[^\\s]*",
  "\\bwww\\.[^\\s/@]+",
  "(?<!@)\\b[\\w.-]+\\.(?:ca|com|org|net|gov|edu)(?:\\/[^\\s]*)?",
  "\\bosm:(?:node|way|relation)\\/\\d+\\b",
  "(?<![\\w])(?!(?:tel|mailto|phone|https?):)[A-Za-z][\\w.-]*[:/][^\\s]+",
];

export function containsPersonalContact(value: string): boolean {
  return contactSpans(value).length > 0;
}

/** Replace line separators that break NDJSON readers. This does not add a fact. */
export function normalizeLineBreaks(value: string): string {
  return value.replace(/[\u2028\u2029]/g, " ");
}

export function scrubField(field: FieldValue): FieldValue {
  const ctx: Provenance = {
    source_id: field.source_id,
    licence: field.licence,
    retrieved_at: field.retrieved_at,
    tier: field.tier,
  };
  if (typeof field.value === "string") {
    const normalized = normalizeLineBreaks(field.value);
    if (field.value !== "UNKNOWN") {
      const redacted = redactContacts(normalized);
      if (redacted.removed) {
        if (redacted.text === null) {
          return unknownField(ctx, field.source_key ? { source_key: field.source_key } : {});
        }
        const next: FieldValue = { ...field, value: redacted.text };
        delete next.raw;
        return next;
      }
    }
    const raw = typeof field.raw === "string" ? normalizeLineBreaks(field.raw) : field.raw;
    const next: FieldValue = { ...field, value: field.value === "UNKNOWN" ? field.value : normalized };
    if (typeof raw === "string" && containsPersonalContact(raw)) {
      delete next.raw;
    } else if (raw !== field.raw) {
      next.raw = raw;
    }
    return next;
  }
  if (typeof field.raw === "string") {
    const raw = normalizeLineBreaks(field.raw);
    if (containsPersonalContact(raw)) {
      const next = { ...field };
      delete next.raw;
      return next;
    }
    if (raw !== field.raw) return { ...field, raw };
  }
  return field;
}

export function scrubRecord(record: DataRecord): DataRecord {
  const fields: DataRecord["fields"] = {};
  for (const [key, field] of Object.entries(record.fields)) {
    fields[key] = scrubField(field);
  }
  return { ...record, fields };
}

function contactSpans(value: string): Array<[number, number]> {
  const phone = new RegExp(PHONE_SOURCE, "g");
  const email = new RegExp(EMAIL_SOURCE, "g");
  const protectedSpans = protectedRanges(value);
  const spans: Array<[number, number]> = [];
  for (const match of value.matchAll(phone)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(start, end, protectedSpans)) continue;
    spans.push([start, end]);
  }
  for (const match of value.matchAll(email)) {
    const start = match.index ?? 0;
    spans.push([start, start + match[0].length]);
  }
  return spans;
}

function protectedRanges(value: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const source of PROTECTED_SOURCES) {
    const pattern = new RegExp(source, "gi");
    for (const match of value.matchAll(pattern)) {
      const start = match.index ?? 0;
      spans.push([start, start + match[0].length]);
    }
  }
  return spans;
}

function overlaps(start: number, end: number, spans: Array<[number, number]>): boolean {
  return spans.some(([from, to]) => start < to && end > from);
}

function redactContacts(value: string): { text: string | null; removed: boolean } {
  const spans = contactSpans(value).sort((a, b) => b[0] - a[0]);
  if (spans.length === 0) return { text: value, removed: false };
  let next = value;
  for (const [start, end] of spans) {
    next = `${next.slice(0, start)} ${next.slice(end)}`;
  }
  const collapsed = next.replace(/\s+/g, " ").trim().replace(/^[\s,;:|/().+-]+|[\s,;:|/().+-]+$/g, "").trim();
  if (!/[A-Za-z0-9]/.test(collapsed) || /^https?$/i.test(collapsed)) return { text: null, removed: true };
  return { text: collapsed, removed: true };
}
