/** Static bilingual catalogue and touch-target contract for offline UI exports. */
import {
  asArray, dictionary, exactFields, finish, hasPiiLikeText, hasUnsafeContent,
  localReference, makeEmitter, requiredString, safeIdentifier,
  type Finding, type FindingReport,
} from './p15e-core.ts';

export type UIKind = 'text' | 'action' | 'status' | 'link' | 'heading' | 'description';
export interface LocalizedEntry {
  readonly key: string;
  readonly kind: UIKind;
  readonly en: string;
  readonly fr: string;
  readonly placeholders: readonly string[];
  readonly context: string;
  readonly targetPx?: number;
  readonly href?: string;
}
export interface LocaleCatalog {
  readonly schemaVersion: 1;
  readonly entries: readonly LocalizedEntry[];
  readonly pages: readonly LocalizedPage[];
}
export interface LocalizedPage {
  readonly id: string;
  readonly enPath: string;
  readonly frPath: string;
  readonly keyRefs: readonly string[];
  readonly headingKey: string;
  readonly skipKey: string;
  readonly switchKey: string;
  readonly statusKey: string;
}
export interface LocaleSummary {
  readonly entries: number;
  readonly pages: number;
  readonly actions: number;
  readonly unknownLabels: number;
  readonly translationWarnings: number;
}
export type LocaleResult = FindingReport<LocaleSummary>;

const TEXT = {
  ROOT: ['Locale catalogue structure is invalid.', 'La structure du catalogue de langues est non valide.'],
  ENTRY: ['Translation entry has missing or unexpected fields.', 'L’entrée de traduction contient des champs manquants ou inattendus.'],
  PAGE: ['Page locale contract has missing or unexpected fields.', 'Le contrat linguistique de page contient des champs manquants ou inattendus.'],
  DUPLICATE: ['A translation or page identifier is repeated.', 'Un identifiant de traduction ou de page est répété.'],
  EMPTY: ['English and French text are both required.', 'Les textes anglais et français sont obligatoires.'],
  UNSAFE: ['Text includes markup, a personal identifier or unsafe content.', 'Le texte contient du balisage, un identifiant personnel ou du contenu non sûr.'],
  PLACEHOLDERS: ['Both translations must use exactly the declared placeholders.', 'Les traductions doivent utiliser exactement les variables déclarées.'],
  PLACEHOLDER_NAME: ['Variable names must be simple and unique.', 'Les noms de variables doivent être simples et uniques.'],
  TARGET: ['Interactive controls require a target of at least 44 px.', 'Les commandes interactives exigent une cible d’au moins 44 px.'],
  HREF: ['Offline link must be relative and local.', 'Le lien hors ligne doit être relatif et local.'],
  LINK_TEXT: ['Link requires meaningful text in both languages.', 'Le lien exige un texte pertinent dans les deux langues.'],
  FR_APOSTROPHE: ['French typographic apostrophe is required.', 'L’apostrophe typographique française est requise.'],
  FR_COLON: ['French colon needs a nonbreaking space.', 'Le deux-points français exige une espace insécable.'],
  FR_PUNCT: ['French punctuation needs a narrow nonbreaking space.', 'La ponctuation française exige une espace fine insécable.'],
  FR_GUILLEMET: ['French quotation marks require narrow nonbreaking spaces.', 'Les guillemets français exigent des espaces fines insécables.'],
  STATUS: ['UNKNOWN needs explicit English and French status labels.', 'UNKNOWN exige des libellés d’état explicites en anglais et en français.'],
  STATUS_CLAIM: ['Status labels must not promise access.', 'Les libellés d’état ne doivent pas promettre l’accès.'],
  REFERENCE: ['Page references a missing translation.', 'La page renvoie à une traduction absente.'],
  PAGE_PATH: ['Language page paths must be separate local paths.', 'Les chemins des pages linguistiques doivent être distincts et locaux.'],
  UNUSED: ['Translation is not referenced by any page.', 'La traduction n’est utilisée par aucune page.'],
  PAGE_REQUIRED: ['Page must reference heading, skip, switch and status labels.', 'La page doit utiliser les libellés de titre, d’évitement, de langue et d’état.'],
  KIND: ['Page control references a label of the wrong kind.', 'La commande de page renvoie à un libellé du mauvais type.'],
  LIMIT: ['Locale catalogue exceeds the allowed entry count.', 'Le catalogue de langues dépasse la limite d’entrées.'],
} as const;
const KINDS = new Set<UIKind>(['text', 'action', 'status', 'link', 'heading', 'description']);
const KEYS = ['key', 'kind', 'en', 'fr', 'placeholders', 'context'];
const PAGE_KEYS = ['id', 'enPath', 'frPath', 'keyRefs', 'headingKey', 'skipKey', 'switchKey', 'statusKey'];
const VARIABLE = /^[a-z][a-zA-Z0-9]*$/;
const TOKEN = /\{([a-z][a-zA-Z0-9]*)\}/g;
const BANNED_CLAIM = /\b(?:always accessible|fully accessible|access guaranteed|guaranteed access|toujours accessible|accès assuré|accès garanti)\b/i;

function entry(value: unknown): value is LocalizedEntry {
  return dictionary(value) && exactFields(value, KEYS, ['targetPx', 'href']) &&
    safeIdentifier(value.key) && typeof value.kind === 'string' && KINDS.has(value.kind as UIKind) &&
    requiredString(value.en, 2000) && requiredString(value.fr, 2000) &&
    requiredString(value.context, 200) && Array.isArray(value.placeholders) &&
    value.placeholders.length <= 16 && value.placeholders.every(v =>
      typeof v === 'string' && VARIABLE.test(v)) &&
    (value.targetPx === undefined || typeof value.targetPx === 'number') &&
    (value.href === undefined || typeof value.href === 'string');
}
function page(value: unknown): value is LocalizedPage {
  return dictionary(value) && exactFields(value, PAGE_KEYS) && safeIdentifier(value.id) &&
    typeof value.enPath === 'string' && typeof value.frPath === 'string' &&
    Array.isArray(value.keyRefs) && value.keyRefs.length <= 1000 &&
    value.keyRefs.every(safeIdentifier) &&
    ['headingKey', 'skipKey', 'switchKey', 'statusKey'].every(key => safeIdentifier(value[key]));
}
function tokens(text: string): string[] {
  return [...text.matchAll(TOKEN)].map(match => match[1] ?? '');
}
function cleanTokens(text: string): boolean {
  return !/[{}]/.test(text.replace(TOKEN, ''));
}
function punctuationIssues(text: string): Array<'FR_APOSTROPHE' | 'FR_COLON' | 'FR_PUNCT' | 'FR_GUILLEMET'> {
  const errors: Array<'FR_APOSTROPHE' | 'FR_COLON' | 'FR_PUNCT' | 'FR_GUILLEMET'> = [];
  if (/[a-zÀ-ÿ]'[a-zÀ-ÿ]/i.test(text)) errors.push('FR_APOSTROPHE');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === ':' && i > 0 && text[i - 1] !== '\u00a0') errors.push('FR_COLON');
    if (';!?'.includes(char) && i > 0 && text[i - 1] !== '\u202f') errors.push('FR_PUNCT');
    if (char === '«' && text[i + 1] !== '\u202f') errors.push('FR_GUILLEMET');
    if (char === '»' && text[i - 1] !== '\u202f') errors.push('FR_GUILLEMET');
  }
  return [...new Set(errors)];
}
function matchTokens(value: LocalizedEntry): boolean {
  const declared = [...value.placeholders].sort();
  if (new Set(declared).size !== declared.length || !declared.every(v => VARIABLE.test(v))) return false;
  const english = tokens(value.en).sort();
  const french = tokens(value.fr).sort();
  return cleanTokens(value.en) && cleanTokens(value.fr) &&
    english.join('|') === declared.join('|') && french.join('|') === declared.join('|');
}
function controls(value: LocalizedEntry): boolean {
  return value.kind === 'action' || value.kind === 'link';
}
function intendedUnknown(value: LocalizedEntry): boolean {
  return value.kind === 'status' && value.key === 'unknown';
}
function explicitUnknown(value: LocalizedEntry): boolean {
  return /\bunknown\b/i.test(value.en) && /\b(?:inconnu|inconnue)\b/i.test(value.fr);
}

/** Fails closed for missing translations, unsafe page contracts and undersized controls. */
export function auditLocaleCatalog(input: unknown): LocaleResult {
  const findings: Finding[] = [];
  const add = makeEmitter(findings, TEXT);
  const empty: LocaleSummary = {
    entries: 0, pages: 0, actions: 0, unknownLabels: 0, translationWarnings: 0,
  };
  if (!dictionary(input) || !exactFields(input, ['schemaVersion', 'entries', 'pages']) ||
      input.schemaVersion !== 1) { add('ROOT', '$'); return finish(findings, empty); }
  const rows = asArray(input.entries, 20000);
  const pages = asArray(input.pages, 5000);
  if (!rows || !pages) { add('LIMIT', '$'); return finish(findings, empty); }
  const catalog = new Map<string, LocalizedEntry>();
  const referenced = new Set<string>();
  let actions = 0;
  let unknownLabels = 0;
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const path = `entries[${i}]`;
    if (!entry(raw)) { add('ENTRY', path); continue; }
    if (catalog.has(raw.key)) add('DUPLICATE', `${path}.key`);
    catalog.set(raw.key, raw);
    if (!raw.en || !raw.fr) add('EMPTY', path);
    if (hasUnsafeContent(raw.en) || hasUnsafeContent(raw.fr) ||
        hasPiiLikeText(raw.en) || hasPiiLikeText(raw.fr) ||
        BANNED_CLAIM.test(raw.en) || BANNED_CLAIM.test(raw.fr)) add('UNSAFE', path);
    if (!matchTokens(raw)) add('PLACEHOLDERS', path);
    if (new Set(raw.placeholders).size !== raw.placeholders.length) add('PLACEHOLDER_NAME', path);
    if (controls(raw)) {
      actions++;
      if (!Number.isSafeInteger(raw.targetPx) || (raw.targetPx ?? 0) < 44 ||
          (raw.targetPx ?? 0) > 512) add('TARGET', path);
    } else if (raw.targetPx !== undefined) add('ENTRY', `${path}.targetPx`);
    if (raw.kind === 'link' && !localReference(raw.href)) add('HREF', path);
    if (raw.kind !== 'link' && raw.href !== undefined) add('HREF', path);
    if (raw.kind === 'link' && (raw.en.length < 3 || raw.fr.length < 3)) add('LINK_TEXT', path);
    for (const code of punctuationIssues(raw.fr)) add(code, `${path}.fr`);
    if (intendedUnknown(raw)) {
      unknownLabels++;
      if (!explicitUnknown(raw)) add('STATUS', path);
    }
    if (raw.kind === 'status' && BANNED_CLAIM.test(`${raw.en} ${raw.fr}`)) add('STATUS_CLAIM', path);
  }
  const pageIds = new Set<string>();
  const paths = new Set<string>();
  for (let i = 0; i < pages.length; i++) {
    const raw = pages[i];
    const path = `pages[${i}]`;
    if (!page(raw)) { add('PAGE', path); continue; }
    if (pageIds.has(raw.id)) add('DUPLICATE', `${path}.id`);
    pageIds.add(raw.id);
    if (!localReference(raw.enPath) || !localReference(raw.frPath) ||
        raw.enPath === raw.frPath || paths.has(raw.enPath) || paths.has(raw.frPath) ||
        !/(?:^|\/)en(?:\/|\.)/.test(raw.enPath) ||
        !/(?:^|\/)fr(?:\/|\.)/.test(raw.frPath)) add('PAGE_PATH', path);
    paths.add(raw.enPath);
    paths.add(raw.frPath);
    if (new Set(raw.keyRefs).size !== raw.keyRefs.length) add('DUPLICATE', `${path}.keyRefs`);
    for (const key of raw.keyRefs) {
      referenced.add(key);
      if (!catalog.has(key)) add('REFERENCE', `${path}.${key}`);
    }
    const requirements = [
      [raw.headingKey, 'heading'], [raw.skipKey, 'action'],
      [raw.switchKey, 'action'], [raw.statusKey, 'status'],
    ] as const;
    for (const [value, kind] of requirements) {
      if (!raw.keyRefs.includes(value)) add('PAGE_REQUIRED', `${path}.${value}`);
      if (catalog.get(value)?.kind !== kind) add('KIND', `${path}.${value}`);
    }
    if (raw.statusKey !== 'unknown') add('STATUS', `${path}.statusKey`);
  }
  if (unknownLabels === 0) add('STATUS', 'entries');
  for (const key of catalog.keys()) if (!referenced.has(key)) add('UNUSED', `entries.${key}`, 'NOTICE');
  return finish(findings, {
    entries: rows.length, pages: pages.length, actions, unknownLabels,
    translationWarnings: findings.filter(f => f.level === 'NOTICE').length,
  });
}
