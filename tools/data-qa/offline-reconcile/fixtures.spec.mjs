import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audit } from './audit.mjs';
import { base, known, odbl, secondFeature, secondSource, corrected, allows, issue } from './fixtures.mjs';
import { dayNumber, exact, id, safePath, safeText } from './contract.mjs';

test('fictional base is internally consistent', () => { allows(base()); });
test('known state has explicit source', () => { allows(known('YES')); });
test('documented NO remains NO', () => { allows(known('NO')); });
test('open ODbL silo remains separate', () => { allows(odbl()); });
test('second feature has its own decision', () => { allows(secondFeature(base())); });
test('known state can be corrected using history', () => { allows(corrected(known('YES'), 'NO')); });
test('a source may be present but unused as notice', () => {
  const input = secondSource(base());
  const report = allows(input);
  assert.ok(issue(report, 'UNREFERENCED'));
});
test('basic identifiers cannot contain slash traversal', () => { assert.equal(id('../secret'), false); });
test('paths must stay relative', () => { assert.equal(safePath('/root/file'), false); });
test('control characters are not safe', () => { assert.equal(safeText('a\nb'), false); });
test('exact fields reject hidden extra fields', () => {
  assert.equal(exact({ a: 1, hidden: true }, ['a']), false);
});
test('calendar day number exists for valid date', () => { assert.ok(dayNumber('2026-11-20') > 0); });
