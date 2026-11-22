import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { auditSchedules, type AuditReport } from './audit.ts';
import { runCli } from './cli.ts';
import { describeFinding, formatReport } from './report.ts';
import { tripIssueCodes } from './trips.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const source = {
  sourceId: 'test-feed', sourceName: 'Test feed', licence: 'Fixture licence',
  licenceUrl: 'https://example.invalid/licence', retrieved: '2024-05-11',
  inWebPack: true, verificationTier: 0,
};

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'local-schedule-audit-'));
  dirs.push(dir);
  const manifest = join(dir, 'manifest.json');
  const parts: Array<Record<string, unknown>> = [];
  const save = () => writeFileSync(manifest, JSON.stringify({ version: 1, sources: [source], parts }));
  function store(kind: 'calendar' | 'trips', payload: string, tripCount: number, region = 'test-region') {
    const sequence = parts.filter(p => p.kind === 'trips' && p.regionId === region).length;
    const file = kind === 'calendar' ? 'calendar.json.gz' : 'trips-' + String(sequence).padStart(4, '0') + '.ndjson.gz';
    const path = region + '/' + source.sourceId + '/' + file;
    const destination = join(dir, path);
    mkdirSync(dirname(destination), { recursive: true });
    const bytes = gzipSync(payload);
    writeFileSync(destination, bytes);
    parts.push({
      kind, sourceId: source.sourceId, regionId: region, path, bytes: bytes.length, tripCount,
      sha256: createHash('sha256').update(bytes).digest('hex'), placement: 'git',
      feedStart: '20240510', feedEnd: '20240512', licence: source.licence,
      licenceUrl: source.licenceUrl, retrieved: source.retrieved,
    });
    save();
    return destination;
  }
  const calendar = {
    sourceId: source.sourceId, sourceName: source.sourceName, agency: [],
    routes: [{ id: 'R', shortName: 'R', longName: '', type: '3' }],
    stops: [{ id: 'S', name: 'Sample', lat: 0, lon: 0, wheelchairBoarding: 'UNKNOWN' }],
    calendar: [],
    calendarDates: [{ serviceId: 'D', date: '20240512', exceptionType: '1' }],
  };
  const trip = {
    id: 'T', routeId: 'R', serviceId: 'D', headsign: '', wheelchairAccessible: 'UNKNOWN',
    stopTimes: [{ sequence: 1, stopId: 'S', arrival: '24:00:00', departure: '24:02:00' }],
  };
  const options = { packRoot: dir, manifest };
  const args = ['--pack-root', dir, '--manifest', manifest];
  return { store, calendar, trip, options, args, parts, save };
}

async function invoke(args: readonly string[]) {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    stdout: text => { stdout += text; },
    stderr: text => { stderr += text; },
  });
  return { code, stdout, stderr };
}

describe('reading and reporting one auditable snapshot', () => {
  it('counts all findings when the retained example list is empty', async () => {
    const f = setup();
    const calendar = f.store('calendar', JSON.stringify(f.calendar), 0);
    f.store('trips', [JSON.stringify(f.trip), JSON.stringify(f.trip)].join('\n'), 2);
    rmSync(calendar);
    const report = await auditSchedules({ ...f.options, maxExamples: 0 });
    expect(report.status).toBe('invalid');
    expect(report.findings).toEqual({
      errors: 1, warnings: 3, examples: [], omitted: 4,
      counts: [
        { code: 'file.missing', severity: 'warning', count: 1 },
        { code: 'trip.catalog-unavailable', severity: 'warning', count: 2 },
        { code: 'trip.duplicate-id', severity: 'error', count: 1 },
      ],
    });
    expect(report.totals).toMatchObject({
      missingParts: 1, decodedParts: 1, rowsWithErrors: 1,
      rowsWithWarnings: 2, duplicateTripIds: 1, declaredTripRows: 2, decodedRows: 2,
    });
    expect(report.groups[0]?.parts[1]).toMatchObject({ outcome: 'decoded', errors: 1, warnings: 2 });
  });

  it('decodes a trip shard even when its calendar cannot be read', async () => {
    const f = setup();
    const calendar = f.store('calendar', JSON.stringify(f.calendar), 0);
    f.store('trips', JSON.stringify(f.trip), 1);
    rmSync(calendar);
    const result = await invoke([...f.args, '--format', 'json', '--lang', 'fr']);
    expect(result.code).toBe(3);
    expect(result.stderr).toBe('');
    const report: AuditReport = JSON.parse(result.stdout);
    expect(report.status).toBe('incomplete');
    expect(report.findings.examples.map(issue => issue.code)).toEqual(['file.missing', 'trip.catalog-unavailable']);
    expect(report.totals.unknownWheelchairTrips).toBe(1);
  });

  it('checks the entire manifest before applying a region or source filter', async () => {
    const f = setup();
    for (const region of ['one', 'two']) {
      f.store('calendar', JSON.stringify(f.calendar), 0, region);
      f.store('trips', JSON.stringify(f.trip), 1, region);
    }
    f.parts[3]!.licence = 'Different fixture licence';
    f.save();
    const filtered = await auditSchedules({ ...f.options, region: 'one', source: source.sourceId });
    expect(filtered.status).toBe('invalid');
    expect(filtered.groups.map(g => [g.regionId, g.status])).toEqual([['one', 'clean']]);
    expect(filtered.totals).toMatchObject({ selectedParts: 2, decodedParts: 2, decodedRows: 1 });
    expect(filtered.findings.examples[0]?.at).toContain('parts[3]');
    expect(filtered.manifest.declaredParts).toBe(4);
  });

  it('uses incomplete for a selection that has no matching evidence', async () => {
    const f = setup();
    f.store('calendar', JSON.stringify(f.calendar), 0);
    f.store('trips', JSON.stringify(f.trip), 1);
    const args = [...f.args, '--region', 'empty', '--format', 'json'];
    const response = await invoke(args);
    expect(response.code).toBe(3);
    const report: AuditReport = JSON.parse(response.stdout);
    expect(report.groups).toEqual([]);
    expect(report.manifest).toMatchObject({ declaredParts: 2, eligibleGroups: 1 });
    expect(report.findings.counts).toEqual([{ code: 'selection.empty', count: 1, severity: 'warning' }]);
    expect(report.selection).toEqual({ source: null, region: 'empty' });
  });

  it('keeps the malformed calendar location attached to its own part number', async () => {
    const f = setup();
    f.store('trips', JSON.stringify({ ...f.trip, stopTimes: [] }), 1);
    f.store('calendar', JSON.stringify({ ...f.calendar, sourceId: 'different' }), 0);
    const input = readFileSync(f.options.manifest);
    const report = await auditSchedules(f.options);
    expect(report.status).toBe('invalid');
    expect(report.groups[0]?.parts.map(part => part.index)).toEqual([1, 0]);
    expect(report.findings.examples).toContainEqual({ code: 'CAL_SOURCE', at: 'parts[1]/sourceId', severity: 'error' });
    expect(report.findings.examples).toContainEqual({ code: 'trip.stop-list', at: 'parts[0].rows[0].stopTimes', severity: 'error' });
    expect(report.totals).toMatchObject({ decodedParts: 2, rowsWithErrors: 1 });
    expect(readFileSync(f.options.manifest)).toEqual(input);
  });

  it('keeps errors in an unreadable manifest distinct from absent declared shards', async () => {
    const f = setup();
    const result = await invoke([...f.args, '--format', 'json']);
    expect(result.code).toBe(1);
    const report: AuditReport = JSON.parse(result.stdout);
    expect(report.findings.examples).toEqual([{ code: 'file.missing', at: 'manifest', severity: 'error' }]);
    expect(report.totals.missingParts).toBe(0);
    expect(result.stdout).not.toContain(f.options.packRoot);
    writeFileSync(f.options.manifest, '{');
    expect((await auditSchedules(f.options)).findings.examples[0]?.code).toBe('file.json');
  });
});

describe('bilingual command line', () => {
  it('renders help and usage errors without opening a manifest', async () => {
    const english = await invoke(['--help']);
    expect(english.code).toBe(0);
    expect(english.stdout).toContain('--release-root');
    const french = await invoke(['--help', '--lang', 'fr']);
    expect(french.stdout).toContain('Codes de sortie\u00a0:');
    expect(french.stderr).toBe('');
    const invalid = await invoke(['--lang', 'fr', '--max-examples', '-4']);
    expect(invalid).toEqual({ code: 2, stderr: 'Arguments invalides. Consultez --help.\n', stdout: '' });
  });

  it.each([
    ['--format', 'xml'], ['--region'], ['--manifest', '--lang'], ['--source', 'bad\n'],
    ['--foo', 'bar'], ['--help', '--help'], ['--max-examples', '1001'],
    ['--lang', 'en', '--lang', 'fr'], ['--max-examples', '1.5'], ['--pack-root', ''],
  ])('rejects invalid or ambiguous arguments %j', async (...args) => {
    const result = await invoke(args);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.endsWith('--help.\n')).toBe(true);
  });

  it('distinguishes a review warning from an invalid row and a clean unknown field', async () => {
    const f = setup();
    f.store('calendar', JSON.stringify(f.calendar), 0);
    f.store('trips', JSON.stringify(f.trip), 1);
    expect((await invoke(f.args)).code).toBe(0);
    f.parts[0]!.feedStart = f.parts[1]!.feedStart = '20240509';
    f.parts[0]!.feedEnd = f.parts[1]!.feedEnd = '20240510';
    f.save();
    const review = await invoke([...f.args, '--lang', 'fr']);
    expect(review.code).toBe(4);
    expect(review.stdout).toContain('Résultat\u00a0: Examen requis');
    expect(review.stdout).toContain('Niveau de vérification\u00a0: 0');
    expect(review.stdout).toContain('Le calendrier ne prévoit aucun jour actif');
    f.parts[1]!.tripCount = 2;
    f.save();
    expect((await invoke(f.args)).code).toBe(1);
  });

  it('uses stable JSON across languages and hides upstream row values in both formats', async () => {
    const f = setup();
    f.store('calendar', JSON.stringify(f.calendar), 0);
    f.store('trips', JSON.stringify({ ...f.trip, routeId: 'private-fixture-label', headsign: 'raw-fixture-value' }), 1);
    const en = await invoke([...f.args, '--format', 'json']);
    const fr = await invoke([...f.args, '--format', 'json', '--lang', 'fr']);
    expect(en.stdout).toBe(fr.stdout);
    const report: AuditReport = JSON.parse(en.stdout);
    for (const rendered of [en.stdout, formatReport(report, 'fr'), formatReport(report, 'en')]) {
      expect(rendered).not.toContain('raw-fixture-value');
      expect(rendered).not.toContain('private-fixture-label');
    }
    expect(formatReport(report, 'fr')).not.toMatch(/(?<!\u00a0)[:?!]/u);
    for (const code of tripIssueCodes) {
      expect(describeFinding(code, 'fr')).not.toBe(describeFinding(code, 'en'));
      expect(describeFinding(code, 'en')).not.toBe('Unrecognized finding.');
    }
    expect(describeFinding('toString', 'fr')).toBe('Constat non reconnu.');
  });

  it('works through the Node entry point from outside the repository', () => {
    const f = setup();
    f.store('calendar', JSON.stringify(f.calendar), 0);
    f.store('trips', JSON.stringify(f.trip), 1);
    const entry = fileURLToPath(new URL('./cli.ts', import.meta.url));
    const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
    const child = spawnSync(process.execPath, ['--import', loader, entry, ...f.args, '--format', 'json'], {
      cwd: f.options.packRoot, encoding: 'utf8', env: { ...process.env, NODE_USE_ENV_PROXY: '0' },
    });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout).totals.decodedRows).toBe(1);
  });
});
