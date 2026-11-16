/** Read-only QA report. No record is amended or made eligible for export. */
export type ReportCode =
  | 'RECORD_INVALID'
  | 'SOURCE_MISSING'
  | 'LICENCE_MISSING'
  | 'LICENCE_UNSUPPORTED'
  | 'DATE_MISSING'
  | 'DATE_INVALID'
  | 'DATE_FUTURE'
  | 'DATE_STALE';

export interface ReportIssue {
  readonly index: number;
  readonly code: ReportCode;
  readonly en: string;
  readonly fr: string;
}

export interface DataQaReport {
  readonly checked: number;
  readonly asOf: string;
  readonly maxAgeDays: number;
  readonly issues: readonly ReportIssue[];
  readonly clean: boolean;
}

/** These are explicitly supported open-licence identifiers, not a compatibility claim. */
const LICENCES = new Set<string>([
  'CC0-1.0',
  'CC-BY-4.0',
  'ODbL-1.0',
  'OGL-Canada-2.0',
  'OGL-ON-1.0',
]);

const MS_PER_DAY = 86_400_000;

function calendarDay(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
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
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const LABELS: Record<ReportCode, readonly [string, string]> = {
  RECORD_INVALID: ['Record is not an object.', 'L’entrée n’est pas un objet.'],
  SOURCE_MISSING: ['Source is missing.', 'La source est manquante.'],
  LICENCE_MISSING: ['Licence is missing.', 'La licence est manquante.'],
  LICENCE_UNSUPPORTED: ['Licence is not on the open-licence allowlist.', 'La licence ne figure pas dans la liste des licences ouvertes autorisées.'],
  DATE_MISSING: ['Observation date is missing.', 'La date d’observation est manquante.'],
  DATE_INVALID: ['Observation date must be a valid YYYY-MM-DD date.', 'La date d’observation doit être une date valide au format AAAA-MM-JJ.'],
  DATE_FUTURE: ['Observation date is in the future.', 'La date d’observation est dans le futur.'],
  DATE_STALE: ['Observation date exceeds the age limit.', 'La date d’observation dépasse la limite d’ancienneté.'],
};

/**
 * Report missing/non-open licences and stale observation dates without modifying
 * input data. Pass an explicit asOf date for repeatable results (UTC calendar days).
 * This diagnostic does not replace the strict export/ODbL/held-feed gate.
 */
export function reportStaleAndMissingLicences(
  input: unknown,
  options: { readonly asOf: string; readonly maxAgeDays: number },
): DataQaReport {
  const asOfDay = calendarDay(options.asOf);
  if (asOfDay === null) throw new RangeError('asOf must be a valid YYYY-MM-DD date');
  if (!Number.isSafeInteger(options.maxAgeDays) || options.maxAgeDays < 0) {
    throw new RangeError('maxAgeDays must be a non-negative safe integer');
  }
  if (!Array.isArray(input)) throw new TypeError('Expected a records array');

  const issues: ReportIssue[] = [];
  function add(index: number, code: ReportCode): void {
    const [en, fr] = LABELS[code];
    issues.push({ index, code, en, fr });
  }
  input.forEach((value: unknown, index: number): void => {
    if (!objectRecord(value)) {
      add(index, 'RECORD_INVALID');
      return;
    }
    if (typeof value.source !== 'string' || value.source.trim() === '') {
      add(index, 'SOURCE_MISSING');
    }
    if (typeof value.licence !== 'string' || value.licence.trim() === '') {
      add(index, 'LICENCE_MISSING');
    } else if (!LICENCES.has(value.licence)) {
      add(index, 'LICENCE_UNSUPPORTED');
    }
    if (value.observedOn === undefined || value.observedOn === null ||
        value.observedOn === '') {
      add(index, 'DATE_MISSING');
    } else {
      const observationDay = calendarDay(value.observedOn);
      if (observationDay === null) add(index, 'DATE_INVALID');
      else if (observationDay > asOfDay) add(index, 'DATE_FUTURE');
      else if (asOfDay - observationDay > options.maxAgeDays) add(index, 'DATE_STALE');
    }
  });
  return {
    checked: input.length,
    asOf: options.asOf,
    maxAgeDays: options.maxAgeDays,
    issues,
    clean: issues.length === 0,
  };
}
