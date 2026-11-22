// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import { localizedLabel, uiText } from './notice-calendar-labels.mjs';
import { parseNotices } from './notice-calendar-input.mjs';
import { calendarReport } from './notice-calendar-report.mjs';
import { sampleNotices } from './notice-calendar-sample.mjs';
import { buildCalendar } from './notice-calendar-time.mjs';

const windowOptions = {
  date: '2026-03-07',
  days: 3,
  zone: 'America/Toronto',
};

test('the sample opens as an independent snapshot on each request', () => {
  const first = sampleNotices();
  const second = sampleNotices();
  assert.deepEqual(first, second);
  assert.ok(first[0] && first[1] && second[0] && second[1]);
  first[0].stops.length = 0;
  first[1].periods.length = 0;
  assert.equal(second[0].stops.length, 1);
  assert.equal(second[1].periods.length, 1);
  for (const notice of second) {
    assert.equal(notice.source, 'sample-source');
    assert.equal(notice.licence, 'sample-licence');
    assert.equal(notice.retrievedOn, '2026-03-06');
    assert.equal(notice.tier, 4);
  }
});

test('sample report marks fictional input and counts multi-day notices once', () => {
  const cal = buildCalendar(sampleNotices(), windowOptions);
  const report = calendarReport(cal, windowOptions, 'en', true);
  assert.match(report, /^Service notice calendar\nFictional example\n/);
  assert.match(report, /Notices after filtering: 4\nWith a period in the selected dates: 2/);
  assert.match(report, /Timing unknown: 1\nOutside the selected dates: 1/);
  assert.equal(report.match(/Source: sample-source/g)?.length, 4);
  assert.equal(report.match(/\[1\] Identifier: example-01/g)?.length, 1);
  assert.equal(report.match(/^\[1\] Practice lift notice/gm)?.length, 2);
  assert.equal(report.endsWith('\n'), true);
  assert.doesNotMatch(calendarReport(cal, windowOptions, 'en'), /Fictional example/);
});

test('day and report ordering are independent of source array order', () => {
  const notices = sampleNotices();
  const forward = calendarReport(buildCalendar(notices, windowOptions), windowOptions, 'en');
  const backward = calendarReport(buildCalendar(notices.reverse(), windowOptions), windowOptions, 'en');
  assert.equal(forward, backward);
  assert.ok(forward.indexOf('example-03') < forward.indexOf('example-04'));
});

test('a filtered report states exact criteria and excludes unrelated records from every section', () => {
  const opts = { ...windowOptions, equipment: 'elevator', stop: 'S-01', route: 'R-01', query: 'practice lift' };
  const report = calendarReport(buildCalendar(sampleNotices(), opts), opts, 'fr', true);
  assert.match(report, /Exemple fictif/);
  assert.match(report, /Équipement\u00a0: Ascenseur/);
  assert.match(report, /Arrêt\u00a0: S-01/);
  assert.match(report, /Ligne\u00a0: R-01/);
  assert.match(report, /Recherche\u00a0: practice lift/);
  assert.match(report, /Avis après filtrage\u00a0: 1/);
  assert.match(report, /Identifiant\u00a0: example-01/);
  assert.doesNotMatch(report, /example-0[234]/);
  assert.doesNotMatch(report, /No notices|Notices after filtering|Outside the selected dates/);
});

test('a notice without timing or provenance survives as an explicit unknown in French', () => {
  const notices = parseNotices('{"id":"n1"}');
  const opts = { date: '2026-02-01', days: 1, zone: 'UTC' };
  const report = calendarReport(buildCalendar(notices, opts), opts, 'fr');
  for (const label of ['Source', 'Licence', 'Date de collecte', 'Niveau de preuve', 'Avis original', 'Périodes publiées (UTC)']) {
    assert.ok(report.includes(label + '\u00a0: UNKNOWN'), label);
  }
  assert.match(report, /Horaire inconnu\u00a0: 1/);
  assert.match(report, /Hors des dates choisies\u00a0: 0/);
  assert.match(report, /Dates choisies\u00a0: 2026-02-01\n/);
});

test('an empty collection still describes the chosen dates and empty classification', () => {
  const opts = { date: '2028-02-28', days: 3, zone: 'UTC' };
  const report = calendarReport(buildCalendar([], opts), opts, 'en');
  assert.match(report, /Selected dates: 2028-02-28 – 2028-03-01/);
  assert.match(report, /2028-02-29\nNo published period overlaps this day\./);
  assert.match(report, /Notice details\nNo notices in this group\./);
  assert.doesNotMatch(report, /undefined|NaN|\[0\]/);
});

test('repeated autumn hours retain distinct numeric offsets and exact UTC source periods', () => {
  const opts = { date: '2026-11-01', days: 1, zone: 'America/Toronto' };
  const start = Date.parse('2026-11-01T05:30:00Z') / 1000;
  const end = start + 3600;
  const notices = parseNotices(JSON.stringify({ id: 'fold', active_periods: [{ start, end }] }));
  const report = calendarReport(buildCalendar(notices, opts), opts, 'en');
  const line = report.split('\n').find(value => value.startsWith('  ') && value.includes(' → '));
  assert.ok(line);
  assert.match(line, /01:30:00.*[−-]04:00.*→.*01:30:00.*[−-]05:00/);
  assert.match(report, /Published periods \(UTC\): 2026-11-01T05:30:00Z → 2026-11-01T06:30:00Z/);
});

test('adjacent source windows merge on the day without disappearing from source detail', () => {
  const opts = { date: '1970-01-01', days: 1, zone: 'UTC' };
  const records = parseNotices(JSON.stringify({
    id: 'joined',
    active_periods: [{ end: 600 }, { start: 600, end: 900 }, { start: 900 }],
  }));
  const report = calendarReport(buildCalendar(records, opts), opts, 'en');
  const day = report.slice(report.indexOf('\n1970-01-01\n'), report.indexOf('\nTiming unknown\n'));
  assert.equal((day.match(/→/g) ?? []).length, 1);
  assert.match(report, /Published periods \(UTC\): UNKNOWN → 1970-01-01T00:10:00Z \/ 1970-01-01T00:10:00Z → 1970-01-01T00:15:00Z \/ 1970-01-01T00:15:00Z → UNKNOWN/);
});

test('multiline source headers cannot create a new top-level report field', () => {
  const header = 'First line\r\nLicence: copied words\u2028Last line';
  const records = parseNotices(JSON.stringify({ id: 'lines', header_text: header }));
  const text = calendarReport(buildCalendar(records, windowOptions), windowOptions, 'en');
  assert.match(text, /Original notice: First line\n {4}Licence: copied words\n {4}Last line/);
  assert.doesNotMatch(text, /^Licence: copied words/m);
});

test('a long source header is complete in the catalogue and shortened in the day list', () => {
  const header = 'é'.repeat(95) + '🚲'.repeat(60) + 'Fin';
  const notices = parseNotices(JSON.stringify({ id: 'long', header_text: header, active_periods: [{ start: 0 }] }));
  const report = calendarReport(buildCalendar(notices, windowOptions), windowOptions, 'en');
  assert.equal(report.split(header).length, 2);
  assert.equal(report.match(/🚲…/gu)?.length, 3);
  assert.doesNotMatch(report, /\p{Surrogate}/u);
});

test('French punctuation uses the required nonbreaking space for each mark', () => {
  const input = '« Où ? » Note : oui ; ici !';
  const label = localizedLabel('literal English text!', input);
  assert.equal(label.fr, '«\u202fOù\u202f?\u202f» Note\u00a0: oui\u202f; ici\u202f!');
  assert.equal(label.en, 'literal English text!');
  assert.equal(localizedLabel('', label.fr).fr, label.fr);
});

test('file names and identifiers are inserted literally into translated messages', () => {
  const name = 'x {1} $& !.json';
  assert.equal(uiText('localOrigin', 'fr', name), 'Fichier local\u00a0: ' + name);
  assert.throws(() => uiText('missing-key', 'en'), RangeError);
});
