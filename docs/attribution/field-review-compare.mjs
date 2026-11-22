// @ts-check

/** @typedef {import('./field-review-input.mjs').FieldEvidence} FieldEvidence */
/** @typedef {import('./field-review-input.mjs').FieldRecord} FieldRecord */

/** @type {readonly ['field-before','field-after','reported','became-unknown','value','evidence','same','region','empty']} */
export const KINDS = Object.freeze([
  'field-before', 'field-after', 'reported', 'became-unknown',
  'value', 'evidence', 'same', 'region', 'empty',
]);

const evidenceKeys = /** @type {const} */ ([
  'source', 'licence', 'retrievedOn', 'tier', 'sourceKey', 'raw', 'derived',
]);

export const DIMENSIONS = Object.freeze(/** @type {const} */ (['value', ...evidenceKeys, 'region']));

/** @typedef {typeof KINDS[number]} Kind */
/** @typedef {typeof DIMENSIONS[number]} Dimension */
/** @typedef {'before'|'after'|'both'} RecordSide */
/**
 * @typedef {object} ReviewRow
 * @property {string} id
 * @property {string} tranche
 * @property {string|null} field
 * @property {Kind} kind
 * @property {RecordSide} recordSide
 * @property {string|null} regionBefore
 * @property {string|null} regionAfter
 * @property {FieldEvidence|null} before
 * @property {FieldEvidence|null} after
 * @property {readonly Dimension[]} dimensions
 */
/**
 * @typedef {object} ReviewTotals
 * @property {number} rows
 * @property {number} fields Number of field comparisons.
 * @property {number} records Number of distinct record identities.
 * @property {number} changed Changed rows, including region or presence changes.
 * @property {Record<Kind, number>} byKind Row counts.
 * @property {Record<RecordSide, number>} bySide Distinct record counts.
 */
/** @typedef {{rows:ReviewRow[],totals:ReviewTotals}} Selection */
/** @typedef {{fields:string[],sources:string[],tranches:string[]}} ReviewFacets */
/** @typedef {Selection & {facets:ReviewFacets}} Comparison */
/**
 * @typedef {object} ReviewFilters
 * @property {string} [source]
 * @property {string} [field]
 * @property {string} [tranche]
 * @property {string} [kind]
 * @property {string} [recordSide]
 * @property {string} [query]
 * @property {boolean} [changesOnly]
 */
/** @typedef {{before:FieldRecord|null,after:FieldRecord|null}} Pair */
/** @typedef {Pick<ReviewRow,'id'|'tranche'|'recordSide'|'regionBefore'|'regionAfter'>} RowIdentity */

/** @type {readonly Dimension[]} */
const noDimensions = Object.freeze([]);
/** @type {readonly Dimension[]} */
const regionDimension = Object.freeze(['region']);

/**
 * Coordinates stay ordered. A reordered path or a change in its number of
 * vertices changes the field even when all coordinates occur on both sides.
 * @param {FieldEvidence['value']} a
 * @param {FieldEvidence['value']} b
 */
function equalValue(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((point, index) => {
    const other = b[index];
    return other !== undefined && point.length === other.length &&
      point.every((coordinate, axis) => coordinate === other[axis]);
  });
}

/**
 * A field seen on just one side has no paired metadata to compare. Its presence
 * is expressed by the kind and the missing side, separately from UNKNOWN.
 * @param {RowIdentity} identity
 * @param {string} field
 * @param {FieldEvidence|null} before
 * @param {FieldEvidence|null} after
 * @returns {ReviewRow}
 */
function compareField(identity, field, before, after) {
  /** @type {Kind} */
  let kind;
  /** @type {readonly Dimension[]} */
  let dimensions = noDimensions;
  if (!before) {
    kind = 'field-after';
  } else if (!after) {
    kind = 'field-before';
  } else {
    /** @type {Dimension[]} */
    const changed = [];
    const sameValue = equalValue(before.value, after.value);
    if (!sameValue) changed.push('value');
    for (const key of evidenceKeys) {
      if (before[key] !== after[key] || (key === 'raw' && before.rawPresent !== after.rawPresent)) {
        changed.push(key);
      }
    }
    if (changed.length) dimensions = changed;
    if (sameValue) kind = changed.length ? 'evidence' : 'same';
    else if (before.value === 'UNKNOWN') kind = 'reported';
    else if (after.value === 'UNKNOWN') kind = 'became-unknown';
    else kind = 'value';
  }
  return { ...identity, field, before, after, kind, dimensions };
}

/**
 * Use two maps so identities can contain punctuation and arbitrary text
 * without a delimiter convention. Regions can change between captures.
 * @param {Map<string,Map<string,Pair>>} index
 * @param {readonly FieldRecord[]} records
 * @param {'before'|'after'} side
 */
function indexSnapshot(index, records, side) {
  for (const record of records) {
    let tranche = index.get(record.tranche);
    if (!tranche) {
      tranche = new Map();
      index.set(record.tranche, tranche);
    }
    let pair = tranche.get(record.id);
    if (!pair) {
      pair = {before: null, after: null};
      tranche.set(record.id, pair);
    }
    if (pair[side]) throw new RangeError('duplicate');
    pair[side] = record;
  }
}

/** @param {ReviewRow} row */
function isChanged(row) {
  return row.kind !== 'same' && !(row.kind === 'empty' && row.recordSide === 'both');
}

/**
 * Rows for an identity are contiguous in the comparison and in its filtered
 * subsequences. Count each identity once, even if several of its fields pass.
 * @param {readonly ReviewRow[]} rows
 * @returns {ReviewTotals}
 */
function summarize(rows) {
  /** @type {ReviewTotals} */
  const totals = {
    rows: rows.length,
    fields: 0,
    records: 0,
    changed: 0,
    bySide: {before: 0, after: 0, both: 0},
    byKind: {
      'field-before': 0, 'field-after': 0, reported: 0, 'became-unknown': 0,
      value: 0, evidence: 0, same: 0, region: 0, empty: 0,
    },
  };
  /** @type {ReviewRow|undefined} */
  let previous;
  for (const row of rows) {
    totals.byKind[row.kind]++;
    if (isChanged(row)) totals.changed++;
    if (row.field !== null) totals.fields++;
    if (!previous || previous.tranche !== row.tranche || previous.id !== row.id) {
      totals.records++;
      totals.bySide[row.recordSide]++;
    }
    previous = row;
  }
  return totals;
}

/**
 * Compare the supplied records, retaining both inputs as references on each
 * field row. A region change has its own row; it does not manufacture changes
 * on all unchanged fields. The order is deterministic across input orderings,
 * interface languages and runtime collation defaults.
 * @param {readonly FieldRecord[]} before
 * @param {readonly FieldRecord[]} after
 * @returns {Comparison}
 */
export function compareSnapshots(before, after) {
  /** @type {Map<string,Map<string,Pair>>} */
  const index = new Map();
  indexSnapshot(index, before, 'before');
  indexSnapshot(index, after, 'after');
  /** @type {ReviewRow[]} */
  const rows = [];
  const tranches = [...index.keys()].sort();
  /** @type {Set<string>} */
  const sources = new Set();
  /** @type {Set<string>} */
  const allFields = new Set();
  for (const tranche of tranches) {
    const grouped = index.get(tranche);
    if (!grouped) continue;
    for (const id of [...grouped.keys()].sort()) {
      const pair = grouped.get(id);
      if (!pair) continue;
      const earlier = pair.before;
      const later = pair.after;
      /** @type {RowIdentity} */
      const identity = {
        id, tranche,
        recordSide: !earlier ? 'after' : !later ? 'before' : 'both',
        regionBefore: earlier?.region ?? null,
        regionAfter: later?.region ?? null,
      };
      const regionChanged = earlier !== null && later !== null && earlier.region !== later.region;
      const fieldNames = new Set([
        ...Object.keys(earlier?.fields ?? {}), ...Object.keys(later?.fields ?? {}),
      ]);
      if (regionChanged || fieldNames.size === 0) {
        rows.push({
          ...identity,
          field: null,
          kind: regionChanged ? 'region' : 'empty',
          before: null,
          after: null,
          dimensions: regionChanged ? regionDimension : noDimensions,
        });
      }
      for (const field of [...fieldNames].sort()) {
        // An inherited property must never stand in for a missing side.
        const left = earlier && Object.hasOwn(earlier.fields, field) ? earlier.fields[field] ?? null : null;
        const right = later && Object.hasOwn(later.fields, field) ? later.fields[field] ?? null : null;
        if (left) sources.add(left.source);
        if (right) sources.add(right.source);
        allFields.add(field);
        rows.push(compareField(identity, field, left, right));
      }
    }
  }
  return {
    rows,
    totals: summarize(rows),
    facets: {tranches, sources: [...sources].sort(), fields: [...allFields].sort()},
  };
}

/** @param {string} text */
function fold(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * A source criterion applies only to explicitly attributed fields. A region
 * marker carries no field evidence and so cannot establish a source match.
 * Facets are exact and case-sensitive; only the free-text query folds accents.
 * @param {Comparison} comparison
 * @param {ReviewFilters} [filters]
 * @returns {Selection}
 */
export function selectRows(comparison, filters = {}) {
  const terms = fold(filters.query ?? '').split(/\s+/u).filter(Boolean);
  if (!terms.length && !filters.source && !filters.field && !filters.tranche &&
      !filters.recordSide && !filters.kind && !filters.changesOnly) {
    return {rows: comparison.rows, totals: comparison.totals};
  }
  const rows = comparison.rows.filter(row => {
    if (filters.changesOnly && !isChanged(row)) return false;
    if (filters.tranche && filters.tranche !== row.tranche) return false;
    if (filters.recordSide && filters.recordSide !== row.recordSide) return false;
    if (filters.kind && filters.kind !== row.kind) return false;
    if (filters.field && filters.field !== row.field) return false;
    if (filters.source && filters.source !== row.before?.source && filters.source !== row.after?.source) return false;
    if (!terms.length) return true;
    const searchable = fold([
      row.id, row.field, row.tranche, row.regionBefore, row.regionAfter,
      row.before?.source, row.after?.source,
    ].join('\n'));
    return terms.every(term => searchable.includes(term));
  });
  return {rows, totals: summarize(rows)};
}

/**
 * The page number is clamped after a filter change. Invalid sizes and
 * fractional page numbers are caller errors. An empty selection has no page.
 * @param {readonly ReviewRow[]} rows
 * @param {number} [page]
 * @param {number} [pageSize]
 */
export function pageRows(rows, page = 1, pageSize = 20) {
  if (!Number.isSafeInteger(page)) throw new RangeError('page');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize');
  const total = rows.length;
  const pages = Math.ceil(total / pageSize);
  if (pages === 0) return {rows: [], page: 0, pages, total, first: 0, last: 0};
  const current = Math.max(1, Math.min(page, pages));
  const offset = (current - 1) * pageSize;
  const last = Math.min(offset + pageSize, total);
  return {rows: rows.slice(offset, last), page: current, pages, total, first: offset + 1, last};
}
