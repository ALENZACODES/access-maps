/**
 * P15M: deterministic, offline-only change journal for attributed place records.
 *
 * A caller supplies two candidate catalogues and an explicit removal policy.
 * This module reads no files and performs no network or publishing operation.
 * A passing result is a structural and provenance check, not a claim about
 * real-world conditions. No assertions about a location are generated here.
 */

const MAX_SOURCES = 5000;
const MAX_RECORDS = 20000;
const MAX_ASSETS = 20000;
const MAX_EVIDENCE = 32;
const MAX_CHANGES = 20000;
const MAX_AGE = 3650;
const DAY_MS = 86400000;
const IDS = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0']);
const ACCESS = new Set(['YES', 'NO', 'UNKNOWN']);
const FEATURES = new Set(['entrance', 'washroom', 'lift', 'parking', 'path', 'seating', 'transit']);
const SILOS = new Set(['open', 'odbl']);
const CODES = Object.freeze({
  ROOT: ['The catalogue is incomplete.', 'Le catalogue est incomplet.'],
  POLICY: ['The change policy is incomplete or unsafe.', 'La politique de modification est incomplète ou non sûre.'],
  LIMIT: ['A safety limit has been exceeded.', 'Une limite de sécurité a été dépassée.'],
  DATE: ['A calendar date is invalid.', 'Une date civile est non valide.'],
  SOURCE: ['Source information is incomplete.', 'Les renseignements sur la source sont incomplets.'],
  LICENCE: ['An open licence is required.', 'Une licence ouverte est exigée.'],
  REFERENCE: ['A local source reference is required.', 'Une référence de source locale est exigée.'],
  DUPLICATE: ['Identifiers must be unique.', 'Les identifiants doivent être uniques.'],
  LABEL: ['English and French text is required.', 'Un texte français et anglais est exigé.'],
  TYPOGRAPHY: ['French spacing is incomplete.', 'Les espaces typographiques français sont incomplets.'],
  RECORD: ['The place record is incomplete.', 'La fiche du lieu est incomplète.'],
  PROVENANCE: ['The record lacks an attributed source.', 'La fiche ne comporte pas de source attribuée.'],
  EVIDENCE: ['Dated observations do not support the access value.', 'Les observations datées ne soutiennent pas l’état d’accès.'],
  CONFLICT: ['Observations disagree; access must be UNKNOWN.', 'Les observations divergent; l’accès doit rester UNKNOWN.'],
  TIER: ['The confidence tier is not supported.', 'Le niveau de confiance n’est pas étayé.'],
  STALE: ['The observation is outside the declared window.', 'L’observation dépasse la période déclarée.'],
  SILO: ['Licence exports must remain separate.', 'Les exportations de licences doivent rester distinctes.'],
  TARGET: ['The interactive target is too small.', 'La cible interactive est trop petite.'],
  ASSET: ['Offline asset metadata is incomplete.', 'Les métadonnées du fichier hors ligne sont incomplètes.'],
  LINK: ['A referenced offline asset is absent.', 'Un fichier hors ligne référencé est absent.'],
  REMOVAL: ['An explicit removal entry is required.', 'Une entrée de retrait explicite est exigée.'],
  UNUSED: ['A removal entry does not match an actual removal.', 'Une entrée de retrait ne correspond à aucun retrait.'],
  REUSE: ['A source identifier cannot change its identity.', 'Un identifiant de source ne peut pas changer d’identité.'],
  DOWNGRADE: ['A record change lacks new matching evidence.', 'Une modification de fiche manque de nouvelle observation correspondante.'],
  LOSS: ['The previous observation chain was truncated.', 'La chaîne précédente d’observations a été raccourcie.'],
  BYTES: ['An asset changed without a new identifier.', 'Un fichier a changé sans nouvel identifiant.'],
  CROSSREF: ['A reference points to a missing source.', 'Une référence renvoie vers une source absente.'],
  CLOCK: ['The catalogue date moved backwards.', 'La date du catalogue a reculé.'],
});

const KEYS = Object.freeze({
  snapshot: ['asOf', 'maxAgeDays', 'sources', 'records', 'assets'],
  source: ['id', 'name', 'licence', 'reference', 'observedOn'],
  record: ['id', 'en', 'fr', 'feature', 'access', 'tier', 'observedOn', 'sourceIds', 'evidence', 'assetIds', 'silo', 'targetPx'],
  evidence: ['sourceId', 'observedOn', 'access'],
  asset: ['id', 'path', 'sha256', 'bytes', 'sourceIds', 'silo'],
  policy: ['removedSources', 'removedRecords', 'removedAssets', 'maximumRemovals'],
});

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value, expected) {
  return object(value) && Object.keys(value).length === expected.length &&
    expected.every(key => Object.hasOwn(value, key));
}
function ident(value) {
  return typeof value === 'string' && value.length <= 96 && IDS.test(value);
}
function unique(values) {
  return new Set(values).size === values.length;
}
function ids(value, limit = MAX_RECORDS) {
  return Array.isArray(value) && value.length <= limit && value.every(ident) && unique(value);
}
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const date = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || date < 1 || date > 31) return null;
  const out = new Date(0);
  out.setUTCHours(0, 0, 0, 0);
  out.setUTCFullYear(year, month - 1, date);
  if (out.getUTCFullYear() !== year || out.getUTCMonth() !== month - 1 || out.getUTCDate() !== date) return null;
  return out.getTime() / DAY_MS;
}
function localPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 400 &&
    !value.startsWith('/') && !/[\\%?#:]|\p{Cc}/u.test(value) &&
    value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}
function frenchSpace(value) {
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (';!?'.includes(value[i]) && i > 0 && value[i - 1] !== '\u202f') return false;
    if (value[i] === '«' && value[i + 1] !== '\u202f') return false;
    if (value[i] === '»' && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
function safeText(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 280 &&
    value.trim() === value && !/\p{Cc}/u.test(value) &&
    !/<\s*\/?\s*[a-z]|(?:javascript|data)\s*:|\bon\w+\s*=/i.test(value) &&
    !/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|token|apikey|privatekey)\s*[:=]/i.test(value) &&
    !/\b(?:guaranteed|real[- ]time|partnership|garanti|temps réel|partenariat)\b/i.test(value);
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function finding(code, path) {
  const [en, fr] = CODES[code];
  return { code, path, en, fr };
}
function ordered(list) {
  return [...list].sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en'));
}
function report(findings, summary) {
  const sorted = ordered(findings);
  return { ok: sorted.length === 0, findings: sorted, summary: { ...summary } };
}

/**
 * Check each candidate without trusting any types from the caller.
 * This operation never edits the supplied value or repairs missing evidence.
 */
export function auditChangeSnapshot(input) {
  const issues = [];
  const add = (code, path) => issues.push(finding(code, path));
  const summary = { sources: 0, records: 0, assets: 0, unknown: 0, asserted: 0 };
  if (!exact(input, KEYS.snapshot) || !Array.isArray(input.sources) ||
      !Array.isArray(input.records) || !Array.isArray(input.assets)) {
    add('ROOT', '$');
    return report(issues, summary);
  }
  const asOf = day(input.asOf);
  if (asOf === null || !Number.isSafeInteger(input.maxAgeDays) ||
      input.maxAgeDays < 0 || input.maxAgeDays > MAX_AGE) {
    add('DATE', '$.asOf');
    return report(issues, summary);
  }
  if (input.sources.length > MAX_SOURCES || input.records.length > MAX_RECORDS ||
      input.assets.length > MAX_ASSETS) {
    add('LIMIT', '$');
    return report(issues, summary);
  }
  summary.sources = input.sources.length;
  summary.records = input.records.length;
  summary.assets = input.assets.length;
  const sourceIndex = new Map();
  const assetIndex = new Map();
  const recordIndex = new Set();
  const assetPaths = new Set();
  for (let i = 0; i < input.sources.length; i += 1) {
    const source = input.sources[i];
    const at = `$.sources[${i}]`;
    if (!exact(source, KEYS.source) || !ident(source.id) || !safeText(source.name)) {
      add('SOURCE', at);
      continue;
    }
    if (sourceIndex.has(source.id)) add('DUPLICATE', `${at}.id`);
    if (!LICENCES.has(source.licence)) add('LICENCE', `${at}.licence`);
    if (!localPath(source.reference)) add('REFERENCE', `${at}.reference`);
    const observed = day(source.observedOn);
    if (observed === null || observed > asOf || asOf - observed > input.maxAgeDays) add('STALE', `${at}.observedOn`);
    sourceIndex.set(source.id, source);
  }
  for (let i = 0; i < input.assets.length; i += 1) {
    const asset = input.assets[i];
    const at = `$.assets[${i}]`;
    if (!exact(asset, KEYS.asset) || !ident(asset.id) || !localPath(asset.path) ||
        typeof asset.sha256 !== 'string' || !HASH.test(asset.sha256) ||
        !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > 32 * 1024 * 1024 ||
        !ids(asset.sourceIds, MAX_SOURCES) || asset.sourceIds.length === 0 || !SILOS.has(asset.silo)) {
      add('ASSET', at);
      continue;
    }
    if (assetIndex.has(asset.id) || assetPaths.has(asset.path)) add('DUPLICATE', `${at}.id`);
    assetPaths.add(asset.path);
    const referenced = asset.sourceIds.map(id => sourceIndex.get(id));
    if (referenced.some(s => !s)) add('CROSSREF', `${at}.sourceIds`);
    if (asset.silo !== (referenced.some(s => s?.licence === 'ODbL-1.0') ? 'odbl' : 'open')) add('SILO', `${at}.silo`);
    assetIndex.set(asset.id, asset);
  }
  for (let i = 0; i < input.records.length; i += 1) {
    const value = input.records[i];
    const at = `$.records[${i}]`;
    if (!exact(value, KEYS.record) || !ident(value.id) || !FEATURES.has(value.feature) ||
        !ACCESS.has(value.access) || ![0, 1, 2, 3].includes(value.tier) ||
        !ids(value.sourceIds, MAX_SOURCES) || value.sourceIds.length === 0 ||
        !ids(value.assetIds, MAX_ASSETS) || !Array.isArray(value.evidence) ||
        value.evidence.length > MAX_EVIDENCE || !SILOS.has(value.silo)) {
      add('RECORD', at);
      continue;
    }
    if (recordIndex.has(value.id)) add('DUPLICATE', `${at}.id`);
    recordIndex.add(value.id);
    if (!safeText(value.en) || !safeText(value.fr)) add('LABEL', `${at}.labels`);
    else if (!frenchSpace(value.fr)) add('TYPOGRAPHY', `${at}.fr`);
    if (!Number.isFinite(value.targetPx) || value.targetPx < 44) add('TARGET', `${at}.targetPx`);
    const observedDay = day(value.observedOn);
    if (observedDay === null || observedDay > asOf || asOf - observedDay > input.maxAgeDays) add('STALE', `${at}.observedOn`);
    if (value.access === 'UNKNOWN') summary.unknown += 1;
    else summary.asserted += 1;
    const sources = value.sourceIds.map(id => sourceIndex.get(id));
    if (sources.some(s => !s)) add('PROVENANCE', `${at}.sourceIds`);
    if (value.silo !== (sources.some(s => s?.licence === 'ODbL-1.0') ? 'odbl' : 'open')) add('SILO', `${at}.silo`);
    for (const assetId of value.assetIds) {
      const asset = assetIndex.get(assetId);
      if (!asset) { add('LINK', `${at}.assetIds`); continue; }
      if (asset.silo !== value.silo || asset.sourceIds.some(id => !value.sourceIds.includes(id))) add('SILO', `${at}.assetIds`);
    }
    const matched = [];
    const evidenceKeys = new Set();
    for (let j = 0; j < value.evidence.length; j += 1) {
      const e = value.evidence[j];
      const where = `${at}.evidence[${j}]`;
      if (!exact(e, KEYS.evidence) || !ident(e.sourceId) || !ACCESS.has(e.access) ||
          !value.sourceIds.includes(e.sourceId)) { add('EVIDENCE', where); continue; }
      const seenDay = day(e.observedOn);
      const sourceDay = day(sourceIndex.get(e.sourceId)?.observedOn);
      if (seenDay === null || seenDay > asOf || asOf - seenDay > input.maxAgeDays ||
          sourceDay === null || seenDay < sourceDay || (observedDay !== null && seenDay > observedDay)) {
        add('STALE', `${where}.observedOn`);
        continue;
      }
      const key = `${e.sourceId}|${e.observedOn}|${e.access}`;
      if (evidenceKeys.has(key)) add('DUPLICATE', where);
      evidenceKeys.add(key);
      matched.push(e);
    }
    const yes = matched.some(e => e.access === 'YES');
    const no = matched.some(e => e.access === 'NO');
    if (yes && no && value.access !== 'UNKNOWN') add('CONFLICT', `${at}.access`);
    if (value.access !== 'UNKNOWN' && !matched.some(e => e.access === value.access)) add('EVIDENCE', `${at}.access`);
    if (value.tier === 0 && (value.access !== 'UNKNOWN' || matched.length !== 0)) add('TIER', `${at}.tier`);
    if (value.tier === 1 && value.access !== 'UNKNOWN') add('TIER', `${at}.tier`);
    if (value.tier >= 2 && value.access !== 'UNKNOWN' && matched.filter(e => e.access === value.access).length < 1) add('TIER', `${at}.tier`);
    if (value.tier === 3 && value.access !== 'UNKNOWN' &&
        new Set(matched.filter(e => e.access === value.access).map(e => e.sourceId)).size < 2) add('TIER', `${at}.tier`);
  }
  return report(issues, summary);
}

function mapById(records) {
  return new Map(records.map(item => [item.id, item]));
}
function approvedPolicy(value) {
  if (!exact(value, KEYS.policy) || !ids(value.removedSources, MAX_SOURCES) ||
      !ids(value.removedRecords, MAX_RECORDS) || !ids(value.removedAssets, MAX_ASSETS) ||
      !Number.isSafeInteger(value.maximumRemovals) || value.maximumRemovals < 0 ||
      value.maximumRemovals > MAX_CHANGES) return false;
  return true;
}
function observedKeys(record) {
  return new Set(record.evidence.map(e => stable(e)));
}
function freshMatchingEvidence(before, after) {
  const previous = observedKeys(before);
  return after.evidence.some(e => e.access === after.access && !previous.has(stable(e)));
}

/**
 * Compare complete, individually passing snapshots. Every deletion needs an
 * explicit grant, with a strict maximum count. Results are deterministic.
 */
export function compareChangeSnapshots(before, after, policy) {
  const oldAudit = auditChangeSnapshot(before);
  const nextAudit = auditChangeSnapshot(after);
  const issues = [];
  const add = (code, path) => issues.push(finding(code, path));
  const summary = { addedSources: 0, addedRecords: 0, addedAssets: 0,
    changedSources: 0, changedRecords: 0, changedAssets: 0,
    removedSources: 0, removedRecords: 0, removedAssets: 0, allowedRemovals: 0 };
  const finish = () => report(issues, summary);
  if (!oldAudit.ok || !nextAudit.ok) { add('ROOT', '$'); return finish(); }
  if (!approvedPolicy(policy)) { add('POLICY', '$.policy'); return finish(); }
  if (after.asOf < before.asOf) add('CLOCK', '$.asOf');
  const groups = [
    ['sources', 'removedSources', 'addedSources', 'changedSources'],
    ['records', 'removedRecords', 'addedRecords', 'changedRecords'],
    ['assets', 'removedAssets', 'addedAssets', 'changedAssets'],
  ];
  for (const [name, policyName, addedName, changedName] of groups) {
    const old = mapById(before[name]);
    const current = mapById(after[name]);
    const removed = [...old.keys()].filter(key => !current.has(key));
    const allowed = policy[policyName];
    summary[policyName] = removed.length;
    summary.allowedRemovals += removed.filter(id => allowed.includes(id)).length;
    for (const id of removed) if (!allowed.includes(id)) add('REMOVAL', `$.${name}.${id}`);
    for (const id of allowed) if (!removed.includes(id)) add('UNUSED', `$.policy.${policyName}.${id}`);
    for (const id of current.keys()) {
      if (!old.has(id)) summary[addedName] += 1;
      else if (stable(old.get(id)) !== stable(current.get(id))) summary[changedName] += 1;
    }
  }
  if (summary.allowedRemovals > policy.maximumRemovals) add('LIMIT', '$.policy.maximumRemovals');
  const previousSources = mapById(before.sources);
  const currentSources = mapById(after.sources);
  for (const [id, previous] of previousSources) {
    const current = currentSources.get(id);
    if (!current) continue;
    if (previous.name !== current.name || previous.licence !== current.licence ||
        previous.reference !== current.reference) add('REUSE', `$.sources.${id}`);
    if (day(current.observedOn) < day(previous.observedOn)) add('CLOCK', `$.sources.${id}.observedOn`);
  }
  const previousRecords = mapById(before.records);
  const currentRecords = mapById(after.records);
  for (const [id, previous] of previousRecords) {
    const current = currentRecords.get(id);
    if (!current) continue;
    if (previous.silo !== current.silo) add('SILO', `$.records.${id}.silo`);
    if (previous.feature !== current.feature) add('REUSE', `$.records.${id}.feature`);
    if (day(current.observedOn) < day(previous.observedOn)) add('CLOCK', `$.records.${id}.observedOn`);
    const currentKeys = observedKeys(current);
    if ([...observedKeys(previous)].some(key => !currentKeys.has(key))) add('LOSS', `$.records.${id}.evidence`);
    if (previous.access !== current.access && current.access !== 'UNKNOWN' &&
        !freshMatchingEvidence(previous, current)) add('DOWNGRADE', `$.records.${id}.access`);
    if (current.tier > previous.tier && current.tier >= 2 &&
        !freshMatchingEvidence(previous, current)) add('TIER', `$.records.${id}.tier`);
    if (current.targetPx < previous.targetPx) add('TARGET', `$.records.${id}.targetPx`);
    for (const sourceId of current.sourceIds) if (!currentSources.has(sourceId)) add('CROSSREF', `$.records.${id}.sourceIds`);
  }
  const previousAssets = mapById(before.assets);
  const currentAssets = mapById(after.assets);
  for (const [id, previous] of previousAssets) {
    const current = currentAssets.get(id);
    if (!current) continue;
    if (previous.silo !== current.silo) add('SILO', `$.assets.${id}.silo`);
    if (previous.sha256 !== current.sha256 || previous.bytes !== current.bytes ||
        previous.path !== current.path) add('BYTES', `$.assets.${id}`);
  }
  return finish();
}

/** Human-readable bilingual output with fixed ordering and no side effects. */
export function changeJournalText(result, locale = 'en') {
  if (!['en', 'fr'].includes(locale)) throw new RangeError('Unsupported locale');
  const title = locale === 'fr' ? (result.ok ? 'Contrôle réussi' : 'Modification bloquée') :
    (result.ok ? 'Check passed' : 'Change blocked');
  return `${[title, ...result.findings.map(item => `${item.code} ${item.path}: ${item[locale]}`)].join('\n')}\n`;
}
