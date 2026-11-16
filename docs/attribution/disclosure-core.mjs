/**
 * Offline publication surface register. A surface represents one location in
 * the App where externally sourced material may appear. All supplied facts
 * are explicit; absence is UNKNOWN, never a positive claim.
 */
import {
  UNKNOWN, isKnownDate, isPlainObject, parseInventory, parseInventoryText,
  isSafeUrl, MAX_DOCUMENT_BYTES,
} from './provenance-core.mjs';

export const DISCLOSURE_VERSION = 1;
export const MAX_SURFACES = 200;
export const MAX_LINKS = 1000;
export const MAX_SURFACE_BYTES = 1_048_576;
export const SURFACE_KINDS = Object.freeze(['map', 'journey', 'place', 'download', 'other']);
export const SURFACE_STATES = Object.freeze(['included', 'held', 'excluded']);
export const ACCESS_STATES = Object.freeze(['yes', 'no', UNKNOWN]);
export const DELIVERY = Object.freeze(['offline', 'online', 'both', UNKNOWN]);
export const DISCLOSURE_FIELDS = Object.freeze([
  'id', 'titleEn', 'titleFr', 'kind', 'state', 'path', 'delivery',
  'lastReviewedOn', 'sourceIds', 'creditEn', 'creditFr', 'noticeEn',
  'noticeFr', 'sourceDate', 'supportsKeyboard', 'supportsScreenReader',
  'minimumTargetPx', 'notesEn', 'notesFr',
]);
export const REGISTER_FIELDS = Object.freeze(['version', 'surfaces']);
export const SURFACE_ID = /^[a-z][a-z0-9_-]{0,63}$/u;
export const ROUTE_PATH = /^\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*)?$/u;

export class DisclosureError extends Error {
  constructor(code, path) {
    super(`${code}: ${path}`);
    this.name = 'DisclosureError';
    this.code = code;
    this.path = path;
  }
}

function fail(code, path) {
  throw new DisclosureError(code, path);
}

function exactKeys(value, allowed, path) {
  if (!isPlainObject(value)) fail('NOT_OBJECT', path);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail('UNEXPECTED_FIELD', `${path}.${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) fail('MISSING_FIELD', `${path}.${key}`);
  }
}

function text(value, path, length = 1000, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > length ||
      (!allowEmpty && !value.trim()) ||
      /[\u0000-\u001f\u007f]/u.test(value)) fail('INVALID_TEXT', path);
  return value;
}

function allowed(value, values, path) {
  if (!values.includes(value)) fail('INVALID_ENUM', path);
  return value;
}

function date(value, path) {
  if (value !== UNKNOWN && !isKnownDate(value)) fail('INVALID_DATE', path);
  return value;
}

function sourceIds(value, path) {
  if (!Array.isArray(value) || value.length > 100) fail('INVALID_SOURCES', path);
  const ids = new Set();
  return Object.freeze(value.map((item, index) => {
    if (typeof item !== 'string' || !SURFACE_ID.test(item)) {
      fail('INVALID_SOURCE_ID', `${path}[${index}]`);
    }
    if (ids.has(item)) fail('DUPLICATE_SOURCE', `${path}[${index}]`);
    ids.add(item);
    return item;
  }));
}

export function blankSurface(id = 'surface') {
  return {
    id, titleEn: UNKNOWN, titleFr: UNKNOWN, kind: 'other', state: 'held',
    path: '/', delivery: UNKNOWN, lastReviewedOn: UNKNOWN, sourceIds: [],
    creditEn: UNKNOWN, creditFr: UNKNOWN, noticeEn: UNKNOWN,
    noticeFr: UNKNOWN, sourceDate: UNKNOWN, supportsKeyboard: UNKNOWN,
    supportsScreenReader: UNKNOWN, minimumTargetPx: UNKNOWN,
    notesEn: '', notesFr: '',
  };
}

export function emptyRegister() {
  return { version: DISCLOSURE_VERSION, surfaces: [] };
}

export function parseSurface(value, path = 'surface') {
  exactKeys(value, DISCLOSURE_FIELDS, path);
  const id = text(value.id, `${path}.id`, 64);
  if (!SURFACE_ID.test(id)) fail('INVALID_ID', `${path}.id`);
  const route = text(value.path, `${path}.path`, 256);
  if (!ROUTE_PATH.test(route)) fail('INVALID_ROUTE', `${path}.path`);
  const target = value.minimumTargetPx;
  if (target !== UNKNOWN && (!Number.isSafeInteger(target) || target < 0 || target > 1000)) {
    fail('INVALID_TARGET', `${path}.minimumTargetPx`);
  }
  return Object.freeze({
    id,
    titleEn: text(value.titleEn, `${path}.titleEn`, 180),
    titleFr: text(value.titleFr, `${path}.titleFr`, 180),
    kind: allowed(value.kind, SURFACE_KINDS, `${path}.kind`),
    state: allowed(value.state, SURFACE_STATES, `${path}.state`),
    path: route,
    delivery: allowed(value.delivery, DELIVERY, `${path}.delivery`),
    lastReviewedOn: date(value.lastReviewedOn, `${path}.lastReviewedOn`),
    sourceIds: sourceIds(value.sourceIds, `${path}.sourceIds`),
    creditEn: text(value.creditEn, `${path}.creditEn`, 4000),
    creditFr: text(value.creditFr, `${path}.creditFr`, 4000),
    noticeEn: text(value.noticeEn, `${path}.noticeEn`, 4000),
    noticeFr: text(value.noticeFr, `${path}.noticeFr`, 4000),
    sourceDate: date(value.sourceDate, `${path}.sourceDate`),
    supportsKeyboard: allowed(value.supportsKeyboard, ACCESS_STATES, `${path}.supportsKeyboard`),
    supportsScreenReader: allowed(value.supportsScreenReader, ACCESS_STATES, `${path}.supportsScreenReader`),
    minimumTargetPx: target,
    notesEn: text(value.notesEn, `${path}.notesEn`, 4000, true),
    notesFr: text(value.notesFr, `${path}.notesFr`, 4000, true),
  });
}

export function parseRegister(value) {
  exactKeys(value, REGISTER_FIELDS, 'register');
  if (value.version !== DISCLOSURE_VERSION) fail('VERSION', 'register.version');
  if (!Array.isArray(value.surfaces) || value.surfaces.length > MAX_SURFACES) {
    fail('INVALID_SURFACES', 'register.surfaces');
  }
  const seen = new Set();
  const routes = new Set();
  let links = 0;
  const surfaces = value.surfaces.map((surface, index) => {
    const current = parseSurface(surface, `register.surfaces[${index}]`);
    if (seen.has(current.id)) fail('DUPLICATE_ID', `register.surfaces[${index}].id`);
    seen.add(current.id);
    if (current.state === 'included' && routes.has(current.path)) {
      fail('DUPLICATE_ROUTE', `register.surfaces[${index}].path`);
    }
    if (current.state === 'included') routes.add(current.path);
    links += current.sourceIds.length;
    if (links > MAX_LINKS) fail('TOO_MANY_LINKS', 'register.surfaces');
    return current;
  });
  return Object.freeze({
    version: DISCLOSURE_VERSION,
    surfaces: Object.freeze(surfaces),
  });
}

export function parseRegisterText(raw) {
  if (typeof raw !== 'string') fail('INVALID_TEXT', 'file');
  if (new TextEncoder().encode(raw).byteLength > MAX_SURFACE_BYTES) {
    fail('FILE_TOO_LARGE', 'file');
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { fail('INVALID_JSON', 'file'); }
  return parseRegister(parsed);
}

export function encodeRegister(value) {
  return `${JSON.stringify(parseRegister(value), null, 2)}\n`;
}

export function upsertSurface(register, raw) {
  const existing = parseRegister(register);
  const surface = parseSurface(raw);
  const surfaces = existing.surfaces.filter((item) => item.id !== surface.id);
  surfaces.push(surface);
  surfaces.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return parseRegister({ version: DISCLOSURE_VERSION, surfaces });
}

export function removeSurface(register, id) {
  if (typeof id !== 'string' || !SURFACE_ID.test(id)) fail('INVALID_ID', 'id');
  const current = parseRegister(register);
  return parseRegister({
    version: DISCLOSURE_VERSION,
    surfaces: current.surfaces.filter((item) => item.id !== id),
  });
}

export function updateSurfaceState(register, id, state) {
  allowed(state, SURFACE_STATES, 'state');
  const current = parseRegister(register);
  const surface = current.surfaces.find((item) => item.id === id);
  if (!surface) fail('MISSING_SURFACE', id);
  return upsertSurface(current, { ...surface, state });
}

export function copySurface(register, id, newId) {
  const current = parseRegister(register);
  const surface = current.surfaces.find((item) => item.id === id);
  if (!surface) fail('MISSING_SURFACE', id);
  return upsertSurface(current, { ...surface, id: newId, state: 'held' });
}

export function findSurface(register, id) {
  return parseRegister(register).surfaces.find((item) => item.id === id) ?? null;
}

export function searchSurfaces(register, query = {}) {
  const current = parseRegister(register);
  const state = query.state ?? 'all';
  const kind = query.kind ?? 'all';
  const phrase = String(query.text ?? '').trim().toLocaleLowerCase('en');
  if (state !== 'all') allowed(state, SURFACE_STATES, 'query.state');
  if (kind !== 'all') allowed(kind, SURFACE_KINDS, 'query.kind');
  return current.surfaces.filter((surface) =>
    (state === 'all' || surface.state === state) &&
    (kind === 'all' || surface.kind === kind) &&
    (!phrase || [surface.id, surface.titleEn, surface.titleFr, surface.path,
      ...surface.sourceIds].join(' ').toLocaleLowerCase('en').includes(phrase)));
}

export function registerCounts(register) {
  const surfaces = parseRegister(register).surfaces;
  return Object.freeze({
    total: surfaces.length,
    included: surfaces.filter((item) => item.state === 'included').length,
    held: surfaces.filter((item) => item.state === 'held').length,
    excluded: surfaces.filter((item) => item.state === 'excluded').length,
    offline: surfaces.filter((item) => item.delivery === 'offline' || item.delivery === 'both').length,
    unknownDelivery: surfaces.filter((item) => item.delivery === UNKNOWN).length,
    linkedSources: new Set(surfaces.flatMap((item) => item.sourceIds)).size,
  });
}

/** Import both documents as an indivisible operation. */
export function parseReleasePackage(value) {
  if (!isPlainObject(value)) fail('NOT_OBJECT', 'package');
  const keys = Object.keys(value).sort();
  if (keys.join('|') !== 'inventory|register') fail('PACKAGE_KEYS', 'package');
  return Object.freeze({
    inventory: parseInventory(value.inventory),
    register: parseRegister(value.register),
  });
}

export function parseReleasePackageText(textValue) {
  if (typeof textValue !== 'string') fail('INVALID_TEXT', 'package');
  if (new TextEncoder().encode(textValue).byteLength > MAX_DOCUMENT_BYTES * 2) {
    fail('FILE_TOO_LARGE', 'package');
  }
  let value;
  try { value = JSON.parse(textValue); } catch { fail('INVALID_JSON', 'package'); }
  return parseReleasePackage(value);
}

export function encodeReleasePackage(value) {
  const result = parseReleasePackage(value);
  return `${JSON.stringify(result, null, 2)}\n`;
}

/** Parse separately supplied files without modifying either source document. */
export function combineReleaseFiles(inventoryText, registerText) {
  return parseReleasePackage({
    inventory: parseInventoryText(inventoryText),
    register: parseRegisterText(registerText),
  });
}

export function sourceLink(record) {
  if (!record || record.sourceUrl === UNKNOWN || !isSafeUrl(record.sourceUrl)) return null;
  return record.sourceUrl;
}

/** Ensure text-only export contains exactly supplied provenance, no interpolation. */
export function surfaceCreditRows(surface, inventory) {
  const current = parseSurface(surface);
  const records = new Map(parseInventory(inventory).records.map((item) => [item.id, item]));
  return Object.freeze(current.sourceIds.map((id) => {
    const record = records.get(id);
    if (!record) return Object.freeze({ id, name: UNKNOWN, licence: UNKNOWN, date: UNKNOWN, url: null });
    return Object.freeze({
      id, name: record.sourceName, licence: record.licence,
      date: record.datasetAsOf, url: sourceLink(record),
    });
  }));
}
