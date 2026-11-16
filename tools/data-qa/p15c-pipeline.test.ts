import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { auditOfflineBundle, renderAuditJson, renderAuditText } from './p15c-pipeline.ts';
import type { AuditCode, AuditOptions } from './p15c-pipeline.ts';

const roots: string[] = [];
const TODAY = '2026-11-15';
const YESTERDAY = '2026-11-14';
const source = { source: 'Ontario municipality', licence: 'OGL-ON-1.0', observedOn: YESTERDAY };
const record = {
  ...source, id: 'entry-1', accessibility: 'UNKNOWN', silo: 'open', lineage: [{ ...source }],
};

function hash(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

async function temp(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'p15c-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

interface FixtureOptions {
  readonly assetKind?: 'records' | 'text' | 'tiles';
  readonly assetData?: string;
  readonly regionCount?: number;
}

async function fixture(config: FixtureOptions = {}): Promise<{
  root: string;
  manifest: Record<string, unknown>;
  asset: Record<string, unknown>;
  options: AuditOptions;
  save: () => Promise<void>;
}> {
  const root = await temp();
  await mkdir(join(root, 'region'));
  const assetData = config.assetData ?? JSON.stringify([record]);
  await writeFile(join(root, 'region', 'records.json'), assetData);
  const asset: Record<string, unknown> = {
    id: 'a-1', path: 'region/records.json', kind: config.assetKind ?? 'records',
    bytes: Buffer.byteLength(assetData), sha256: hash(assetData), silo: 'open',
    ...source, lineage: [{ ...source }],
  };
  const regions = Array.from({ length: config.regionCount ?? 1 }, (_, i) => ({
    id: `r-${i}`, cells: [{ id: 'c-1', status: 'PRESENT', assetId: 'a-1' },
      { id: 'c-2', status: 'UNKNOWN' }],
  }));
  const manifest: Record<string, unknown> = {
    schemaVersion: 1, generatedOn: TODAY, assets: [asset], regions,
  };
  const save = async (): Promise<void> => {
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  };
  const options: AuditOptions = { root, manifestPath: 'manifest.json', asOf: TODAY, maxAgeDays: 30 };
  await save();
  return { root, manifest, asset, options, save };
}

async function codes(options: AuditOptions): Promise<AuditCode[]> {
  return (await auditOfflineBundle(options)).issues.map(issue => issue.code);
}

test('valid package reads offline files, counts UNKNOWN, and renders both languages', async () => {
  const f = await fixture({ regionCount: 2 });
  const before = await readFile(join(f.root, 'manifest.json'), 'utf8');
  const result = await auditOfflineBundle(f.options);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.deepEqual(result.totals, {
    assets: 1, regions: 2, cellsPresent: 2, cellsUnknown: 2,
    bytesRead: Buffer.byteLength(JSON.stringify([record])),
  });
  assert.equal((await readFile(join(f.root, 'manifest.json'), 'utf8')), before);
  assert.deepEqual(JSON.parse(renderAuditJson(result)), result);
  assert.match(renderAuditText(result, 'en'), /PASS/);
  assert.match(renderAuditText(result, 'fr'), /RÉUSSI/);
});

test('reports contain localized descriptions and stable order', async () => {
  const f = await fixture();
  f.asset.sha256 = '0'.repeat(64);
  (f.manifest.regions as Array<{ cells: unknown[] }>)[0]?.cells.push({ id: 'c-3', status: 'PRESENT', assetId: 'absent' });
  await f.save();
  const first = await auditOfflineBundle(f.options);
  const second = await auditOfflineBundle(f.options);
  assert.deepEqual(first, second);
  assert.equal(first.ok, false);
  assert.ok(first.issues.every(issue => issue.en.length > 0 && issue.fr.length > 0));
  assert.match(renderAuditText(first, 'fr'), /BLOQUÉ/);
  assert.ok(first.issues.some(issue => issue.code === 'ASSET_HASH'));
  assert.ok(first.issues.some(issue => issue.code === 'CELL_ASSET'));
});

test('rejects mismatched hashes without interpreting record payload', async () => {
  const f = await fixture();
  f.asset.sha256 = 'a'.repeat(64);
  await f.save();
  assert.deepEqual(await codes(f.options), ['ASSET_HASH']);
});

test('rejects file size mismatch and never reports it as present content', async () => {
  const f = await fixture();
  f.asset.bytes = 1;
  await f.save();
  assert.ok((await codes(f.options)).includes('ASSET_SIZE'));
});

test('rejects declared asset larger than byte limit before reading', async () => {
  const f = await fixture();
  assert.ok((await codes({ ...f.options, maxAssetBytes: 1 })).includes('ASSET_SIZE'));
});

test('rejects cumulative file reads over the configured budget', async () => {
  const f = await fixture();
  assert.ok((await codes({ ...f.options, maxTotalBytes: 1 })).includes('TOTAL_BYTES'));
});

test('blocks missing asset, preserving UNKNOWN coverage counts', async () => {
  const f = await fixture();
  await rm(join(f.root, 'region', 'records.json'));
  const result = await auditOfflineBundle(f.options);
  assert.equal(result.ok, false);
  assert.equal(result.totals.cellsUnknown, 1);
  assert.ok(result.issues.some(issue => issue.code === 'ASSET_MISSING'));
});

test('rejects URL paths, path traversal, drive-like paths and absolute paths', async () => {
  for (const value of ['https://tiles.example/map', '../escape', '/tmp/outside',
    'C:/temp/asset', 'region//records.json', './region/records.json']) {
    const f = await fixture();
    f.asset.path = value;
    await f.save();
    assert.ok((await codes(f.options)).includes('ASSET_SCHEMA'), value);
  }
});

test('rejects a manifest path outside the local root', async () => {
  const f = await fixture();
  assert.ok((await codes({ ...f.options, manifestPath: '../manifest.json' })).includes('ASSET_PATH'));
});

test('rejects symlink leaf and symlinked parent directory', async () => {
  const f = await fixture();
  await symlink('region/records.json', join(f.root, 'alias'));
  f.asset.path = 'alias';
  await f.save();
  assert.ok((await codes(f.options)).includes('ASSET_SYMLINK'));
  const other = await fixture();
  await symlink('region', join(other.root, 'alias'));
  other.asset.path = 'alias/records.json';
  await other.save();
  assert.ok((await codes(other.options)).includes('ASSET_SYMLINK'));
});

test('rejects invalid JSON and malformed Unicode in the manifest', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'manifest.json'), '{broken');
  assert.ok((await codes(f.options)).includes('MANIFEST_JSON'));
  await writeFile(join(f.root, 'manifest.json'), Buffer.from([0xff]));
  assert.ok((await codes(f.options)).includes('MANIFEST_JSON'));
});

test('rejects overly large manifest before parsing it', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'manifest.json'), ' '.repeat(1024 * 1024 + 1));
  assert.ok((await codes(f.options)).includes('INPUT_LIMIT'));
});

test('rejects future or malformed manifest date', async () => {
  const f = await fixture();
  f.manifest.generatedOn = '2026-11-16';
  await f.save();
  assert.ok((await codes(f.options)).includes('MANIFEST_DATE'));
  f.manifest.generatedOn = '2026-02-30';
  await f.save();
  assert.ok((await codes(f.options)).includes('MANIFEST_DATE'));
});

test('rejects unrecognized top-level fields or schema version', async () => {
  const f = await fixture();
  f.manifest.unknownKey = 'not allowed';
  await f.save();
  assert.ok((await codes(f.options)).includes('MANIFEST_FIELD'));
  delete f.manifest.unknownKey;
  f.manifest.schemaVersion = 2;
  await f.save();
  assert.ok((await codes(f.options)).includes('MANIFEST_FIELD'));
});

test('held feed is excluded even if it appears only in upstream lineage', async () => {
  const f = await fixture();
  f.asset.lineage = [{ ...source }, { source: 'Mi-Way', licence: 'OGL-ON-1.0', observedOn: YESTERDAY }];
  await f.save();
  assert.ok((await codes(f.options)).includes('ASSET_HELD'));
});

test('ODbL is rejected in ordinary export, including relabelled upstream data', async () => {
  const f = await fixture();
  f.asset.lineage = [{ ...source }, { source: 'OSM', licence: 'ODbL-1.0', observedOn: YESTERDAY }];
  await f.save();
  assert.ok((await codes(f.options)).includes('ASSET_SILO'));
});

test('ODbL asset must retain its licence, silo and recorded lineage', async () => {
  const f = await fixture();
  f.asset.silo = 'odbl';
  await f.save();
  assert.ok((await codes(f.options)).includes('ASSET_SILO'));
  f.asset.licence = 'ODbL-1.0';
  await f.save();
  assert.ok((await codes(f.options)).includes('ASSET_LINEAGE'));
});

test('fails on stale asset and stale provenance under explicit day policy', async () => {
  const f = await fixture();
  f.asset.observedOn = '2026-09-01';
  await f.save();
  assert.ok((await codes(f.options)).includes('ASSET_STALE'));
  f.asset.observedOn = YESTERDAY;
  f.asset.lineage = [{ source: 'history', licence: 'OGL-ON-1.0', observedOn: '2026-09-01' }, { ...source }];
  await f.save();
  assert.ok((await codes(f.options)).includes('ASSET_STALE'));
});

test('duplicate asset IDs and paths are blocked', async () => {
  const f = await fixture();
  (f.manifest.assets as unknown[]).push({ ...f.asset });
  await f.save();
  assert.ok((await codes(f.options)).includes('ASSET_DUPLICATE'));
});

test('duplicate region IDs and duplicate cell IDs are blocked', async () => {
  const f = await fixture();
  const regions = f.manifest.regions as Array<{ id: string; cells: unknown[] }>;
  regions.push({ id: regions[0]!.id, cells: [] });
  regions[0]!.cells.push({ id: 'c-1', status: 'UNKNOWN' });
  await f.save();
  const found = await codes(f.options);
  assert.ok(found.includes('REGION_DUPLICATE'));
  assert.ok(found.includes('CELL_DUPLICATE'));
});

test('a PRESENT cell needs a known, local asset ID', async () => {
  const f = await fixture();
  (f.manifest.regions as Array<{ cells: unknown[] }>)[0]!.cells.push({
    id: 'c-4', status: 'PRESENT', assetId: 'no-such-asset',
  });
  await f.save();
  assert.ok((await codes(f.options)).includes('CELL_ASSET'));
});

test('UNKNOWN cell with an asset reference is rejected, not promoted', async () => {
  const f = await fixture();
  (f.manifest.regions as Array<{ cells: unknown[] }>)[0]!.cells.push({
    id: 'c-4', status: 'UNKNOWN', assetId: 'a-1',
  });
  await f.save();
  assert.ok((await codes(f.options)).includes('REGION_SCHEMA'));
});

test('unreferenced asset raises a notice but does not imply accessibility', async () => {
  const f = await fixture();
  (f.manifest.regions as Array<{ cells: unknown[] }>)[0]!.cells = [
    { id: 'c-2', status: 'UNKNOWN' },
  ];
  await f.save();
  const result = await auditOfflineBundle(f.options);
  assert.equal(result.ok, true);
  assert.equal(result.totals.cellsPresent, 0);
  assert.equal(result.totals.cellsUnknown, 1);
  assert.ok(result.issues.some(issue => issue.code === 'CELL_UNREFERENCED' && issue.severity === 'NOTICE'));
});

test('non-record asset can be audited by bytes and provenance without network', async () => {
  const f = await fixture({ assetKind: 'tiles', assetData: 'local vector bytes' });
  assert.equal((await auditOfflineBundle(f.options)).ok, true);
});

test('corrupted records fail strict content schema, even with matching hash', async () => {
  const f = await fixture({ assetData: JSON.stringify([{ ...record, accessibility: 'YES', unexpected: true }]) });
  assert.ok((await codes(f.options)).includes('ASSET_CONTENT'));
});

test('record lineage cannot omit a contributing source from manifest', async () => {
  const other = { source: 'Other municipality', licence: 'CC-BY-4.0', observedOn: TODAY };
  const f = await fixture({ assetData: JSON.stringify([{ ...record, lineage: [source, other] }]) });
  assert.ok((await codes(f.options)).includes('ASSET_METADATA'));
});

test('source record lineage matches manifest when every contributor is declared', async () => {
  const other = { source: 'Other municipality', licence: 'CC-BY-4.0', observedOn: TODAY };
  const f = await fixture({ assetData: JSON.stringify([{ ...record, lineage: [source, other] }]) });
  f.asset.lineage = [source, other];
  await f.save();
  assert.equal((await auditOfflineBundle(f.options)).ok, true);
});

test('invalid CLI configuration values are rejected before file access', async () => {
  const f = await fixture();
  await assert.rejects(auditOfflineBundle({ ...f.options, asOf: '2026-02-30' }), RangeError);
  await assert.rejects(auditOfflineBundle({ ...f.options, maxAgeDays: -1 }), RangeError);
  await assert.rejects(auditOfflineBundle({ ...f.options, maxTotalBytes: 0 }), RangeError);
});


test('missing licence is explicitly diagnosed even when the asset schema fails', async () => {
  const f = await fixture();
  delete f.asset.licence;
  await f.save();
  const found = await codes(f.options);
  assert.ok(found.includes('ASSET_SCHEMA'));
  assert.ok(found.includes('ASSET_LICENCE'));
});

test('bad contributing licence is explicitly diagnosed by lineage position', async () => {
  const f = await fixture();
  f.asset.lineage = [{ source: 'upstream', licence: 'closed', observedOn: YESTERDAY }];
  await f.save();
  const result = await auditOfflineBundle(f.options);
  assert.ok(result.issues.some(issue => issue.code === 'ASSET_LICENCE' &&
    issue.path.includes('lineage[0]')));
});
