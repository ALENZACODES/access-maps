/** Shared strict parsing primitives for deterministic offline audit gates. */
import { OPEN_LICENCES } from './index.ts';

export type Locale = 'en' | 'fr';
export type SiloName = 'open' | 'odbl';
export type AccessValue = 'YES' | 'NO' | 'UNKNOWN';
export type FindingLevel = 'ERROR' | 'NOTICE';
export interface Finding {
  readonly code: string;
  readonly level: FindingLevel;
  readonly path: string;
  readonly en: string;
  readonly fr: string;
}
export interface FindingReport<T> {
  readonly ok: boolean;
  readonly findings: readonly Finding[];
  readonly summary: T;
}
export interface SourceStamp {
  readonly source: string;
  readonly licence: string;
  readonly observedOn: string;
  readonly reference: string;
}
export const DAY_MS = 86_400_000;
const OPEN = new Set<string>(OPEN_LICENCES);
const HELD = /mi[\s._\-]*way/i;
const EXTERNAL_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const RESERVED_PATH = /(?:^|\/)(?:\.|\.\.)(?:\/|$)/;

export function dictionary(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function requiredString(value: unknown, max = 512): value is string {
  return typeof value === 'string' && value.trim().length > 0 &&
    value === value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
export function exactFields(value: Record<string, unknown>, required: readonly string[],
  optional: readonly string[] = []): boolean {
  return required.every(k => Object.hasOwn(value, k)) &&
    Object.keys(value).every(k => required.includes(k) || optional.includes(k));
}
export function calendarDay(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day) return null;
  return parsed.getTime() / DAY_MS;
}
export function dateWithin(value: unknown, asOf: unknown, maxAgeDays: number): boolean {
  const actual = calendarDay(value);
  const now = calendarDay(asOf);
  return actual !== null && now !== null && Number.isSafeInteger(maxAgeDays) &&
    maxAgeDays >= 0 && actual <= now && now - actual <= maxAgeDays;
}
export function heldSource(value: unknown): boolean {
  return typeof value === 'string' &&
    (HELD.test(value) || value.toLowerCase().replace(/[^a-z0-9]/g, '').includes('miway'));
}
export function licenceAllowed(value: unknown): value is string {
  return typeof value === 'string' && OPEN.has(value);
}
export function localReference(value: unknown): value is string {
  if (!requiredString(value, 512)) return false;
  if (EXTERNAL_SCHEME.test(value) || value.includes('\\') || value.includes('?') ||
      value.includes('#') || value.startsWith('/') || value.includes('%') ||
      RESERVED_PATH.test(value)) return false;
  return value.split('/').every(part => part !== '' && part !== '.' && part !== '..' &&
    !part.includes(':'));
}
export function validSourceStamp(value: unknown): value is SourceStamp {
  return dictionary(value) &&
    exactFields(value, ['source', 'licence', 'observedOn', 'reference']) &&
    requiredString(value.source) && !heldSource(value.source) &&
    licenceAllowed(value.licence) && calendarDay(value.observedOn) !== null &&
    localReference(value.reference);
}
export function validSilo(value: unknown): value is SiloName {
  return value === 'open' || value === 'odbl';
}
export function validAccess(value: unknown): value is AccessValue {
  return value === 'YES' || value === 'NO' || value === 'UNKNOWN';
}
export function sameStamp(a: SourceStamp, b: SourceStamp): boolean {
  return a.source === b.source && a.licence === b.licence &&
    a.observedOn === b.observedOn && a.reference === b.reference;
}
export function evidenceSilo(stamps: readonly SourceStamp[]): SiloName {
  return stamps.some(s => s.licence === 'ODbL-1.0') ? 'odbl' : 'open';
}
export function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}
export function stableFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => a.path.localeCompare(b.path, 'en') ||
    a.code.localeCompare(b.code, 'en') || a.level.localeCompare(b.level, 'en'));
}
export function finish<T>(findings: readonly Finding[], summary: T): FindingReport<T> {
  const sorted = stableFindings(findings);
  return { ok: !sorted.some(f => f.level === 'ERROR'), findings: sorted, summary };
}
export function makeEmitter(findings: Finding[],
  wording: Readonly<Record<string, readonly [string, string]>>):
  (code: string, path: string, level?: FindingLevel) => void {
  return (code, path, level = 'ERROR') => {
    const words = wording[code];
    if (!words) throw new Error(`Missing audit wording for ${code}`);
    findings.push({ code, level, path, en: words[0], fr: words[1] });
  };
}
export function textReport(report: FindingReport<unknown>, locale: Locale): string {
  const header = locale === 'fr' ? (report.ok ? 'Contrôle réussi' : 'Exportation bloquée') :
    (report.ok ? 'Check passed' : 'Export blocked');
  const lines = [header];
  for (const finding of report.findings) {
    lines.push(`${finding.level} ${finding.code} ${finding.path}: ${finding[locale]}`);
  }
  return `${lines.join('\n')}\n`;
}
export function safeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(value) &&
    value.length <= 96;
}
export function hasPiiLikeText(value: string): boolean {
  return /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\b(?:token|password|apikey|secret|authorization)\s*[:=])/i.test(value);
}
export function hasUnsafeContent(value: string): boolean {
  return /<\s*\/?\s*(?:script|iframe|object|embed|form|style)\b|\bon\w+\s*=|javascript:|data:text\/html|\u0000/i.test(value);
}
export function asArray(value: unknown, limit = 10000): readonly unknown[] | null {
  return Array.isArray(value) && value.length <= limit ? value : null;
}
export function sortedCopy<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => key(a).localeCompare(key(b), 'en'));
}
