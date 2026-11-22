import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audit } from './audit.mjs';
import { compare } from './compare.mjs';
import { validSource } from './contract.mjs';
import { base } from './fixtures.mjs';
import { reportCsv, reportJson, textReport } from './report.mjs';

const privateLabel = 'fixture-private-reference';

function assertPrivate(report) {
  const surfaces = [reportJson(report), reportCsv(report), reportCsv(report, 'fr'),
    textReport(report), textReport(report, 'fr')];
  for (const text of surfaces) assert.ok(!text.includes(privateLabel));
}

test('orphan group and uncited source can be located without copying their IDs', () => {
  const bundle = base();
  bundle.decisions = [];
  bundle.observations[0].placeId = privateLabel;
  bundle.sources.push({ ...bundle.sources[0], id: privateLabel });
  const report = audit(bundle);
  assert.equal(report.findings.find(issue => issue.code === 'ORPHAN').path, '$.observations[0]');
  assert.equal(report.findings.find(issue => issue.code === 'UNREFERENCED').path, '$.sources[1]');
  assertPrivate(report);
});

test('comparison finding paths identify the specific input and row', () => {
  const before = base();
  before.decisions[0].placeId = privateLabel;
  before.observations[0].placeId = privateLabel;
  before.observations[0].id = privateLabel;
  before.decisions[0].observationIds = [privateLabel];
  const after = base();
  after.observations = [];
  after.decisions = [];
  const report = compare(before, after, { removedDecisions: [privateLabel + '/washroom'], maxRemovals: 0 });
  const paths = new Map(report.findings.map(issue => [issue.code, issue.path]));
  assert.equal(paths.get('REMOVED'), '$.before.decisions[0]');
  assert.equal(paths.get('HISTORY'), '$.before.observations[0]');
  assert.equal(paths.get('UNUSED'), '$.policy.removedDecisions[0]');
  assert.match(textReport(report, 'fr'), /\$\.before\.decisions\[0\]\u00a0: /u);
  assertPrivate(report);
});

test('protected source checks cover the reference and stable ID as well as the display name', () => {
  const source = base().sources[0];
  assert.equal(validSource({ ...source, reference: 'sources/user@example.invalid.json' }), false);
  assert.equal(validSource({ ...source, id: 'mi-way-fixture' }), false);
  assert.equal(validSource({ ...source, reference: 'sources/mi-way/fixture' }), false);
});
