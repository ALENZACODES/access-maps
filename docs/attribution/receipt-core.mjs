/**
 * Portable, read-only attribution receipts for individual publication surfaces.
 * The catalogue supplies source names and legal phrases; the release package
 * supplies the actual dataset-specific evidence. Neither is inferred from the
 * other. No network, clock or browser storage is accessed by this module.
 */
import { parseReleasePackage, parseReleasePackageText } from './disclosure-core.mjs';
import { UNKNOWN } from './provenance-core.mjs';
import {
  SOURCES,
  METROLINX_AUA_LEGEND,
  METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';

export const RECEIPT_VERSION = 1;
export const MAX_RECEIPT_BYTES = 1_048_576;
export const RECEIPT_FIELDS = Object.freeze([
  'version', 'surfaceId', 'route', 'language', 'title', 'delivery', 'surfaceDate',
  'reviewedOn', 'keyboard', 'screenReader', 'minimumTargetPx', 'credits',
  'sourceNotices', 'datasets', 'status',
]);
export const DATASET_FIELDS = Object.freeze([
  'id', 'provider', 'name', 'sourceUrl', 'licence', 'licenceUrl', 'acquiredOn',
  'datasetAsOf', 'termsReviewedOn', 'permission', 'status', 'notices',
]);
export const LOCALES = Object.freeze(['en', 'fr']);
export const RECEIPT_STATUSES = Object.freeze(['ready', 'held']);
const ID = /^[a-z][a-z0-9_-]{0,63}$/u;
const HTTPS_PATTERN = /^https:\/\//iu;

export class ReceiptError extends Error {
  constructor(code, path) {
    super(`${code} at ${path}`);
    this.name = 'ReceiptError';
    this.code = code;
    this.path = path;
  }
}

function fail(code, path) { throw new ReceiptError(code, path); }
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function keys(value, allowed, path) {
  if (!plain(value)) fail('NOT_OBJECT', path);
  if (Object.keys(value).length !== allowed.length ||
      allowed.some((name) => !Object.hasOwn(value, name))) fail('RECEIPT_FIELDS', path);
}
function valueString(value, path, limit = 4000) {
  if (typeof value !== 'string' || value.length > limit || !value.length ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) fail('RECEIPT_STRING', path);
  return value;
}
function date(value, path) {
  if (value === UNKNOWN) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) fail('RECEIPT_DATE', path);
  const stamp = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(stamp.getTime()) || stamp.toISOString().slice(0, 10) !== value) {
    fail('RECEIPT_DATE', path);
  }
  return value;
}
function safeAddress(value, path) {
  if (value === UNKNOWN) return UNKNOWN;
  if (typeof value !== 'string' || !HTTPS_PATTERN.test(value) || value.length > 2048) fail('RECEIPT_URL', path);
  let parsed;
  try { parsed = new URL(value); } catch { fail('RECEIPT_URL', path); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    fail('RECEIPT_URL', path);
  }
  return value;
}
function noticeStrings(notices, path) {
  if (!Array.isArray(notices) || notices.length > 12) fail('RECEIPT_NOTICES', path);
  const unique = new Set();
  for (const [index, item] of notices.entries()) {
    valueString(item, `${path}[${index}]`);
    if (unique.has(item)) fail('DUPLICATE_NOTICE', path);
    unique.add(item);
  }
  return Object.freeze([...notices]);
}
function strictDataset(value, path) {
  keys(value, DATASET_FIELDS, path);
  const id = valueString(value.id, `${path}.id`, 64);
  if (!ID.test(id)) fail('RECEIPT_ID', `${path}.id`);
  if (!['osm', 'metrolinx', 'ltc', 'other'].includes(value.provider)) {
    fail('RECEIPT_PROVIDER', `${path}.provider`);
  }
  if (!['included', 'held', 'excluded'].includes(value.status)) fail('RECEIPT_STATUS', `${path}.status`);
  if (![true, false, UNKNOWN].includes(value.permission)) fail('RECEIPT_PERMISSION', `${path}.permission`);
  return Object.freeze({
    id,
    provider: value.provider,
    name: valueString(value.name, `${path}.name`, 500),
    sourceUrl: safeAddress(value.sourceUrl, `${path}.sourceUrl`),
    licence: valueString(value.licence, `${path}.licence`, 256),
    licenceUrl: safeAddress(value.licenceUrl, `${path}.licenceUrl`),
    acquiredOn: date(value.acquiredOn, `${path}.acquiredOn`),
    datasetAsOf: date(value.datasetAsOf, `${path}.datasetAsOf`),
    termsReviewedOn: date(value.termsReviewedOn, `${path}.termsReviewedOn`),
    permission: value.permission,
    status: value.status,
    notices: noticeStrings(value.notices, `${path}.notices`),
  });
}

/** Safe import shape: deterministic, exact keys, bounded and explicitly versioned. */
export function parseReceipt(value) {
  keys(value, RECEIPT_FIELDS, 'receipt');
  if (value.version !== RECEIPT_VERSION) fail('RECEIPT_VERSION', 'receipt.version');
  const surfaceId = valueString(value.surfaceId, 'receipt.surfaceId', 64);
  if (!ID.test(surfaceId)) fail('RECEIPT_ID', 'receipt.surfaceId');
  const route = valueString(value.route, 'receipt.route', 256);
  if (!/^\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*)?$/u.test(route)) fail('RECEIPT_ROUTE', 'receipt.route');
  if (!LOCALES.includes(value.language)) fail('RECEIPT_LOCALE', 'receipt.language');
  if (!['online', 'offline', 'both', UNKNOWN].includes(value.delivery)) fail('RECEIPT_DELIVERY', 'receipt.delivery');
  if (!['yes', 'no', UNKNOWN].includes(value.keyboard) ||
      !['yes', 'no', UNKNOWN].includes(value.screenReader)) fail('RECEIPT_ACCESS', 'receipt');
  const target = value.minimumTargetPx;
  if (target !== UNKNOWN && (!Number.isInteger(target) || target < 0 || target > 1000)) {
    fail('RECEIPT_TARGET', 'receipt.minimumTargetPx');
  }
  if (!RECEIPT_STATUSES.includes(value.status)) fail('RECEIPT_STATUS', 'receipt.status');
  if (!Array.isArray(value.datasets) || value.datasets.length > 250) fail('RECEIPT_DATASETS', 'receipt.datasets');
  const datasets = value.datasets.map((dataset, index) => strictDataset(dataset, `receipt.datasets[${index}]`));
  if (new Set(datasets.map((dataset) => dataset.id)).size !== datasets.length) fail('DUPLICATE_DATASET', 'receipt.datasets');
  return Object.freeze({
    version: RECEIPT_VERSION,
    surfaceId,
    route,
    language: value.language,
    title: valueString(value.title, 'receipt.title', 500),
    delivery: value.delivery,
    surfaceDate: date(value.surfaceDate, 'receipt.surfaceDate'),
    reviewedOn: date(value.reviewedOn, 'receipt.reviewedOn'),
    keyboard: value.keyboard,
    screenReader: value.screenReader,
    minimumTargetPx: target,
    credits: valueString(value.credits, 'receipt.credits'),
    sourceNotices: valueString(value.sourceNotices, 'receipt.sourceNotices'),
    datasets: Object.freeze(datasets),
    status: value.status,
  });
}

export function parseReceiptText(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_RECEIPT_BYTES) {
    fail('RECEIPT_SIZE', 'receipt');
  }
  let raw;
  try { raw = JSON.parse(text); } catch { fail('RECEIPT_JSON', 'receipt'); }
  return parseReceipt(raw);
}

export function encodeReceipt(value) {
  const receipt = parseReceipt(value);
  const text = `${JSON.stringify(receipt, null, 2)}\n`;
  if (new TextEncoder().encode(text).length > MAX_RECEIPT_BYTES) fail('RECEIPT_SIZE', 'receipt');
  return text;
}

/**
 * Legal notices are chosen from the actual feed licence, not from provider
 * identity alone. Metrolinx AUA and OGL must never be conflated.
 */
export function legalNotices(record, locale) {
  if (!LOCALES.includes(locale)) fail('RECEIPT_LOCALE', 'locale');
  switch (record.provider) {
    case 'osm':
      if (record.licence !== 'ODbL-1.0') return [];
      return [...SOURCES.osm.notices[locale]];
    case 'metrolinx':
      if (record.licence === 'Metrolinx-AUA') {
        return [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN,
          METROLINX_AUA_END_USER_LAWS_FR];
      }
      if (record.licence === 'OGL-Ontario-Metrolinx') return [METROLINX_OGL_NOTICE];
      return [];
    case 'ltc':
      return record.licence === 'LTC-Open-Data-Terms' ? [...SOURCES.ltc.notices[locale]] : [];
    default:
      return [];
  }
}

/** A visible data date is sourced from the surface, never auto-filled. */
export function createReceipt(input, surfaceId, language) {
  if (!LOCALES.includes(language)) fail('RECEIPT_LOCALE', 'language');
  const bundle = parseReleasePackage(input);
  const surface = bundle.register.surfaces.find((item) => item.id === surfaceId);
  if (!surface) fail('SURFACE_MISSING', 'surfaceId');
  const byId = new Map(bundle.inventory.records.map((item) => [item.id, item]));
  const datasets = surface.sourceIds.map((id) => {
    const record = byId.get(id);
    if (!record) fail('DATASET_MISSING', `surface.${surface.id}.${id}`);
    return {
      id: record.id,
      provider: record.provider,
      name: record.sourceName,
      sourceUrl: record.sourceUrl,
      licence: record.licence,
      licenceUrl: record.licenceUrl,
      acquiredOn: record.acquiredOn,
      datasetAsOf: record.datasetAsOf,
      termsReviewedOn: record.termsReviewedOn,
      permission: record.redistributionAllowed,
      status: record.status,
      notices: legalNotices(record, language),
    };
  });
  return parseReceipt({
    version: RECEIPT_VERSION,
    surfaceId: surface.id,
    route: surface.path,
    language,
    title: language === 'fr' ? surface.titleFr : surface.titleEn,
    delivery: surface.delivery,
    surfaceDate: surface.sourceDate,
    reviewedOn: surface.lastReviewedOn,
    keyboard: surface.supportsKeyboard,
    screenReader: surface.supportsScreenReader,
    minimumTargetPx: surface.minimumTargetPx,
    credits: language === 'fr' ? surface.creditFr : surface.creditEn,
    sourceNotices: language === 'fr' ? surface.noticeFr : surface.noticeEn,
    datasets,
    status: surface.state === 'included' ? 'ready' : 'held',
  });
}

export function createReceipts(input, language = 'en') {
  const bundle = parseReleasePackage(input);
  return bundle.register.surfaces.map((surface) => createReceipt(bundle, surface.id, language));
}

export function createReceiptFromText(text, surfaceId, locale = 'en') {
  return createReceipt(parseReleasePackageText(text), surfaceId, locale);
}

/** Comparisons operate on evidence fields, ignoring key ordering in JSON. */
export function receiptEqual(left, right) {
  return encodeReceipt(left) === encodeReceipt(right);
}

export function receiptSourceIds(receipt) {
  return parseReceipt(receipt).datasets.map((dataset) => dataset.id);
}

export function receiptSummary(receipt) {
  const value = parseReceipt(receipt);
  return Object.freeze({
    surfaceId: value.surfaceId,
    language: value.language,
    sources: value.datasets.length,
    datesUnknown: value.datasets.filter((dataset) => dataset.datasetAsOf === UNKNOWN).length,
    permissionUnknown: value.datasets.filter((dataset) => dataset.permission === UNKNOWN).length,
    offline: value.delivery === 'offline' || value.delivery === 'both',
  });
}

/** Plain text suitable for a local device; no markup or external links fetched. */
export function receiptAsText(receipt) {
  const value = parseReceipt(receipt);
  const fr = value.language === 'fr';
  const t = fr
    ? { route: 'Parcours', source: 'Source', licence: 'Licence', date: 'Données en date du\u00a0:',
      permission: 'Permission', reviewed: 'Conditions consultées le', notice: 'Mentions',
      credit: 'Crédits', delivery: 'Distribution', accessibility: 'Accès documenté' }
    : { route: 'Route', source: 'Source', licence: 'Licence', date: 'Data as of:',
      permission: 'Permission', reviewed: 'Terms reviewed', notice: 'Notices',
      credit: 'Credits', delivery: 'Delivery', accessibility: 'Documented access' };
  const separator = fr ? '\u00a0:' : ':';
  const lines = [value.title, `${t.route}${separator} ${value.route}`, `${t.date} ${value.surfaceDate}`,
    `${t.delivery}${separator} ${value.delivery}`, `${t.accessibility}${separator} ${value.keyboard} / ${value.screenReader} / ${value.minimumTargetPx}`,
    `${t.credit}${separator} ${value.credits}`, `${t.notice}${separator} ${value.sourceNotices}`];
  for (const dataset of value.datasets) {
    lines.push('', `${t.source}${separator} ${dataset.name} (${dataset.id})`,
      `${t.licence}${separator} ${dataset.licence}`, dataset.sourceUrl, dataset.licenceUrl,
      `${t.date} ${dataset.datasetAsOf}`, `${t.reviewed}${separator} ${dataset.termsReviewedOn}`,
      `${t.permission}${separator} ${dataset.permission}`, ...dataset.notices);
  }
  return `${lines.join('\n')}\n`;
}
