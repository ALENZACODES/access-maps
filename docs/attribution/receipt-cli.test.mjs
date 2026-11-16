import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, runReceiptCli } from './receipt-cli.mjs';
import { release, dataset, surface, withMetrolinx } from './receipt-fixture.test.mjs';

const fixtures = () => JSON.stringify(release());
function harness(contents = fixtures()) {
  const printed = [];
  const errors = [];
  const writes = [];
  const io = {
    read: async () => contents,
    write: async (path, content) => { writes.push({ path, content }); },
    print: (text) => { printed.push(text); },
    error: (text) => { errors.push(text); },
  };
  return { io, printed, errors, writes };
}

test('CLI accepts an explicit English surface and produces portable text', async () => {
  const mock = harness();
  const exit = await runReceiptCli(['release.json', '--surface', 'mapone'], mock.io);
  assert.equal(exit, 0);
  assert.ok(mock.printed.join('').includes('OpenStreetMap'));
  assert.ok(mock.printed.join('').includes('UNKNOWN'));
  assert.deepEqual(mock.errors, []);
});

test('CLI French JSON uses selected locale and source provenance', async () => {
  const mock = harness();
  const exit = await runReceiptCli(['release.json', '--surface', 'mapone',
    '--language', 'fr', '--format', 'json'], mock.io);
  assert.equal(exit, 0);
  const receipt = JSON.parse(mock.printed.join(''));
  assert.equal(receipt.language, 'fr');
  assert.equal(receipt.title, 'Carte publique');
  assert.equal(receipt.datasets[0].datasetAsOf, 'UNKNOWN');
});

test('CLI can generate a report without writing a file', async () => {
  const mock = harness();
  const result = await runReceiptCli(['release.json', '--surface', 'mapone',
    '--format', 'report'], mock.io);
  assert.equal(result, 0);
  assert.equal(mock.writes.length, 0);
  assert.match(mock.printed.join(''), /"blocked": false/u);
});

test('CLI writes explicit output file, not unexpected side effects', async () => {
  const mock = harness();
  const result = await runReceiptCli(['release.json', '--surface', 'mapone',
    '--output', 'chosen.txt'], mock.io);
  assert.equal(result, 0);
  assert.equal(mock.writes.length, 1);
  assert.equal(mock.writes[0].path, 'chosen.txt');
  assert.ok(mock.writes[0].content.includes('OpenStreetMap'));
  assert.deepEqual(mock.printed, []);
});

test('CLI fails with status 1 when redistribution is UNKNOWN', async () => {
  const data = JSON.stringify(release([dataset('osmone', { redistributionAllowed: 'UNKNOWN' })]));
  const mock = harness(data);
  const result = await runReceiptCli(['release.json', '--surface', 'mapone'], mock.io);
  assert.equal(result, 1);
});

test('CLI fails with status 1 when targets are too small', async () => {
  const data = JSON.stringify(release([dataset()], [surface('mapone', { minimumTargetPx: 43 })]));
  const mock = harness(data);
  const result = await runReceiptCli(['release.json', '--surface', 'mapone'], mock.io);
  assert.equal(result, 1);
});

test('CLI does not treat absent sources as a successful publish', async () => {
  const data = JSON.stringify(release([dataset()], [surface('mapone', { sourceIds: [] })]));
  const mock = harness(data);
  const result = await runReceiptCli(['release.json', '--surface', 'mapone'], mock.io);
  assert.equal(result, 1);
});

test('CLI --gate runs the existing publication audit', async () => {
  const mock = harness();
  const result = await runReceiptCli(['release.json', '--surface', 'mapone', '--gate'], mock.io);
  assert.ok([0, 1].includes(result));
  assert.equal(mock.errors.length, 0);
});

test('CLI all mode reports each surface separately', async () => {
  const data = JSON.stringify(release([dataset()], [surface('mapone'),
    surface('second', { path: '/second' })]));
  const mock = harness(data);
  const result = await runReceiptCli(['release.json', '--all'], mock.io);
  assert.equal(result, 0);
  assert.ok(mock.printed.join('').includes('Public map'));
});

test('CLI all mode returns blocked on any surface failure', async () => {
  const data = JSON.stringify(release([dataset()], [surface('mapone'),
    surface('second', { path: '/second', minimumTargetPx: 30 })]));
  const mock = harness(data);
  const result = await runReceiptCli(['release.json', '--all'], mock.io);
  assert.equal(result, 1);
});

test('CLI all mode JSON includes results and blocking count', async () => {
  const mock = harness();
  const result = await runReceiptCli(['release.json', '--all', '--format', 'json'], mock.io);
  assert.equal(result, 0);
  const data = JSON.parse(mock.printed.join(''));
  assert.equal(data.results.length, 1);
  assert.equal(data.language, 'en');
});

test('CLI does not infer a licence from the Metrolinx provider name', async () => {
  const mock = harness(JSON.stringify(withMetrolinx('Metrolinx-AUA')));
  const result = await runReceiptCli(['release.json', '--surface', 'gojourney',
    '--format', 'json'], mock.io);
  assert.ok([0, 1].includes(result));
  const data = JSON.parse(mock.printed.join(''));
  assert.equal(data.datasets[0].licence, 'Metrolinx-AUA');
  assert.equal(data.datasets[0].notices.length, 3);
});

const invalidArgs = [
  [], ['--all'], ['release.json'], ['release.json', '--format'],
  ['release.json', '--surface'], ['release.json', '--language', 'es', '--all'],
  ['release.json', '--format', 'xml', '--all'], ['release.json', '--other'],
  ['release.json', '--all', '--surface', 'mapone'],
  ['release.json', '--surface', 'mapone', '--language'],
  ['release.json', '--surface', 'mapone', '--output'],
];
for (const args of invalidArgs) {
  test(`CLI rejects invalid options: ${args.join(' ') || '(empty)'}`, async () => {
    const mock = harness();
    const exit = await runReceiptCli(args, mock.io);
    assert.equal(exit, 2);
    assert.equal(mock.printed.length, 0);
    assert.ok(mock.errors.length > 0);
  });
}

test('CLI reports unreadable input with status 2', async () => {
  const mock = harness();
  mock.io.read = async () => { throw new Error('Permission denied'); };
  assert.equal(await runReceiptCli(['release.json', '--all'], mock.io), 2);
  assert.match(mock.errors.join(''), /INPUT_ERROR/u);
});

test('CLI reports invalid JSON without producing a receipt', async () => {
  const mock = harness('{not json');
  assert.equal(await runReceiptCli(['release.json', '--all'], mock.io), 2);
  assert.equal(mock.printed.length, 0);
});

test('CLI reports unknown surface with status 2 rather than an empty receipt', async () => {
  const mock = harness();
  assert.equal(await runReceiptCli(['release.json', '--surface', 'not-here'], mock.io), 2);
  assert.match(mock.errors.join(''), /RECEIPT_ERROR/u);
});

test('CLI write failure does not report success', async () => {
  const mock = harness();
  mock.io.write = async () => { throw new Error('Read-only disk'); };
  const result = await runReceiptCli(['release.json', '--surface', 'mapone',
    '--output', 'out.json'], mock.io);
  assert.equal(result, 2);
  assert.equal(mock.printed.length, 0);
});

test('parser keeps stable expected options', () => {
  assert.deepEqual(parseArgs(['in.json', '--all', '--gate', '--language', 'fr']), {
    file: 'in.json', surface: null, language: 'fr', format: 'text', output: null,
    all: true, gate: true,
  });
});
