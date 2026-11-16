/** Fail-closed checks for static map data. No network or publishing operations. */
export const OPEN_LICENCES = [
  'CC0-1.0',
  'CC-BY-4.0',
  'ODbL-1.0',
  'OGL-Canada-2.0',
  'OGL-ON-1.0',
] as const;

export type OpenLicence = (typeof OPEN_LICENCES)[number];
export type Silo = 'open' | 'odbl';
export type AccessState = 'YES' | 'NO' | 'UNKNOWN';

export interface Provenance {
  source: string;
  licence: OpenLicence;
  observedOn: string;
}

export interface DataRecord extends Provenance {
  id: string;
  accessibility: AccessState;
  silo: Silo;
  lineage: Provenance[];
}

export type QaResult =
  | { ok: true; records: DataRecord[] }
  | { ok: false; errors: string[] };

const RECORD_KEYS = ['id', 'source', 'licence', 'observedOn', 'accessibility', 'silo', 'lineage'];
const PROVENANCE_KEYS = ['source', 'licence', 'observedOn'];

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function openLicence(value: unknown): value is OpenLicence {
  return typeof value === 'string' && (OPEN_LICENCES as readonly string[]).includes(value);
}

function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  // Avoid Date.UTC's special handling of years 0 through 99.
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function heldSource(value: string): boolean {
  // Covers MiWay, Mi-Way and feed identifiers with separators.
  return value.toLowerCase().replace(/[^a-z0-9]/g, '').includes('miway');
}

function extraKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key}: unexpected field`);
  }
}

function parseProvenance(value: unknown, path: string, errors: string[]): Provenance | null {
  if (!object(value)) {
    errors.push(`${path}: expected provenance object`);
    return null;
  }
  extraKeys(value, PROVENANCE_KEYS, path, errors);
  if (!nonempty(value.source)) errors.push(`${path}.source: required`);
  else if (heldSource(value.source)) errors.push(`${path}.source: held feed excluded`);
  if (!openLicence(value.licence)) errors.push(`${path}.licence: unsupported or missing`);
  if (!calendarDate(value.observedOn)) errors.push(`${path}.observedOn: invalid date`);
  if (!nonempty(value.source) || heldSource(value.source) || !openLicence(value.licence) ||
      !calendarDate(value.observedOn) || Object.keys(value).some(key => !PROVENANCE_KEYS.includes(key))) {
    return null;
  }
  return { source: value.source, licence: value.licence, observedOn: value.observedOn };
}

function parseRecord(value: unknown, index: number, errors: string[]): DataRecord | null {
  const path = `records[${index}]`;
  if (!object(value)) {
    errors.push(`${path}: expected object`);
    return null;
  }
  extraKeys(value, RECORD_KEYS, path, errors);
  const provenance = parseProvenance(
    { source: value.source, licence: value.licence, observedOn: value.observedOn }, path, errors,
  );
  if (!nonempty(value.id)) errors.push(`${path}.id: required`);
  if (value.accessibility !== 'YES' && value.accessibility !== 'NO' && value.accessibility !== 'UNKNOWN') {
    errors.push(`${path}.accessibility: expected YES, NO or UNKNOWN`);
  }
  if (value.silo !== 'open' && value.silo !== 'odbl') errors.push(`${path}.silo: invalid silo`);
  if (!Array.isArray(value.lineage) || value.lineage.length === 0) {
    errors.push(`${path}.lineage: nonempty provenance required`);
    return null;
  }
  const lineage = value.lineage.map((item: unknown, j: number) =>
    parseProvenance(item, `${path}.lineage[${j}]`, errors));
  if (!provenance || !nonempty(value.id) ||
      (value.accessibility !== 'YES' && value.accessibility !== 'NO' && value.accessibility !== 'UNKNOWN') ||
      (value.silo !== 'open' && value.silo !== 'odbl') || lineage.some(item => item === null) ||
      Object.keys(value).some(key => !RECORD_KEYS.includes(key))) return null;
  return {
    ...provenance,
    id: value.id,
    accessibility: value.accessibility,
    silo: value.silo,
    lineage: lineage as Provenance[],
  };
}

/** Never publish records when ok is false. Keep ODbL and non-ODbL exports separate. */
export function checkStrictData(input: unknown, target: Silo): QaResult {
  if (target !== 'open' && target !== 'odbl') return { ok: false, errors: ['target: invalid silo'] };
  if (!Array.isArray(input)) return { ok: false, errors: ['records: expected array'] };
  const errors: string[] = [];
  const seen = new Set<string>();
  const records: DataRecord[] = [];
  input.forEach((item: unknown, index: number) => {
    const record = parseRecord(item, index, errors);
    if (!record) return;
    if (seen.has(record.id)) errors.push(`records[${index}].id: duplicate`);
    seen.add(record.id);
    if (record.silo !== target) errors.push(`records[${index}].silo: wrong export silo`);
    const hasOdbl = record.licence === 'ODbL-1.0' || record.lineage.some(p => p.licence === 'ODbL-1.0');
    if (target === 'open' && hasOdbl) errors.push(`records[${index}]: ODbL lineage cannot enter open export`);
    if (target === 'odbl' && !hasOdbl) errors.push(`records[${index}]: ODbL provenance required`);
    if (hasOdbl && record.licence !== 'ODbL-1.0') {
      errors.push(`records[${index}].licence: ODbL lineage must remain labelled ODbL`);
    }
    records.push(record);
  });
  return errors.length ? { ok: false, errors } : { ok: true, records };
}
