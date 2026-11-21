import { createHash } from 'node:crypto';

export const SOURCE_STATES = Object.freeze(['active', 'held', 'retired', 'superseded']);
export const HOLD_REASONS = Object.freeze(['licence-review', 'source-correction', 'withdrawal-notice', 'integrity-failure', 'provenance-gap', 'date-conflict', 'other']);
export const RECORD_STATES = Object.freeze(['usable', 'review-required', 'quarantined', 'retired']);
export const ASSET_STATES = Object.freeze(['current', 'stale', 'quarantined', 'removed']);
export const PACKAGE_STATES = Object.freeze(['draft', 'ready', 'held', 'withdrawn']);
export const LICENCES = Object.freeze(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0', 'UNKNOWN']);
export const SILOS = Object.freeze(['open', 'odbl']);
export const MAX_SOURCES = 5000;
export const MAX_RECORDS = 20000;
export const MAX_ASSETS = 20000;
export const MAX_PACKAGES = 5000;
export const MAX_EVENTS = 100000;
export const MAX_LINKS = 100000;
export class ImpactError extends Error {
  constructor(code, message) { super(message); this.name = 'ImpactError'; this.code = code; }
}
export function fail(condition, code, message) { if (!condition) throw new ImpactError(code, message); }
export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function exact(value, required, optional = []) {
  fail(isObject(value), 'SHAPE', 'Expected a plain object.');
  const allowed = new Set([...required, ...optional]);
  fail(required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => allowed.has(key)), 'SHAPE', 'Object fields do not match contract.');
}
export function id(value, field = 'id') {
  fail(typeof value === 'string' && value.length <= 96 &&
    /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(value), 'ID', `${field} is invalid.`);
  return value;
}
export function token(value, field = 'token') {
  id(value, field);
  fail(!/^(?:person|name|email|phone|reviewer)-/iu.test(value), 'PRIVATE', `${field} must be opaque.`);
  return value;
}
export function safeText(value, field, max = 1000) {
  fail(typeof value === 'string' && value.length > 0 && value.length <= max &&
    value === value.trim(), 'TEXT', `${field} is invalid.`);
  fail(!/[\u0000-\u001f\u007f]/u.test(value), 'CONTROL', `${field} has control characters.`);
  fail(!/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b)/iu.test(value),
    'PRIVATE', `${field} contains contact information.`);
  fail(!/<\s*\/?\s*[a-z]|javascript\s*:|\bon[a-z]+\s*=/iu.test(value), 'UNSAFE', `${field} contains markup.`);
  fail(!/\b(?:guaranteed|real[- ]time|partnership|garanti|temps réel|partenariat)\b/iu.test(value),
    'OVERCLAIM', `${field} contains a prohibited claim.`);
  return value;
}
export function date(value, field = 'date') {
  fail(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value), 'DATE', `${field} must be YYYY-MM-DD.`);
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(0);
  candidate.setUTCHours(0, 0, 0, 0);
  candidate.setUTCFullYear(year, month - 1, day);
  fail(year > 0 && candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day,
    'DATE', `${field} is not a calendar date.`);
  return value;
}
export function hash(value, field = 'digest') {
  fail(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), 'HASH', `${field} must be SHA-256.`);
  return value;
}
export function integer(value, field, min = 0, max = 100000) {
  fail(Number.isSafeInteger(value) && value >= min && value <= max, 'INTEGER', `${field} outside bounds.`);
  return value;
}
export function unique(values, field = 'values') {
  fail(Array.isArray(values) && new Set(values).size === values.length, 'DUPLICATE', `${field} must be unique.`);
}
export function canonical(value, depth = 0) {
  fail(depth <= 32, 'LIMIT', 'Document nesting is too deep.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    fail(Number.isFinite(value) && !Object.is(value, -0), 'NUMBER', 'Number is not canonical.');
    return value;
  }
  if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1));
  fail(isObject(value), 'SHAPE', 'Only plain JSON values are supported.');
  const output = {};
  for (const key of Object.keys(value).sort()) {
    fail(!['__proto__', 'constructor', 'prototype'].includes(key), 'UNSAFE', 'Unsafe object key.');
    output[key] = canonical(value[key], depth + 1);
  }
  return output;
}
export function stableJson(value) { return JSON.stringify(canonical(value)); }
export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}
export function bodyDigest(value) { const { digest: ignored, ...body } = value; return sha256(body); }
export function copy(value) { return structuredClone(value); }
export function sorted(values, key) {
  return [...values].sort((a, b) => String(key(a)).localeCompare(String(key(b)), 'en'));
}
export function siloForLicence(licence) { return licence === 'ODbL-1.0' ? 'odbl' : 'open'; }
export function pathSafe(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 400 ||
      value.startsWith('/') || /[\\%?#:\u0000-\u001f\u007f]/u.test(value)) return false;
  return value.split('/').every(part => part && part !== '.' && part !== '..' &&
    part.trim() === part && !part.startsWith('.'));
}
export function frenchText(value) {
  if (typeof value !== 'string') return false;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (';!?'.includes(value[i]) && i > 0 && value[i - 1] !== '\u202f') return false;
    if (value[i] === '«' && value[i + 1] !== '\u202f') return false;
    if (value[i] === '»' && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
export function bilingual(value, field = 'copy') {
  exact(value, ['en', 'fr']);
  safeText(value.en, `${field}.en`);
  safeText(value.fr, `${field}.fr`);
  fail(frenchText(value.fr), 'TYPOGRAPHY', `${field}.fr has invalid French spacing.`);
  return copy(value);
}
export function eventHash(row) { const { hash: ignored, ...body } = row; return sha256(body); }
export function appendEvent(ledger, type, at, by, payload) {
  fail(ledger.events.length < MAX_EVENTS, 'LIMIT', 'Event limit reached.');
  const previous = ledger.events.at(-1);
  const event = { sequence: ledger.events.length + 1, type, at, actor: by,
    payload: copy(payload), previousHash: previous?.hash ?? '0'.repeat(64), hash: '' };
  event.hash = eventHash(event);
  ledger.events.push(event);
  ledger.digest = bodyDigest(ledger);
  return event;
}
export function noIdentity(value) {
  const serialized = JSON.stringify(value);
  fail(!/"(?:fullName|legalName|email|phone|address|reviewerName|personName)"\s*:/iu.test(serialized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(serialized), 'PRIVATE', 'Export contains identity-bearing data.');
}
