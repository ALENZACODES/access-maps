import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  byteDigest, canonicalObject, checkReportText, createEvidenceReport,
  deterministicJson, localFilePlan, reportAuditTrail, reportCsv, reportText,
} from './p15ac-report.mjs';
import { auditRouteChoices } from './p15ac-comparison.mjs';
import { defaultReviewPolicy } from './p15ac-policy.mjs';
import { fictionalOntario, copy } from './p15v-fixtures.mjs';

function review(changes = {}, policyChanges = {}) {
  const snapshot = fictionalOntario();
  for (const [key, value] of Object.entries(changes)) snapshot[key] = value;
  return auditRouteChoices(snapshot, { start: 'a', end: 'd' },
    defaultReviewPolicy(snapshot.asOf, policyChanges));
}
function incomplete() {
  const r = review();
  return { ...r, ok: false };
}

describe('P15AC: canonical offline serialisation', () => {
  it('sorts object keys before serialising', () => {
    assert.equal(deterministicJson({ z: 2, a: 1 }), '{"a":1,"z":2}\n');
  });
  it('sorts nested objects recursively', () => {
    assert.equal(deterministicJson({ root: { z: 3, a: 2 } }),
      '{"root":{"a":2,"z":3}}\n');
  });
  it('preserves array item order', () => {
    assert.equal(deterministicJson({ items: [{ y: 1, x: 2 }, { y: 3, x: 4 }] }),
      '{"items":[{"x":2,"y":1},{"x":4,"y":3}]}\n');
  });
  it('does not mutate the input during canonicalisation', () => {
    const record = { z: { b: 2, a: 1 }, a: [3, 2, 1] };
    const original = copy(record);
    canonicalObject(record);
    assert.deepEqual(record, original);
  });
  it('rejects nonfinite numbers', () => {
    assert.throws(() => deterministicJson({ n: Infinity }), TypeError);
  });
  it('rejects NaN values rather than changing them to null', () => {
    assert.throws(() => deterministicJson({ n: NaN }), TypeError);
  });
  it('rejects unsupported functions', () => {
    assert.throws(() => deterministicJson({ action: () => 1 }), TypeError);
  });
  it('rejects undefined values', () => {
    assert.throws(() => deterministicJson({ missing: undefined }), TypeError);
  });
  it('rejects bigint fields', () => {
    assert.throws(() => deterministicJson({ number: 2n }), TypeError);
  });
  it('rejects symbol fields', () => {
    assert.throws(() => deterministicJson({ value: Symbol('a') }), TypeError);
  });
  it('produces the same bytes for reordered keys', () => {
    assert.equal(deterministicJson({ a: 1, b: 2 }), deterministicJson({ b: 2, a: 1 }));
  });
  it('produces distinct digest for different values', () => {
    assert.notEqual(byteDigest('first'), byteDigest('second'));
  });
  it('returns a lowercase SHA-256 digest', () => {
    assert.match(byteDigest('data'), /^[0-9a-f]{64}$/u);
  });
  it('calculates a digest from UTF-8 encoded text', () => {
    assert.notEqual(byteDigest('é'), byteDigest('e'));
  });
  it('returns JSON terminated by one newline', () => {
    assert.equal(deterministicJson({}), '{}\n');
  });
  it('enforces a bounded output size', () => {
    assert.throws(() => deterministicJson({ long: 'a'.repeat(4 * 1024 * 1024) }), RangeError);
  });
});

describe('P15AC: bilingual review presentation', () => {
  it('creates a local JSON review report', () => {
    const result = createEvidenceReport(review());
    assert.equal(result.ok, true);
    assert.equal(result.report.kind, 'ontario-route-evidence-report');
  });
  it('returns no report when the review is blocked', () => {
    const result = createEvidenceReport(incomplete());
    assert.equal(result.ok, false);
    assert.equal(result.json, null);
  });
  it('reports the snapshot date from the supplied evidence', () => {
    const result = createEvidenceReport(review());
    assert.equal(result.report.summary.asOf, '2026-11-19');
  });
  it('declares the export licence partition', () => {
    const result = createEvidenceReport(review());
    assert.equal(result.report.summary.silo, 'open');
  });
  it('preserves source dates in each route segment', () => {
    const result = createEvidenceReport(review());
    assert.ok(result.report.routes[0].segments[0].sources[0].observedOn);
  });
  it('does not replace UNKNOWN with a positive status', () => {
    const snapshot = fictionalOntario();
    Object.assign(snapshot.edges[0], { access: 'UNKNOWN', tier: 1, evidence: [] });
    const assessed = auditRouteChoices(snapshot, { start: 'a', end: 'd' },
      defaultReviewPolicy(snapshot.asOf));
    const result = createEvidenceReport(assessed);
    assert.ok(result.report.routes.some((r) => r.segments.some((s) => s.access === 'UNKNOWN')));
  });
  it('creates a French report with bilingual labels', () => {
    const result = createEvidenceReport(review(), 'fr');
    assert.equal(result.report.locale, 'fr');
    assert.ok(result.report.heading.includes('Couverture'));
  });
  it('rejects unsupported report locale', () => {
    assert.throws(() => createEvidenceReport(review(), 'de'), TypeError);
  });
  it('produces exactly the same output over identical input', () => {
    assert.equal(createEvidenceReport(review()).json, createEvidenceReport(review()).json);
  });
  it('produces different digests for distinct locales', () => {
    assert.notEqual(createEvidenceReport(review(), 'en').sha256,
      createEvidenceReport(review(), 'fr').sha256);
  });
  it('includes a caution about route suitability', () => {
    const result = createEvidenceReport(review());
    assert.ok(result.report.caution.length > 0);
  });
  it('includes only the requested route options', () => {
    const assessed = review({}, { alternatives: 1 });
    const result = createEvidenceReport(assessed);
    assert.equal(result.report.routes.length, 1);
  });
  it('computes byte length from actual JSON UTF-8 bytes', () => {
    const result = createEvidenceReport(review());
    assert.equal(result.bytes, Buffer.byteLength(result.json, 'utf8'));
  });
  it('links the report digest to exactly those bytes', () => {
    const result = createEvidenceReport(review());
    assert.equal(byteDigest(result.json), result.sha256);
  });
  it('detects modified JSON bytes', () => {
    const result = createEvidenceReport(review());
    assert.equal(checkReportText({ ...result, json: result.json + ' ' }), false);
  });
  it('detects modified digest', () => {
    const result = createEvidenceReport(review());
    assert.equal(checkReportText({ ...result, sha256: 'b'.repeat(64) }), false);
  });
  it('detects incorrect declared byte length', () => {
    const result = createEvidenceReport(review());
    assert.equal(checkReportText({ ...result, bytes: result.bytes + 1 }), false);
  });
  it('rejects malformed JSON in report audit', () => {
    const result = createEvidenceReport(review());
    const bad = { ...result, json: 'not JSON', bytes: 8, sha256: byteDigest('not JSON') };
    assert.equal(checkReportText(bad), false);
  });
  it('accepts an unchanged report for local use', () => {
    assert.equal(checkReportText(createEvidenceReport(review())), true);
  });
  it('does not accept a missing report', () => {
    assert.equal(checkReportText(null), false);
  });
  it('does not accept a report marked as blocked', () => {
    assert.equal(checkReportText({ ok: false }), false);
  });
  it('uses deterministic summaries across input record reordering', () => {
    const a = createEvidenceReport(review());
    const snapshot = fictionalOntario();
    snapshot.sources.reverse();
    const b = createEvidenceReport(auditRouteChoices(snapshot, { start: 'a', end: 'd' },
      defaultReviewPolicy(snapshot.asOf)));
    assert.equal(a.sha256, b.sha256);
  });
});

describe('P15AC: human-readable evidence explanations', () => {
  it('renders an English heading and source information', () => {
    const text = reportText(review());
    assert.match(text, /Route evidence coverage/u);
    assert.match(text, /Source/u);
  });
  it('renders a French heading and dated source information', () => {
    const text = reportText(review(), 'fr');
    assert.match(text, /Couverture des observations/u);
    assert.match(text, /Date de l’observation/u);
  });
  it('shows a blocked message for invalid review', () => {
    assert.match(reportText(incomplete()), /blocked/u);
  });
  it('shows explicit UNKNOWN where there is an evidence gap', () => {
    const snapshot = fictionalOntario();
    Object.assign(snapshot.edges[0], { access: 'UNKNOWN', tier: 1, evidence: [] });
    const assessed = auditRouteChoices(snapshot, { start: 'a', end: 'd' },
      defaultReviewPolicy(snapshot.asOf));
    assert.match(reportText(assessed, 'fr'), /UNKNOWN/u);
  });
  it('describes route distance in metres', () => {
    assert.match(reportText(review()), /\d+ m/u);
  });
  it('includes the licence of the contributing source', () => {
    assert.match(reportText(review()), /OGL-ON-1\.0/u);
  });
  it('does not add an unsupported source credit', () => {
    assert.doesNotMatch(reportText(review()), /Private data vendor/u);
  });
  it('ends with a newline', () => {
    assert.ok(reportText(review()).endsWith('\n'));
  });
  it('handles a route review with no available routes', () => {
    const snap = fictionalOntario();
    snap.edges = [];
    const assessed = auditRouteChoices(snap, { start: 'a', end: 'd' },
      defaultReviewPolicy(snap.asOf));
    assert.match(reportText(assessed), /Route evidence coverage/u);
  });
  it('rejects a language not present in the bilingual copy bank', () => {
    assert.throws(() => reportText(review(), 'xx'), TypeError);
  });
});

describe('P15AC: safe, local CSV and audit trail', () => {
  it('creates CSV with the expected columns', () => {
    const csv = reportCsv(review());
    assert.ok(csv.startsWith('"route","segment","from","to"'));
  });
  it('quotes every field to avoid delimiter ambiguity', () => {
    const csv = reportCsv(review());
    assert.ok(csv.split('\n')[1].startsWith('"'));
  });
  it('returns no partial CSV for blocked review', () => {
    assert.equal(reportCsv(incomplete()), null);
  });
  it('returns a French CSV for French labels', () => {
    const csv = reportCsv(review(), 'fr');
    assert.ok(csv.includes('Segment fictif'));
  });
  it('supports empty route results without adding fabricated rows', () => {
    const snap = fictionalOntario();
    snap.edges = [];
    const assessed = auditRouteChoices(snap, { start: 'a', end: 'd' },
      defaultReviewPolicy(snap.asOf));
    assert.equal(reportCsv(assessed).trim().split('\n').length, 1);
  });
  it('does not include raw source email or credentials', () => {
    const csv = reportCsv(review());
    assert.doesNotMatch(csv, /password|@example.com/u);
  });
  it('keeps actual evidence dates in the audit trail', () => {
    const rows = reportAuditTrail(review());
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.observedOn === '2026-11-02'));
  });
  it('returns no trail for invalid review', () => {
    assert.deepEqual(reportAuditTrail(incomplete()), []);
  });
  it('uses real source licence metadata in the trail', () => {
    const rows = reportAuditTrail(review());
    assert.ok(rows.every((row) => row.licence === 'OGL-ON-1.0'));
  });
  it('does not transform citation source identifiers', () => {
    const rows = reportAuditTrail(review());
    assert.ok(rows.every((row) => row.sourceId === 'municipal'));
  });
  it('removes no observations when assembling a report', () => {
    const assessed = review();
    const count = assessed.routes.reduce((total, route) => total +
      route.segments.reduce((n, segment) => n + segment.edge.observations.length, 0), 0);
    assert.equal(reportAuditTrail(assessed).length, count);
  });
  it('orders records by route rank and segment identity', () => {
    const rows = reportAuditTrail(review());
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].route <= rows[i].route);
  });
  it('does not mutate route reviews while producing the audit trail', () => {
    const assessed = review();
    const before = structuredClone(assessed.routes);
    reportAuditTrail(assessed);
    assert.deepEqual(assessed.routes, before);
  });
  it('creates a local file plan with bounded names', () => {
    const plan = localFilePlan(createEvidenceReport(review()));
    assert.match(plan.json.fileName, /^ontario-route-evidence-2026-11-19-en\.json$/u);
  });
  it('never contains path separators in generated file names', () => {
    const plan = localFilePlan(createEvidenceReport(review(), 'fr'), 'fr');
    assert.doesNotMatch(plan.json.fileName, /[/\\]/u);
  });
  it('links local file hash to the exact JSON content', () => {
    const plan = localFilePlan(createEvidenceReport(review()));
    assert.equal(plan.json.sha256, byteDigest(plan.json.content));
  });
  it('does not plan local files for a blocked report', () => {
    assert.equal(localFilePlan(createEvidenceReport(incomplete())), null);
  });
  it('does not plan local files for modified bytes', () => {
    const result = createEvidenceReport(review());
    assert.equal(localFilePlan({ ...result, json: result.json + 'extra' }), null);
  });
  it('does not perform an upload or network action', () => {
    const plan = localFilePlan(createEvidenceReport(review()));
    assert.ok(plan.json.content.startsWith('{'));
    assert.equal(Object.hasOwn(plan, 'upload'), false);
  });
});

describe('P15AC: local export fidelity and adversarial input', () => {
  it('preserves actual segment metres in the structured report', () => {
    const result = createEvidenceReport(review());
    const segment = result.report.routes[0].segments[0];
    assert.equal(typeof segment.metres, 'number');
    assert.ok(segment.metres > 0);
  });
  it('retains original metres in CSV rather than a blank placeholder', () => {
    const result = createEvidenceReport(review());
    const files = localFilePlan(result);
    const first = result.report.routes[0].segments[0];
    assert.ok(files.csv.content.includes(`"${first.metres}"`));
  });
  it('ties the CSV digest to the exact CSV bytes', () => {
    const files = localFilePlan(createEvidenceReport(review()));
    assert.equal(files.csv.sha256, byteDigest(files.csv.content));
  });
  it('does not silently discard recorded UNKNOWN in an export', () => {
    const snapshot = fictionalOntario();
    Object.assign(snapshot.edges[0], { access: 'UNKNOWN', tier: 1, evidence: [] });
    const assessed = auditRouteChoices(snapshot, { start: 'a', end: 'd' },
      defaultReviewPolicy(snapshot.asOf));
    const result = createEvidenceReport(assessed);
    const file = localFilePlan(result);
    assert.match(file.json.content, /"UNKNOWN"/u);
    assert.match(file.csv.content, /"UNKNOWN"/u);
  });
  it('retains date metadata in both export formats', () => {
    const files = localFilePlan(createEvidenceReport(review()));
    assert.match(files.json.content, /2026-11-01/u);
    assert.match(files.csv.content, /2026-11-01/u);
  });
  it('reports the correct MIME type for both exports', () => {
    const files = localFilePlan(createEvidenceReport(review()));
    assert.equal(files.json.mime, 'application/json');
    assert.equal(files.csv.mime, 'text/csv');
  });
  it('keeps French locale in both output file names', () => {
    const files = localFilePlan(createEvidenceReport(review(), 'fr'), 'fr');
    assert.ok(files.json.fileName.endsWith('-fr.json'));
    assert.ok(files.csv.fileName.endsWith('-fr.csv'));
  });
  it('does not include local machine identifiers in output names', () => {
    const files = localFilePlan(createEvidenceReport(review()));
    assert.doesNotMatch(files.json.fileName, /[\\/:*?"<>|]/u);
    assert.doesNotMatch(files.csv.fileName, /[\\/:*?"<>|]/u);
  });
  it('keeps evidence source dates in the JSON export without inference', () => {
    const result = createEvidenceReport(review());
    const parsed = JSON.parse(result.json);
    const citations = parsed.routes.flatMap((r) => r.segments.flatMap((s) => s.sources));
    assert.ok(citations.every((s) => s.observedOn === '2026-11-01'));
  });
  it('keeps observed evidence dates separate from source catalogue dates', () => {
    const result = createEvidenceReport(review());
    const parsed = JSON.parse(result.json);
    const evidence = parsed.routes.flatMap((r) => r.segments.flatMap((s) => s.observations));
    assert.ok(evidence.every((o) => o.observedOn === '2026-11-02'));
    assert.ok(evidence.every((o) => o.sourceDate === '2026-11-01'));
  });
  it('round-trips Unicode French names through the JSON bytes', () => {
    const result = createEvidenceReport(review(), 'fr');
    const parsed = JSON.parse(result.json);
    assert.ok(parsed.routes[0].segments[0].name.fr.startsWith('Segment'));
  });
  it('keeps deterministic order when called repeatedly on the same result', () => {
    const assessed = review();
    const first = localFilePlan(createEvidenceReport(assessed));
    const second = localFilePlan(createEvidenceReport(assessed));
    assert.deepEqual(first, second);
  });
  it('never includes an automatic network endpoint in a file plan', () => {
    const files = localFilePlan(createEvidenceReport(review()));
    assert.deepEqual(Object.keys(files).sort(), ['csv', 'json']);
  });
  it('does not change the local plan when another route is merely compared', () => {
    const result = createEvidenceReport(review());
    const before = localFilePlan(result);
    createEvidenceReport(review({}, { alternatives: 1 }));
    assert.deepEqual(localFilePlan(result), before);
  });
  it('rejects report locale mismatch at the presentation boundary', () => {
    const result = createEvidenceReport(review());
    assert.throws(() => localFilePlan(result, 'UNKNOWN'), TypeError);
  });
});
