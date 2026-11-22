// @ts-check

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {buildCalendar} from './notice-calendar-time.mjs';

/** @typedef {import('./notice-calendar-input.mjs').Notice} Notice */
/** @typedef {import('./notice-calendar-time.mjs').CalendarDay} CalendarDay */
/** @typedef {import('./notice-calendar-time.mjs').CalendarOptions} CalendarOptions */
/** @typedef {import('./notice-calendar-time.mjs').CalendarResult} CalendarResult */
/** @typedef {import('./notice-calendar-time.mjs').Span} Span */

const dayStart = Date.parse('2026-02-07T00:00:00Z') / 1000;
const dayLength = 86400;

/** @type {CalendarOptions} */
const utc = {date: '2026-02-07', days: 1, zone: 'UTC'};

/** @param {string} id @param {Partial<Notice>} [fields] @returns {Notice} */
function notice(id, fields = {}) {
  return {
    id,
    header: 'UNKNOWN',
    source: 'UNKNOWN',
    licence: 'UNKNOWN',
    retrievedOn: 'UNKNOWN',
    tier: 'UNKNOWN',
    equipment: 'UNKNOWN',
    language: 'UNKNOWN',
    stops: [],
    routes: [],
    periods: [],
    ...fields,
  };
}

/** @param {number|null} from @param {number|null} until */
function period(from, until) {
  return {
    start: from === null ? null : dayStart + from,
    end: until === null ? null : dayStart + until,
  };
}

/** @param {number} from @param {number} until @returns {Span} */
function span(from, until) {
  return {start: dayStart + from, end: dayStart + until};
}

/** @param {CalendarResult} calendar @param {number} [index] @returns {CalendarDay} */
function day(calendar, index = 0) {
  const value = calendar.days[index];
  assert.ok(value, 'expected calendar date');
  return value;
}

/** @param {string} text */
function epoch(text) {
  return Date.parse(text) / 1000;
}

/** @param {Notice[]} rows */
function ids(rows) {
  return rows.map(row => row.id);
}

/** @param {CalendarResult} calendar */
function onDates(calendar) {
  return calendar.days.map(date => date.entries.map(entry => entry.notice.id));
}

describe('local dates', () => {
  it('keeps selected dates visible even when the file has no notices', () => {
    const calendar = buildCalendar([], utc);
    assert.deepEqual(calendar, {
      days: [{
        date: '2026-02-07',
        start: dayStart,
        end: dayStart + dayLength,
        entries: [],
      }],
      matched: 0,
      unknown: [],
      outside: [],
    });
  });

  it('uses the selected local zone at a shared UTC instant', () => {
    const start = epoch('2026-01-02T05:30:00Z');
    const rows = [notice('a', {periods: [{start, end: start + 60}]})];
    const options = {...utc, date: '2026-01-01', days: 2};
    assert.deepEqual(onDates(buildCalendar(rows, {...options, zone: 'UTC'})), [[], ['a']]);
    assert.deepEqual(onDates(buildCalendar(rows, {...options, zone: 'America/Toronto'})), [[], ['a']]);
    assert.deepEqual(onDates(buildCalendar(rows, {...options, zone: 'America/Winnipeg'})), [['a'], []]);
  });

  it('clips an open notice to the 23-hour eastern spring day', () => {
    const rows = [notice('a', {periods: [{start: 0, end: null}]})];
    const current = day(buildCalendar(rows, {
      date: '2026-03-08',
      days: 1,
      zone: 'America/Toronto',
    }));
    assert.equal(current.start, epoch('2026-03-08T05:00:00Z'));
    assert.equal(current.end, epoch('2026-03-09T04:00:00Z'));
    assert.deepEqual(current.entries[0]?.spans, [{start: current.start, end: current.end}]);
    assert.equal(current.end - current.start, 23 * 3600);
  });

  it('preserves distinct instants in the repeated central autumn hour', () => {
    const earlier = epoch('2025-11-02T06:12:00Z');
    const later = epoch('2025-11-02T07:12:00Z');
    const periods = [
      {start: later, end: later + 60},
      {start: earlier, end: earlier + 60},
    ];
    const current = day(buildCalendar([notice('a', {periods})], {
      date: '2025-11-02',
      days: 1,
      zone: 'America/Winnipeg',
    }));
    assert.equal(current.start, epoch('2025-11-02T05:00:00Z'));
    assert.equal(current.end, epoch('2025-11-03T06:00:00Z'));
    assert.equal(current.end - current.start, 25 * 3600);
    assert.deepEqual(current.entries[0]?.spans, [periods[1], periods[0]]);
  });

  it('keeps continuity across an offset change within a month-long selection', () => {
    const options = {date: '2026-02-27', days: 31, zone: 'America/Toronto'};
    const calendar = buildCalendar([], options);
    assert.equal(calendar.days.length, 31);
    assert.equal(day(calendar).date, '2026-02-27');
    assert.equal(day(calendar, 30).date, '2026-03-29');
    const seconds = calendar.days.reduce((total, date) => total + date.end - date.start, 0);
    assert.equal(seconds, 31 * dayLength - 3600);
    for (let index = 1; index < calendar.days.length; index++) {
      assert.equal(day(calendar, index - 1).end, day(calendar, index).start);
    }
  });

  it('advances calendar dates across leap days and year boundaries', () => {
    const datesFor = (/** @type {string} */ date) =>
      buildCalendar([], {...utc, date, days: 3}).days.map(d => d.date);
    assert.deepEqual(datesFor('2000-02-28'), ['2000-02-28', '2000-02-29', '2000-03-01']);
    assert.deepEqual(datesFor('2100-02-28'), ['2100-02-28', '2100-03-01', '2100-03-02']);
    assert.deepEqual(datesFor('2026-12-31'), ['2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('accepts the last four-digit year but rejects selections continuing beyond it', () => {
    const date = '9999-12-31';
    const current = day(buildCalendar([], {...utc, date}));
    assert.equal(current.date, date);
    assert.equal(current.end - current.start, dayLength);
    assert.throws(() => buildCalendar([], {...utc, date, days: 2}), {message: 'date'});
  });

  it('rejects impossible, ambiguous, or non-calendar input dates', () => {
    for (const date of ['2026-02-29', '2026-04-31', '2026-00-10', '0000-01-01',
      '2026-13-01', '26-01-01', '2026-2-07', '2026-02-07Z', '07/02/2026', '']) {
      assert.throws(() => buildCalendar([], {...utc, date}), {name: 'RangeError', message: 'date'});
    }
  });

  it('bounds the number of days and requires a supported zone', () => {
    for (const days of [0, -1, 32, 1.25, NaN, Infinity]) {
      assert.throws(() => buildCalendar([], {...utc, days}), {message: 'days'});
    }
    for (const zone of ['', 'local', 'utc', '+05:00', 'America/Unknown']) {
      assert.throws(() => buildCalendar([], {...utc, zone}), {message: 'zone'});
    }
  });
});

describe('period evidence', () => {
  it('assigns the instant at midnight only to the day that starts there', () => {
    const rows = [
      notice('before', {periods: [period(-30, 0)]}),
      notice('first', {periods: [period(0, 1)]}),
      notice('last', {periods: [period(dayLength - 1, dayLength)]}),
      notice('next', {periods: [period(dayLength, dayLength + 1)]}),
    ];
    const calendar = buildCalendar(rows, utc);
    assert.deepEqual(onDates(calendar), [['first', 'last']]);
    assert.deepEqual(ids(calendar.outside), ['before', 'next']);
    assert.deepEqual(calendar.unknown, []);
  });

  it('treats each supplied open endpoint as evidence on its reported side only', () => {
    const rows = [
      notice('start-before', {periods: [period(-1, null)]}),
      notice('start-after', {periods: [period(dayLength, null)]}),
      notice('end-before', {periods: [period(null, 0)]}),
      notice('end-during', {periods: [period(null, 100)]}),
    ];
    const calendar = buildCalendar(rows, utc);
    assert.deepEqual(ids(calendar.outside), ['end-before', 'start-after']);
    assert.deepEqual(day(calendar).entries, [
      {notice: rows[3], spans: [span(0, 100)]},
      {notice: rows[0], spans: [span(0, dayLength)]},
    ]);
  });

  it('preserves zero epoch seconds as a known end rather than an open bound', () => {
    const row = notice('a', {periods: [{start: null, end: 0}]});
    assert.deepEqual(buildCalendar([row], {...utc, date: '1970-01-01'}).outside, [row]);
    const previous = day(buildCalendar([row], {...utc, date: '1969-12-31'}));
    assert.deepEqual(previous.entries[0]?.spans, [{start: -dayLength, end: 0}]);
  });

  it('retains timetables with no dates in the undated list', () => {
    const empty = notice('empty');
    const noBounds = notice('no-bounds', {periods: [period(null, null)]});
    const calendar = buildCalendar([noBounds, empty], utc);
    assert.deepEqual(calendar.unknown, [empty, noBounds]);
    assert.deepEqual(calendar.outside, []);
    assert.deepEqual(onDates(calendar), [[]]);
    assert.equal(calendar.matched, 2);
  });

  it('does not infer a window from a retrieval date or a date embedded in a title', () => {
    const row = notice('title', {
      header: 'Travaux du 7 au 8 février 2026',
      retrievedOn: '2026-02-07',
      periods: [],
    });
    const calendar = buildCalendar([row], utc);
    assert.deepEqual(calendar.unknown, [row]);
    assert.deepEqual(onDates(calendar), [[]]);
  });

  it('keeps an uncertain period visible if the other periods miss the view', () => {
    const row = notice('mixed', {
      periods: [period(-10, -5), period(null, null), period(dayLength, null)],
    });
    const calendar = buildCalendar([row], utc);
    assert.deepEqual(calendar.unknown, [row]);
    assert.deepEqual(calendar.outside, []);
  });

  it('places a matching mixed notice without expanding its uncertain periods', () => {
    const row = notice('mixed', {periods: [period(null, null), period(3, 4)]});
    const calendar = buildCalendar([row], {...utc, days: 2});
    assert.deepEqual(day(calendar).entries, [{notice: row, spans: [span(3, 4)]}]);
    assert.deepEqual(day(calendar, 1).entries, []);
    assert.deepEqual(calendar.unknown, []);
    assert.equal(calendar.matched, 1);
  });

  it('unions duplicates, nested periods and chains of touching intervals', () => {
    const periods = [
      period(20, 50),
      period(45, 60),
      period(5, 10),
      period(10, 20),
      period(6, 9),
      period(45, 60),
      period(61, 62),
    ];
    const row = notice('intervals', {periods});
    const before = structuredClone(row);
    const calendar = buildCalendar([row], utc);
    assert.deepEqual(day(calendar).entries[0]?.spans, [span(5, 60), span(61, 62)]);
    assert.deepEqual(row, before);
  });

  it('splits a crossing interval and retains later events after an empty day', () => {
    const row = notice('crossing', {
      periods: [period(-500, dayLength + 60), period(3 * dayLength + 300, null)],
    });
    const calendar = buildCalendar([row], {...utc, days: 4});
    assert.deepEqual(calendar.days.map(date => date.entries.flatMap(entry => entry.spans)), [
      [span(0, dayLength)],
      [span(dayLength, dayLength + 60)],
      [],
      [span(3 * dayLength + 300, 4 * dayLength)],
    ]);
    assert.equal(calendar.matched, 1);
  });

  it('keeps simultaneous notices separate and preserves source metadata by reference', () => {
    const rows = [
      notice('b', {periods: [period(3, 7)], source: 'feed-2', tier: 4}),
      notice('A', {periods: [period(3, 7)], source: 'feed-1', tier: 4}),
    ];
    const calendar = buildCalendar(rows, utc);
    assert.deepEqual(onDates(calendar), [['A', 'b']]);
    assert.equal(day(calendar).entries[0]?.notice, rows[1]);
    assert.equal(day(calendar).entries[1]?.notice, rows[0]);
    assert.deepEqual(ids(rows), ['b', 'A']);
  });
});

describe('calendar filters', () => {
  const rows = [
    notice('upper', {
      header: 'Élévateur à l’étage',
      equipment: 'elevator',
      source: 'volume-72',
      stops: ['01', '02'],
      routes: ['blue'],
      periods: [period(10, 20)],
    }),
    notice('lower', {
      header: 'Accès sud',
      equipment: 'elevator_and_escalator',
      source: 'volume-73',
      stops: ['1'],
      routes: ['Blue'],
    }),
    notice('later', {
      header: 'Passage',
      stops: ['01'],
      routes: ['blue'],
      periods: [period(dayLength, null)],
    }),
  ];

  it('compares equipment, stop and route identifiers exactly', () => {
    assert.equal(buildCalendar(rows, {...utc, equipment: 'elevator'}).matched, 1);
    assert.equal(buildCalendar(rows, {...utc, stop: '01'}).matched, 2);
    assert.equal(buildCalendar(rows, {...utc, stop: '1'}).matched, 1);
    assert.equal(buildCalendar(rows, {...utc, route: 'BLUE'}).matched, 0);
    assert.deepEqual(ids(buildCalendar(rows, {...utc, equipment: 'UNKNOWN'}).outside), ['later']);
    assert.deepEqual(ids(buildCalendar(rows, {...utc, route: 'Blue'}).unknown), ['lower']);
  });

  it('combines facets and all query terms across searchable fields', () => {
    const calendar = buildCalendar(rows, {
      ...utc,
      equipment: 'elevator',
      stop: '02',
      route: 'blue',
      query: '  ETAGE\n72  e\u0301le\u0301vateur  ',
    });
    assert.deepEqual(onDates(calendar), [['upper']]);
    assert.equal(calendar.matched, 1);
    assert.deepEqual(calendar.outside, []);
    assert.deepEqual(calendar.unknown, []);
    assert.equal(buildCalendar(rows, {...utc, query: 'étage missing'}).matched, 0);
  });

  it('searches identifiers in undated and outside records before classification', () => {
    assert.deepEqual(ids(buildCalendar(rows, {...utc, query: 'LOWER'}).unknown), ['lower']);
    assert.deepEqual(ids(buildCalendar(rows, {...utc, query: 'later blue 01'}).outside), ['later']);
    assert.equal(buildCalendar(rows, {...utc, query: 'later 02'}).matched, 0);
  });

  it('clears all filters when their controls have empty values', () => {
    const all = buildCalendar(rows, utc);
    const reset = buildCalendar(rows, {...utc, equipment: '', route: '', stop: '', query: ' \t '});
    assert.deepEqual(reset, all);
    assert.equal(all.matched, 3);
    assert.deepEqual(onDates(all), [['upper']]);
    assert.deepEqual(ids(all.unknown), ['lower']);
    assert.deepEqual(ids(all.outside), ['later']);
  });

  it('returns equivalent output regardless of file order or prior selections', () => {
    const expected = buildCalendar(rows, utc);
    buildCalendar(rows, {...utc, stop: '01', days: 7});
    assert.deepEqual(buildCalendar([...rows].reverse(), utc), expected);
    const fresh = buildCalendar(rows, utc);
    day(fresh).entries.length = 0;
    assert.deepEqual(onDates(expected), [['upper']]);
  });
});

it('preserves exactly the reported seconds through clipping, union and local-day partitioning', () => {
  // Concentrate endpoints around midnight, where touching, overlapping and
  // disjoint periods can land on different local dates a second apart.
  const cuts = [-3, -1, 0, 1, 2, 3599, 3600, dayLength - 1, dayLength, dayLength + 1];
  const rows = [];
  for (const left of cuts) {
    for (const right of cuts) {
      if (right <= left) continue;
      const reflected = period(dayLength - right, dayLength - left);
      rows.push(notice(String(left) + '/' + String(right), {
        periods: [
          reflected,
          period(left, right),
          period(left + 1, right + 1),
        ],
      }));
    }
  }
  const calendar = buildCalendar(rows, {...utc, days: 2});
  for (const date of calendar.days) {
    const byId = new Map(date.entries.map(entry => [entry.notice.id, entry.spans]));
    assert.equal(byId.size, date.entries.length, 'one entry per notice and day');
    for (const row of rows) {
      const spans = byId.get(row.id) ?? [];
      let previousEnd = -Infinity;
      for (const piece of spans) {
        assert.ok(date.start <= piece.start && piece.start < piece.end && piece.end <= date.end);
        assert.ok(previousEnd < piece.start, 'adjacent fragments have been merged');
        previousEnd = piece.end;
      }
      // On the integer time axis membership may change only at an endpoint.
      // A probe immediately before and at each one checks both sides of
      // every transition, including transitions introduced by projection.
      const endpoints = [
        date.start,
        date.end,
        ...row.periods.flatMap(p => [p.start, p.end]),
        ...spans.flatMap(p => [p.start, p.end]),
      ];
      for (const boundary of endpoints) {
        if (boundary === null) continue;
        for (const probe of [boundary - 1, boundary]) {
          if (probe < date.start || probe >= date.end) continue;
          const expected = row.periods.some(p =>
            p.start !== null && p.end !== null && p.start <= probe && probe < p.end);
          const actual = spans.some(p => p.start <= probe && probe < p.end);
          assert.equal(actual, expected, row.id + ' at ' + probe);
        }
      }
    }
  }
});
