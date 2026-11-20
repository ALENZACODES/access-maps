/** Local-only, fail-closed notice placement planning. No provider data is fetched. */
import { SOURCE_IDS, SOURCES, UNKNOWN, normalizeLocale } from './attribution-utils.mjs';

export const PLACEMENT_SCHEMA = 'notice-placement-plan/1';
export { UNKNOWN, SOURCE_IDS };
export const MAX_BYTES = 1024 * 1024;
export const MAX_SURFACES = 120;
export const MAX_USES = 600;
export const MAX_LABEL = 160;
export const OSM_CREDIT = '© OpenStreetMap contributors';
export const TIERS = Object.freeze(['UNKNOWN', 'publisher', 'reviewed', 'community', 'imported']);
export const MODES = Object.freeze(['map', 'list', 'journey', 'download', 'other']);
export const LOCATIONS = Object.freeze(['near-content', 'details', 'footer', 'missing', 'UNKNOWN']);
export const STATES = Object.freeze(['UNKNOWN', 'yes', 'no']);

const surfaceFields = new Set(['id', 'name', 'mode', 'route', 'uses']);
const useFields = new Set(['sourceId', 'source', 'licence', 'retrievedOn', 'tier', 'location', 'credit', 'licenceVisible', 'keyboard', 'screenReader', 'minTargetPx', 'notes']);
const rootFields = new Set(['schema', 'surfaces']);
const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const prohibited = /[\u0000-\u001f\u007f]/u;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value, allowed, context) {
  if (!object(value)) throw new TypeError(`${context}: expected an object`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`${context}: unsupported field ${key}`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) throw new TypeError(`${context}: missing ${key}`);
}
function text(value, name, max = MAX_LABEL) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || prohibited.test(value)) {
    throw new TypeError(`${name}: invalid text`);
  }
  return value.trim();
}
function multiline(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0009\u000b-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${name}: invalid text`);
  }
  return value.trim();
}
function choice(value, allowed, name) {
  if (!allowed.includes(value)) throw new TypeError(`${name}: unrecognised value`);
  return value;
}
function date(value, name) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new TypeError(`${name}: expected YYYY-MM-DD or UNKNOWN`);
  const dateValue = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(dateValue.valueOf()) || dateValue.toISOString().slice(0, 10) !== value) throw new TypeError(`${name}: invalid calendar date`);
  return value;
}
function route(value) {
  if (value === UNKNOWN) return value;
  if (typeof value !== 'string' || value.length > 240 || !/^\/(?!\/)[a-zA-Z0-9/_#?=&.%-]*$/u.test(value) || value.includes('..')) {
    throw new TypeError('surface route: expected a local path or UNKNOWN');
  }
  return value;
}
function use(value, context) {
  exactKeys(value, useFields, context);
  const sourceId = choice(value.sourceId, SOURCE_IDS, `${context}.sourceId`);
  const source = text(value.source, `${context}.source`);
  const licence = text(value.licence, `${context}.licence`);
  const retrievedOn = date(value.retrievedOn, `${context}.retrievedOn`);
  const tier = choice(value.tier, TIERS, `${context}.tier`);
  const location = choice(value.location, LOCATIONS, `${context}.location`);
  const credit = multiline(value.credit, `${context}.credit`, 2500);
  const licenceVisible = choice(value.licenceVisible, STATES, `${context}.licenceVisible`);
  const keyboard = choice(value.keyboard, STATES, `${context}.keyboard`);
  const screenReader = choice(value.screenReader, STATES, `${context}.screenReader`);
  const minTargetPx = value.minTargetPx === UNKNOWN ? UNKNOWN : value.minTargetPx;
  if (minTargetPx !== UNKNOWN && (!Number.isInteger(minTargetPx) || minTargetPx < 0 || minTargetPx > 1000)) {
    throw new TypeError(`${context}.minTargetPx: expected 0–1000 or UNKNOWN`);
  }
  const notes = value.notes === UNKNOWN ? UNKNOWN : multiline(value.notes, `${context}.notes`, 1000);
  return { sourceId, source, licence, retrievedOn, tier, location, credit, licenceVisible, keyboard, screenReader, minTargetPx, notes };
}
function surface(value, index) {
  const context = `surface ${index + 1}`;
  exactKeys(value, surfaceFields, context);
  const id = text(value.id, `${context}.id`, 80);
  if (!idPattern.test(id)) throw new TypeError(`${context}.id: expected a lowercase hyphenated ID`);
  const name = text(value.name, `${context}.name`);
  const mode = choice(value.mode, MODES, `${context}.mode`);
  const path = route(value.route);
  if (!Array.isArray(value.uses) || value.uses.length > SOURCE_IDS.length) throw new TypeError(`${context}.uses: too many entries`);
  const uses = value.uses.map((item, number) => use(item, `${context}.uses[${number}]`));
  const sourceIds = uses.map((item) => item.sourceId);
  if (new Set(sourceIds).size !== sourceIds.length) throw new TypeError(`${context}: repeated source`);
  return { id, name, mode, route: path, uses };
}
/** Strictly parse a user-selected local plan; never auto-complete evidence. */
export function parsePlan(input) {
  const raw = typeof input === 'string' ? (() => {
    if (new TextEncoder().encode(input).byteLength > MAX_BYTES) throw new TypeError('Plan exceeds size limit');
    return JSON.parse(input);
  })() : input;
  exactKeys(raw, rootFields, 'plan');
  if (raw.schema !== PLACEMENT_SCHEMA) throw new TypeError('Unsupported placement schema');
  if (!Array.isArray(raw.surfaces) || raw.surfaces.length > MAX_SURFACES) throw new TypeError('Invalid surface count');
  const surfaces = raw.surfaces.map(surface);
  if (surfaces.reduce((n, item) => n + item.uses.length, 0) > MAX_USES) throw new TypeError('Too many source uses');
  if (new Set(surfaces.map((item) => item.id)).size !== surfaces.length) throw new TypeError('Repeated surface ID');
  return { schema: PLACEMENT_SCHEMA, surfaces };
}
export function blankPlan() { return { schema: PLACEMENT_SCHEMA, surfaces: [] }; }
export function blankUse(sourceId) {
  if (!SOURCE_IDS.includes(sourceId)) throw new TypeError('Unrecognised source');
  return {
    sourceId, source: SOURCES[sourceId].name, licence: UNKNOWN, retrievedOn: UNKNOWN,
    tier: UNKNOWN, location: UNKNOWN, credit: UNKNOWN, licenceVisible: UNKNOWN,
    keyboard: UNKNOWN, screenReader: UNKNOWN, minTargetPx: UNKNOWN, notes: UNKNOWN,
  };
}
export function addSurface(plan, name, mode = 'other') {
  const current = parsePlan(plan);
  if (current.surfaces.length >= MAX_SURFACES) throw new RangeError('Surface limit reached');
  const cleanName = text(name, 'surface name');
  choice(mode, MODES, 'mode');
  let counter = 1;
  while (current.surfaces.some((item) => item.id === `view-${counter}`)) counter += 1;
  return parsePlan({ ...current, surfaces: [...current.surfaces, { id: `view-${counter}`, name: cleanName, mode, route: UNKNOWN, uses: [] }] });
}
export function removeSurface(plan, id) {
  const current = parsePlan(plan);
  return parsePlan({ ...current, surfaces: current.surfaces.filter((item) => item.id !== id) });
}
export function setSurface(plan, id, patch) {
  const current = parsePlan(plan);
  if (!current.surfaces.some((item) => item.id === id)) throw new TypeError('No matching surface');
  return parsePlan({ ...current, surfaces: current.surfaces.map((item) => item.id === id ? { ...item, ...patch, id } : item) });
}
export function setUse(plan, id, sourceId, patch) {
  if (!SOURCE_IDS.includes(sourceId)) throw new TypeError('Unrecognised source');
  const current = parsePlan(plan);
  const match = current.surfaces.find((item) => item.id === id);
  if (!match) throw new TypeError('No matching surface');
  const previous = match.uses.find((item) => item.sourceId === sourceId) ?? blankUse(sourceId);
  const next = { ...previous, ...patch, sourceId };
  return setSurface(current, id, { uses: [...match.uses.filter((item) => item.sourceId !== sourceId), next] });
}
export function dropUse(plan, id, sourceId) {
  const current = parsePlan(plan);
  const match = current.surfaces.find((item) => item.id === id);
  if (!match) throw new TypeError('No matching surface');
  return setSurface(current, id, { uses: match.uses.filter((item) => item.sourceId !== sourceId) });
}
export function requiredNotices(sourceId, locale = 'en') {
  if (!SOURCE_IDS.includes(sourceId)) throw new TypeError('Unrecognised source');
  return [...SOURCES[sourceId].notices[normalizeLocale(locale)]];
}
export function downloadName(locale) { return `notice-placement-${normalizeLocale(locale)}.json`; }
export function serializePlan(plan) { return `${JSON.stringify(parsePlan(plan), null, 2)}\n`; }
