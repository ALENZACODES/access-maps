import { unknownField, type FieldValue, type Provenance } from "../model/provenance.js";
import type { DataRecord } from "../model/records.js";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+\d{1,3}[\s().-]*)?(?:\(?\d{3}\)?[\s().-]*)\d{3}[\s().-]*\d{4}\b/;

export function containsPersonalContact(value: string): boolean {
  return EMAIL.test(value) || PHONE.test(value);
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
    if (field.value !== "UNKNOWN" && containsPersonalContact(normalized)) {
      return unknownField(ctx, field.source_key ? { source_key: field.source_key } : {});
    }
    const raw = typeof field.raw === "string" ? normalizeLineBreaks(field.raw) : field.raw;
    const next: FieldValue = { ...field, value: normalized };
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
