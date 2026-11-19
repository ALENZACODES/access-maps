/**
 * P15K — local-only, deterministic access-evidence ledger.
 *
 * The ledger is an additional QA gate for candidate records; it is not a source
 * of real-world accessibility claims. A caller supplies dated, attributed
 * evidence and content digests from its own locally cached source bundle.
 * Invalid, old, contradictory, or unattributed observations never become
 * positive accessibility statements. The module performs no I/O, network,
 * publishing, storage, or scheduled work.
 */

const MAX_SOURCES = 5000;
const MAX_RECORDS = 20000;
const MAX_EVIDENCE = 32;
const MAX_DAYS = 3650;
const DAY_MS = 86_400_000;
const LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'ODbL-1.0', 'OGL-Canada-2.0', 'OGL-ON-1.0']);
const STATES = new Set(['YES', 'NO', 'UNKNOWN']);
const SILOS = new Set(['open', 'odbl']);
const FEATURES = new Set(['entrance', 'washroom', 'lift', 'parking', 'path', 'seating']);
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const HEX_DIGEST = /^[a-f0-9]{64}$/;
const INVALID_COPY = /<\s*\/?\s*[a-z]|javascript\s*:|data\s*:|\bon\w+\s*=|\p{Cc}/iu;
const PRIVATE_COPY = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|token|secret|apikey)\s*[:=]/i;
const OVERCLAIM_COPY = /\b(?:guaranteed|real[- ]time|partnership|garanti|temps réel|partenariat)\b/i;

const DIAGNOSTICS = Object.freeze({
  ROOT: ['The catalogue shape is incomplete.', 'La structure du catalogue est incomplète.'],
  LIMIT: ['Catalogue safety limit exceeded.', 'Limite de sécurité du catalogue dépassée.'],
  DATE: ['A calendar date is invalid.', 'Une date civile est non valide.'],
  SOURCE: ['Source metadata is incomplete.', 'Les renseignements de source sont incomplets.'],
  LICENCE: ['Source licence is missing or not supported.', 'La licence de source est absente ou non prise en charge.'],
  DUPLICATE: ['A record identifier is repeated.', 'Un identifiant de fiche est répété.'],
  RECORD: ['The place record is incomplete.', 'La fiche du lieu est incomplète.'],
  TEXT: ['Bilingual text is missing or unsafe.', 'Le texte bilingue est absent ou non sûr.'],
  TYPOGRAPHY: ['French spacing is not suitable.', 'Les espaces typographiques français ne conviennent pas.'],
  REFERENCE: ['A local source reference is invalid.', 'La référence de source locale est non valide.'],
  PROVENANCE: ['Every record needs supported source lineage.', 'Chaque fiche exige une provenance de source.'],
  EVIDENCE: ['An observation is incomplete or does not match its record.', 'Une observation est incomplète ou ne correspond pas à sa fiche.'],
  CONFLICT: ['Observations disagree; access must remain UNKNOWN.', 'Les observations divergent; l’accès doit rester UNKNOWN.'],
  ACCESS: ['An access statement needs current matching evidence.', 'Un état d’accès exige une observation actuelle correspondante.'],
  AGE: ['An observation is outside its allowed time window.', 'Une observation dépasse sa période admissible.'],
  TIER: ['The stated tier is not supported by its observations.', 'Le niveau indiqué n’est pas étayé par les observations.'],
  SILO: ['Licences must remain in their own export group.', 'Les licences doivent rester dans leur groupe d’exportation.'],
  OFFLINE: ['The offline asset declaration is incomplete.', 'La déclaration du fichier hors ligne est incomplète.'],
  ASSET: ['An offline asset is missing or its bytes do not match.', 'Un fichier hors ligne est absent ou ses octets ne correspondent pas.'],
  TARGET: ['Interactive targets must be at least 44 pixels.', 'Les cibles interactives doivent mesurer au moins 44 pixels.'],
  POLICY: ['The declared retention policy is invalid.', 'La politique de conservation déclarée est non valide.'],
});

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isId(value) {
  return typeof value === 'string' && value.length <= 96 && IDENTIFIER.test(value);
}
function isText(value) {
  return typeof value === 'string' && value.trim() === value &&
    value.length > 0 && value.length <= 280 && !INVALID_COPY.test(value) &&
    !PRIVATE_COPY.test(value) && !OVERCLAIM_COPY.test(value);
}
function frenchSpacing(value) {
  for (let i = 0; i < value.length; i += 1) {
    const current = value[i];
    if (current === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (';!?'.includes(current) && i > 0 && value[i - 1] !== '\u202f') return false;
    if (current === '«' && value[i + 1] !== '\u202f') return false;
    if (current === '»' && value[i - 1] !== '\u202f') return false;
  }
  return !/[a-zÀ-ÿ]'[a-zÀ-ÿ]/i.test(value);
}
function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day ? date.getTime() / DAY_MS : null;
}
function isLocalPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    !value.startsWith('/') && !/[\\%?#:]/.test(value) &&
    value.split('/').every(part => part.length && part !== '.' && part !== '..');
}
function exactKeys(value, required, optional = []) {
  return isObject(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function stableFindings(findings) {
  return findings.sort((left, right) =>
    left.path.localeCompare(right.path, 'en') || left.code.localeCompare(right.code, 'en'));
}
function recordIdOrIndex(value, index) {
  return isId(value?.id) ? value.id : String(index);
}

/**
 * Examine an offline catalogue and an optional map of local asset descriptors.
 * Each descriptor is { bytes, sha256 } — the caller must calculate the digest
 * from actual bytes before invoking this pure gate. No hashes are computed or
 * derived in this module.
 *
 * Source tier: 0 draft, 1 attributed, 2 independently checked, 3 current
 * operator evidence. Tier 0 never establishes YES/NO. Tiers above 1 require
 * an independently attributed current observation of at least that tier.
 *
 * @param {unknown} input Candidate catalogue.
 * @param {unknown} localAssets Local metadata keyed by relative offline path.
 * @returns {{ok:boolean, findings:readonly object[], summary:object, records:readonly object[]}}
 */
export function auditRecordLedger(input, localAssets = {}) {
  const findings = [];
  const rows = [];
  const summary = { sources: 0, records: 0, unknown: 0, asserted: 0, assets: 0 };
  const add = (code, path) => {
    const [en, fr] = DIAGNOSTICS[code];
    findings.push({ code, path, en, fr });
  };
  const finish = () => ({
    ok: findings.length === 0,
    findings: stableFindings(findings),
    summary: { ...summary },
    records: rows,
  });
  if (!exactKeys(input, ['asOf', 'maxAgeDays', 'sources', 'records']) ||
      !Array.isArray(input.sources) || !Array.isArray(input.records) ||
      !isObject(localAssets)) {
    add('ROOT', '$');
    return finish();
  }
  if (input.sources.length > MAX_SOURCES || input.records.length > MAX_RECORDS) {
    add('LIMIT', '$');
    return finish();
  }
  const now = calendarDay(input.asOf);
  if (now === null) add('DATE', '$.asOf');
  const ageLimit = input.maxAgeDays;
  if (!Number.isSafeInteger(ageLimit) || ageLimit < 0 || ageLimit > MAX_DAYS) {
    add('POLICY', '$.maxAgeDays');
  }
  if (now === null || !Number.isSafeInteger(ageLimit) || ageLimit < 0 || ageLimit > MAX_DAYS) return finish();

  summary.sources = input.sources.length;
  summary.records = input.records.length;
  const sources = new Map();
  input.sources.forEach((source, i) => {
    const path = `$.sources[${i}]`;
    if (!exactKeys(source, ['id', 'licence', 'observedOn', 'reference', 'tier']) ||
        !isId(source.id) || !Number.isInteger(source.tier) || source.tier < 0 || source.tier > 3) {
      add('SOURCE', path);
      return;
    }
    if (sources.has(source.id)) add('DUPLICATE', `${path}.id`);
    if (!LICENCES.has(source.licence)) add('LICENCE', `${path}.licence`);
    if (!isLocalPath(source.reference)) add('REFERENCE', `${path}.reference`);
    const day = calendarDay(source.observedOn);
    if (day === null) add('DATE', `${path}.observedOn`);
    else if (day > now || now - day > ageLimit) add('AGE', `${path}.observedOn`);
    if (LICENCES.has(source.licence) && isLocalPath(source.reference) && day !== null &&
        day <= now && now - day <= ageLimit) sources.set(source.id, source);
  });

  const seenRecords = new Set();
  const declaredAssets = new Set();
  input.records.forEach((record, i) => {
    const at = `$.records[${recordIdOrIndex(record, i)}]`;
    if (!exactKeys(record, ['id', 'en', 'fr', 'feature', 'access', 'tier', 'silo',
      'sourceIds', 'evidence', 'offline', 'targetPx']) || !isId(record.id) ||
        !FEATURES.has(record.feature) || !STATES.has(record.access) ||
        !SILOS.has(record.silo) || !Number.isInteger(record.tier) ||
        record.tier < 0 || record.tier > 3 || !Array.isArray(record.sourceIds) ||
        !Array.isArray(record.evidence) || !Number.isFinite(record.targetPx)) {
      add('RECORD', at);
      return;
    }
    if (seenRecords.has(record.id)) add('DUPLICATE', `${at}.id`);
    seenRecords.add(record.id);
    if (!isText(record.en) || !isText(record.fr)) add('TEXT', `${at}.labels`);
    else if (!frenchSpacing(record.fr)) add('TYPOGRAPHY', `${at}.fr`);
    if (record.targetPx < 44) add('TARGET', `${at}.targetPx`);
    if (record.access === 'UNKNOWN') summary.unknown += 1;
    else summary.asserted += 1;
    if (record.sourceIds.length === 0 || !record.sourceIds.every(isId) ||
        new Set(record.sourceIds).size !== record.sourceIds.length) add('PROVENANCE', `${at}.sourceIds`);
    const lineage = record.sourceIds.map(id => sources.get(id));
    if (lineage.some(source => !source)) add('PROVENANCE', `${at}.sourceIds`);
    const odbl = lineage.some(source => source?.licence === 'ODbL-1.0');
    if ((odbl ? 'odbl' : 'open') !== record.silo) add('SILO', `${at}.silo`);
    if (record.evidence.length > MAX_EVIDENCE) add('LIMIT', `${at}.evidence`);
    const validEvidence = [];
    if (record.evidence.length <= MAX_EVIDENCE) {
      record.evidence.forEach((evidence, j) => {
        const ep = `${at}.evidence[${j}]`;
        if (!exactKeys(evidence, ['sourceId', 'observedOn', 'feature', 'access', 'tier']) ||
            !isId(evidence.sourceId) || !FEATURES.has(evidence.feature) ||
            !STATES.has(evidence.access) || !Number.isInteger(evidence.tier) ||
            evidence.tier < 0 || evidence.tier > 3) {
          add('EVIDENCE', ep);
          return;
        }
        const source = sources.get(evidence.sourceId);
        if (!source || !record.sourceIds.includes(evidence.sourceId) ||
            evidence.feature !== record.feature || evidence.tier > source.tier) {
          add('EVIDENCE', ep);
          return;
        }
        const date = calendarDay(evidence.observedOn);
        const sourceDate = calendarDay(source.observedOn);
        if (date === null) add('DATE', `${ep}.observedOn`);
        else if (date > now || now - date > ageLimit ||
            (sourceDate !== null && date < sourceDate)) add('AGE', `${ep}.observedOn`);
        else validEvidence.push(evidence);
      });
    }
    const positive = validEvidence.filter(e => e.access === 'YES');
    const negative = validEvidence.filter(e => e.access === 'NO');
    if (positive.length && negative.length && record.access !== 'UNKNOWN') {
      add('CONFLICT', `${at}.access`);
    }
    const matching = validEvidence.filter(e => e.access === record.access);
    if (record.access !== 'UNKNOWN' && (record.tier === 0 || matching.length === 0 ||
        (positive.length && negative.length))) add('ACCESS', `${at}.access`);
    if (record.tier >= 2 && !matching.some(e => e.tier >= record.tier)) {
      add('TIER', `${at}.tier`);
    }
    if (record.tier === 1 && record.access !== 'UNKNOWN' &&
        !matching.some(e => e.tier >= 1)) add('TIER', `${at}.tier`);
    if (record.offline !== null) {
      if (!exactKeys(record.offline, ['path', 'bytes', 'sha256']) ||
          !isLocalPath(record.offline.path) || !Number.isSafeInteger(record.offline.bytes) ||
          record.offline.bytes <= 0 || typeof record.offline.sha256 !== 'string' ||
          !HEX_DIGEST.test(record.offline.sha256)) {
        add('OFFLINE', `${at}.offline`);
      } else {
        declaredAssets.add(record.offline.path);
        const local = localAssets[record.offline.path];
        if (!exactKeys(local, ['bytes', 'sha256']) ||
            local.bytes !== record.offline.bytes || local.sha256 !== record.offline.sha256) {
          add('ASSET', `${at}.offline`);
        }
      }
    }
    rows.push({ id: record.id, en: record.en, fr: record.fr,
      access: record.access, tier: record.tier, silo: record.silo,
      sourceIds: [...record.sourceIds] });
  });
  summary.assets = declaredAssets.size;
  return finish();
}

/** Return a local-only report suitable for a log or saved QA attachment. */
export function ledgerText(report, locale = 'en') {
  if (!isObject(report) || !Array.isArray(report.findings) || !['en', 'fr'].includes(locale)) {
    throw new TypeError('Invalid report or language');
  }
  const title = locale === 'fr' ? (report.ok ? 'Contrôle réussi' : 'Publication bloquée') :
    (report.ok ? 'Check passed' : 'Publication blocked');
  return [title, ...report.findings.map(f => `${f.code} ${f.path}: ${f[locale]}`)].join('\n') + '\n';
}
