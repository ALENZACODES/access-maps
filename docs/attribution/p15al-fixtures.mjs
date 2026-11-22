import { baselineHash, fingerprint, INPUT_SCHEMA } from './p15al-input.mjs';

export function sampleSource(patch = {}) {
  return {
    source: 'sample-survey',
    licence: 'CC0-1.0',
    retrievedOn: '2024-02-22',
    verificationTier: 0,
    contentDigest: fingerprint(['fictional', 'edition-a']),
    validForDays: 14,
    ...patch,
  };
}

export function linkedRecord(recordId, sourceIds = [], dependsOn = [], access = 'UNKNOWN') {
  return { recordId, sourceIds, dependsOn, access };
}

export function sampleInput(patch = {}) {
  return {
    schema: INPUT_SCHEMA,
    asOf: '2024-03-01',
    leadDays: 2,
    sources: [sampleSource()],
    records: [linkedRecord('demo-lift', ['sample-survey'])],
    captures: [],
    ...patch,
  };
}

export function receipt(source, patch = {}) {
  return {
    captureId: 'receipt-one',
    sourceId: source.source,
    baselineHash: baselineHash(source),
    evidenceDigest: fingerprint(['offline witness file']),
    kind: 'retrieved',
    checkedOn: '2024-02-28',
    retrievedOn: '2024-02-28',
    licence: source.licence,
    verificationTier: source.verificationTier,
    contentDigest: source.contentDigest ?? fingerprint(['fictional source bytes']),
    ...patch,
  };
}

export function notice(source, kind, patch = {}) {
  return {
    captureId: 'notice-one',
    sourceId: source.source,
    baselineHash: baselineHash(source),
    evidenceDigest: fingerprint(['dated notice', kind]),
    kind,
    checkedOn: '2024-02-28',
    ...patch,
  };
}

export function sampleRegistry(patch = {}) {
  return {
    id: 'sample-survey', name: 'Fictional survey', kind: 'municipal',
    url: 'https://example.invalid/catalogue', download_url: 'https://example.invalid/data',
    licence_id: 'CC0-1.0', licence_name: 'Sample licence',
    licence_url: 'https://example.invalid/licence', attribution: 'Fictional dataset',
    retrieved_at: '2024-02-22', tier: 0, ...patch,
  };
}
