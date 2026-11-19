/** Synthetic contract fixtures only, not publication evidence. */
import { CHECKPOINT_SCHEMA } from './checkpoint-core.mjs';
export function sourceFixture(overrides = {}) {
  return {
    id: 'sample-source', name: 'Sample source', sourceUrl: 'https://example.org/data',
    licenceUrl: 'https://example.org/terms', licenceName: 'Example open terms',
    evidenceUrl: 'https://example.org/evidence', permission: 'YES', evidenceTier: 'primary',
    termsDate: '2026-10-10', datasetDate: 'UNKNOWN', acquisitionDate: '2026-10-11',
    decision: 'accepted', decisionDate: '2026-10-12', decisionReason: 'Published evidence reviewed for this release',
    notice: 'Sample source attribution', publication: 'included', ...overrides,
  };
}
export function surfaceFixture(overrides = {}) {
  return {
    id: 'sample-view', title: 'Information list', mode: 'list', locale: 'en', sourceIds: ['sample-source'],
    offline: 'YES', keyboard: 'YES', screenReader: 'YES', targetPx: 44,
    mapCredit: 'UNKNOWN', publicationDate: 'UNKNOWN', ...overrides,
  };
}
export function checkpointFixture(overrides = {}) {
  return {
    schema: CHECKPOINT_SCHEMA, releaseId: 'sample-release', comparisonDate: '2026-11-19',
    sources: [sourceFixture()], surfaces: [surfaceFixture()], ...overrides,
  };
}
export function mutatedSource(overrides) {
  return checkpointFixture({ sources: [sourceFixture(overrides)] });
}
export function mutatedSurface(overrides) {
  return checkpointFixture({ surfaces: [surfaceFixture(overrides)] });
}
