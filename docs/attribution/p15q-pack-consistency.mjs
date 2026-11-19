/**
 * P15Q: deterministic, local-only consistency audit across independently
 * packaged offline place catalogues. This code does not read files or send data.
 * Unknown access stays unknown. Records never gain a confidence tier here.
 */
const LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'ODbL-1.0']);
const FEATURES = new Set(['entrance', 'washroom', 'lift', 'parking', 'path', 'seating']);
const STATES = new Set(['YES', 'NO', 'UNKNOWN']);
const SILOS = new Set(['open', 'odbl']);
const CODES = Object.freeze({
  ROOT: ['The pack set is incomplete.', 'L’ensemble des paquets est incomplet.'],
  POLICY: ['The audit options are invalid.', 'Les options de contrôle sont non valides.'],
  LIMIT: ['The pack set exceeds a safety limit.', 'L’ensemble des paquets dépasse une limite de sécurité.'],
  PACK: ['An offline pack has incomplete metadata.', 'Un paquet hors ligne possède des renseignements incomplets.'],
  DATE: ['A date is invalid or outside the allowed period.', 'Une date est non valide ou hors de la période permise.'],
  SOURCE: ['A source entry is incomplete.', 'Une entrée de source est incomplète.'],
  LICENCE: ['A source licence is not in the open-licence allowlist.', 'Une licence de source n’est pas dans la liste des licences ouvertes.'],
  SILO: ['A source belongs in a different licence export.', 'Une source appartient à une autre exportation de licence.'],
  DUPLICATE: ['An identifier is repeated.', 'Un identifiant apparaît plusieurs fois.'],
  IDENTITY: ['The same identifier has incompatible provenance.', 'Le même identifiant possède une provenance incompatible.'],
  PLACE: ['A place entry is incomplete.', 'Une fiche de lieu est incomplète.'],
  TEXT: ['English and French content must be safe and present.', 'Le contenu anglais et français doit être sûr et présent.'],
  TYPOGRAPHY: ['French punctuation spacing is invalid.', 'L’espacement de la ponctuation française est non valide.'],
  EVIDENCE: ['A dated observation is incomplete or inconsistent.', 'Une observation datée est incomplète ou incohérente.'],
  ACCESS: ['A stated access condition has no matching observation.', 'Un état d’accès déclaré ne possède pas d’observation correspondante.'],
  CONFLICT: ['Conflicting observations require UNKNOWN.', 'Observations contradictoires\u202f; l’accès doit rester UNKNOWN.'],
  TIER: ['The confidence tier is unsupported.', 'Le niveau de confiance est non soutenu.'],
  MISSING: ['A referenced identifier is absent.', 'Un identifiant référencé est absent.'],
  ASSET: ['An offline asset is incomplete.', 'Un fichier hors ligne est incomplet.'],
  PATH: ['A file reference is not a safe relative path.', 'Une référence de fichier n’est pas un chemin relatif sûr.'],
  COLLISION: ['Two assets claim the same offline path with different bytes.', 'Deux fichiers revendiquent le même chemin hors ligne avec des octets différents.'],
  HELD: ['A held operator feed cannot enter this export.', 'Un flux d’opérateur retenu ne peut pas entrer dans cette exportation.'],
  PERSONAL: ['Personal contact or access credentials are not permitted.', 'Les coordonnées personnelles et les identifiants d’accès sont interdits.'],
});
const PACK_KEYS = ['id', 'asOf', 'silo', 'sources', 'places', 'assets'];
const SOURCE_KEYS = ['id', 'name', 'licence', 'observedOn', 'reference'];
const PLACE_KEYS = ['id', 'en', 'fr', 'feature', 'access', 'tier', 'sourceIds', 'evidence', 'assetIds'];
const EVIDENCE_KEYS = ['sourceId', 'feature', 'access', 'tier', 'observedOn'];
const ASSET_KEYS = ['id', 'path', 'sha256', 'bytes', 'sourceIds'];
const OPTION_KEYS = ['asOf', 'maxPacks', 'maxPlaces', 'maxAssets', 'maxBytes', 'maxAgeDays'];
const DAY_MS = 86_400_000;
const MAX_PACKS = 100;
const MAX_RECORDS = 20000;
const MAX_BYTES = 1024 * 1024 * 1024;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value, keys) {
  return object(value) && keys.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => keys.includes(key));
}
function id(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 96 &&
    /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u.test(value);
}
function control(value) {
  return [...value].some(character => {
    const code = character.codePointAt(0);
    return code !== undefined && (code < 32 || (code >= 127 && code <= 159));
  });
}
function personal(value) {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|token|api[-_]?key|private[-_]?key)\s*[:=]/iu.test(value);
}
function text(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 280 &&
    value.trim() === value && !control(value) && !personal(value) &&
    !/<\s*\/?\s*[a-z]|\bon\w+\s*=|\b(?:javascript|data)\s*:/iu.test(value);
}
function french(value) {
  if (!text(value) || /[a-zÀ-ÿ]'[a-zÀ-ÿ]/iu.test(value)) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (';!?'.includes(value[i]) && i > 0 && value[i - 1] !== '\u202f') return false;
    if (value[i] === '«' && value[i + 1] !== '\u202f') return false;
    if (value[i] === '»' && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
function path(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    !control(value) && !personal(value) && !value.startsWith('/') &&
    !/[\\%?#:]/u.test(value) && value.split('/').every(part =>
      part.length > 0 && part !== '.' && part !== '..' && part.trim() === part);
}
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(y, m - 1, d);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d) return null;
  return date.getTime() / DAY_MS;
}
function ids(value) {
  return Array.isArray(value) && value.length <= MAX_RECORDS &&
    value.every(id) && new Set(value).size === value.length;
}
function held(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/gu, '').includes('miway');
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function optionsValid(opts) {
  if (!exact(opts, OPTION_KEYS)) return false;
  if (day(opts.asOf) === null) return false;
  return [['maxPacks', 1, MAX_PACKS], ['maxPlaces', 0, MAX_RECORDS],
    ['maxAssets', 0, MAX_RECORDS], ['maxBytes', 0, MAX_BYTES],
    ['maxAgeDays', 0, 3650]].every(([key, lower, upper]) =>
    Number.isSafeInteger(opts[key]) && opts[key] >= lower && opts[key] <= upper);
}
function fresh(observed, asOf, maxAgeDays) {
  const when = day(observed);
  return when !== null && when <= asOf && asOf - when <= maxAgeDays;
}
function ordered(a, b) {
  return a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en') ||
    a.pack.localeCompare(b.pack, 'en');
}
function summaryOf(packs) {
  return {
    packs: packs.length,
    sources: 0,
    places: 0,
    unknown: 0,
    assets: 0,
    bytes: 0,
    crossPackSources: 0,
    crossPackPlaces: 0,
    crossPackAssets: 0,
  };
}

/**
 * Returns an all-or-nothing diagnostic report. Does not export a combined pack
 * or merge two conflicting claims, even when one is newer or has a higher tier.
 * The caller must provide a complete, explicit audit policy and observation day.
 * @param {unknown} input an array of complete offline pack manifests
 * @param {unknown} policy bounded audit settings
 */
export function auditPackConsistency(input, policy) {
  const findings = [];
  const packs = Array.isArray(input) ? input : [];
  const summary = summaryOf(packs);
  const add = (code, where, pack = '') => {
    const [en, fr] = CODES[code];
    findings.push({ code, path: where, pack, en, fr });
  };
  const finish = () => ({
    ok: findings.length === 0,
    findings: [...findings].sort(ordered),
    summary: { ...summary },
  });
  if (!Array.isArray(input)) { add('ROOT', '$'); return finish(); }
  if (!optionsValid(policy)) { add('POLICY', '$.policy'); return finish(); }
  if (packs.length === 0 || packs.length > policy.maxPacks) {
    add('LIMIT', '$.packs'); return finish();
  }
  const referenceDay = day(policy.asOf);
  const allSources = new Map();
  const allPlaces = new Map();
  const allAssets = new Map();
  const allPaths = new Map();
  const packIds = new Set();
  for (const [index, pack] of packs.entries()) {
    const at = `$.packs[${index}]`;
    if (!exact(pack, PACK_KEYS) || !id(pack.id) || !SILOS.has(pack.silo) ||
        !Array.isArray(pack.sources) || !Array.isArray(pack.places) ||
        !Array.isArray(pack.assets)) { add('PACK', at); continue; }
    const packId = pack.id;
    if (packIds.has(packId)) add('DUPLICATE', `${at}.id`, packId);
    packIds.add(packId);
    const packDay = day(pack.asOf);
    if (packDay === null || packDay > referenceDay ||
        referenceDay - packDay > policy.maxAgeDays) add('DATE', `${at}.asOf`, packId);
    if (pack.sources.length > MAX_RECORDS || pack.places.length > MAX_RECORDS ||
        pack.assets.length > MAX_RECORDS) { add('LIMIT', at, packId); continue; }
    const localSources = new Map();
    const localPlaces = new Set();
    const localAssets = new Map();
    for (const [sourceIndex, source] of pack.sources.entries()) {
      const where = `${at}.sources[${sourceIndex}]`;
      summary.sources += 1;
      if (!exact(source, SOURCE_KEYS) || !id(source.id) || !text(source.name) ||
          !path(source.reference)) { add('SOURCE', where, packId); continue; }
      if (held(source.name) || held(source.id)) add('HELD', where, packId);
      if (!LICENCES.has(source.licence)) add('LICENCE', `${where}.licence`, packId);
      if ((source.licence === 'ODbL-1.0' ? 'odbl' : 'open') !== pack.silo) {
        add('SILO', `${where}.licence`, packId);
      }
      if (packDay === null || !fresh(source.observedOn, packDay, policy.maxAgeDays)) {
        add('DATE', `${where}.observedOn`, packId);
      }
      if (localSources.has(source.id)) add('DUPLICATE', `${where}.id`, packId);
      localSources.set(source.id, source);
      const prior = allSources.get(source.id);
      if (prior) {
        summary.crossPackSources += 1;
        if (stable(prior.source) !== stable(source)) add('IDENTITY', `${where}.id`, packId);
      } else allSources.set(source.id, { packId, source });
    }
    for (const [assetIndex, asset] of pack.assets.entries()) {
      const where = `${at}.assets[${assetIndex}]`;
      summary.assets += 1;
      if (!exact(asset, ASSET_KEYS) || !id(asset.id) || !path(asset.path) ||
          typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(asset.sha256) ||
          !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || !ids(asset.sourceIds) ||
          asset.sourceIds.length === 0) { add('ASSET', where, packId); continue; }
      summary.bytes += asset.bytes;
      if (localAssets.has(asset.id)) add('DUPLICATE', `${where}.id`, packId);
      localAssets.set(asset.id, asset);
      for (const sourceId of asset.sourceIds) {
        if (!localSources.has(sourceId)) add('MISSING', `${where}.sourceIds`, packId);
      }
      const previous = allAssets.get(asset.id);
      if (previous) {
        summary.crossPackAssets += 1;
        if (stable(previous.asset) !== stable(asset)) add('IDENTITY', `${where}.id`, packId);
      } else allAssets.set(asset.id, { packId, asset });
      const used = allPaths.get(asset.path);
      if (used && (used.sha256 !== asset.sha256 || used.bytes !== asset.bytes ||
          used.id !== asset.id || used.silo !== pack.silo)) add('COLLISION', `${where}.path`, packId);
      else if (!used) allPaths.set(asset.path, { ...asset, silo: pack.silo });
    }
    for (const [placeIndex, place] of pack.places.entries()) {
      const where = `${at}.places[${placeIndex}]`;
      summary.places += 1;
      if (!exact(place, PLACE_KEYS) || !id(place.id) || !FEATURES.has(place.feature) ||
          !STATES.has(place.access) || !Number.isInteger(place.tier) ||
          place.tier < 0 || place.tier > 3 || !ids(place.sourceIds) ||
          !ids(place.assetIds) || !Array.isArray(place.evidence)) {
        add('PLACE', where, packId); continue;
      }
      if (place.access === 'UNKNOWN') summary.unknown += 1;
      if (localPlaces.has(place.id)) add('DUPLICATE', `${where}.id`, packId);
      localPlaces.add(place.id);
      if (!text(place.en) || !text(place.fr)) add('TEXT', `${where}.labels`, packId);
      else if (!french(place.fr)) add('TYPOGRAPHY', `${where}.fr`, packId);
      if (place.sourceIds.length === 0) add('MISSING', `${where}.sourceIds`, packId);
      for (const sourceId of place.sourceIds) {
        if (!localSources.has(sourceId)) add('MISSING', `${where}.sourceIds`, packId);
      }
      for (const assetId of place.assetIds) {
        const asset = localAssets.get(assetId);
        if (!asset) add('MISSING', `${where}.assetIds`, packId);
        else if (asset.sourceIds.some(sourceId => !place.sourceIds.includes(sourceId))) {
          add('MISSING', `${where}.assetIds`, packId);
        }
      }
      const observations = [];
      const keys = new Set();
      if (place.evidence.length > MAX_RECORDS) add('LIMIT', `${where}.evidence`, packId);
      else for (const [evIndex, ev] of place.evidence.entries()) {
        const evPath = `${where}.evidence[${evIndex}]`;
        if (!exact(ev, EVIDENCE_KEYS) || !id(ev.sourceId) ||
            !FEATURES.has(ev.feature) || !STATES.has(ev.access) ||
            !Number.isInteger(ev.tier) || ev.tier < 0 || ev.tier > 3 ||
            !place.sourceIds.includes(ev.sourceId) || ev.feature !== place.feature ||
            packDay === null || !fresh(ev.observedOn, packDay, policy.maxAgeDays)) {
          add('EVIDENCE', evPath, packId); continue;
        }
        const key = stable(ev);
        if (keys.has(key)) add('DUPLICATE', evPath, packId);
        keys.add(key);
        observations.push(ev);
      }
      const yes = observations.some(ev => ev.access === 'YES');
      const no = observations.some(ev => ev.access === 'NO');
      if (yes && no && place.access !== 'UNKNOWN') add('CONFLICT', `${where}.access`, packId);
      if (place.access !== 'UNKNOWN' && !observations.some(ev => ev.access === place.access)) {
        add('ACCESS', `${where}.access`, packId);
      }
      if (place.tier <= 1 && place.access !== 'UNKNOWN') add('TIER', `${where}.tier`, packId);
      if (place.tier >= 2 && place.access !== 'UNKNOWN' &&
          !observations.some(ev => ev.access === place.access && ev.tier >= place.tier)) {
        add('TIER', `${where}.tier`, packId);
      }
      if (place.tier === 3 && place.access !== 'UNKNOWN' &&
          new Set(observations.filter(ev => ev.access === place.access)
            .map(ev => ev.sourceId)).size < 2) add('TIER', `${where}.tier`, packId);
      const prior = allPlaces.get(place.id);
      if (prior) {
        summary.crossPackPlaces += 1;
        if (stable(prior.place) !== stable(place) || prior.silo !== pack.silo) {
          add('IDENTITY', `${where}.id`, packId);
        }
      } else allPlaces.set(place.id, { packId, silo: pack.silo, place });
    }
  }
  if (summary.places > policy.maxPlaces || summary.assets > policy.maxAssets ||
      summary.bytes > policy.maxBytes) add('LIMIT', '$.summary');
  return finish();
}

/** Bilingual, deterministic diagnostics without revealing any input contents. */
export function packConsistencyText(report, locale = 'en') {
  const language = locale === 'fr' ? 'fr' : 'en';
  const header = report.ok ? (language === 'fr' ? 'Contrôle réussi' : 'Check passed') :
    (language === 'fr' ? 'Publication bloquée' : 'Publication blocked');
  return `${[header, ...report.findings.map(item =>
    `${item.code} ${item.path}: ${item[language]}`)].join('\n')}\n`;
}

export const PACK_CONSISTENCY_OPEN_LICENCES = Object.freeze([...LICENCES].sort());
