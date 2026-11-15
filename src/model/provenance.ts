export const UNKNOWN = "UNKNOWN";

export type Tier = 0 | 1 | 2 | 3 | 4;
export type ScalarValue = string | number;
export type FieldPrimitive = ScalarValue | number[][];

export interface Provenance {
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: Tier;
}

export interface FieldValue {
  value: FieldPrimitive;
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: Tier;
  source_key?: string;
  raw?: string | number | null;
  derived?: boolean;
}

export interface FieldOptions {
  source_key?: string;
  raw?: string | number | null;
  derived?: boolean;
}

const MISSING_TOKENS = new Set(["", "unknown", "n/a", "na", "null"]);

export function unknownField(ctx: Provenance, options: FieldOptions = {}): FieldValue {
  const field: FieldValue = {
    value: UNKNOWN,
    source_id: ctx.source_id,
    licence: ctx.licence,
    retrieved_at: ctx.retrieved_at,
    tier: ctx.tier,
  };
  if (options.source_key) field.source_key = options.source_key;
  if (options.raw !== undefined) field.raw = options.raw;
  return field;
}

export function fv(
  value: FieldPrimitive | null | undefined,
  ctx: Provenance,
  options: FieldOptions = {},
): FieldValue {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (MISSING_TOKENS.has(trimmed.toLowerCase())) return unknownField(ctx, options);
    value = trimmed;
  }
  if (value === null || value === undefined) return unknownField(ctx, options);
  if (typeof value === "number" && !Number.isFinite(value)) return unknownField(ctx, options);
  if (Array.isArray(value) && value.length === 0) return unknownField(ctx, options);
  const field: FieldValue = {
    value,
    source_id: ctx.source_id,
    licence: ctx.licence,
    retrieved_at: ctx.retrieved_at,
    tier: ctx.tier,
  };
  if (options.source_key) field.source_key = options.source_key;
  if (options.raw !== undefined) field.raw = options.raw;
  if (options.derived) field.derived = true;
  return field;
}

export function isUnknown(field: FieldValue): boolean {
  return field.value === UNKNOWN;
}

/** A piece is a non-derived field whose value is not UNKNOWN. */
export function isPiece(field: FieldValue): boolean {
  return field.value !== UNKNOWN && field.derived !== true;
}

/** A known gap is an explicit UNKNOWN that is not a derived copy. */
export function isGap(field: FieldValue): boolean {
  return field.value === UNKNOWN && field.derived !== true;
}

export function isDerivedExcluded(field: FieldValue): boolean {
  return field.derived === true && field.value !== UNKNOWN;
}
