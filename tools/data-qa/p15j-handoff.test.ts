import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditHandoff } from './p15j-handoff.js';

const stamp = { id: 'source-a', source: 'Ontario open data', licence: 'OGL-ON-1.0',
  observedOn: '2026-11-10', reference: 'sources/ontario.txt', silo: 'open' };
const packet = { id: 'packet-a', generatedOn: '2026-11-18', status: 'READY',
  recordIds: ['place-a'], previousId: null as string | null };
const record = { id: 'place-a', status: 'YES', silo: 'open', sourceIds: ['source-a'],
  receiptIds: ['receipt-a'], labelEn: 'Accessible entrance', labelFr: 'Entrée accessible' };
const receipt = { id: 'receipt-a', packetId: 'packet-a', recordId: 'place-a', state: 'YES',
  capturedOn: '2026-11-12', sourceIds: ['source-a'], silo: 'open',
  noteEn: 'Entrance observed', noteFr: 'Entrée observée' };
function base() {
  return { schemaVersion: 1, asOf: '2026-11-20', maxAgeDays: 60,
    packets: [{ ...packet, recordIds: [...packet.recordIds] }],
    records: [{ ...record, sourceIds: [...record.sourceIds], receiptIds: [...record.receiptIds] }],
    sources: [{ ...stamp }], receipts: [{ ...receipt, sourceIds: [...receipt.sourceIds] }] };
}
function check(value: unknown) { return auditHandoff(value); }
function fail(value: unknown, code: string) {
  const result = check(value);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(item => item.code === code), JSON.stringify(result.findings));
}
function mutate(collection: 'packets' | 'records' | 'sources' | 'receipts', key: string, value: unknown) {
  const input = base();
  const item = input[collection][0] as Record<string, unknown>;
  item[key] = value;
  return input;
}

describe('P15J offline handoff receipts', () => {
  it('accepts one complete packet with open provenance', () => {
    const result = check(base());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.totals.packets, 1);
    assert.equal(result.totals.records, 1);
    assert.equal(result.totals.receipts, 1);
    assert.equal(result.totals.unknown, 0);
  });
  it('accepts an explicit UNKNOWN record with no affirmative evidence', () => {
    const input = base();
    input.records[0]!.status = 'UNKNOWN';
    input.receipts[0]!.state = 'UNKNOWN';
    const result = check(input);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.totals.unknown, 1);
  });
  it('keeps UNKNOWN when YES and NO receipts conflict', () => {
    const input = base();
    input.records[0]!.status = 'UNKNOWN';
    input.records[0]!.receiptIds.push('receipt-b');
    input.receipts.push({ ...receipt, id: 'receipt-b', state: 'NO' });
    assert.equal(check(input).ok, true);
  });
  it('does not permit YES when there is contradictory NO evidence', () => {
    const input = base();
    input.records[0]!.receiptIds.push('receipt-b');
    input.receipts.push({ ...receipt, id: 'receipt-b', state: 'NO' });
    fail(input, 'CONFLICT');
  });
  it('does not permit NO when there is contradictory YES evidence', () => {
    const input = base();
    input.records[0]!.status = 'NO';
    input.records[0]!.receiptIds.push('receipt-b');
    input.receipts.push({ ...receipt, id: 'receipt-b', state: 'NO' });
    fail(input, 'CONFLICT');
  });
  it('does not invent affirmative access from UNKNOWN evidence', () => {
    fail(mutate('receipts', 'state', 'UNKNOWN'), 'STATUS');
  });
  it('does not invent negative access from UNKNOWN evidence', () => {
    const input = mutate('receipts', 'state', 'UNKNOWN');
    input.records[0]!.status = 'NO';
    fail(input, 'STATUS');
  });
  it('requires a receipt for known access', () => {
    fail(mutate('records', 'receiptIds', []), 'STATUS');
  });
  it('requires each record to be included in a packet', () => {
    fail(mutate('packets', 'recordIds', []), 'UNLINKED');
  });
  it('requires every referenced packet record to exist', () => {
    fail(mutate('packets', 'recordIds', ['missing-place']), 'MISSING');
  });
  it('blocks an absent receipt reference', () => {
    fail(mutate('records', 'receiptIds', ['missing-receipt']), 'MISSING');
  });
  it('blocks an absent source reference', () => {
    fail(mutate('records', 'sourceIds', ['missing-source']), 'MISSING');
  });
  it('blocks an absent receipt source', () => {
    fail(mutate('receipts', 'sourceIds', ['missing-source']), 'MISSING');
  });
  it('blocks an absent packet reference on receipt', () => {
    fail(mutate('receipts', 'packetId', 'missing-packet'), 'MISSING');
  });
  it('blocks receipt associated with an unknown record', () => {
    fail(mutate('receipts', 'recordId', 'missing-record'), 'MISSING');
  });
  it('blocks receipt linked to another record', () => {
    const input = base();
    input.records.push({ ...record, id: 'place-b', receiptIds: [], status: 'UNKNOWN' });
    input.packets[0]!.recordIds.push('place-b');
    input.receipts[0]!.recordId = 'place-b';
    fail(input, 'UNLINKED');
  });
  it('blocks receipt linked to another packet', () => {
    const input = base();
    input.packets.push({ ...packet, id: 'packet-b', recordIds: [] });
    input.receipts[0]!.packetId = 'packet-b';
    fail(input, 'UNLINKED');
  });
  it('blocks a receipt source absent from its record', () => {
    const input = base();
    input.sources.push({ ...stamp, id: 'source-b' });
    input.receipts[0]!.sourceIds.push('source-b');
    fail(input, 'SOURCE');
  });
  it('blocks a receipt before the source observation date', () => {
    fail(mutate('receipts', 'capturedOn', '2026-11-01'), 'ORDER');
  });
  it('blocks a packet dated before its receipt', () => {
    fail(mutate('packets', 'generatedOn', '2026-11-11'), 'PACKET_DATE');
  });
  it('blocks a future-dated receipt', () => {
    fail(mutate('receipts', 'capturedOn', '2026-11-25'), 'DATE');
  });
  it('blocks a future-dated packet', () => {
    fail(mutate('packets', 'generatedOn', '2026-11-25'), 'DATE');
  });
  it('blocks a future-dated source', () => {
    fail(mutate('sources', 'observedOn', '2026-11-25'), 'DATE');
  });
  it('blocks a stale source', () => {
    fail(mutate('sources', 'observedOn', '2025-10-01'), 'DATE');
  });
  it('blocks a stale receipt', () => {
    fail(mutate('receipts', 'capturedOn', '2025-10-01'), 'DATE');
  });
  it('blocks a stale packet', () => {
    fail(mutate('packets', 'generatedOn', '2025-10-01'), 'DATE');
  });
  it('supports a valid ODbL-only packet', () => {
    const input = base();
    input.sources[0]!.licence = 'ODbL-1.0';
    input.sources[0]!.silo = 'odbl';
    input.receipts[0]!.silo = 'odbl';
    input.records[0]!.silo = 'odbl';
    assert.equal(check(input).ok, true);
  });
  it('blocks ODbL material mislabelled as open at the source', () => {
    fail(mutate('sources', 'licence', 'ODbL-1.0'), 'SILO');
  });
  it('blocks an ODbL record in the open silo', () => {
    const input = base();
    input.sources[0]!.licence = 'ODbL-1.0';
    input.sources[0]!.silo = 'odbl';
    input.receipts[0]!.silo = 'odbl';
    fail(input, 'ODBL');
  });
  it('blocks a mismatched receipt silo', () => {
    fail(mutate('receipts', 'silo', 'odbl'), 'SILO');
  });
  it('blocks held-feed data at the source', () => {
    fail(mutate('sources', 'source', 'MiWay GTFS feed'), 'HELD');
  });
  it('blocks held-feed name separated by punctuation', () => {
    fail(mutate('sources', 'source', 'mi-way transit'), 'HELD');
  });
  it('blocks closed licensing', () => {
    fail(mutate('sources', 'licence', 'proprietary'), 'SOURCE');
  });
  it('blocks a source without date', () => {
    fail(mutate('sources', 'observedOn', ''), 'SOURCE');
  });
  it('blocks an invalid calendar date', () => {
    fail(mutate('sources', 'observedOn', '2026-02-30'), 'SOURCE');
  });
  it('blocks a source reference traversal path', () => {
    fail(mutate('sources', 'reference', '../secret.json'), 'SOURCE');
  });
  it('blocks a source reference with a URL scheme', () => {
    fail(mutate('sources', 'reference', 'https://example.com'), 'SOURCE');
  });
  it('blocks an English script injection', () => {
    fail(mutate('records', 'labelEn', '<script>alert(1)</script>'), 'RECORD');
  });
  it('blocks a French script injection', () => {
    fail(mutate('records', 'labelFr', '<script>alert(1)</script>'), 'RECORD');
  });
  it('blocks malformed French colon spacing', () => {
    fail(mutate('records', 'labelFr', 'Accès : entrée'), 'RECORD');
  });
  it('accepts French nonbreaking colon spacing', () => {
    const input = base();
    input.records[0]!.labelFr = 'Accès\u00a0: entrée';
    assert.equal(check(input).ok, true);
  });
  it('blocks typographic French apostrophe errors', () => {
    fail(mutate('records', 'labelFr', "L'entree"), 'RECORD');
  });
  it('accepts typographic French apostrophes', () => {
    const input = base();
    input.records[0]!.labelFr = 'L’entrée';
    assert.equal(check(input).ok, true);
  });
  it('blocks a personal email in notes', () => {
    fail(mutate('receipts', 'noteEn', 'contact@example.com'), 'RECEIPT');
  });
  it('blocks duplicate record identifiers', () => {
    const input = base();
    input.records.push({ ...record });
    fail(input, 'DUPLICATE');
  });
  it('blocks duplicate source identifiers', () => {
    const input = base();
    input.sources.push({ ...stamp });
    fail(input, 'DUPLICATE');
  });
  it('blocks duplicate receipt identifiers', () => {
    const input = base();
    input.receipts.push({ ...receipt });
    fail(input, 'DUPLICATE');
  });
  it('blocks duplicate packet identifiers', () => {
    const input = base();
    input.packets.push({ ...packet });
    fail(input, 'DUPLICATE');
  });
  it('blocks duplicate packet record references', () => {
    fail(mutate('packets', 'recordIds', ['place-a', 'place-a']), 'DUPLICATE');
  });
  it('blocks duplicate record source references', () => {
    fail(mutate('records', 'sourceIds', ['source-a', 'source-a']), 'DUPLICATE');
  });
  it('blocks duplicate receipt source references', () => {
    fail(mutate('receipts', 'sourceIds', ['source-a', 'source-a']), 'SOURCE');
  });
  it('blocks duplicate record receipt references', () => {
    fail(mutate('records', 'receiptIds', ['receipt-a', 'receipt-a']), 'DUPLICATE');
  });
  it('blocks a self-cycle in packet history', () => {
    fail(mutate('packets', 'previousId', 'packet-a'), 'GRAPH');
  });
  it('blocks packet history references to absent packets', () => {
    fail(mutate('packets', 'previousId', 'missing'), 'GRAPH');
  });
  it('blocks a cycle spanning two packets', () => {
    const input = base();
    input.packets[0]!.previousId = 'packet-b';
    input.packets.push({ ...packet, id: 'packet-b', previousId: 'packet-a', recordIds: [] });
    fail(input, 'GRAPH');
  });
  it('blocks packet history that moves backward', () => {
    const input = base();
    input.packets.push({ ...packet, id: 'packet-old', generatedOn: '2026-11-19', recordIds: [] });
    input.packets[0]!.previousId = 'packet-old';
    fail(input, 'FORWARD');
  });
  it('allows chronological predecessor packets', () => {
    const input = base();
    input.packets.push({ ...packet, id: 'packet-old', generatedOn: '2026-11-01', recordIds: [] });
    input.packets[0]!.previousId = 'packet-old';
    assert.equal(check(input).ok, true);
  });
  it('reports unused provenance as a notice, not a release blocker', () => {
    const input = base();
    input.sources.push({ ...stamp, id: 'source-unused' });
    const result = check(input);
    assert.equal(result.ok, true);
    assert.ok(result.findings.some(f => f.code === 'UNUSED' && f.severity === 'NOTICE'));
  });
  it('blocks orphan receipts not linked to a record', () => {
    const input = base();
    input.receipts.push({ ...receipt, id: 'receipt-orphan' });
    fail(input, 'ORPHAN');
  });
  it('blocks missing top-level collections', () => {
    const input = base() as Record<string, unknown>;
    delete input.sources;
    fail(input, 'ROOT');
  });
  it('blocks unexpected root metadata', () => {
    fail({ ...base(), trackingId: 'hidden' }, 'ROOT');
  });
  it('blocks invalid policy age', () => {
    fail({ ...base(), maxAgeDays: -1 }, 'POLICY');
  });
  it('blocks invalid policy calendar date', () => {
    fail({ ...base(), asOf: '2026-02-30' }, 'POLICY');
  });
  it('blocks a malformed receipt entry', () => {
    const input = base();
    input.receipts = [null] as unknown as typeof input.receipts;
    fail(input, 'RECEIPT');
  });
  it('blocks a malformed packet entry', () => {
    const input = base();
    input.packets = [null] as unknown as typeof input.packets;
    fail(input, 'PACKET');
  });
  it('blocks a malformed record entry', () => {
    const input = base();
    input.records = [null] as unknown as typeof input.records;
    fail(input, 'RECORD');
  });
  it('blocks an input larger than the per-collection limit', () => {
    fail({ ...base(), packets: Array.from({ length: 5001 }, () => packet) }, 'LIMIT');
  });
  it('produces deterministic findings for identical inputs', () => {
    const input = mutate('sources', 'source', 'MiWay');
    assert.deepEqual(check(input), check(input));
  });
});
