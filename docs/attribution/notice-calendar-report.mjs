// @ts-check

import { localizedLabel } from './notice-calendar-labels.mjs';

/** @typedef {import('./notice-calendar-input.mjs').Notice} Notice */
/** @typedef {ReturnType<typeof import('./notice-calendar-time.mjs').buildCalendar>} Calendar */
/** @typedef {Parameters<typeof import('./notice-calendar-time.mjs').buildCalendar>[1]} Options */

const words = {
  title: localizedLabel('Service notice calendar', 'Calendrier des avis de service'),
  example: localizedLabel('Fictional example', 'Exemple fictif'),
  period: localizedLabel('Selected dates', 'Dates choisies'),
  zone: localizedLabel('Time zone', 'Fuseau horaire'),
  rule: localizedLabel(
    'Periods include the start and exclude the end. Times include the local offset.',
    'Chaque période comprend son début et exclut sa fin. Les heures indiquent le décalage local.',
  ),
  scope: localizedLabel(
    'This calendar describes the periods in the snapshot. Equipment condition is unknown.',
    'Ce calendrier décrit les périodes du fichier. L’état des équipements demeure inconnu.',
  ),
  equipment: localizedLabel('Equipment', 'Équipement'),
  stop: localizedLabel('Stop', 'Arrêt'),
  route: localizedLabel('Route', 'Ligne'),
  query: localizedLabel('Search', 'Recherche'),
  matching: localizedLabel('Notices after filtering', 'Avis après filtrage'),
  inRange: localizedLabel('With a period in the selected dates', 'Avec une période dans les dates choisies'),
  unscheduled: localizedLabel('Timing unknown', 'Horaire inconnu'),
  outside: localizedLabel('Outside the selected dates', 'Hors des dates choisies'),
  emptyDay: localizedLabel('No published period overlaps this day.', 'Aucune période publiée ne recoupe cette journée.'),
  catalog: localizedLabel('Notice details', 'Détails des avis'),
  empty: localizedLabel('No notices in this group.', 'Aucun avis dans ce groupe.'),
  id: localizedLabel('Identifier', 'Identifiant'),
  header: localizedLabel('Original notice', 'Avis original'),
  language: localizedLabel('Original language', 'Langue d’origine'),
  source: localizedLabel('Source', 'Source'),
  licence: localizedLabel('Licence', 'Licence'),
  retrieved: localizedLabel('Date retrieved', 'Date de collecte'),
  tier: localizedLabel('Evidence tier', 'Niveau de preuve'),
  stops: localizedLabel('Stop identifiers', 'Identifiants des arrêts'),
  routes: localizedLabel('Route identifiers', 'Identifiants des lignes'),
  inputPeriods: localizedLabel('Published periods (UTC)', 'Périodes publiées (UTC)'),
  elevator: localizedLabel('Elevator', 'Ascenseur'),
  escalator: localizedLabel('Escalator', 'Escalier mécanique'),
  elevator_and_escalator: localizedLabel('Elevator and escalator', 'Ascenseur et escalier mécanique'),
};

/** @param {string} value @param {'en'|'fr'} locale */
function equipmentLabel(value, locale) {
  if (value === 'elevator' || value === 'escalator' || value === 'elevator_and_escalator') {
    return words[value][locale];
  }
  return value;
}

/**
 * Put continued lines inside the same field. Keep human-readable source text
 * while preventing carriage returns or directional overrides from swallowing
 * adjacent field labels when pasted into a plain-text editor.
 * @param {string|number} value
 */
function fieldValue(value) {
  return String(value)
    .replace(/[\r\n\u0085\u2028\u2029]+/gu, '\n    ')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, '');
}

/** @param {number|null} epoch */
function utcBoundary(epoch) {
  return epoch === null ? 'UNKNOWN' : new Date(epoch * 1000).toISOString().replace('.000Z', 'Z');
}

/**
 * Number notices once in source-ID order. A single multi-day notice can appear
 * on several dates without repeating or losing its original source metadata.
 * @param {Calendar} calendar
 */
function noticeIndex(calendar) {
  /** @type {Map<string, Notice>} */
  const byId = new Map();
  for (const day of calendar.days) {
    for (const entry of day.entries) byId.set(entry.notice.id, entry.notice);
  }
  for (const group of [calendar.unknown, calendar.outside]) {
    for (const notice of group) byId.set(notice.id, notice);
  }
  const notices = [...byId.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id === right.id ? 0 : 1,
  );
  const references = new Map(notices.map((notice, index) => [notice.id, `[${index + 1}]`]));
  return { notices, references };
}

/**
 * Create a human-readable report of exactly the selected view. Each time in
 * the daily section carries its date and offset so repeated autumn hours and
 * midnight boundaries can be distinguished. Source periods retain UTC.
 * @param {Calendar} calendar
 * @param {Options} options
 * @param {'en'|'fr'} locale
 * @param {boolean} [example]
 */
export function calendarReport(calendar, options, locale, example = false) {
  const label = (/** @type {keyof typeof words} */ key) => words[key][locale];
  const separator = locale === 'fr' ? '\u00a0: ' : ': ';
  const field = (/** @type {keyof typeof words} */ key, /** @type {string|number} */ value) =>
    label(key) + separator + fieldValue(value);
  const { notices, references } = noticeIndex(calendar);
  // The catalogue keeps the complete notice; the daily view uses one excerpt
  // per record to bound the cost of repeating a long header across many days.
  const excerpts = new Map(notices.map(({ id, header }) => {
    const preview = header.length > 100
      ? Array.from(header).slice(0, 96).join('') + '…'
      : header;
    return [id, fieldValue(preview)];
  }));
  const last = calendar.days.at(-1);
  const format = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    timeZone: options.zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  });

  // Shared midnights occur repeatedly in long windows spanning many notices.
  /** @type {Map<number,string>} */
  const displayTimes = new Map();
  const localTime = (/** @type {number} */ epoch) => {
    const existing = displayTimes.get(epoch);
    if (existing !== undefined) return existing;
    const local = format.format(epoch * 1000);
    displayTimes.set(epoch, local);
    return local;
  };

  const lines = [
    label('title'),
    ...(example ? [label('example')] : []),
    field('period', last && last.date !== options.date ? `${options.date} – ${last.date}` : options.date),
    field('zone', options.zone),
    label('rule'),
    label('scope'),
  ];
  if (options.equipment) lines.push(field('equipment', equipmentLabel(options.equipment, locale)));
  if (options.stop) lines.push(field('stop', options.stop));
  if (options.route) lines.push(field('route', options.route));
  if (options.query) lines.push(field('query', options.query));
  lines.push(
    '',
    field('matching', calendar.matched),
    field('inRange', calendar.matched - calendar.unknown.length - calendar.outside.length),
    field('unscheduled', calendar.unknown.length),
    field('outside', calendar.outside.length),
  );

  for (const day of calendar.days) {
    lines.push('', day.date);
    if (!day.entries.length) lines.push(label('emptyDay'));
    for (const { notice, spans } of day.entries) {
      lines.push(`${references.get(notice.id)} ${excerpts.get(notice.id)}`);
      for (const span of spans) {
        lines.push(`  ${localTime(span.start)} → ${localTime(span.end)}`);
      }
    }
  }

  /** @param {'unscheduled'|'outside'} key @param {Notice[]} group */
  function appendGroup(key, group) {
    lines.push('', label(key));
    if (!group.length) lines.push(label('empty'));
    for (const notice of group) lines.push(`${references.get(notice.id)} ${fieldValue(notice.header)}`);
  }
  appendGroup('unscheduled', calendar.unknown);
  appendGroup('outside', calendar.outside);

  lines.push('', label('catalog'));
  if (!notices.length) lines.push(label('empty'));
  for (const notice of notices) {
    lines.push(
      '',
      `${references.get(notice.id)} ${field('id', notice.id)}`,
      field('header', notice.header),
      field('language', notice.language),
      field('source', notice.source),
      field('licence', notice.licence),
      field('retrieved', notice.retrievedOn),
      field('tier', notice.tier),
      field('equipment', equipmentLabel(notice.equipment, locale)),
      field('stops', notice.stops.join(', ') || 'UNKNOWN'),
      field('routes', notice.routes.join(', ') || 'UNKNOWN'),
      field('inputPeriods', notice.periods.length ? notice.periods.map(({ start, end }) =>
        `${utcBoundary(start)} → ${utcBoundary(end)}`
      ).join(' / ') : 'UNKNOWN'),
    );
  }
  return lines.join('\n') + '\n';
}
