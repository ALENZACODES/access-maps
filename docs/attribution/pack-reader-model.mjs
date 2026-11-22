// @ts-check
import { expectedPackNotice, packLicenceMatches } from './pack-reader-provider.mjs';
import {
  MAX_MANIFEST_BYTES, PackReaderError, add, cellId, count, excluded,
  identifier, list, object, publicField, readObject, retrievalDate,
} from './pack-reader-parse.mjs';

export { MAX_MANIFEST_BYTES, PackReaderError };

export const TRANCHES = Object.freeze(/** @type {const} */ (['venue', 'washroom', 'transit', 'path']));

/** @typedef {typeof TRANCHES[number]} Tranche */
/** @typedef {'metadata-gap'|'licence-mismatch'|'notice-mismatch'|'missing-source'|'held-source'|'duplicate-part'|'conflicting-part'|'withheld-conflict'|'count-mismatch'} Issue */
/** @typedef {{id:string,label:{en:string,fr:string},cells:string[]}} Region */
/** @typedef {{sourceId:string,source:string,licence:string,retrievedOn:string,tier:string,attribution:string,issues:Issue[]}} Source */
/** @typedef {Source & {partCount:number,recordCount:number,withheldCount:number}} PackSourceRow */
/** @typedef {{sourceId:string|null,tranche:Tranche|null,cell:string|null,records:number,withheld:boolean,issues:Issue[]}} Entry */
/** @typedef {Entry & {signature:string|null,listed:boolean,explicitHold:boolean}} DraftEntry */
/** @typedef {{regions:Region[],sources:Map<string,Source>,entries:Entry[],issues:Issue[]}} PackManifest */
/** @typedef {{rows:PackSourceRow[],partCount:number,recordCount:number,withheldCount:number,unlocatedCount:number,issues:Issue[]}} PackCoverage */

const DIRECTORIES = { venue: 'venues', washroom: 'washrooms', transit: 'transit', path: 'paths' };
const MAX_ENTRIES = 45000;
const UNKNOWN = 'UNKNOWN';
/** @param {Issue[]} issues @param {Issue} issue */
function mark(issues, issue) {
  if (!issues.includes(issue)) issues.push(issue);
}

/** @param {string} id @returns {Source} */
function missingSource(id) {
  return {
    sourceId: id, source: UNKNOWN, licence: UNKNOWN, retrievedOn: UNKNOWN,
    tier: UNKNOWN, attribution: UNKNOWN, issues: ['missing-source'],
  };
}

/** @param {string} id @param {Record<string,unknown>} row @returns {Source} */
function sourceMetadata(id, row) {
  const source = publicField(row.name, 256);
  const licence = publicField(row.licence, 512);
  const retrievedOn = retrievalDate(row.retrieved);
  let attribution = publicField(row.attribution, 4096);
  /** @type {Issue[]} */
  const issues = [];
  const expected = expectedPackNotice(id);
  if (expected !== undefined) {
    const matches = packLicenceMatches(id, licence, row.licenceUrl);
    if (matches === false) issues.push('licence-mismatch');
    if (matches === null) issues.push('metadata-gap');
  }
  if (expected !== undefined && row.attribution !== expected) {
    issues.push('notice-mismatch');
    attribution = UNKNOWN;
  }
  if ([source, licence, retrievedOn, attribution].includes(UNKNOWN)) mark(issues, 'metadata-gap');
  // The v1 pack contract has no record-level evidence tier. Ignore any
  // unrecognised extension with a tier-like name.
  return { sourceId: id, source, licence, retrievedOn, tier: UNKNOWN, attribution, issues };
}

/** @param {unknown} input */
function catalogue(input) {
  /** @type {Map<string, Source>} */
  const sources = new Map();
  const seen = new Set();
  const held = new Set();
  const blocked = new Set();
  for (const item of list(input, 4096)) {
    const row = object(item);
    const id = identifier(row.sourceId);
    if (seen.has(id)) throw new PackReaderError('format');
    seen.add(id);
    if (excluded(id) || excluded(row.name)) {
      blocked.add(id);
      continue;
    }
    const metadata = sourceMetadata(id, row);
    if (row.inWebPack !== true || row.heldReason !== null) {
      held.add(id);
      metadata.issues.push('held-source');
    }
    sources.set(id, metadata);
  }
  return { sources, held, blocked };
}

/** @param {unknown} input @returns {Region[]} */
function readRegions(input) {
  const used = new Set();
  return list(input, 1024).map((item) => {
    const row = object(item);
    const id = identifier(row.id);
    if (used.has(id)) throw new PackReaderError('format');
    used.add(id);
    const label = object(row.label);
    const cells = [...new Set(list(row.cells, MAX_ENTRIES).map(cellId))];
    return { id, label: { en: publicField(label.en, 160), fr: publicField(label.fr, 160) }, cells };
  });
}

/**
 * The builder names a partition from tranche, source and half-degree cell,
 * followed by an optional split number. Never dereference that path. Requiring
 * it to match the surrounding declaration prevents a file from acquiring a
 * second provider or region by appearing in another part list.
 * @param {unknown} path @param {Tranche} tranche @param {string} id @param {string} cell
 * @returns {string}
 */
function partitionPath(path, tranche, id, cell) {
  const stem = DIRECTORIES[tranche] + '/' + id + '/' + cell;
  if (typeof path !== 'string' || !path.startsWith(stem)
    || !/^(?:\.p\d{1,8})?\.ndjson\.gz$/u.test(path.slice(stem.length))) {
    throw new PackReaderError('format');
  }
  return path;
}

/** @param {unknown} value @returns {Tranche} */
function trancheOf(value) {
  for (const tranche of TRANCHES) if (tranche === value) return tranche;
  throw new PackReaderError('format');
}

/** @param {Map<string,DraftEntry>} entries @param {string} path @param {DraftEntry} next */
function mergeEntry(entries, path, next) {
  const previous = entries.get(path);
  if (!previous) {
    entries.set(path, next);
    if (entries.size > MAX_ENTRIES) throw new PackReaderError('limit');
    return;
  }
  for (const issue of next.issues) mark(previous.issues, issue);
  if (next.explicitHold !== previous.explicitHold && (previous.listed || next.listed)) {
    mark(previous.issues, 'withheld-conflict');
  } else {
    mark(previous.issues, 'duplicate-part');
  }
  if (previous.signature !== null && next.signature !== null && previous.signature !== next.signature) {
    mark(previous.issues, 'conflicting-part');
    previous.withheld = true;
  }
  // Withheld metadata may be unlocated. Do not choose a source, category
  // or cell when two independently supplied scopes disagree.
  if (previous.sourceId !== next.sourceId) previous.sourceId = null;
  if (previous.tranche !== next.tranche) previous.tranche = null;
  if (previous.cell !== next.cell) previous.cell = null;
  previous.withheld ||= next.withheld;
  previous.explicitHold ||= next.explicitHold;
  previous.listed ||= next.listed;
}

/**
 * @param {unknown} input
 * @param {ReturnType<typeof catalogue>} catalog
 * @param {Map<string,DraftEntry>} entries
 */
function readParts(input, catalog, entries) {
  const tranches = object(input);
  Object.keys(tranches).forEach(trancheOf);
  for (const tranche of TRANCHES) {
    const cells = object(object(tranches[tranche]).cells);
    for (const [cell, value] of Object.entries(cells)) {
      cellId(cell);
      for (const item of list(object(value).parts, MAX_ENTRIES)) {
        const part = object(item);
        const id = identifier(part.sourceId);
        const path = partitionPath(part.path, tranche, id, cell);
        const blocked = excluded(id) || catalog.blocked.has(id);
        const bytes = count(part.bytes);
        const records = count(part.count);
        if (bytes > 25 * 1024 * 1024 || typeof part.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(part.sha256)) {
          throw new PackReaderError('format');
        }
        mergeEntry(entries, path, {
          sourceId: id, tranche, cell, records, issues: [],
          signature: [bytes, records, part.sha256].join('/'),
          withheld: !blocked && (!catalog.sources.has(id) || catalog.held.has(id)),
          explicitHold: false, listed: true,
        });
      }
    }
  }
}

/**
 * Unlike released partitions, a withheld path is also allowed to be a tile,
 * a link asset or an unrecognised filename with no category or cell. Keep
 * these counts separate under a filter. Never return paths or reasons.
 * @param {unknown} input @param {Set<string>} blocked @param {Map<string,DraftEntry>} entries
 */
function readWithheld(input, blocked, entries) {
  if (input === undefined) return;
  for (const item of list(input, MAX_ENTRIES)) {
    const row = object(item);
    let id = row.sourceId === null ? null : identifier(row.sourceId);
    const path = row.path;
    if (typeof path !== 'string' || !path || path.length > 1024) throw new PackReaderError('format');
    const fileSource = path.split('/')[1];
    if (excluded(id) || excluded(fileSource) || (fileSource && blocked.has(fileSource)) || (id && blocked.has(id))) {
      continue;
    }
    let tranche = row.tranche === null ? null : trancheOf(row.tranche);
    let cell = row.cell === null ? null : cellId(row.cell);
    /** @type {Issue[]} */
    const issues = [];
    const partition = /^(venues|washrooms|transit|paths)\/([^/]+)\/([ns]\d{2,3}\.[05]_[ew]\d{3}\.[05])(?:\.p\d+)?\.ndjson\.gz$/u.exec(path);
    if (partition) {
      if (id && id !== partition[2]) { id = null; mark(issues, 'conflicting-part'); }
      if (cell && cell !== partition[3]) { cell = null; mark(issues, 'conflicting-part'); }
      if (tranche && DIRECTORIES[tranche] !== partition[1]) { tranche = null; mark(issues, 'conflicting-part'); }
    }
    mergeEntry(entries, path, {
      sourceId: id, tranche, cell, records: 0, withheld: true, issues,
      listed: false, explicitHold: true, signature: null,
    });
  }
}

/** @param {unknown} input @param {Map<string,number>} actual */
function countersAgree(input, actual) {
  const totals = object(input);
  const keys = new Set([...Object.keys(totals), ...actual.keys()]);
  let agrees = true;
  for (const key of keys) {
    const stated = Object.hasOwn(totals, key) ? count(totals[key]) : 0;
    if (stated !== (actual.get(key) ?? 0)) agrees = false;
  }
  return agrees;
}

/**
 * Compare the publisher's whole-pack totals with counts from distinct usable
 * partitions, including excluded feed counts here only. This makes a wrong
 * gross total or per-category total detectable even for an input containing
 * excluded feeds. Those feeds never enter the public result.
 * @param {unknown} input @param {Entry[]} entries
 */
function consistentCounts(input, entries) {
  const counts = object(input);
  /** @type {Map<string,number>} */
  const sourceCounts = new Map();
  /** @type {Map<string,number>} */
  const trancheCounts = new Map();
  let total = 0;
  for (const entry of entries) {
    if (entry.withheld || !entry.sourceId || !entry.tranche) continue;
    total = add(total, entry.records);
    sourceCounts.set(entry.sourceId, add(sourceCounts.get(entry.sourceId) ?? 0, entry.records));
    trancheCounts.set(entry.tranche, add(trancheCounts.get(entry.tranche) ?? 0, entry.records));
  }
  const bySource = countersAgree(counts.bySource, sourceCounts);
  const byTranche = countersAgree(counts.byTranche, trancheCounts);
  return count(counts.records) === total && bySource && byTranche;
}

/**
 * Read attribution metadata from the web pack v1 manifest. Unrelated
 * sections (tiles, search, links and build details) cannot supply a record
 * count, an attribution, a retrieval date or a tier.
 * @param {string} text @returns {PackManifest}
 */
export function readPack(text) {
  const raw = readObject(text);
  if (raw.version !== 1) throw new PackReaderError('version');
  const catalog = catalogue(raw.sources);
  const regions = readRegions(raw.regions);
  /** @type {Map<string,DraftEntry>} */
  const byPath = new Map();
  readParts(raw.tranches, catalog, byPath);
  readWithheld(raw.withheld, catalog.blocked, byPath);
  const entries = Array.from(byPath.values(), (entry) => ({
    sourceId: entry.sourceId, tranche: entry.tranche, cell: entry.cell,
    records: entry.withheld ? 0 : entry.records, withheld: entry.withheld, issues: entry.issues,
  }));
  const issues = consistentCounts(raw.counts, entries)
    ? [] : /** @type {Issue[]} */ (['count-mismatch']);
  const visible = entries.filter(({sourceId}) =>
    sourceId === null || (!excluded(sourceId) && !catalog.blocked.has(sourceId)));
  return { sources: catalog.sources, regions, entries: visible, issues };
}

/**
 * Aggregate distinct record partitions only. Overlapping region windows and
 * the same source across several categories never multiply a file's count.
 * If a requested scope is invalid, fail instead of widening the scope.
 * @param {PackManifest} pack @param {string} [regionId] @param {string} [tranche]
 * @returns {PackCoverage}
 */
export function selectCoverage(pack, regionId = '', tranche = '') {
  const region = regionId ? pack.regions.find((r) => r.id === regionId) : undefined;
  if (regionId && !region) throw new PackReaderError('format');
  if (tranche) trancheOf(tranche);
  const cells = region ? new Set(region.cells) : null;
  /** @type {Map<string,PackSourceRow>} */
  const rows = new Map();
  const issues = [...pack.issues];
  let withheldCount = 0;
  let unlocatedCount = 0;
  let recordCount = 0;
  let partCount = 0;
  for (const entry of pack.entries) {
    if (cells && entry.cell && !cells.has(entry.cell)) continue;
    if (tranche && entry.tranche && entry.tranche !== tranche) continue;
    if ((cells && !entry.cell) || (tranche && !entry.tranche)) {
      unlocatedCount++;
      continue;
    }
    if (entry.withheld) withheldCount++;
    else {
      partCount++;
      recordCount = add(recordCount, entry.records);
    }
    for (const issue of entry.issues) mark(issues, issue);
    const id = entry.sourceId ?? UNKNOWN;
    let row = rows.get(id);
    if (!row) {
      const source = pack.sources.get(id) ?? missingSource(id);
      row = { ...source, issues: [...source.issues], recordCount: 0, partCount: 0, withheldCount: 0 };
      for (const issue of row.issues) mark(issues, issue);
      rows.set(id, row);
    }
    for (const issue of entry.issues) mark(row.issues, issue);
    if (entry.withheld) row.withheldCount++;
    else {
      row.partCount++;
      row.recordCount = add(row.recordCount, entry.records);
    }
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId, 'en')),
    partCount, recordCount, withheldCount, unlocatedCount, issues,
  };
}
