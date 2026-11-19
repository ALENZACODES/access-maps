/**
 * P15P — deterministic, local-only offline attribution slice planner.
 *
 * The caller supplies a complete catalogue and a list of requested record ids.
 * The planner does not fetch anything, mutate source data or assume a positive
 * access condition from a missing observation. It produces a bounded subset
 * with all referenced sources and assets, or a bilingual failure report.
 */
import { createHash } from 'node:crypto';

const LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'ODbL-1.0', 'OGL-Canada-2.0', 'OGL-ON-1.0']);
const STATES = new Set(['YES', 'NO', 'UNKNOWN']);
const FEATURES = new Set(['entrance', 'washroom', 'lift', 'parking', 'path', 'seating']);
const SILOS = new Set(['open', 'odbl']);
const KEYS = Object.freeze({
  catalogue: ['schemaVersion', 'asOf', 'maxAgeDays', 'sources', 'records', 'assets'],
  source: ['id', 'name', 'licence', 'observedOn', 'reference'],
  record: ['id', 'en', 'fr', 'feature', 'access', 'tier', 'silo', 'sourceIds', 'assetIds', 'evidence'],
  asset: ['id', 'path', 'sha256', 'bytes', 'sourceIds', 'silo'],
  evidence: ['sourceId', 'observedOn', 'feature', 'access', 'tier'],
  request: ['ids', 'silo', 'maximumRecords', 'maximumBytes'],
});
const MESSAGES = Object.freeze({
  ROOT: ['Catalogue shape is incomplete.', 'Le catalogue est incomplet.'],
  OPTION: ['Selection options are incomplete.', 'Les options de sélection sont incomplètes.'],
  DATE: ['A date is missing or outside the permitted window.', 'Une date manque ou dépasse la période permise.'],
  FIELD: ['A record contains an unsupported value.', 'Une fiche contient une valeur non prise en charge.'],
  SOURCE: ['Source details are missing or not open.', 'Les renseignements de source manquent ou ne sont pas ouverts.'],
  ASSET: ['An offline asset is incomplete.', 'Un fichier hors ligne est incomplet.'],
  PATH: ['A local file reference is unsafe.', 'Une référence de fichier local est non sûre.'],
  TEXT: ['Bilingual text is missing or unsafe.', 'Le texte bilingue manque ou est non sûr.'],
  TYPOGRAPHY: ['French punctuation requires nonbreaking spacing.', 'La ponctuation française exige des espaces insécables.'],
  DUPLICATE: ['An identifier appears more than once.', 'Un identifiant apparaît plusieurs fois.'],
  MISSING: ['A requested or linked identifier is absent.', 'Un identifiant demandé ou lié est absent.'],
  SILO: ['The selected licence export is inconsistent.', 'L’exportation de licence choisie est incohérente.'],
  HELD: ['A held operator feed cannot enter this package.', 'Un flux retenu ne peut pas entrer dans ce paquet.'],
  EVIDENCE: ['A dated observation does not support the access value.', 'Une observation datée ne soutient pas l’état d’accès.'],
  TIER: ['The confidence tier is not supported.', 'Le niveau de confiance n’est pas soutenu.'],
  CONFLICT: ['Conflicting observations require UNKNOWN.', 'Des observations contradictoires exigent UNKNOWN.'],
  LIMIT: ['The selected package exceeds a limit.', 'Le paquet sélectionné dépasse une limite.'],
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value, names) {
  return isObject(value) && names.every(name => Object.hasOwn(value, name)) &&
    Object.keys(value).every(name => names.includes(name));
}
function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 96 &&
    /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(value);
}
function hasControl(value) {
  return [...value].some(char => {
    const cp = char.codePointAt(0);
    return cp !== undefined && (cp < 32 || (cp >= 127 && cp <= 159));
  });
}
function safeText(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 280 &&
    value.trim() === value && !hasControl(value) &&
    !/<\s*\/?\s*[a-z]|\bon\w+\s*=|\b(?:javascript|data)\s*:/iu.test(value) &&
    !/[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu.test(value) &&
    !/\b(?:password|token|api[-_]?key|private[-_]?key)\s*[:=]/iu.test(value);
}
function frenchSpacing(value) {
  if (/[a-zÀ-ÿ]'[a-zÀ-ÿ]/iu.test(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === ':' && index > 0 && value[index - 1] !== '\u00a0') return false;
    if (';!?'.includes(char) && index > 0 && value[index - 1] !== '\u202f') return false;
    if (char === '«' && value[index + 1] !== '\u202f') return false;
    if (char === '»' && value[index - 1] !== '\u202f') return false;
  }
  return true;
}
function localPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    !hasControl(value) && !value.startsWith('/') && !/[\\%?#:]/u.test(value) &&
    value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}
function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const instant = new Date(0);
  instant.setUTCHours(0, 0, 0, 0);
  instant.setUTCFullYear(year, month - 1, day);
  if (instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1 ||
      instant.getUTCDate() !== day) return null;
  return Math.floor(instant.getTime() / 86_400_000);
}
function uniqueIds(value) {
  return Array.isArray(value) && value.length <= 20000 &&
    value.every(identifier) && new Set(value).size === value.length;
}
function sourceSilo(source) {
  return source.licence === 'ODbL-1.0' ? 'odbl' : 'open';
}
function stableOrder(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
function sorted(items) {
  return [...items].sort(stableOrder);
}
function shaText(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function report(issues, selected) {
  const ordered = [...issues].sort((a, b) => a.path.localeCompare(b.path, 'en') ||
    a.code.localeCompare(b.code, 'en'));
  return { ok: ordered.length === 0, issues: ordered, ...(ordered.length === 0 ? { slice: selected } : {}) };
}

/**
 * Build a complete dependency-closed subset of the catalogue.
 * No file or network access occurs. A failure never returns a partial slice.
 *
 * @param {unknown} catalogue Caller-supplied data; no inferred facts.
 * @param {unknown} request Ordered record ids, target silo and bounded quotas.
 * @returns {{ok:boolean,issues:Array<object>,slice?:object}}
 */
export function planOfflineSlice(catalogue, request) {
  const issues = [];
  function add(code, path) {
    const [en, fr] = MESSAGES[code];
    issues.push({ code, path, en, fr });
  }
  if (!exact(catalogue, KEYS.catalogue) || catalogue.schemaVersion !== 1 ||
      !Array.isArray(catalogue.sources) || !Array.isArray(catalogue.records) ||
      !Array.isArray(catalogue.assets)) {
    add('ROOT', '$');
    return report(issues);
  }
  if (!exact(request, KEYS.request) || !uniqueIds(request.ids) ||
      request.ids.length === 0 || !SILOS.has(request.silo) ||
      !Number.isSafeInteger(request.maximumRecords) || request.maximumRecords < 1 ||
      request.maximumRecords > 20000 || !Number.isSafeInteger(request.maximumBytes) ||
      request.maximumBytes < 1 || request.maximumBytes > 1024 * 1024 * 1024) {
    add('OPTION', '$.request');
    return report(issues);
  }
  const asOf = dayNumber(catalogue.asOf);
  if (asOf === null || !Number.isSafeInteger(catalogue.maxAgeDays) ||
      catalogue.maxAgeDays < 0 || catalogue.maxAgeDays > 3650) {
    add('DATE', '$.asOf');
    return report(issues);
  }
  if ([catalogue.sources, catalogue.records, catalogue.assets].some(list => list.length > 20000)) {
    add('LIMIT', '$.catalogue');
    return report(issues);
  }
  const sources = new Map();
  const records = new Map();
  const assets = new Map();
  for (const [index, source] of catalogue.sources.entries()) {
    const at = `$.sources[${index}]`;
    if (!exact(source, KEYS.source) || !identifier(source.id) || !safeText(source.name) ||
        !LICENCES.has(source.licence)) { add('SOURCE', at); continue; }
    if (sources.has(source.id)) add('DUPLICATE', `${at}.id`);
    if (!localPath(source.reference)) add('PATH', `${at}.reference`);
    const observed = dayNumber(source.observedOn);
    if (observed === null || observed > asOf || asOf - observed > catalogue.maxAgeDays) {
      add('DATE', `${at}.observedOn`);
    }
    if (/miway/iu.test(source.name.replace(/[^a-z0-9]/giu, ''))) add('HELD', `${at}.name`);
    sources.set(source.id, source);
  }
  for (const [index, asset] of catalogue.assets.entries()) {
    const at = `$.assets[${index}]`;
    if (!exact(asset, KEYS.asset) || !identifier(asset.id) || !uniqueIds(asset.sourceIds) ||
        asset.sourceIds.length === 0 || !SILOS.has(asset.silo) ||
        !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 ||
        typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(asset.sha256)) {
      add('ASSET', at);
      continue;
    }
    if (assets.has(asset.id)) add('DUPLICATE', `${at}.id`);
    if (!localPath(asset.path)) add('PATH', `${at}.path`);
    for (const sourceId of asset.sourceIds) {
      if (!sources.has(sourceId)) add('MISSING', `${at}.sourceIds.${sourceId}`);
      else if (sourceSilo(sources.get(sourceId)) !== asset.silo) add('SILO', `${at}.sourceIds.${sourceId}`);
    }
    assets.set(asset.id, asset);
  }
  for (const [index, record] of catalogue.records.entries()) {
    const at = `$.records[${index}]`;
    if (!exact(record, KEYS.record) || !identifier(record.id) ||
        !FEATURES.has(record.feature) || !STATES.has(record.access) ||
        !Number.isInteger(record.tier) || record.tier < 0 || record.tier > 3 ||
        !SILOS.has(record.silo) || !uniqueIds(record.sourceIds) ||
        record.sourceIds.length === 0 || !uniqueIds(record.assetIds) ||
        !Array.isArray(record.evidence) || record.evidence.length > 10000) {
      add('FIELD', at);
      continue;
    }
    if (records.has(record.id)) add('DUPLICATE', `${at}.id`);
    if (!safeText(record.en) || !safeText(record.fr)) add('TEXT', `${at}.labels`);
    else if (!frenchSpacing(record.fr)) add('TYPOGRAPHY', `${at}.fr`);
    for (const sourceId of record.sourceIds) {
      if (!sources.has(sourceId)) add('MISSING', `${at}.sourceIds.${sourceId}`);
      else if (sourceSilo(sources.get(sourceId)) !== record.silo) add('SILO', `${at}.sourceIds.${sourceId}`);
    }
    for (const assetId of record.assetIds) {
      const asset = assets.get(assetId);
      if (!asset) add('MISSING', `${at}.assetIds.${assetId}`);
      else if (asset.silo !== record.silo || asset.sourceIds.some(id => !record.sourceIds.includes(id))) {
        add('SILO', `${at}.assetIds.${assetId}`);
      }
    }
    const matched = [];
    for (const [j, evidence] of record.evidence.entries()) {
      const atEvidence = `${at}.evidence[${j}]`;
      if (!exact(evidence, KEYS.evidence) || !identifier(evidence.sourceId) ||
          !record.sourceIds.includes(evidence.sourceId) ||
          evidence.feature !== record.feature || !STATES.has(evidence.access) ||
          !Number.isInteger(evidence.tier) || evidence.tier < 0 || evidence.tier > 3) {
        add('EVIDENCE', atEvidence);
        continue;
      }
      const day = dayNumber(evidence.observedOn);
      const source = sources.get(evidence.sourceId);
      const sourceDay = source && dayNumber(source.observedOn);
      if (day === null || day > asOf || asOf - day > catalogue.maxAgeDays ||
          sourceDay === null || sourceDay === undefined || day < sourceDay) {
        add('DATE', `${atEvidence}.observedOn`);
        continue;
      }
      matched.push(evidence);
    }
    const yes = matched.some(item => item.access === 'YES');
    const no = matched.some(item => item.access === 'NO');
    if (yes && no && record.access !== 'UNKNOWN') add('CONFLICT', `${at}.access`);
    if (record.tier === 0 && (record.access !== 'UNKNOWN' || matched.length > 0)) add('TIER', `${at}.tier`);
    if (record.tier === 1 && record.access !== 'UNKNOWN') add('TIER', `${at}.tier`);
    if (record.tier >= 2 && record.access === 'UNKNOWN') add('TIER', `${at}.tier`);
    const supporting = matched.filter(item => item.access === record.access && item.tier >= record.tier);
    if (record.access !== 'UNKNOWN' && supporting.length === 0) add('EVIDENCE', `${at}.access`);
    if (record.tier === 3 && new Set(supporting.map(item => item.sourceId)).size < 2) {
      add('TIER', `${at}.tier`);
    }
    records.set(record.id, record);
  }
  const chosen = [];
  const chosenAssets = new Map();
  const chosenSources = new Map();
  let bytes = 0;
  for (const id of request.ids) {
    const record = records.get(id);
    if (!record) { add('MISSING', `$.request.ids.${id}`); continue; }
    if (record.silo !== request.silo) { add('SILO', `$.request.ids.${id}`); continue; }
    chosen.push(record);
    for (const sid of record.sourceIds) if (sources.has(sid)) chosenSources.set(sid, sources.get(sid));
    for (const aid of record.assetIds) {
      const asset = assets.get(aid);
      if (!asset || chosenAssets.has(aid)) continue;
      chosenAssets.set(aid, asset);
      bytes += asset.bytes;
      for (const sid of asset.sourceIds) if (sources.has(sid)) chosenSources.set(sid, sources.get(sid));
    }
  }
  if (chosen.length > request.maximumRecords) add('LIMIT', '$.request.maximumRecords');
  if (bytes > request.maximumBytes) add('LIMIT', '$.request.maximumBytes');
  if (issues.length) return report(issues);
  const slice = {
    schemaVersion: 1,
    asOf: catalogue.asOf,
    silo: request.silo,
    records: sorted(chosen).map(value => structuredClone(value)),
    assets: sorted(chosenAssets.values()).map(value => structuredClone(value)),
    sources: sorted(chosenSources.values()).map(value => structuredClone(value)),
    bytes,
  };
  const digest = shaText(canonical(slice));
  return report(issues, { ...slice, digest });
}

/** Render diagnostics for either supported locale; never mutate a report. */
export function sliceReportText(result, locale = 'en') {
  if (locale !== 'en' && locale !== 'fr') throw new TypeError('Unsupported locale');
  const heading = locale === 'fr' ? (result.ok ? 'Contrôle réussi' : 'Sélection bloquée') :
    (result.ok ? 'Check passed' : 'Selection blocked');
  return [heading, ...result.issues.map(item => `${item.code} ${item.path}: ${item[locale]}`)].join('\n') + '\n';
}
