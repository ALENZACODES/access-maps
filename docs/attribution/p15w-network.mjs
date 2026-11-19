/** Fail-closed Ontario accessibility network intake. All input is caller supplied. */
import { distance, inOntario, pathLength, point, polyline } from './p15w-geometry.mjs';

export const LICENCES = Object.freeze(['CC0-1.0', 'CC-BY-4.0', 'OGL-ON-1.0', 'OGL-Canada-2.0', 'ODbL-1.0']);
export const ACCESS = Object.freeze(['YES', 'NO', 'UNKNOWN']);
export const FEATURES = Object.freeze(['entrance', 'path', 'crossing', 'lift', 'ramp', 'surface', 'stop', 'door', 'washroom']);
export const KINDS = Object.freeze(['walk', 'crossing', 'lift', 'ramp', 'transfer', 'platform', 'door', 'stair']);
export const SILOS = Object.freeze(['open', 'odbl']);
export const LEVELS = Object.freeze([0, 1, 2, 3]);
const ID = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const CONTROLS = /\p{Cc}/u;
const UNSAFE = /<\s*\/?\s*[a-z]|(?:javascript|data)\s*:|\bon\w+\s*=/iu;
const SENSITIVE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:password|token|api[-_]?key|private[-_]?key)\s*[:=]/iu;
const OVERCLAIM = /\b(?:guaranteed|real[- ]time|certified|garanti|temps réel|certifié)\b/iu;
const FR_NARROW = new Set([';', '!', '?']);

export function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function identifier(value) {
  return typeof value === 'string' && value.length <= 96 && ID.test(value);
}
export function strictKeys(value, keys) {
  return record(value) && Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key));
}
export function localFile(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 ||
      value.startsWith('/') || value.includes('\\') || value.includes('%') ||
      value.includes('?') || value.includes('#') || value.includes(':') || CONTROLS.test(value)) return false;
  return value.split('/').every(segment => segment && segment !== '.' && segment !== '..');
}
export function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(0);
  candidate.setUTCHours(0, 0, 0, 0);
  candidate.setUTCFullYear(year, month - 1, day);
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 ||
      candidate.getUTCDate() !== day) return null;
  return candidate.getTime() / 86400000;
}
export function safeCopy(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 280 &&
    value.trim() === value && !CONTROLS.test(value) && !UNSAFE.test(value) &&
    !SENSITIVE.test(value) && !OVERCLAIM.test(value);
}
export function frenchCopy(value) {
  if (!safeCopy(value) || /[a-zÀ-ÿ]'[a-zÀ-ÿ]/iu.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (FR_NARROW.has(ch) && i > 0 && value[i - 1] !== '\u202f') return false;
    if (ch === '«' && value[i + 1] !== '\u202f') return false;
    if (ch === '»' && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
export function heldOperator(value) {
  if (typeof value !== 'string') return true;
  return value.toLowerCase().replace(/[^a-z0-9]/g, '').includes('miway');
}
export function desiredSilo(sourceIds, sources) {
  const entries = sourceIds.map(id => sources.get(id));
  if (entries.some(x => !x)) return null;
  return entries.some(x => x.licence === 'ODbL-1.0') ? 'odbl' : 'open';
}

const MESSAGES = Object.freeze({
  ROOT: ['The routing snapshot structure is incomplete.', 'La structure du jeu de parcours est incomplète.'],
  DATE: ['The snapshot date is invalid.', 'La date du jeu est non valide.'],
  LIMIT: ['The routing snapshot exceeds a safe limit.', 'Le jeu de parcours dépasse une limite de sécurité.'],
  SOURCE: ['A dated source is missing or malformed.', 'Une source datée est absente ou mal formée.'],
  LICENCE: ['Only accepted open licences can be used.', 'Seules les licences ouvertes acceptées sont permises.'],
  HELD: ['A held operator source cannot be used.', 'Une source d’exploitant retenue ne peut pas être utilisée.'],
  STALE: ['An observation is outside its date window.', 'Une observation est hors de sa période de validité.'],
  COPY: ['English and French descriptions must be safe.', 'Les descriptions anglaises et françaises doivent être sûres.'],
  PUNCTUATION: ['French typography is inconsistent.', 'La typographie française est incohérente.'],
  DUPLICATE: ['An identifier occurs more than once.', 'Un identifiant apparaît plusieurs fois.'],
  NODE: ['A routing node is malformed or outside Ontario.', 'Un nœud de parcours est mal formé ou hors de l’Ontario.'],
  EDGE: ['A routing connection is malformed.', 'Une liaison de parcours est mal formée.'],
  REFERENCE: ['A referenced record is missing.', 'Une fiche citée est absente.'],
  GEOMETRY: ['A route geometry does not connect its endpoints.', 'Une géométrie ne relie pas ses extrémités.'],
  EVIDENCE: ['An access statement lacks matching dated evidence.', 'Un état d’accès manque d’observations datées correspondantes.'],
  CONFLICT: ['Conflicting observations require UNKNOWN.', 'Observations contradictoires\u202f; conserver UNKNOWN.'],
  TIER: ['Evidence tier cannot support this access statement.', 'Le niveau de preuve ne soutient pas cet état d’accès.'],
  SILO: ['A record crosses incompatible licence boundaries.', 'Une fiche franchit des limites de licence incompatibles.'],
  ASSET: ['Offline asset metadata is invalid.', 'Les métadonnées du fichier hors ligne sont non valides.'],
  PATH: ['Only bounded local asset paths are accepted.', 'Seuls les chemins locaux bornés sont acceptés.'],
  HASH: ['An offline asset must declare a SHA-256 digest.', 'Un fichier hors ligne doit indiquer une empreinte SHA-256.'],
});

function audit() {
  const findings = [];
  return {
    add(code, path) {
      const [en, fr] = MESSAGES[code];
      findings.push({ code, path, en, fr });
    },
    finish(value) {
      const sorted = findings.sort((a, b) => a.path.localeCompare(b.path, 'en') ||
        a.code.localeCompare(b.code, 'en'));
      return Object.freeze({ ok: sorted.length === 0, findings: sorted, network: sorted.length ? null : value });
    },
  };
}

function checkSource(source, i, add, asOf, windowDays) {
  const at = `$.sources[${i}]`;
  if (!strictKeys(source, ['id', 'name', 'licence', 'observedOn', 'reference', 'en', 'fr']) ||
      !identifier(source.id) || !safeCopy(source.name)) { add('SOURCE', at); return null; }
  if (!LICENCES.includes(source.licence)) add('LICENCE', `${at}.licence`);
  if (heldOperator(source.name) || heldOperator(source.id)) add('HELD', `${at}.name`);
  if (!localFile(source.reference)) add('PATH', `${at}.reference`);
  if (!safeCopy(source.en) || !safeCopy(source.fr)) add('COPY', `${at}.labels`);
  else if (!frenchCopy(source.fr)) add('PUNCTUATION', `${at}.fr`);
  const day = calendarDay(source.observedOn);
  if (day === null || day > asOf || asOf - day > windowDays) add('STALE', `${at}.observedOn`);
  return source;
}

function checkEvidence(evidence, at, sources, asOf, maxDays, feature) {
  const valid = [];
  const findings = [];
  if (!Array.isArray(evidence) || evidence.length > 100) return { valid, findings: ['EVIDENCE'] };
  for (let i = 0; i < evidence.length; i++) {
    const observation = evidence[i];
    if (!strictKeys(observation, ['sourceId', 'observedOn', 'access', 'tier', 'feature']) ||
        !identifier(observation.sourceId) || !ACCESS.includes(observation.access) ||
        !LEVELS.includes(observation.tier) || observation.feature !== feature) {
      findings.push('EVIDENCE'); continue;
    }
    const source = sources.get(observation.sourceId);
    if (!source) { findings.push('REFERENCE'); continue; }
    const day = calendarDay(observation.observedOn);
    if (day === null || day > asOf || asOf - day > maxDays ||
        day < calendarDay(source.observedOn)) { findings.push('STALE'); continue; }
    valid.push(observation);
  }
  return { valid, findings };
}

function checkAccess(recordValue, at, add, sources, asOf, maxDays) {
  if (!Array.isArray(recordValue.sourceIds) || !recordValue.sourceIds.length ||
      recordValue.sourceIds.length > 20 || recordValue.sourceIds.some(id => !identifier(id)) ||
      new Set(recordValue.sourceIds).size !== recordValue.sourceIds.length) {
    add('REFERENCE', `${at}.sourceIds`); return;
  }
  const silo = desiredSilo(recordValue.sourceIds, sources);
  if (!silo) add('REFERENCE', `${at}.sourceIds`);
  else if (silo !== recordValue.silo) add('SILO', `${at}.silo`);
  const found = checkEvidence(recordValue.evidence, at, sources, asOf, maxDays, recordValue.feature);
  for (const code of found.findings) add(code, `${at}.evidence`);
  const present = found.valid.filter(e => recordValue.sourceIds.includes(e.sourceId));
  if (present.length !== found.valid.length) add('REFERENCE', `${at}.evidence`);
  const yes = present.some(e => e.access === 'YES');
  const no = present.some(e => e.access === 'NO');
  if (yes && no && recordValue.access !== 'UNKNOWN') add('CONFLICT', `${at}.access`);
  if (recordValue.access !== 'UNKNOWN' && !present.some(e => e.access === recordValue.access)) {
    add('EVIDENCE', `${at}.access`);
  }
  if (recordValue.tier === 0 && (recordValue.access !== 'UNKNOWN' || present.length)) add('TIER', `${at}.tier`);
  if (recordValue.tier === 1 && recordValue.access !== 'UNKNOWN') add('TIER', `${at}.tier`);
  if (recordValue.tier >= 2 && recordValue.access === 'UNKNOWN') add('TIER', `${at}.tier`);
  if (recordValue.tier >= 2 && !present.some(e => e.tier >= recordValue.tier && e.access === recordValue.access)) {
    add('TIER', `${at}.tier`);
  }
  if (recordValue.tier === 3 && new Set(present.filter(e => e.access === recordValue.access && e.tier === 3)
    .map(e => e.sourceId)).size < 2) add('TIER', `${at}.tier`);
}

function checkNode(node, i, add, sources, asOf, windowDays) {
  const at = `$.nodes[${i}]`;
  if (!strictKeys(node, ['id', 'en', 'fr', 'coordinate', 'feature', 'access', 'tier',
    'sourceIds', 'evidence', 'silo']) || !identifier(node.id) || !FEATURES.includes(node.feature) ||
      !ACCESS.includes(node.access) || !LEVELS.includes(node.tier) || !SILOS.includes(node.silo) ||
      !point(node.coordinate) || !inOntario(node.coordinate, 0.02)) {
    add('NODE', at); return null;
  }
  if (!safeCopy(node.en) || !safeCopy(node.fr)) add('COPY', `${at}.labels`);
  else if (!frenchCopy(node.fr)) add('PUNCTUATION', `${at}.fr`);
  checkAccess(node, at, add, sources, asOf, windowDays);
  return node;
}

function checkEdge(edge, i, add, sources, nodes, asOf, windowDays) {
  const at = `$.edges[${i}]`;
  if (!strictKeys(edge, ['id', 'from', 'to', 'kind', 'en', 'fr', 'geometry', 'lengthMetres',
    'access', 'tier', 'feature', 'sourceIds', 'evidence', 'silo', 'bidirectional', 'gradientPercent']) ||
      !identifier(edge.id) || !identifier(edge.from) || !identifier(edge.to) || edge.from === edge.to ||
      !KINDS.includes(edge.kind) || !FEATURES.includes(edge.feature) ||
      !ACCESS.includes(edge.access) || !LEVELS.includes(edge.tier) || !SILOS.includes(edge.silo) ||
      typeof edge.bidirectional !== 'boolean' || !Number.isFinite(edge.gradientPercent) ||
      edge.gradientPercent < 0 || edge.gradientPercent > 100 ||
      !Number.isFinite(edge.lengthMetres) || edge.lengthMetres <= 0 || edge.lengthMetres > 1000000) {
    add('EDGE', at); return null;
  }
  const a = nodes.get(edge.from);
  const b = nodes.get(edge.to);
  if (!a || !b) add('REFERENCE', `${at}.endpoints`);
  const line = polyline(edge.geometry);
  if (!line) add('GEOMETRY', `${at}.geometry`);
  else if (a && b) {
    if (distance(line[0], a.coordinate) > 15 || distance(line.at(-1), b.coordinate) > 15 ||
        Math.abs(pathLength(line) - edge.lengthMetres) > Math.max(25, edge.lengthMetres * 0.25)) {
      add('GEOMETRY', `${at}.geometry`);
    }
  }
  if (!safeCopy(edge.en) || !safeCopy(edge.fr)) add('COPY', `${at}.labels`);
  else if (!frenchCopy(edge.fr)) add('PUNCTUATION', `${at}.fr`);
  checkAccess(edge, at, add, sources, asOf, windowDays);
  return edge;
}

function checkAsset(asset, i, add, sources) {
  const at = `$.assets[${i}]`;
  if (!strictKeys(asset, ['id', 'path', 'bytes', 'sha256', 'sourceIds', 'silo', 'en', 'fr']) ||
      !identifier(asset.id) || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 ||
      asset.bytes > 32000000 || !Array.isArray(asset.sourceIds) || !asset.sourceIds.length ||
      asset.sourceIds.some(id => !identifier(id)) || !SILOS.includes(asset.silo)) {
    add('ASSET', at); return null;
  }
  if (!localFile(asset.path)) add('PATH', `${at}.path`);
  if (typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) add('HASH', `${at}.sha256`);
  if (!safeCopy(asset.en) || !safeCopy(asset.fr)) add('COPY', `${at}.labels`);
  else if (!frenchCopy(asset.fr)) add('PUNCTUATION', `${at}.fr`);
  const silo = desiredSilo(asset.sourceIds, sources);
  if (!silo) add('REFERENCE', `${at}.sourceIds`);
  else if (silo !== asset.silo) add('SILO', `${at}.silo`);
  return asset;
}

/** A failed audit never returns a partial network, even for one malformed entry. */
export function auditNetwork(input) {
  const { add, finish } = audit();
  if (!strictKeys(input, ['schemaVersion', 'asOf', 'maxAgeDays', 'sources', 'nodes', 'edges', 'assets']) ||
      input.schemaVersion !== 1 || !Array.isArray(input.sources) || !Array.isArray(input.nodes) ||
      !Array.isArray(input.edges) || !Array.isArray(input.assets)) {
    add('ROOT', '$'); return finish(null);
  }
  const asOf = calendarDay(input.asOf);
  if (asOf === null || !Number.isSafeInteger(input.maxAgeDays) ||
      input.maxAgeDays < 0 || input.maxAgeDays > 3650) {
    add('DATE', '$.asOf'); return finish(null);
  }
  if (input.sources.length > 5000 || input.nodes.length > 20000 ||
      input.edges.length > 50000 || input.assets.length > 10000) {
    add('LIMIT', '$'); return finish(null);
  }
  const sources = new Map();
  const nodes = new Map();
  const edges = new Map();
  const assets = new Map();
  for (const [i, item] of input.sources.entries()) {
    const entry = checkSource(item, i, add, asOf, input.maxAgeDays);
    if (!entry) continue;
    if (sources.has(entry.id)) add('DUPLICATE', `$.sources[${i}].id`);
    sources.set(entry.id, entry);
  }
  for (const [i, item] of input.nodes.entries()) {
    const entry = checkNode(item, i, add, sources, asOf, input.maxAgeDays);
    if (!entry) continue;
    if (nodes.has(entry.id)) add('DUPLICATE', `$.nodes[${i}].id`);
    nodes.set(entry.id, entry);
  }
  for (const [i, item] of input.edges.entries()) {
    const entry = checkEdge(item, i, add, sources, nodes, asOf, input.maxAgeDays);
    if (!entry) continue;
    if (edges.has(entry.id)) add('DUPLICATE', `$.edges[${i}].id`);
    edges.set(entry.id, entry);
  }
  const paths = new Set();
  for (const [i, item] of input.assets.entries()) {
    const entry = checkAsset(item, i, add, sources);
    if (!entry) continue;
    if (assets.has(entry.id)) add('DUPLICATE', `$.assets[${i}].id`);
    if (paths.has(entry.path)) add('DUPLICATE', `$.assets[${i}].path`);
    paths.add(entry.path);
    assets.set(entry.id, entry);
  }
  return finish(Object.freeze({ asOf: input.asOf, maxAgeDays: input.maxAgeDays,
    sources, nodes, edges, assets }));
}

export function networkSummary(network) {
  if (!network || !(network.nodes instanceof Map) || !(network.edges instanceof Map)) return null;
  const states = { YES: 0, NO: 0, UNKNOWN: 0 };
  for (const item of network.nodes.values()) states[item.access]++;
  for (const item of network.edges.values()) states[item.access]++;
  return Object.freeze({ sourceCount: network.sources.size, nodeCount: network.nodes.size,
    edgeCount: network.edges.size, assetCount: network.assets.size, states });
}

export function networkText(result, locale = 'en') {
  if (!result || !['en', 'fr'].includes(locale)) return null;
  const heading = locale === 'fr' ? (result.ok ? 'Contrôle réussi' : 'Parcours bloqué') :
    (result.ok ? 'Check passed' : 'Route blocked');
  return [heading, ...result.findings.map(item => `${item.code} ${item.path}: ${item[locale]}`)].join('\n') + '\n';
}
