// @ts-check
import { NoticeInputError, readNoticeFile } from './notice-calendar-input.mjs';
import { buildCalendar } from './notice-calendar-time.mjs';
import { uiText } from './notice-calendar-labels.mjs';
import { calendarReport } from './notice-calendar-report.mjs';
import { sampleNotices } from './notice-calendar-sample.mjs';

/** @typedef {import('./notice-calendar-input.mjs').Notice} Notice */
/** @typedef {import('./notice-calendar-time.mjs').CalendarOptions} CalendarOptions */
/** @typedef {import('./notice-calendar-time.mjs').CalendarEntry} CalendarEntry */
/** @typedef {import('./notice-calendar-time.mjs').CalendarResult} CalendarResult */
/** @typedef {import('./notice-calendar-labels.mjs').Locale} Locale */

/**
 * Match the element type at the boundary between the static page and its script.
 * @template {keyof HTMLElementTagNameMap} Tag
 * @param {string} id
 * @param {Tag} tag
 * @returns {HTMLElementTagNameMap[Tag]}
 */
function byId(id, tag) {
  const node = document.getElementById(id);
  if (!node || node.localName !== tag) throw new Error(id);
  return /** @type {HTMLElementTagNameMap[Tag]} */ (node);
}

/** @template {keyof HTMLElementTagNameMap} Tag @param {Tag} tag @param {string} [text] */
function el(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

const file = byId('file', 'input');
const form = byId('options', 'form');
const date = byId('date', 'input');
const days = byId('days', 'input');
const zone = byId('zone', 'select');
const equipment = byId('equipment', 'select');
const stop = byId('stop', 'input');
const route = byId('route', 'input');
const query = byId('query', 'input');
const chosenDay = byId('shown-day', 'select');
const language = byId('language', 'button');
const download = byId('download', 'button');
const pageSize = 12;
const defaultZone = 'America/Toronto';
const requested = new URLSearchParams(location.search).get('lang');

/** @type {Locale} */
let locale = requested === 'fr' || requested === 'en' ? requested
  : navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
/** @type {Notice[]} */
let notices = [];
/** @type {CalendarOptions | null} */
let options = null;
/** @type {CalendarResult | null} */
let calendar = null;
/** @type {{sample:boolean,name:string} | null} */
let origin = null;
let selectedDay = 0;
let loadNumber = 0;
let reading = false;
let statusKey = '';
/** @type {{key:string,row:number|null}|null} */
let errorMessage = null;
const pageNumbers = { entries: 0, 'unknown-entries': 0, 'outside-entries': 0 };

/** @param {string} key @param {...(number|string)} values */
function label(key, ...values) {
  return uiText(key, locale, ...values);
}

function refreshMessages() {
  byId('status', 'p').textContent = statusKey ? label(statusKey) : '';
  const extra = errorMessage?.row != null ? ' ' + label('inputRow', errorMessage.row) : '';
  byId('error', 'p').textContent = errorMessage ? label(errorMessage.key) + extra : '';
}

/** @param {string} key */
function announce(key) {
  statusKey = key;
  refreshMessages();
}

/** @param {string} key @param {number|null} [row] */
function showError(key, row = null) {
  statusKey = '';
  errorMessage = { key, row };
  refreshMessages();
}

function updateOrigin() {
  byId('origin', 'p').textContent = origin
    ? origin.sample ? label('exampleOrigin') : label('localOrigin', origin.name)
    : '';
  byId('start-help', 'p').hidden = !origin || origin.sample;
  byId('clear', 'button').disabled = !origin && !reading;
  byId('loaded', 'div').hidden = !origin;
}

function readOptions() {
  return {
    date: date.value,
    days: days.valueAsNumber,
    zone: zone.value,
    equipment: equipment.value,
    stop: stop.value.trim(),
    route: route.value.trim(),
    query: query.value.trim(),
  };
}

function pendingChanges() {
  if (!options) return;
  const draft = readOptions();
  const pending = Object.entries(draft).some(([key, value]) =>
    options?.[/** @type {keyof CalendarOptions} */ (key)] !== value,
  );
  byId('pending', 'p').hidden = !pending;
  download.disabled = pending;
}

/** @param {HTMLInputElement | HTMLSelectElement} field */
function clearInvalid(field) {
  field.removeAttribute('aria-invalid');
  field.removeAttribute('aria-errormessage');
}

function resetFilterFields() {
  equipment.value = '';
  stop.value = '';
  route.value = '';
  query.value = '';
}

/**
 * A file can retain long-running notices that began years before collection.
 * Centre the initial choice on its latest retrieval date. Without a dated
 * retrieval, use the first known boundary (the included side of an end).
 * @param {Notice[]} records
 */
function initialDate(records) {
  let boundary = Infinity;
  let retrieved = '';
  for (const record of records) {
    if (record.retrievedOn !== 'UNKNOWN' && record.retrievedOn > retrieved) {
      retrieved = record.retrievedOn;
    }
    for (const period of record.periods) {
      if (period.start !== null) boundary = Math.min(boundary, period.start);
      else if (period.end !== null) boundary = Math.min(boundary, period.end - 1);
    }
  }
  if (retrieved) return retrieved;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: defaultZone,
  });
  const parts = formatter.formatToParts(Number.isFinite(boundary) ? boundary * 1000 : Date.now());
  const part = (/** @type {Intl.DateTimeFormatPartTypes} */ type) =>
    parts.find(item => item.type === type)?.value ?? '';
  return [part('year').padStart(4, '0'), part('month'), part('day')].join('-');
}

/** @param {number} count */
function countLabel(count) {
  return count === 1 ? label('oneNotice') : label('notices', count);
}

/** @param {string} value */
function equipmentName(value) {
  if (value === 'elevator_and_escalator') return label('bothEquipment');
  if (value === 'elevator' || value === 'escalator') return label(value);
  return 'UNKNOWN';
}

function dateFormatters() {
  const tag = locale === 'fr' ? 'fr-CA' : 'en-CA';
  const timeZone = options?.zone ?? defaultZone;
  return {
    day: new Intl.DateTimeFormat(tag, { timeZone, dateStyle: 'full' }),
    instant: new Intl.DateTimeFormat(tag, {
      timeZone, year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset',
    }),
  };
}

/**
 * @param {Notice} notice
 * @param {Intl.DateTimeFormat} instant
 * @param {boolean} open
 */
function noticeDetails(notice, instant, open) {
  const details = el('details');
  details.dataset.notice = notice.id;
  details.open = open;
  const title = el('summary');
  const original = el('bdi', notice.header);
  if (notice.header !== 'UNKNOWN') {
    original.lang = notice.language === 'UNKNOWN' ? '' : notice.language;
  }
  title.append(original);
  if (notice.header === 'UNKNOWN') title.append(' · ', el('bdi', notice.id));
  const metadata = el('dl');
  const fields = [
    [label('noticeId'), notice.id],
    [label('source'), notice.source],
    [label('licence'), notice.licence],
    [label('retrieved'), notice.retrievedOn],
    [label('tier'), String(notice.tier)],
    [label('equipment'), equipmentName(notice.equipment)],
    [label('stopIds'), notice.stops.join(', ') || 'UNKNOWN'],
    [label('routeIds'), notice.routes.join(', ') || 'UNKNOWN'],
  ];
  for (const pair of fields) {
    const row = el('div');
    const value = el('dd');
    value.append(el('bdi', pair[1]));
    row.append(el('dt', pair[0]), value);
    metadata.append(row);
  }
  const periodLabel = el('strong', label('sourcePeriods'));
  const help = el('p', label('sourcePeriodsHelp'));
  help.className = 'help';
  details.append(title, metadata, periodLabel, help);
  if (notice.periods.length === 0) {
    details.append(el('p', 'UNKNOWN'));
  } else {
    const list = el('ul');
    for (const period of notice.periods) {
      const bound = (/** @type {number|null} */ seconds) =>
        seconds === null ? 'UNKNOWN' : instant.format(seconds * 1000);
      list.append(el('li', label('timeSpan', bound(period.start), bound(period.end))));
    }
    details.append(list);
  }
  return details;
}

/** @param {string} text @param {() => void} action @param {boolean} disabled */
function actionButton(text, action, disabled) {
  const button = el('button', text);
  button.type = 'button';
  button.disabled = disabled;
  button.addEventListener('click', action);
  return button;
}

/**
 * Only mount the current page, even if a file has thousands of notices.
 * Preserve the open disclosures in this group across language changes.
 * @param {keyof typeof pageNumbers} id
 * @param {(CalendarEntry|Notice)[]} rows
 * @param {Intl.DateTimeFormat} instant
 * @param {boolean} [focusPage]
 */
function renderList(id, rows, instant, focusPage = false) {
  const container = byId(id, 'div');
  const open = new Set(Array.from(container.querySelectorAll('details[open]'),
    row => /** @type {HTMLDetailsElement} */ (row).dataset.notice));
  container.replaceChildren();
  if (!rows.length) {
    container.append(el('p', label(id === 'entries' ? 'emptyDay' : 'emptyGroup')));
    return;
  }

  const first = pageNumbers[id] * pageSize;
  const end = Math.min(first + pageSize, rows.length);
  const list = el('ul');
  list.className = 'notice-list';
  for (const row of rows.slice(first, end)) {
    const entry = 'notice' in row ? row.notice : row;
    const li = el('li');
    li.append(noticeDetails(entry, instant, open.has(entry.id)));
    if ('spans' in row) {
      const times = el('ul');
      times.className = 'times';
      for (const span of row.spans) {
        times.append(el('li', label('timeSpan', instant.format(span.start * 1000), instant.format(span.end * 1000))));
      }
      li.append(times);
    }
    list.append(li);
  }
  if (rows.length <= pageSize) {
    container.append(list);
    return;
  }

  const position = el('p', label('pageInfo', first + 1, end, rows.length));
  position.tabIndex = -1;
  const controls = el('div');
  controls.className = 'actions';
  const move = (/** @type {number} */ step) => {
    pageNumbers[id] += step;
    renderList(id, rows, instant, true);
  };
  controls.append(
    actionButton(label('previousPage'), () => move(-1), first === 0),
    actionButton(label('nextPage'), () => move(1), end === rows.length),
  );
  container.append(position, list, controls);
  if (focusPage) position.focus();
}

function displayDay() {
  const day = calendar?.days[selectedDay];
  if (!day || !calendar) return;
  const formatter = dateFormatters();
  byId('day-heading', 'h3').textContent = label('dayHeading', formatter.day.format(day.start * 1000));
  byId('previous-day', 'button').disabled = selectedDay <= 0;
  byId('next-day', 'button').disabled = selectedDay >= calendar.days.length - 1;
  chosenDay.value = String(selectedDay);
  renderList('entries', day.entries, formatter.instant);
}

function renderCalendar() {
  if (!calendar) return;
  const { days: calendarDays, matched, unknown, outside } = calendar;
  const formatter = dateFormatters();
  byId('summary', 'p').textContent = label('summary', notices.length, matched, matched - unknown.length - outside.length);
  chosenDay.replaceChildren(...calendarDays.map((day, index) => {
    const option = el('option', label('dayOption', formatter.day.format(day.start * 1000), countLabel(day.entries.length)));
    option.value = String(index);
    return option;
  }));
  displayDay();
  byId('unknown-title', 'summary').textContent = label('unknownTitle', unknown.length);
  byId('outside-title', 'summary').textContent = label('outsideTitle', outside.length);
  renderList('unknown-entries', unknown, formatter.instant);
  renderList('outside-entries', outside, formatter.instant);
  pendingChanges();
}

/** @param {boolean} focus */
function apply(focus) {
  errorMessage = null;
  for (const field of [date, days, zone]) clearInvalid(field);
  const next = readOptions();
  try {
    calendar = buildCalendar(notices, next);
  } catch (error) {
    const kind = error instanceof RangeError ? error.message : '';
    if (kind !== 'date' && kind !== 'days' && kind !== 'zone') throw error;
    const field = { date, days, zone }[kind];
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-errormessage', 'error');
    showError({ date: 'invalidDate', days: 'invalidDays', zone: 'invalidZone' }[kind]);
    field.focus();
    pendingChanges();
    return;
  }
  options = next;
  for (const id of /** @type {const} */ (['entries', 'unknown-entries', 'outside-entries'])) pageNumbers[id] = 0;
  selectedDay = 0;
  renderCalendar();
  announce('');
  if (focus) byId('results-heading', 'h2').focus();
}

/** @param {Notice[]} records @param {string | null} name */
function openRecords(records, name) {
  reading = false;
  notices = records;
  origin = { sample: name === null, name: name ?? '' };
  const first = name === null ? '2026-03-07' : initialDate(records);
  date.value = first;
  // A short window stays inside the supported calendar even at the final year.
  const remaining = (Date.parse('9999-12-31T00:00:00Z') - Date.parse(first + 'T00:00:00Z')) / 86400000 + 1;
  days.value = String(Math.min(3, remaining));
  zone.value = defaultZone;
  resetFilterFields();
  for (const id of ['unknown', 'outside', 'filters']) byId(id, 'details').open = false;
  for (const id of ['entries', 'unknown-entries', 'outside-entries']) byId(id, 'div').replaceChildren();
  updateOrigin();
  apply(false);
  announce(name === null ? 'exampleReady' : 'fileReady');
}

/** @param {number} index @param {boolean} focus */
function selectDay(index, focus) {
  if (!calendar || index < 0 || index >= calendar.days.length) return;
  selectedDay = index;
  pageNumbers.entries = 0;
  displayDay();
  if (focus) byId('day-heading', 'h3').focus();
}

function refreshLocale() {
  document.documentElement.lang = locale;
  document.title = label('title');
  for (const element of document.querySelectorAll('[data-label]')) {
    const key = element.getAttribute('data-label');
    if (key) element.textContent = label(key);
  }
  const other = locale === 'fr' ? 'en' : 'fr';
  language.lang = other;
  language.textContent = uiText('language', other);
  updateOrigin();
  refreshMessages();
  renderCalendar();
}

language.addEventListener('click', () => {
  locale = locale === 'fr' ? 'en' : 'fr';
  const url = new URL(location.href);
  url.searchParams.set('lang', locale);
  if (url.protocol === 'https:' || url.protocol === 'http:') history.replaceState(null, '', url);
  refreshLocale();
});

file.addEventListener('change', async () => {
  const choice = file.files?.[0];
  if (!choice) return;
  const ticket = ++loadNumber;
  reading = true;
  errorMessage = null;
  updateOrigin();
  announce('working');
  try {
    const records = await readNoticeFile(choice);
    if (ticket === loadNumber) openRecords(records, choice.name);
  } catch (error) {
    if (ticket !== loadNumber) return;
    file.value = '';
    reading = false;
    updateOrigin();
    if (error instanceof NoticeInputError) showError('error_' + error.code, error.row);
    else showError('error_read');
  }
});

byId('sample', 'button').addEventListener('click', () => {
  loadNumber++;
  file.value = '';
  openRecords(sampleNotices(), null);
});

byId('clear', 'button').addEventListener('click', () => {
  loadNumber++;
  reading = false;
  file.value = '';
  notices = [];
  origin = null;
  options = null;
  calendar = null;
  errorMessage = null;
  form.reset();
  for (const field of [date, days, zone]) clearInvalid(field);
  chosenDay.replaceChildren();
  byId('summary', 'p').textContent = '';
  byId('day-heading', 'h3').textContent = '';
  for (const id of ['entries', 'unknown-entries', 'outside-entries']) byId(id, 'div').replaceChildren();
  updateOrigin();
  announce('cleared');
  file.focus();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  apply(true);
});

form.addEventListener('input', () => {
  for (const field of [date, days, zone]) clearInvalid(field);
  if (errorMessage?.key.startsWith('invalid')) {
    errorMessage = null;
    refreshMessages();
  }
  pendingChanges();
});

byId('reset-filters', 'button').addEventListener('click', () => {
  resetFilterFields();
  apply(true);
});

chosenDay.addEventListener('change', () => selectDay(Number(chosenDay.value), false));
byId('previous-day', 'button').addEventListener('click', () => selectDay(selectedDay - 1, true));
byId('next-day', 'button').addEventListener('click', () => selectDay(selectedDay + 1, true));

download.addEventListener('click', () => {
  if (!calendar || !options) return;
  const body = calendarReport(calendar, options, locale, origin?.sample === true);
  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
  const link = el('a');
  link.href = url;
  link.download = 'notice-calendar-' + options.date + '-' + locale + '.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  errorMessage = null;
  announce('downloaded');
});

refreshLocale();
byId('fallback', 'div').hidden = true;
byId('workspace', 'div').hidden = false;
language.hidden = false;
