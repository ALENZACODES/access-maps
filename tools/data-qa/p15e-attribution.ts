/** Offline attribution ledger audit: every distributed asset retains dated source credit. */
import {
  asArray, calendarDay, dictionary, evidenceSilo, exactFields, finish,
  hasPiiLikeText, hasUnsafeContent, heldSource, licenceAllowed, localReference,
  makeEmitter, requiredString, safeIdentifier, validSilo, validSourceStamp,
  type Finding, type FindingReport, type SiloName, type SourceStamp,
} from './p15e-core.js';

export interface AttributionAsset {
  readonly id: string;
  readonly path: string;
  readonly silo: SiloName;
  readonly sources: readonly SourceStamp[];
}
export interface AttributionNotice {
  readonly id: string;
  readonly assetIds: readonly string[];
  readonly en: string;
  readonly fr: string;
  readonly licence: string;
  readonly sourceReference: string;
}
export interface AttributionLedger {
  readonly schemaVersion: 1;
  readonly asOf: string;
  readonly assets: readonly AttributionAsset[];
  readonly notices: readonly AttributionNotice[];
}
export interface AttributionSummary {
  readonly assets: number;
  readonly notices: number;
  readonly sources: number;
  readonly uncreditedAssets: number;
  readonly odblAssets: number;
}
export type AttributionResult = FindingReport<AttributionSummary>;

const MESSAGES = {
  ROOT: ['Attribution ledger structure is invalid.', 'La structure du registre d’attribution est non valide.'],
  LIMIT: ['Attribution inventory exceeds the limit.', 'L’inventaire d’attribution dépasse la limite.'],
  ASSET: ['Asset attribution has missing or unexpected fields.', 'L’attribution du fichier contient des champs manquants ou inattendus.'],
  NOTICE: ['Notice has missing or unexpected fields.', 'L’avis contient des champs manquants ou inattendus.'],
  DUPLICATE: ['Attribution entry or path is repeated.', 'Une entrée ou un chemin d’attribution est répété.'],
  SOURCE: ['Every asset requires a complete open-licence source.', 'Chaque fichier exige une source complète sous licence ouverte.'],
  HELD: ['Held feeds cannot appear in the attribution ledger.', 'Les flux retenus ne peuvent pas figurer au registre d’attribution.'],
  SILO: ['ODbL credits and files must stay in the separate silo.', 'Les crédits et fichiers ODbL doivent rester dans l’exportation distincte.'],
  DATE: ['Source date must not exceed the export date.', 'La date de source ne doit pas dépasser celle de l’exportation.'],
  PAIR: ['Notice requires meaningful English and French credit text.', 'L’avis exige un texte d’attribution pertinent en anglais et en français.'],
  CONTENT: ['Attribution text includes unsafe markup or a personal identifier.', 'Le texte d’attribution contient du balisage non sûr ou un identifiant personnel.'],
  CREDIT: ['Every distinct asset/source pair needs an exact credit.', 'Chaque paire fichier/source distincte exige un crédit exact.'],
  WRONG_SOURCE: ['Notice references a source not declared by its asset.', 'L’avis renvoie à une source absente de la déclaration du fichier.'],
  UNKNOWN_ASSET: ['Notice references an unknown asset.', 'L’avis renvoie à un fichier inconnu.'],
  ORPHAN: ['Notice must reference at least one published asset.', 'L’avis doit renvoyer à au moins un fichier publié.'],
  LICENCE: ['Notice must retain the original open licence.', 'L’avis doit conserver la licence ouverte d’origine.'],
  REMOTE: ['Source evidence must remain inside the offline package.', 'La source doit demeurer dans le paquet hors ligne.'],
  REUSED: ['One attribution notice cannot mix incompatible licences.', 'Un avis d’attribution ne peut pas mélanger des licences incompatibles.'],
} as const;
const ASSET_KEYS = ['id', 'path', 'silo', 'sources'];
const NOTICE_KEYS = ['id', 'assetIds', 'en', 'fr', 'licence', 'sourceReference'];

function asset(value: unknown): value is AttributionAsset {
  return dictionary(value) && exactFields(value, ASSET_KEYS) &&
    safeIdentifier(value.id) && localReference(value.path) && validSilo(value.silo) &&
    Array.isArray(value.sources) && value.sources.length > 0 && value.sources.length <= 200 &&
    value.sources.every(validSourceStamp);
}
function notice(value: unknown): value is AttributionNotice {
  return dictionary(value) && exactFields(value, NOTICE_KEYS) &&
    safeIdentifier(value.id) && Array.isArray(value.assetIds) &&
    value.assetIds.length > 0 && value.assetIds.length <= 10000 &&
    value.assetIds.every(safeIdentifier) && requiredString(value.en, 2000) &&
    requiredString(value.fr, 2000) && licenceAllowed(value.licence) &&
    localReference(value.sourceReference);
}
function creditKey(assetId: string, stamp: SourceStamp): string {
  return `${assetId}\u0000${stamp.licence}\u0000${stamp.reference}`;
}
function frenchTypography(value: string): boolean {
  if (/[a-zÀ-ÿ]'[a-zÀ-ÿ]/i.test(value)) return false;
  if (/(?:^|[^\u00a0]):/.test(value)) return false;
  if (/[ \t][;!?]/.test(value)) return false;
  if (/«(?!\u202f)|(?<!\u202f)»/.test(value)) return false;
  return true;
}

/** Reject a manifest when any distributed asset loses its source/licence notice. */
export function auditAttribution(input: unknown): AttributionResult {
  const findings: Finding[] = [];
  const add = makeEmitter(findings, MESSAGES);
  const empty: AttributionSummary = {
    assets: 0, notices: 0, sources: 0, uncreditedAssets: 0, odblAssets: 0,
  };
  if (!dictionary(input) || !exactFields(input, ['schemaVersion', 'asOf', 'assets', 'notices']) ||
      input.schemaVersion !== 1 || calendarDay(input.asOf) === null) {
    add('ROOT', '$'); return finish(findings, empty);
  }
  const assets = asArray(input.assets, 50000);
  const notices = asArray(input.notices, 50000);
  if (!assets || !notices) { add('LIMIT', '$'); return finish(findings, empty); }
  const byId = new Map<string, AttributionAsset>();
  const byPath = new Set<string>();
  const credits = new Set<string>();
  const declared = new Set<string>();
  let odblAssets = 0;
  let sources = 0;
  for (let i = 0; i < assets.length; i++) {
    const raw = assets[i];
    const path = `assets[${i}]`;
    if (!asset(raw)) {
      add('ASSET', path);
      if (dictionary(raw) && Array.isArray(raw.sources) &&
          raw.sources.some(s => dictionary(s) && heldSource(s.source))) add('HELD', path);
      continue;
    }
    if (byId.has(raw.id) || byPath.has(raw.path)) add('DUPLICATE', path);
    byId.set(raw.id, raw);
    byPath.add(raw.path);
    if (raw.silo === 'odbl') odblAssets++;
    if (evidenceSilo(raw.sources) !== raw.silo) add('SILO', path);
    const stampKeys = new Set<string>();
    for (const stamp of raw.sources) {
      sources++;
      if (heldSource(stamp.source)) add('HELD', path);
      if (!licenceAllowed(stamp.licence)) add('SOURCE', path);
      if (!localReference(stamp.reference)) add('REMOTE', path);
      if ((calendarDay(stamp.observedOn) ?? Infinity) >
          (calendarDay(input.asOf) ?? -Infinity)) add('DATE', path);
      const composite = creditKey(raw.id, stamp);
      if (stampKeys.has(composite)) add('DUPLICATE', `${path}.sources`);
      stampKeys.add(composite);
      declared.add(composite);
    }
  }
  const noticeIds = new Set<string>();
  for (let i = 0; i < notices.length; i++) {
    const raw = notices[i];
    const path = `notices[${i}]`;
    if (!notice(raw)) { add('NOTICE', path); continue; }
    if (noticeIds.has(raw.id)) add('DUPLICATE', path);
    noticeIds.add(raw.id);
    if (raw.en.length < 8 || raw.fr.length < 8 || !frenchTypography(raw.fr)) add('PAIR', path);
    if (hasUnsafeContent(raw.en) || hasUnsafeContent(raw.fr) ||
        hasPiiLikeText(raw.en) || hasPiiLikeText(raw.fr)) add('CONTENT', path);
    if (new Set(raw.assetIds).size !== raw.assetIds.length) add('DUPLICATE', `${path}.assetIds`);
    const usedSilos = new Set<SiloName>();
    for (const id of raw.assetIds) {
      const declaredAsset = byId.get(id);
      if (!declaredAsset) { add('UNKNOWN_ASSET', `${path}.${id}`); continue; }
      usedSilos.add(declaredAsset.silo);
      const key = `${id}\u0000${raw.licence}\u0000${raw.sourceReference}`;
      if (!declared.has(key)) add('WRONG_SOURCE', `${path}.${id}`);
      if (credits.has(key)) add('DUPLICATE', `${path}.${id}`);
      credits.add(key);
    }
    if (usedSilos.size > 1) add('REUSED', path);
    if (usedSilos.has('odbl') && raw.licence !== 'ODbL-1.0' &&
        byId.size > 0 && raw.assetIds.some(id => byId.get(id)?.sources.some(s => s.licence === 'ODbL-1.0'))) {
      add('LICENCE', path);
    }
    if (raw.assetIds.length === 0) add('ORPHAN', path);
  }
  const lacking = new Set<string>();
  for (const key of declared) if (!credits.has(key)) {
    const id = key.split('\u0000')[0] ?? '';
    lacking.add(id);
    add('CREDIT', `assets.${id}`);
  }
  return finish(findings, {
    assets: assets.length, notices: notices.length, sources,
    uncreditedAssets: lacking.size, odblAssets,
  });
}
