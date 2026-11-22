// @ts-check

/** @typedef {import('./notice-calendar-input.mjs').Notice} Notice */
/** @typedef {{ start: number, end: number }} Span */
/** @typedef {{ notice: Notice, spans: Span[] }} CalendarEntry */
/** @typedef {{ date: string, start: number, end: number, entries: CalendarEntry[] }} CalendarDay */
/**
 * @typedef {object} CalendarOptions
 * @property {string} date First local date, in YYYY-MM-DD form.
 * @property {number} days Number of consecutive local dates to include.
 * @property {string} zone Civil time zone for the entire selection.
 * @property {string} [equipment]
 * @property {string} [stop]
 * @property {string} [route]
 * @property {string} [query]
 */
/**
 * @typedef {object} CalendarResult
 * @property {CalendarDay[]} days
 * @property {Notice[]} unknown Notices without enough period information to place.
 * @property {Notice[]} outside Notices whose reported periods all miss the window.
 * @property {number} matched Count of distinct notices passing the selected filters.
 */

const SECONDS_PER_DAY = 86400;
const ZONES = new Set(['America/Toronto', 'America/Winnipeg', 'UTC']);

/** @type {Map<string, Intl.DateTimeFormat>} */
const dateFormatters = new Map();

/** @param {string} zone */
function formatterFor(zone) {
  const existing = dateFormatters.get(zone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: zone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    era: 'short',
  });
  dateFormatters.set(zone, formatter);
  return formatter;
}

/**
 * Encode a civil date as an integer with calendar ordering. Asking for parts
 * avoids relying on the order or separators chosen for a display locale.
 * @param {number} seconds
 * @param {Intl.DateTimeFormat} formatter
 */
function localDateKey(seconds, formatter) {
  let year = 0;
  let month = 0;
  let day = 0;
  let beforeCommonEra = false;
  for (const part of formatter.formatToParts(seconds * 1000)) {
    switch (part.type) {
      case 'year':
        year = Number(part.value);
        break;
      case 'month':
        month = Number(part.value);
        break;
      case 'day':
        day = Number(part.value);
        break;
      case 'era':
        beforeCommonEra = part.value === 'BC';
        break;
    }
  }
  if (beforeCommonEra) year = 1 - year;
  return year * 10000 + month * 100 + day;
}

/**
 * UTC midnight here is a convenient ordinal for a civil date. The local-day
 * boundary is the first instant that displays that date in the selected zone.
 * Searching in seconds also handles historical offsets with fractional minutes.
 * @param {number} ordinal
 * @param {string} zone
 */
function firstInstant(ordinal, zone) {
  if (zone === 'UTC') return ordinal;
  const utc = new Date(ordinal * 1000);
  const key = utc.getUTCFullYear() * 10000 + (utc.getUTCMonth() + 1) * 100 + utc.getUTCDate();
  const formatter = formatterFor(zone);
  let low = ordinal - SECONDS_PER_DAY;
  let high = ordinal + SECONDS_PER_DAY;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (localDateKey(middle, formatter) < key) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * A string can match the shape of an ISO date and still name a nonexistent
 * day. Round-trip the date before doing any ordinal arithmetic.
 * @param {string} value
 */
function dateOrdinal(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    throw new RangeError('date');
  }
  const milliseconds = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) {
    throw new RangeError('date');
  }
  return milliseconds / 1000;
}

/** @param {CalendarOptions} options @returns {CalendarDay[]} */
function makeDays(options) {
  if (!ZONES.has(options.zone)) throw new RangeError('zone');
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 31) {
    throw new RangeError('days');
  }
  let ordinal = dateOrdinal(options.date);
  let start = firstInstant(ordinal, options.zone);
  /** @type {CalendarDay[]} */
  const result = [];
  for (let index = 0; index < options.days; index++) {
    const civilDate = new Date(ordinal * 1000).toISOString();
    if (civilDate.startsWith('+')) throw new RangeError('date');
    ordinal += SECONDS_PER_DAY;
    const end = firstInstant(ordinal, options.zone);
    result.push({date: civilDate.slice(0, 10), start, end, entries: []});
    start = end;
  }
  return result;
}

/** @param {string} value */
function searchText(value) {
  return value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** @param {Notice} notice @param {CalendarOptions} options @param {string[]} terms */
function includesNotice(notice, options, terms) {
  if (options.equipment && notice.equipment !== options.equipment) return false;
  if (options.stop && !notice.stops.includes(options.stop)) return false;
  if (options.route && !notice.routes.includes(options.route)) return false;
  if (terms.length === 0) return true;
  const text = searchText([
    notice.id,
    notice.header,
    notice.source,
    ...notice.stops,
    ...notice.routes,
  ].join('\n'));
  return terms.every(term => text.includes(term));
}

/**
 * Clip to the complete selection first. A missing endpoint has no bound on
 * that side. A period with neither endpoint supplies no placement evidence.
 * @param {Notice} notice
 * @param {number} start
 * @param {number} end
 */
function periodUnion(notice, start, end) {
  /** @type {Span[]} */
  const candidates = [];
  let uncertain = notice.periods.length === 0;
  for (const period of notice.periods) {
    if (period.start === null && period.end === null) {
      uncertain = true;
      continue;
    }
    const left = Math.max(start, period.start ?? start);
    const right = Math.min(end, period.end ?? end);
    if (left < right) candidates.push({start: left, end: right});
  }
  candidates.sort((a, b) => a.start - b.start || a.end - b.end);
  /** @type {Span[]} */
  const spans = [];
  for (const candidate of candidates) {
    const previous = spans[spans.length - 1];
    if (previous && candidate.start <= previous.end) {
      previous.end = Math.max(previous.end, candidate.end);
    } else {
      spans.push(candidate);
    }
  }
  return {spans, uncertain};
}

/**
 * Walk already merged spans in time order. A span crossing midnight stays
 * available for the next day; fully consumed spans are never scanned again.
 * @param {Notice} notice
 * @param {Span[]} spans
 * @param {CalendarDay[]} days
 */
function placeOnDays(notice, spans, days) {
  let index = 0;
  for (const day of days) {
    /** @type {Span[]} */
    const pieces = [];
    let span = spans[index];
    while (span && span.start < day.end) {
      pieces.push({start: Math.max(day.start, span.start), end: Math.min(day.end, span.end)});
      if (span.end > day.end) break;
      span = spans[++index];
    }
    if (pieces.length) day.entries.push({notice, spans: pieces});
    if (!span) break;
  }
}

/**
 * Return independent buckets for the supplied file. Header text and the file
 * retrieval date have no bearing on the reported periods. Each included
 * notice is counted once, even when its intervals land on several dates.
 * @param {readonly Notice[]} notices
 * @param {CalendarOptions} options
 * @returns {CalendarResult}
 */
export function buildCalendar(notices, options) {
  const days = makeDays(options);
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) throw new RangeError('days');
  const terms = searchText(options.query ?? '').split(/\s+/u).filter(Boolean);
  const selected = notices.filter(notice => includesNotice(notice, options, terms));
  selected.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  /** @type {Notice[]} */
  const unknown = [];
  /** @type {Notice[]} */
  const outside = [];
  for (const notice of selected) {
    const {spans, uncertain} = periodUnion(notice, first.start, last.end);
    if (spans.length > 0) {
      placeOnDays(notice, spans, days);
    } else if (uncertain) {
      unknown.push(notice);
    } else {
      outside.push(notice);
    }
  }
  return {days, unknown, outside, matched: selected.length};
}
