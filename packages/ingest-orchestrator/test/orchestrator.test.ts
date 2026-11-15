import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { licenceHoldReason, plan, run, type RegistryEntry } from '../src/index.js';
import { main, parseArgs } from '../src/cli.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const temp = async () => {
  const path = await mkdtemp(join(tmpdir(), 'ingest-test-'));
  dirs.push(path);
  return path;
};
const confirmed = (id: string): RegistryEntry => ({
  sourceId: id, name: id, licence: 'CC0', licenceUrl: 'https://example.org/cc0',
  shareAlike: false, status: 'confirmed', licenceConfirmedAt: '2026-11-15',
  licenceNote: 'Operator checked the licence on the stated date',
});
const clock = () => new Date('2026-11-15T12:00:00.000Z');

describe('licence gates', () => {
  it('never invokes held, rejected or unconfirmed-licence importers', async () => {
    const outputDir = await temp();
    const hook = vi.fn(() => ({ read: 2, emitted: 2, held: 0 }));
    const held = { ...confirmed('go-transit'), status: 'held' as const };
    const rejected = { ...confirmed('bad-feed'), status: 'rejected' as const };
    const invalid = { ...confirmed('unlicensed'), licence: 'proprietary' };
    const withoutNote = { ...confirmed('missing-evidence'), licenceNote: '' };
    const report = await run([held, rejected, invalid, withoutNote], {
      'go-transit': hook, 'bad-feed': hook, unlicensed: hook, 'missing-evidence': hook,
    }, { outputDir, now: clock });
    expect(hook).not.toHaveBeenCalled();
    expect(report.totals.emitted).toBe(0);
    expect(report.skippedHeld).toBe(4);
    expect(report.sources.map((s) => s.counts.emitted)).toEqual([0, 0, 0, 0]);
  });

  it('requires a dated note, HTTPS evidence and ODbL share-alike', () => {
    expect(licenceHoldReason({ ...confirmed('a'), licence: 'ODbL' })).toMatch(/Share-alike/);
    expect(licenceHoldReason({ ...confirmed('a'), licenceUrl: '' })).toMatch(/URL/);
    expect(licenceHoldReason({ ...confirmed('a'), licenceConfirmedAt: '' })).toMatch(/Dated/);
    expect(licenceHoldReason({ ...confirmed('a'), licence: 'OGL-Ontario' })).toBeUndefined();
    expect(licenceHoldReason({ ...confirmed('a'), licence: 'OGL-Canada' })).toBeUndefined();
    expect(licenceHoldReason({ ...confirmed('a'), licence: 'CC-BY' })).toBeUndefined();
  });
});

describe('manual runs', () => {
  it('writes a deterministic report with per-source counts, skips and errors', async () => {
    const outputDir = await temp();
    const registry = [confirmed('ok'), confirmed('broken'), {
      ...confirmed('held'), status: 'held' as const, heldReason: 'Licence unknown',
    }];
    const report = await run(registry, {
      ok: () => ({ read: 7, emitted: 5, held: 2 }),
      broken: () => { throw new Error('synthetic failure'); },
    }, { outputDir, now: clock });
    expect(report.startedAt).toBe('2026-11-15T12:00:00.000Z');
    expect(report.totals).toEqual({ read: 7, emitted: 5, held: 2 });
    expect(report.errors).toEqual(['broken: synthetic failure']);
    expect(report.sources[2]?.status).toBe('skipped-held');
    const files = await readdir(join(outputDir, 'reports'));
    expect(files).toEqual(['ingest-2026-11-15T12-00-00.000Z.json']);
    const reportFile = files[0];
    expect(reportFile).toBeDefined();
    expect(JSON.parse(await readFile(join(outputDir, 'reports', reportFile!), 'utf8'))).toEqual(report);
  });
  it('rejects bad counts and missing hooks instead of fabricating records', async () => {
    const report = await run([confirmed('bad'), confirmed('missing')], {
      bad: () => ({ read: 0, emitted: 1, held: 0 }),
    }, { outputDir: await temp(), now: clock });
    expect(report.errors).toHaveLength(2);
    expect(report.totals.emitted).toBe(0);
  });
  it('does not silently import duplicate IDs', async () => {
    const hook = vi.fn(() => ({ read: 1, emitted: 1, held: 0 }));
    const report = await run([confirmed('once'), confirmed('once')], { once: hook }, {
      outputDir: await temp(), now: clock,
    });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(report.errors).toHaveLength(1);
  });
});

describe('CLI', () => {
  it.each(['--schedule', '--schedule=daily', '--cron', '--crontab', '--interval=30', '--poll'])('refuses %s', (flag) => {
    expect(() => parseArgs(['registry.json', flag])).toThrow(/forbidden/);
  });
  it('dry-run plans held sources without invoking hooks or writing reports', () => {
    expect(plan([{ ...confirmed('go-transit'), status: 'held' }])[0]?.status).toBe('skipped-held');
    expect(parseArgs(['registry.json', '--dry-run']).dryRun).toBe(true);
  });
  it('rejects absent registry input', async () => {
    await expect(main([])).rejects.toThrow(/Usage/);
  });
});
