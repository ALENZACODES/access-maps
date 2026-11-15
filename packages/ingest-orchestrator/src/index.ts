import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const ALLOWED_LICENCES = ['ODbL', 'OGL-Ontario', 'OGL-Canada', 'CC-BY', 'CC0'] as const;
export type Licence = (typeof ALLOWED_LICENCES)[number];
export type SourceStatus = 'confirmed' | 'held' | 'rejected';

export interface RegistryEntry {
  sourceId: string;
  name: string;
  licence: string;
  licenceUrl: string;
  shareAlike: boolean;
  status: SourceStatus;
  heldReason?: string;
  cadenceHint?: string;
  importerModule?: string;
  /** Dated human confirmation of the licence (YYYY-MM-DD). */
  licenceConfirmedAt?: string;
  /** Operator's licence-evidence note; never inferred by this package. */
  licenceNote?: string;
}

export interface ImportCounts {
  read: number;
  emitted: number;
  held: number;
}
export type ImportHook = (source: Readonly<RegistryEntry>) => Promise<ImportCounts> | ImportCounts;
export type ImportHooks = Record<string, ImportHook>;

export interface SourceReport {
  sourceId: string;
  name: string;
  licence: string;
  licenceUrl: string;
  shareAlike: boolean;
  status: 'completed' | 'skipped-held' | 'skipped-rejected' | 'skipped-licence' | 'error';
  counts: ImportCounts;
  heldReason?: string;
  error?: string;
}
export interface RunReport {
  startedAt: string;
  finishedAt: string;
  sources: SourceReport[];
  totals: ImportCounts;
  skippedHeld: number;
  errors: string[];
}
export interface RunOptions {
  /** Parent folder for reports/; defaults to tmp. */
  outputDir?: string;
  /** Test injection; called once for each timestamp. */
  now?: () => Date;
}

const EMPTY = (): ImportCounts => ({ read: 0, emitted: 0, held: 0 });
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function licenceHoldReason(entry: RegistryEntry): string | undefined {
  if (entry.status !== 'confirmed') return entry.heldReason || `Source status: ${entry.status}`;
  if (!ALLOWED_LICENCES.some((licence) => licence === entry.licence)) return 'Licence is not allowlisted';
  if (!/^https:\/\//.test(entry.licenceUrl)) return 'Licence evidence URL is missing or invalid';
  if (!entry.licenceConfirmedAt || !ISO_DATE.test(entry.licenceConfirmedAt) ||
      Number.isNaN(Date.parse(`${entry.licenceConfirmedAt}T00:00:00Z`)) ||
      !entry.licenceNote?.trim()) return 'Dated human licence confirmation is missing';
  if (entry.shareAlike !== (entry.licence === 'ODbL')) return 'Share-alike flag disagrees with licence';
  return undefined;
}

function validCounts(value: ImportCounts): boolean {
  return value != null && [value.read, value.emitted, value.held].every(
    (v) => Number.isSafeInteger(v) && v >= 0,
  ) && value.emitted + value.held <= value.read;
}

/** A caller supplies hooks; this package never fetches, publishes or uploads anything. */
export async function run(
  registry: readonly RegistryEntry[], hooks: ImportHooks, opts: RunOptions = {},
): Promise<RunReport> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const sources: SourceReport[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const source of registry) {
    const item: SourceReport = {
      sourceId: source.sourceId,
      name: source.name,
      licence: source.licence,
      licenceUrl: source.licenceUrl,
      shareAlike: source.shareAlike,
      status: 'skipped-held',
      counts: EMPTY(),
    };
    sources.push(item);
    if (!source.sourceId || seen.has(source.sourceId)) {
      item.status = 'error';
      item.error = `Empty or duplicate sourceId: ${source.sourceId}`;
      errors.push(item.error);
      continue;
    }
    seen.add(source.sourceId);
    const reason = licenceHoldReason(source);
    if (source.status !== 'confirmed') {
      item.status = source.status === 'rejected' ? 'skipped-rejected' : 'skipped-held';
      item.heldReason = reason;
      continue;
    }
    if (reason) {
      item.status = 'skipped-licence';
      item.heldReason = reason;
      continue;
    }
    const hook = hooks[source.sourceId];
    if (!hook) {
      item.status = 'error';
      item.error = `No importer hook registered for ${source.sourceId}`;
      errors.push(item.error);
      continue;
    }
    try {
      const counts = await hook(Object.freeze({ ...source }));
      if (!validCounts(counts)) throw new Error('Importer returned invalid counts');
      item.counts = { ...counts };
      item.status = 'completed';
    } catch (cause) {
      item.status = 'error';
      item.error = `${source.sourceId}: ${cause instanceof Error ? cause.message : String(cause)}`;
      errors.push(item.error);
    }
  }
  const totals = sources.reduce<ImportCounts>((sum, source) => ({
    read: sum.read + source.counts.read,
    emitted: sum.emitted + source.counts.emitted,
    held: sum.held + source.counts.held,
  }), EMPTY());
  const report: RunReport = {
    startedAt,
    finishedAt: now().toISOString(),
    sources,
    totals,
    skippedHeld: sources.filter((s) => s.status.startsWith('skipped-')).length,
    errors,
  };
  const filename = `ingest-${startedAt.replace(/:/g, '-')}.json`;
  const folder = join(opts.outputDir ?? 'tmp', 'reports');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, filename), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  return report;
}

export function plan(registry: readonly RegistryEntry[]): SourceReport[] {
  return registry.map((entry) => {
    const reason = licenceHoldReason(entry);
    const status = entry.status === 'rejected' ? 'skipped-rejected'
      : entry.status !== 'confirmed' ? 'skipped-held'
        : reason ? 'skipped-licence' : 'completed';
    return {
      sourceId: entry.sourceId, name: entry.name, licence: entry.licence,
      licenceUrl: entry.licenceUrl, shareAlike: entry.shareAlike,
      status, counts: EMPTY(), ...(reason ? { heldReason: reason } : {}),
    };
  });
}
