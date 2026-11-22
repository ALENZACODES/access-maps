// @ts-check

// The sample uses the same published-record shape and parser as local files.
import { parseNotices } from './notice-calendar-input.mjs';

const epoch = (/** @type {string} */ value) => Date.parse(value) / 1000;

const provenance = {
  source_id: 'sample-source',
  licence: 'sample-licence',
  retrieved_at: '2026-03-06',
  tier: 4,
  feed_timestamp: epoch('2026-03-06T12:00:00Z'),
  effect: 'UNKNOWN',
  cause: 'UNKNOWN',
};

export function sampleNotices() {
  const records = [
    {
      ...provenance,
      id: 'example-01',
      header_text: 'Practice lift notice with two periods',
      header_language: 'en',
      equipment: 'elevator',
      stop_ids: ['S-01'],
      route_ids: ['R-01'],
      active_periods: [
        { start: epoch('2026-03-07T15:00:00Z'), end: epoch('2026-03-07T17:00:00Z') },
        { start: epoch('2026-03-08T06:30:00Z'), end: epoch('2026-03-08T08:00:00Z') },
      ],
    },
    {
      ...provenance,
      id: 'example-02',
      header_text: 'Exercice sur un escalier mécanique',
      header_language: 'fr',
      equipment: 'escalator',
      stop_ids: ['S-02'],
      route_ids: ['R-02'],
      active_periods: [
        { start: epoch('2026-03-08T03:00:00Z'), end: epoch('2026-03-08T07:30:00Z') },
      ],
    },
    {
      ...provenance,
      id: 'example-03',
      header_text: 'Practice notice without published times',
      header_language: 'en',
      equipment: 'UNKNOWN',
      stop_ids: ['S-01'],
      route_ids: [],
      active_periods: [],
    },
    {
      ...provenance,
      id: 'example-04',
      header_text: 'Exercice portant sur une période antérieure',
      header_language: 'fr',
      equipment: 'elevator',
      stop_ids: ['S-01'],
      route_ids: ['R-01'],
      active_periods: [
        { start: epoch('2026-03-04T14:00:00Z'), end: epoch('2026-03-04T16:00:00Z') },
      ],
    },
  ];
  const input = records.map(record => ({ ...record, entity_id: record.id }));
  return parseNotices(JSON.stringify(input));
}
