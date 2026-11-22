// @ts-check

/** @typedef {{start: number | null, end: number | null}} NoticePeriod */
/**
 * @typedef {object} Notice
 * @property {string} id
 * @property {string} source
 * @property {string} licence
 * @property {string} retrievedOn
 * @property {number | 'UNKNOWN'} tier
 * @property {string} header
 * @property {string} language
 * @property {string} equipment
 * @property {string[]} stops
 * @property {string[]} routes
 * @property {NoticePeriod[]} periods
 */
/** @typedef {'empty'|'format'|'row'|'duplicate'|'date'|'period'|'limit'|'encoding'|'compression'|'read'} InputCode */

export class NoticeInputError extends Error {
  /** @param {InputCode} code @param {number | null} [row] */
  constructor(code, row = null) {
    super(code);
    this.name = 'NoticeInputError';
    this.code = code;
    this.row = row;
  }
}

export const inputLimits = Object.freeze({
  fileBytes: 4 * 1024 * 1024,
  textBytes: 8 * 1024 * 1024,
  records: 5000,
  periodsPerRecord: 128,
  totalPeriods: 32768,
  referencesPerField: 512,
});

const unknown = 'UNKNOWN';
const rowKeys = new Set([
  'id', 'source_id', 'licence', 'retrieved_at', 'tier',
  'feed_timestamp', 'entity_id', 'effect', 'equipment', 'header_text',
  'header_language', 'stop_ids', 'route_ids', 'active_periods', 'cause',
]);
const equipmentNames = new Set(['elevator', 'escalator', 'elevator_and_escalator', unknown]);
const lastSecond = 253402300799; // End of the last four-digit civil year.
const unsafeText = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]|\p{Surrogate}/u;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value */
function missing(value) {
  return value === undefined || value === null ||
    (typeof value === 'string' && (value.trim() === '' || value.trim() === unknown));
}

/**
 * @param {unknown} value
 * @param {number} row
 * @param {number} maxLength
 * @param {boolean} [multiline]
 * @returns {string}
 */
function textField(value, row, maxLength, multiline = false) {
  if (missing(value)) return unknown;
  if (typeof value !== 'string' || unsafeText.test(value) ||
      (!multiline && /[\r\n\t]/u.test(value))) {
    throw new NoticeInputError('row', row);
  }
  if (value.length > maxLength) throw new NoticeInputError('limit', row);
  return value.trim();
}

/** @param {unknown} value @param {number} row */
function retrievedDate(value, row) {
  if (missing(value)) return unknown;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith('0000')) {
    throw new NoticeInputError('date', row);
  }
  const instant = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== value) {
    throw new NoticeInputError('date', row);
  }
  return value;
}

/** @param {unknown} value @param {number} row */
function languageField(value, row) {
  const tag = textField(value, row, 64);
  if (tag === unknown) return tag;
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? unknown;
  } catch {
    throw new NoticeInputError('row', row);
  }
}

/** @param {unknown} value @param {number} row @returns {string[]} */
function referenceList(value, row) {
  if (missing(value)) return [];
  if (!Array.isArray(value)) throw new NoticeInputError('row', row);
  if (value.length > inputLimits.referencesPerField) throw new NoticeInputError('limit', row);
  const references = new Set();
  for (const item of value) {
    const id = textField(item, row, 512);
    if (id !== unknown) references.add(id);
  }
  return Array.from(references);
}

/** @param {unknown} value @param {number} row @returns {number | null} */
function boundary(value, row) {
  if (missing(value)) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > lastSecond) {
    throw new NoticeInputError('period', row);
  }
  return value;
}

/** @param {unknown} value @param {number} row @returns {NoticePeriod[]} */
function periodsField(value, row) {
  if (missing(value)) return [];
  if (!Array.isArray(value)) throw new NoticeInputError('period', row);
  if (value.length > inputLimits.periodsPerRecord) throw new NoticeInputError('limit', row);
  return value.map((item) => {
    if (!isObject(item) || Object.keys(item).some((key) => key !== 'start' && key !== 'end')) {
      throw new NoticeInputError('period', row);
    }
    const start = boundary(item.start, row);
    const end = boundary(item.end, row);
    if (start !== null && end !== null && start >= end) throw new NoticeInputError('period', row);
    return { start, end };
  });
}

/** @param {unknown} input @param {number} row @returns {Notice} */
function noticeFrom(input, row) {
  if (!isObject(input) || Object.keys(input).some((key) => !rowKeys.has(key))) {
    throw new NoticeInputError('row', row);
  }
  const id = textField(input.id, row, 512);
  if (id === unknown) throw new NoticeInputError('row', row);
  // These snapshot fields do not become calendar boundaries. Check their
  // shape before discarding them so a nested object cannot masquerade as text.
  for (const field of ['entity_id', 'effect', 'cause']) textField(input[field], row, 512);
  const stamp = input.feed_timestamp;
  if (!missing(stamp) && (typeof stamp !== 'number' || !Number.isSafeInteger(stamp) || stamp < 0)) {
    throw new NoticeInputError('row', row);
  }
  const tier = missing(input.tier) ? unknown : input.tier;
  if (tier !== unknown && tier !== 4) throw new NoticeInputError('row', row);
  const equipment = textField(input.equipment, row, 32);
  if (!equipmentNames.has(equipment)) throw new NoticeInputError('row', row);
  return {
    id,
    source: textField(input.source_id, row, 512),
    licence: textField(input.licence, row, 2048),
    retrievedOn: retrievedDate(input.retrieved_at, row),
    tier,
    header: textField(input.header_text, row, 16384, true),
    language: languageField(input.header_language, row),
    equipment,
    stops: referenceList(input.stop_ids, row),
    routes: referenceList(input.route_ids, row),
    periods: periodsField(input.active_periods, row),
  };
}

/**
 * Read an array, one object (including a pretty-printed object), or one object
 * per line. Array positions and physical line numbers both start at one.
 * @param {string} text
 * @returns {Generator<[unknown, number]>}
 */
function* sourceRows(text) {
  if (text.startsWith('[')) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new NoticeInputError('format');
    }
    if (!Array.isArray(parsed)) throw new NoticeInputError('format');
    if (parsed.length > inputLimits.records) throw new NoticeInputError('limit', inputLimits.records + 1);
    for (const [index, record] of parsed.entries()) yield [record, index + 1];
    return;
  }
  // Try a complete object first so that line breaks inside a formatted
  // single record do not look like record boundaries.
  if (text.trimStart().startsWith('{')) {
    /** @type {unknown} */
    let single;
    try {
      single = JSON.parse(text);
    } catch {
      // Multiple records are handled by the line reader.
    }
    if (single !== undefined) {
      let row = 1;
      const opening = text.indexOf('{');
      for (let i = 0; i < opening; i++) {
        if (text[i] === '\r' || (text[i] === '\n' && text[i - 1] !== '\r')) row++;
      }
      yield [single, row];
      return;
    }
  }
  // Walk the lines without creating an array proportional to empty lines.
  let position = 0;
  let row = 1;
  while (position < text.length) {
    let end = position;
    while (end < text.length && text[end] !== '\n' && text[end] !== '\r') end++;
    const line = text.slice(position, end).trim();
    if (line) {
      /** @type {unknown} */
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        throw new NoticeInputError('format', row);
      }
      yield [record, row];
    }
    if (text[end] === '\r' && text[end + 1] === '\n') end++;
    position = end + 1;
    row++;
  }
}

/** @param {string} text @returns {Notice[]} */
export function parseNotices(text) {
  if (typeof text !== 'string') throw new NoticeInputError('format');
  if (text.length > inputLimits.textBytes || new TextEncoder().encode(text).length > inputLimits.textBytes) {
    throw new NoticeInputError('limit');
  }
  const first = text.trimStart();
  if (!first) throw new NoticeInputError('empty');
  const rows = sourceRows(first.startsWith('[') ? first : text.replace(/^\uFEFF/u, ''));
  /** @type {Notice[]} */
  const notices = [];
  const ids = new Set();
  let periods = 0;
  for (const [raw, row] of rows) {
    if (notices.length >= inputLimits.records) throw new NoticeInputError('limit', row);
    const notice = noticeFrom(raw, row);
    if (ids.has(notice.id)) throw new NoticeInputError('duplicate', row);
    periods += notice.periods.length;
    if (periods > inputLimits.totalPeriods) throw new NoticeInputError('limit', row);
    ids.add(notice.id);
    notices.push(notice);
  }
  return notices;
}

/**
 * Count bytes after optional decompression. Decode incrementally so a valid
 * code point that straddles chunks is preserved and invalid UTF-8 is rejected.
 * @param {ReadableStream<Uint8Array>} stream
 * @param {boolean} compressed
 */
async function decodedText(stream, compressed) {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const pieces = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > inputLimits.textBytes) throw new NoticeInputError('limit');
      try {
        pieces.push(decoder.decode(value, { stream: true }));
      } catch {
        throw new NoticeInputError('encoding');
      }
    }
    try {
      pieces.push(decoder.decode());
    } catch {
      throw new NoticeInputError('encoding');
    }
    return pieces.join('');
  } catch (error) {
    // The decompressor may already have errored. Preserve the original cause.
    await reader.cancel().catch(() => {});
    if (error instanceof NoticeInputError) throw error;
    throw new NoticeInputError(compressed ? 'compression' : 'read');
  } finally {
    reader.releaseLock();
  }
}

/** @param {Blob} file @returns {Promise<Notice[]>} */
export async function readNoticeFile(file) {
  if (file.size > inputLimits.fileBytes) throw new NoticeInputError('limit');
  let compressed = false;
  try {
    const prefix = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    compressed = prefix[0] === 0x1f && prefix[1] === 0x8b;
    let stream = file.stream();
    if (compressed) {
      if (typeof DecompressionStream !== 'function') throw new NoticeInputError('compression');
      stream = stream.pipeThrough(new DecompressionStream('gzip'));
    }
    return parseNotices(await decodedText(stream, compressed));
  } catch (error) {
    if (error instanceof NoticeInputError) throw error;
    throw new NoticeInputError(compressed ? 'compression' : 'read');
  }
}
