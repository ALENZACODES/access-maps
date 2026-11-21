/** Deterministic, offline-only P15J validation primitives. */
export type Locale = 'en' | 'fr';
export type Access = 'YES' | 'NO' | 'UNKNOWN';
export type Silo = 'open' | 'odbl';
export type Severity = 'ERROR' | 'NOTICE';
export interface Finding {
  readonly code: string;
  readonly path: string;
  readonly severity: Severity;
  readonly en: string;
  readonly fr: string;
}
export interface Report<T> {
  readonly ok: boolean;
  readonly findings: readonly Finding[];
  readonly totals: T;
}
export type Words = Readonly<Record<string, readonly [string, string]>>;
export const OPEN_LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'ODbL-1.0', 'OGL-Canada-2.0', 'OGL-ON-1.0'] as const;
const OPEN_SET = new Set<string>(OPEN_LICENCES);
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function exact(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every(field => Object.hasOwn(value, field)) &&
    Object.keys(value).every(field => required.includes(field) || optional.includes(field));
}
export function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
export function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 100 &&
    /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(value) && !RESERVED.has(value);
}
export function printable(value: unknown, max = 500): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 &&
    value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
export function pathLocal(value: unknown): value is string {
  if (!printable(value, 512) || value.includes('\\') || value.includes('?') || value.includes('#') ||
      value.includes('%') || value.includes('://') || value.startsWith('/') || value.startsWith('~')) return false;
  return value.split('/').every(piece => piece !== '' && piece !== '.' && piece !== '..' &&
    !piece.includes(':') && !RESERVED.has(piece));
}
export function day(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(y, m - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date.getTime() / 86400000 : null;
}
export function held(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase().replace(/[^a-z0-9]/g, '').includes('miway');
}
export function openLicence(value: unknown): value is string {
  return typeof value === 'string' && OPEN_SET.has(value);
}
export function silo(value: unknown): value is Silo {
  return value === 'open' || value === 'odbl';
}
export function access(value: unknown): value is Access {
  return value === 'UNKNOWN' || value === 'YES' || value === 'NO';
}
export function safeText(value: unknown): value is string {
  return printable(value, 3000) &&
    !/(?:<\s*\/?\s*(?:script|iframe|object|embed|form|style)\b|\bon\w+\s*=|javascript:|data:text\/html)/i.test(value) &&
    !/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:token|apikey|password|secret)\s*[:=])/i.test(value);
}
export function frenchText(value: unknown): value is string {
  if (!safeText(value)) return false;
  if (/[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/.test(value)) return false;
  if (/(^|[^\u00a0]):/.test(value) && /\S:/.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if ((char === ';' || char === '!' || char === '?') && i > 0 && value[i - 1] !== '\u202f') return false;
    if (char === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (char === '«' && value[i + 1] !== '\u202f') return false;
    if (char === '»' && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
export function push(findings: Finding[], words: Words, code: string, path: string, severity: Severity = 'ERROR'): void {
  const message = words[code];
  if (!message) throw new Error(`Missing wording for ${code}`);
  findings.push({ code, path, severity, en: message[0], fr: message[1] });
}
export function finish<T>(findings: readonly Finding[], totals: T): Report<T> {
  const ordered = [...findings].sort((a, b) => a.path.localeCompare(b.path, 'en') ||
    a.code.localeCompare(b.code, 'en') || a.severity.localeCompare(b.severity, 'en'));
  return { ok: !ordered.some(f => f.severity === 'ERROR'), findings: ordered, totals };
}
export function render(report: Report<unknown>, locale: Locale): string {
  const heading = report.ok ? (locale === 'fr' ? 'Contrôle réussi' : 'Check passed') :
    (locale === 'fr' ? 'Publication bloquée' : 'Publication blocked');
  return [heading, ...report.findings.map(f => `${f.severity} ${f.code} ${f.path}: ${f[locale]}`)].join('\n') + '\n';
}
export interface Stamp { source: string; licence: string; observedOn: string; reference: string }
export function stamp(value: unknown): value is Stamp {
  return object(value) && exact(value, ['source', 'licence', 'observedOn', 'reference']) &&
    printable(value.source) && !held(value.source) && openLicence(value.licence) &&
    day(value.observedOn) !== null && pathLocal(value.reference);
}
export function stampKey(value: Stamp): string {
  return [value.source, value.licence, value.observedOn, value.reference].join('\u001f');
}
export function stampSilo(values: readonly Stamp[]): Silo {
  return values.some(v => v.licence === 'ODbL-1.0') ? 'odbl' : 'open';
}
export function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}
export function array(value: unknown, max = 5000): readonly unknown[] | null {
  return Array.isArray(value) && value.length <= max ? value : null;
}
export function current(value: unknown, asOf: unknown, maxAgeDays: unknown): boolean {
  const a = day(value);
  const b = day(asOf);
  return a !== null && b !== null && integer(maxAgeDays, 0, 3650) && a <= b && b - a <= maxAgeDays;
}
