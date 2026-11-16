/** Cross-release offline inventory gate. No content is loaded from the network. */
import { OPEN_LICENCES } from './index.js';

export type ReleaseCode =
  | 'INPUT' | 'DATE' | 'DUPLICATE' | 'SOURCE' | 'LICENCE' | 'HELD'
  | 'LINEAGE' | 'SILO' | 'STATE' | 'REMOVED_REGION' | 'REMOVED_CELL'
  | 'REMOVED_ASSET' | 'REGRESSION_UNKNOWN' | 'STATE_WITHOUT_EVIDENCE'
  | 'SOURCE_WITHOUT_EVIDENCE' | 'LICENCE_CHANGE' | 'ODBL_MOVED'
  | 'AGE_REGRESSION' | 'UNDECLARED_ASSET' | 'ASSET_ID_REUSED'
  | 'ASSET_WITHOUT_CELL' | 'BUDGET' | 'CHURN';
export type Level = 'ERROR' | 'NOTICE';
export type KnownState = 'YES' | 'NO' | 'UNKNOWN';
export type ExportSilo = 'open' | 'odbl';

export interface ReleaseFinding {
  readonly code: ReleaseCode;
  readonly level: Level;
  readonly path: string;
  readonly en: string;
  readonly fr: string;
}
export interface Provenance {
  readonly source: string;
  readonly licence: string;
  readonly observedOn: string;
}
export interface ReleaseAsset extends Provenance {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly silo: ExportSilo;
  readonly lineage: readonly Provenance[];
}
export interface ReleaseCell {
  readonly id: string;
  readonly status: 'PRESENT' | 'UNKNOWN';
  readonly assetId?: string;
}
export interface ReleaseRegion {
  readonly id: string;
  readonly cells: readonly ReleaseCell[];
}
export interface ReleaseSnapshot {
  readonly schemaVersion: 1;
  readonly generatedOn: string;
  readonly assets: readonly ReleaseAsset[];
  readonly regions: readonly ReleaseRegion[];
}
export interface ReleasePolicy {
  readonly asOf: string;
  readonly maxAgeDays: number;
  readonly maxLossOfPresentCells: number;
  readonly maxUnexplainedAssetRemoval: number;
  readonly maxBytes: number;
  readonly allowRemovedRegionIds?: readonly string[];
  readonly allowRemovedCellKeys?: readonly string[];
}
export interface ReleaseSummary {
  readonly previousRegions: number;
  readonly currentRegions: number;
  readonly previousPresent: number;
  readonly currentPresent: number;
  readonly previousUnknown: number;
  readonly currentUnknown: number;
  readonly removedCells: number;
  readonly changedCells: number;
  readonly addedCells: number;
  readonly totalBytes: number;
}
export interface ReleaseReport {
  readonly ok: boolean;
  readonly asOf: string;
  readonly findings: readonly ReleaseFinding[];
  readonly summary: ReleaseSummary;
}

const wording: Record<ReleaseCode, readonly [string, string]> = {
  INPUT: ['Invalid release inventory.', 'L’inventaire de publication est non valide.'],
  DATE: ['A release or observation date is invalid.', 'Une date de publication ou d’observation est non valide.'],
  DUPLICATE: ['An identifier occurs more than once.', 'Un identifiant figure plus d’une fois.'],
  SOURCE: ['A source is missing.', 'Une source est manquante.'],
  LICENCE: ['A licence is missing or not allowed.', 'Une licence est manquante ou non autorisée.'],
  HELD: ['A held feed is present.', 'Un flux retenu est présent.'],
  LINEAGE: ['Source lineage is missing or incomplete.', 'La provenance des sources est absente ou incomplète.'],
  SILO: ['Open and ODbL exports must remain separate.', 'Les exportations ouvertes et ODbL doivent rester distinctes.'],
  STATE: ['Coverage status must remain explicit.', 'L’état de couverture doit rester explicite.'],
  REMOVED_REGION: ['A region disappeared without an explicit allowance.', 'Une région a disparu sans autorisation explicite.'],
  REMOVED_CELL: ['A cell disappeared without an explicit allowance.', 'Une cellule a disparu sans autorisation explicite.'],
  REMOVED_ASSET: ['An asset was removed beyond the configured threshold.', 'Des fichiers ont été retirés au-delà du seuil configuré.'],
  REGRESSION_UNKNOWN: ['Known coverage became UNKNOWN.', 'Une couverture connue est devenue UNKNOWN.'],
  STATE_WITHOUT_EVIDENCE: ['A coverage change lacks new dated source evidence.', 'Un changement de couverture manque de nouvelles sources datées.'],
  SOURCE_WITHOUT_EVIDENCE: ['A source changed without corresponding lineage.', 'Une source a changé sans provenance correspondante.'],
  LICENCE_CHANGE: ['A licence changed without a new source observation.', 'Une licence a changé sans nouvelle observation de source.'],
  ODBL_MOVED: ['An asset crossed the ODbL boundary.', 'Un fichier a franchi la limite ODbL.'],
  AGE_REGRESSION: ['A replacement asset is older than the previous asset.', 'Un fichier de remplacement est plus ancien que le précédent.'],
  UNDECLARED_ASSET: ['A cell refers to an unknown asset.', 'Une cellule renvoie à un fichier inconnu.'],
  ASSET_ID_REUSED: ['An asset identifier was reused for incompatible provenance.', 'Un identifiant de fichier a été réutilisé avec une provenance incompatible.'],
  ASSET_WITHOUT_CELL: ['An asset has no coverage cell.', 'Un fichier n’a aucune cellule de couverture.'],
  BUDGET: ['The offline byte budget is exceeded.', 'Le budget d’octets hors ligne est dépassé.'],
  CHURN: ['Coverage changed beyond the configured threshold.', 'La couverture a changé au-delà du seuil configuré.'],
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function string(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
function dateIndex(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return null;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8));
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const instant = new Date(0);
  instant.setUTCHours(0, 0, 0, 0);
  instant.setUTCFullYear(y, m - 1, d);
  return instant.getUTCFullYear() === y && instant.getUTCMonth() === m - 1 &&
    instant.getUTCDate() === d ? Math.floor(instant.getTime() / 86400000) : null;
}
function isHeld(source: string): boolean {
  return source.toLowerCase().replace(/[^a-z0-9]/g, '').includes('miway');
}
function licensed(value: unknown): value is string {
  return typeof value === 'string' && (OPEN_LICENCES as readonly string[]).includes(value);
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}
function isProvenance(value: unknown): value is Provenance {
  return record(value) && keys(value, ['source', 'licence', 'observedOn']) &&
    string(value.source) && licensed(value.licence) && dateIndex(value.observedOn) !== null;
}
function isAsset(value: unknown): value is ReleaseAsset {
  return record(value) &&
    keys(value, ['id', 'path', 'sha256', 'bytes', 'source', 'licence', 'observedOn', 'silo', 'lineage', 'kind']) &&
    string(value.id) && string(value.path) &&
    typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256) &&
    Number.isSafeInteger(value.bytes) && (value.bytes as number) >= 0 &&
    (value.silo === 'open' || value.silo === 'odbl') &&
    string(value.source) && licensed(value.licence) && dateIndex(value.observedOn) !== null &&
    Array.isArray(value.lineage) && value.lineage.length > 0 && value.lineage.every(isProvenance);
}
function isCell(value: unknown): value is ReleaseCell {
  if (!record(value) || !keys(value, ['id', 'status', 'assetId']) || !string(value.id)) return false;
  if (value.status === 'UNKNOWN') return !Object.hasOwn(value, 'assetId');
  return value.status === 'PRESENT' && string(value.assetId);
}
function isRegion(value: unknown): value is ReleaseRegion {
  return record(value) && keys(value, ['id', 'cells']) && string(value.id) &&
    Array.isArray(value.cells) && value.cells.every(isCell);
}
function isSnapshot(value: unknown): value is ReleaseSnapshot {
  return record(value) && keys(value, ['schemaVersion', 'generatedOn', 'assets', 'regions']) &&
    value.schemaVersion === 1 && dateIndex(value.generatedOn) !== null &&
    Array.isArray(value.assets) && value.assets.every(isAsset) &&
    Array.isArray(value.regions) && value.regions.every(isRegion);
}
function provenanceKey(source: Provenance): string {
  return `${source.source}\0${source.licence}\0${source.observedOn}`;
}
function cellKey(region: string, cell: string): string {
  return `${region}/${cell}`;
}
function countCells(snapshot: ReleaseSnapshot): { present: number; unknown: number } {
  let present = 0;
  let unknown = 0;
  for (const region of snapshot.regions) {
    for (const cell of region.cells) {
      if (cell.status === 'PRESENT') present++;
      else unknown++;
    }
  }
  return { present, unknown };
}
function safePolicy(policy: ReleasePolicy): boolean {
  return dateIndex(policy.asOf) !== null &&
    [policy.maxAgeDays, policy.maxLossOfPresentCells, policy.maxUnexplainedAssetRemoval, policy.maxBytes]
      .every(n => Number.isSafeInteger(n) && n >= 0) &&
    (policy.allowRemovedRegionIds === undefined ||
      policy.allowRemovedRegionIds.every(string)) &&
    (policy.allowRemovedCellKeys === undefined || policy.allowRemovedCellKeys.every(string));
}

/** Compare two complete local package inventories before replacing an offline release. */
export function compareOfflineReleases(
  previous: unknown,
  current: unknown,
  policy: ReleasePolicy,
): ReleaseReport {
  if (!safePolicy(policy)) throw new RangeError('Invalid release policy');
  const findings: ReleaseFinding[] = [];
  const add = (code: ReleaseCode, path: string, level: Level = 'ERROR'): void => {
    const [en, fr] = wording[code];
    findings.push({ code, path, level, en, fr });
  };
  const blank: ReleaseSummary = {
    previousRegions: 0, currentRegions: 0, previousPresent: 0, currentPresent: 0,
    previousUnknown: 0, currentUnknown: 0, removedCells: 0, changedCells: 0,
    addedCells: 0, totalBytes: 0,
  };
  const finish = (summary: ReleaseSummary): ReleaseReport => ({
    ok: !findings.some(item => item.level === 'ERROR'),
    asOf: policy.asOf,
    summary,
    findings: findings.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)),
  });
  if (!isSnapshot(previous)) add('INPUT', 'previous');
  if (!isSnapshot(current)) add('INPUT', 'current');
  if (!isSnapshot(previous) || !isSnapshot(current)) return finish(blank);
  const beforeDay = dateIndex(previous.generatedOn) ?? 0;
  const afterDay = dateIndex(current.generatedOn) ?? 0;
  const asOfDay = dateIndex(policy.asOf) ?? 0;
  if (afterDay < beforeDay || afterDay > asOfDay || beforeDay > asOfDay) add('DATE', 'generatedOn');
  const beforeCount = countCells(previous);
  const afterCount = countCells(current);
  const oldAssets = new Map<string, ReleaseAsset>();
  const newAssets = new Map<string, ReleaseAsset>();
  const oldRegions = new Map<string, ReleaseRegion>();
  const newRegions = new Map<string, ReleaseRegion>();
  const scan = (
    snapshot: ReleaseSnapshot,
    prefix: string,
    assets: Map<string, ReleaseAsset>,
    regions: Map<string, ReleaseRegion>,
  ): void => {
    const assetPaths = new Set<string>();
    for (const [i, asset] of snapshot.assets.entries()) {
      const path = `${prefix}.assets[${i}]`;
      if (assets.has(asset.id) || assetPaths.has(asset.path)) add('DUPLICATE', path);
      assets.set(asset.id, asset);
      assetPaths.add(asset.path);
      const declared = new Set(asset.lineage.map(provenanceKey));
      if (!declared.has(provenanceKey(asset))) add('LINEAGE', path);
      const contributors: Provenance[] = [asset, ...asset.lineage];
      const includesOdbl = contributors.some(item => item.licence === 'ODbL-1.0');
      if ((includesOdbl && (asset.silo !== 'odbl' || asset.licence !== 'ODbL-1.0')) ||
          (!includesOdbl && asset.silo === 'odbl')) add('SILO', path);
      for (const [j, item] of contributors.entries()) {
        const position = j === 0 ? path : `${path}.lineage[${j - 1}]`;
        if (!string(item.source)) add('SOURCE', position);
        if (!licensed(item.licence)) add('LICENCE', position);
        if (isHeld(item.source)) add('HELD', position);
        const day = dateIndex(item.observedOn);
        if (day === null || day > asOfDay || asOfDay - day > policy.maxAgeDays) add('DATE', position);
      }
    }
    for (const [i, region] of snapshot.regions.entries()) {
      const path = `${prefix}.regions[${i}]`;
      if (regions.has(region.id)) add('DUPLICATE', path);
      regions.set(region.id, region);
      const seen = new Set<string>();
      for (const [j, cell] of region.cells.entries()) {
        const position = `${path}.cells[${j}]`;
        if (seen.has(cell.id)) add('DUPLICATE', position);
        seen.add(cell.id);
        if (cell.status === 'PRESENT' && (!cell.assetId || !assets.has(cell.assetId))) {
          add('UNDECLARED_ASSET', position);
        }
        if (cell.status === 'UNKNOWN' && cell.assetId !== undefined) add('STATE', position);
      }
    }
  };
  scan(previous, 'previous', oldAssets, oldRegions);
  scan(current, 'current', newAssets, newRegions);
  const referenced = new Set<string>();
  const newCells = new Map<string, ReleaseCell>();
  const oldCells = new Map<string, ReleaseCell>();
  for (const [id, region] of oldRegions) {
    for (const cell of region.cells) oldCells.set(cellKey(id, cell.id), cell);
  }
  for (const [id, region] of newRegions) {
    for (const cell of region.cells) {
      newCells.set(cellKey(id, cell.id), cell);
      if (cell.assetId) referenced.add(cell.assetId);
    }
  }
  for (const id of oldRegions.keys()) {
    if (!newRegions.has(id) && !(policy.allowRemovedRegionIds ?? []).includes(id)) {
      add('REMOVED_REGION', `regions.${id}`);
    }
  }
  let lost = 0;
  let removed = 0;
  let changed = 0;
  let added = 0;
  for (const [key, prior] of oldCells) {
    const next = newCells.get(key);
    if (!next) {
      removed++;
      if (prior.status === 'PRESENT') lost++;
      if (!(policy.allowRemovedCellKeys ?? []).includes(key)) add('REMOVED_CELL', `cells.${key}`);
      continue;
    }
    if (prior.status !== next.status || prior.assetId !== next.assetId) changed++;
    if (prior.status === 'PRESENT' && next.status === 'UNKNOWN') {
      lost++;
      add('REGRESSION_UNKNOWN', `cells.${key}`);
    }
    if (next.status !== 'PRESENT' || !next.assetId) continue;
    const after = newAssets.get(next.assetId);
    const before = prior.assetId ? oldAssets.get(prior.assetId) : undefined;
    if (!after) continue;
    if (prior.status === 'UNKNOWN' || (before && before.sha256 !== after.sha256)) {
      const newestBefore = before ? dateIndex(before.observedOn) ?? 0 : beforeDay;
      const newestAfter = dateIndex(after.observedOn) ?? 0;
      if (newestAfter <= newestBefore && (prior.status === 'UNKNOWN' || before?.sha256 !== after.sha256)) {
        add('STATE_WITHOUT_EVIDENCE', `cells.${key}`);
      }
    }
    if (before) {
      const earlier = dateIndex(before.observedOn) ?? 0;
      const later = dateIndex(after.observedOn) ?? 0;
      if (later < earlier) add('AGE_REGRESSION', `cells.${key}`);
      if (before.silo !== after.silo) add('ODBL_MOVED', `cells.${key}`);
      if (before.licence !== after.licence && later <= earlier) add('LICENCE_CHANGE', `cells.${key}`);
      if (before.source !== after.source &&
          !after.lineage.some(part => part.source === before.source) && later <= earlier) {
        add('SOURCE_WITHOUT_EVIDENCE', `cells.${key}`);
      }
    }
  }
  for (const key of newCells.keys()) if (!oldCells.has(key)) added++;
  if (lost > policy.maxLossOfPresentCells) add('CHURN', 'cells');
  let removedAssets = 0;
  for (const [id, prior] of oldAssets) {
    if (!newAssets.has(id)) removedAssets++;
    const next = newAssets.get(id);
    if (next && (next.source !== prior.source || next.silo !== prior.silo) &&
        next.sha256 === prior.sha256) add('ASSET_ID_REUSED', `assets.${id}`);
  }
  if (removedAssets > policy.maxUnexplainedAssetRemoval) add('REMOVED_ASSET', 'assets');
  for (const id of newAssets.keys()) if (!referenced.has(id)) add('ASSET_WITHOUT_CELL', `assets.${id}`, 'NOTICE');
  const totalBytes = current.assets.reduce((sum, asset) => sum + asset.bytes, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > policy.maxBytes) add('BUDGET', 'assets');
  return finish({
    previousRegions: previous.regions.length,
    currentRegions: current.regions.length,
    previousPresent: beforeCount.present,
    currentPresent: afterCount.present,
    previousUnknown: beforeCount.unknown,
    currentUnknown: afterCount.unknown,
    removedCells: removed,
    changedCells: changed,
    addedCells: added,
    totalBytes,
  });
}

export function releaseText(report: ReleaseReport, language: 'en' | 'fr'): string {
  const title = language === 'en' ? 'Offline release comparison' : 'Comparaison des publications hors ligne';
  const status = report.ok ? (language === 'en' ? 'PASS' : 'RÉUSSI') :
    (language === 'en' ? 'BLOCKED' : 'BLOQUÉ');
  return [title, `${status} (${report.asOf})`,
    ...report.findings.map(item => `${item.level} ${item.code} ${item.path}: ${item[language]}`),
  ].join('\n') + '\n';
}
