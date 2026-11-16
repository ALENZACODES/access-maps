/** Conservative static checks for bilingual, offline-first exported HTML shells. */
import { OPEN_LICENCES } from './index.js';
export type PageCode =
  | 'DOCUMENT' | 'LANG' | 'TITLE' | 'VIEWPORT' | 'MAIN'
  | 'SKIP_LINK' | 'SKIP_TARGET' | 'LANG_PAIR' | 'LANG_SWITCH'
  | 'EXTERNAL_RESOURCE' | 'INLINE_HANDLER' | 'AUTO_REFRESH'
  | 'FORM_LABEL' | 'IMAGE_ALT' | 'BUTTON_NAME' | 'LINK_NAME'
  | 'TOUCH_TARGET' | 'FOCUS_HIDDEN' | 'AUTOPLAY' | 'TABINDEX'
  | 'UNKNOWN_CLAIM' | 'MISSING_PROVENANCE' | 'MISSING_DATE'
  | 'MISSING_LICENCE' | 'DUPLICATE_ID' | 'BAD_DIRECTION'
  | 'INSECURE_REFERENCE' | 'EMPTY_BODY' | 'PAGE_SIZE';
export interface PageIssue {
  readonly code: PageCode;
  readonly file: string;
  readonly position: number;
  readonly en: string;
  readonly fr: string;
}
export interface PageInput {
  readonly file: string;
  readonly html: string;
  readonly maxBytes?: number;
}
export interface PageReport {
  readonly ok: boolean;
  readonly pages: number;
  readonly issues: readonly PageIssue[];
}
interface Element {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly pos: number;
  readonly end: number;
  readonly text: string;
}

const messages: Readonly<Record<PageCode, readonly [string, string]>> = {
  DOCUMENT: ['A complete HTML document is required.', 'Un document HTML complet est requis.'],
  LANG: ['The document needs an explicit English or French language.', 'Le document doit préciser l’anglais ou le français.'],
  TITLE: ['A nonempty page title is required.', 'Un titre de page non vide est requis.'],
  VIEWPORT: ['A responsive viewport declaration is required.', 'Une déclaration de fenêtre adaptative est requise.'],
  MAIN: ['Exactly one main landmark is required.', 'Un seul repère principal est requis.'],
  SKIP_LINK: ['A keyboard skip link is required.', 'Un lien d’évitement au clavier est requis.'],
  SKIP_TARGET: ['The skip link destination is missing.', 'La destination du lien d’évitement est absente.'],
  LANG_PAIR: ['Both English and French pages are required.', 'Les pages anglaise et française sont requises.'],
  LANG_SWITCH: ['A local link to the other language is required.', 'Un lien local vers l’autre langue est requis.'],
  EXTERNAL_RESOURCE: ['Remote dependencies are not allowed for offline pages.', 'Les dépendances distantes ne sont pas autorisées hors ligne.'],
  INLINE_HANDLER: ['Inline event handlers are not allowed.', 'Les gestionnaires d’événements intégrés ne sont pas autorisés.'],
  AUTO_REFRESH: ['Automatic page refresh is not allowed.', 'Le rafraîchissement automatique de la page n’est pas autorisé.'],
  FORM_LABEL: ['A form field needs an accessible name.', 'Un champ de formulaire doit avoir un nom accessible.'],
  IMAGE_ALT: ['An image must have explicit alternative text, including empty for decoration.', 'Une image doit avoir un texte de remplacement explicite, même vide si décorative.'],
  BUTTON_NAME: ['A button needs an accessible name.', 'Un bouton doit avoir un nom accessible.'],
  LINK_NAME: ['A link needs an accessible name.', 'Un lien doit avoir un nom accessible.'],
  TOUCH_TARGET: ['Interactive targets need a minimum 44px dimension.', 'Les cibles interactives doivent mesurer au moins 44 px.'],
  FOCUS_HIDDEN: ['Keyboard focus must not be removed from view.', 'Le focus clavier ne doit pas être masqué.'],
  AUTOPLAY: ['Media must not start automatically.', 'Les médias ne doivent pas démarrer automatiquement.'],
  TABINDEX: ['Positive tabindex changes expected navigation order.', 'Un tabindex positif modifie l’ordre de navigation attendu.'],
  UNKNOWN_CLAIM: ['Missing coverage must remain UNKNOWN.', 'Une couverture absente doit rester UNKNOWN.'],
  MISSING_PROVENANCE: ['The data source is required.', 'La source des données est requise.'],
  MISSING_DATE: ['The data observation date is required.', 'La date d’observation des données est requise.'],
  MISSING_LICENCE: ['The data licence is required.', 'La licence des données est requise.'],
  DUPLICATE_ID: ['Element identifiers must be unique.', 'Les identifiants d’élément doivent être uniques.'],
  BAD_DIRECTION: ['Unexpected text direction attribute.', 'Attribut de direction de texte inattendu.'],
  INSECURE_REFERENCE: ['A URL contains a disallowed scheme.', 'Une URL utilise un schéma non autorisé.'],
  EMPTY_BODY: ['The page has no readable body content.', 'La page ne contient aucun texte lisible.'],
  PAGE_SIZE: ['The offline page exceeds the configured byte budget.', 'La page hors ligne dépasse le budget d’octets configuré.'],
};

function decode(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39|#x27);/gi, match => {
    const map: Record<string, string> = {
      '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<',
      '&gt;': '>', '&nbsp;': ' ', '&#39;': "'", '&#x27;': "'",
    };
    return map[match.toLowerCase()] ?? match;
  });
}
function attributes(raw: string): Record<string, string> {
  const found: Record<string, string> = Object.create(null) as Record<string, string>;
  // Attribute parsing is deliberately restricted to ordinary static HTML; no JS evaluation.
  const scanner = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of raw.matchAll(scanner)) {
    const key = match[1]?.toLowerCase();
    if (key) found[key] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return found;
}
function stripped(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function elements(html: string): Element[] {
  const output: Element[] = [];
  const scanner = /<([a-z][a-z0-9:-]*)\b([^>]*?)\s*\/?>/gi;
  for (const match of html.matchAll(scanner)) {
    const name = match[1]?.toLowerCase() ?? '';
    if (!name) continue;
    const pos = match.index;
    const end = pos + match[0].length;
    const close = new RegExp(`<\\/${name}\\s*>`, 'i').exec(html.slice(end));
    const body = close ? html.slice(end, end + close.index) : '';
    output.push({ name, attrs: attributes(match[2] ?? ''), pos, end, text: stripped(body) });
  }
  return output;
}
function localUrl(url: string): boolean {
  const value = url.trim().toLowerCase();
  if (!value || value.startsWith('#')) return true;
  if (/^(https?:|\/\/|data:|blob:|javascript:|file:|ftp:|ws:|wss:)/.test(value)) return false;
  return !/^[a-z][a-z0-9+.-]*:/.test(value) && !value.includes('\\') &&
    !value.split('/').includes('..');
}
function usableName(el: Element): boolean {
  return Boolean(el.attrs['aria-label']?.trim() || el.attrs['aria-labelledby']?.trim() ||
    el.text.trim() || (el.name === 'input' && el.attrs.value?.trim()));
}
function targetSize(el: Element): boolean {
  // An explicit dimension token is required for individually assessable controls.
  // Layout-dependent CSS cannot be determined without rendering; run browser checks too.
  const raw = `${el.attrs.style ?? ''};${el.attrs['data-min-target'] ?? ''}`;
  if (el.attrs['data-min-target']) return /^\d+(?:\.\d+)?$/.test(el.attrs['data-min-target']) &&
    Number(el.attrs['data-min-target']) >= 44;
  const width = /(?:^|;)\s*(?:min-)?width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(raw);
  const height = /(?:^|;)\s*(?:min-)?height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(raw);
  return Boolean(width && height && Number(width[1]) >= 44 && Number(height[1]) >= 44);
}
function dateValid(value: string | undefined): boolean {
  if (!value || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8));
  const d = new Date(0);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCFullYear(year, month - 1, day);
  return year >= 1 && d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day;
}
function language(page: PageInput): 'en' | 'fr' | null {
  const root = /<html\b([^>]*)>/i.exec(page.html);
  const lang = root ? attributes(root[1] ?? '').lang?.toLowerCase() : undefined;
  return lang === 'en' || lang === 'en-ca' ? 'en' : lang === 'fr' || lang === 'fr-ca' ? 'fr' : null;
}

/** Local HTML lint. Conservative static rules; this does not replace browser accessibility testing. */
export function auditOfflinePages(pages: readonly PageInput[]): PageReport {
  const issues: PageIssue[] = [];
  const add = (code: PageCode, file: string, position = 0): void => {
    const [en, fr] = messages[code];
    issues.push({ code, file, position, en, fr });
  };
  const seenFiles = new Set<string>();
  const langs = new Set<'en' | 'fr'>();
  for (const page of pages) {
    if (!page.file || seenFiles.has(page.file)) { add('DOCUMENT', page.file); continue; }
    seenFiles.add(page.file);
    const html = page.html;
    if (typeof html !== 'string' || !/<!doctype\s+html\s*>/i.test(html) ||
        !/<html\b/i.test(html) || !/<\/html\s*>/i.test(html) ||
        !/<body\b/i.test(html) || !/<\/body\s*>/i.test(html)) {
      add('DOCUMENT', page.file);
      continue;
    }
    if (page.maxBytes !== undefined && Buffer.byteLength(html, 'utf8') > page.maxBytes) {
      add('PAGE_SIZE', page.file);
    }
    const current = language(page);
    if (!current) add('LANG', page.file);
    else langs.add(current);
    const nodes = elements(html);
    if (!/<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title>/i.test(html)) add('TITLE', page.file);
    if (!nodes.some(node => node.name === 'meta' && node.attrs.name?.toLowerCase() === 'viewport' &&
        /width\s*=\s*device-width/i.test(node.attrs.content ?? ''))) add('VIEWPORT', page.file);
    const mains = nodes.filter(node => node.name === 'main' || node.attrs.role === 'main');
    if (mains.length !== 1) add('MAIN', page.file);
    const ids = new Set<string>();
    for (const node of nodes) {
      const id = node.attrs.id;
      if (id) {
        if (ids.has(id)) add('DUPLICATE_ID', page.file, node.pos);
        ids.add(id);
      }
    }
    const skip = nodes.filter(node => node.name === 'a' && node.attrs.href?.startsWith('#') &&
      /skip|éviter|contenu/i.test(`${node.text} ${node.attrs['aria-label'] ?? ''}`));
    if (skip.length === 0) add('SKIP_LINK', page.file);
    for (const node of skip) {
      if (!ids.has((node.attrs.href ?? '').slice(1))) add('SKIP_TARGET', page.file, node.pos);
    }
    const otherLanguage = current === 'en' ? 'fr' : 'en';
    if (current && !nodes.some(node => node.name === 'a' &&
        (node.attrs.hreflang?.toLowerCase().startsWith(otherLanguage) ?? false) &&
        localUrl(node.attrs.href ?? '') && node.attrs.href !== '')) add('LANG_SWITCH', page.file);
    const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? '';
    if (!stripped(body)) add('EMPTY_BODY', page.file);
    for (const node of nodes) {
      for (const [name, value] of Object.entries(node.attrs)) {
        if (/^on[a-z]+$/.test(name)) add('INLINE_HANDLER', page.file, node.pos);
        if (['src', 'href', 'action', 'poster', 'data'].includes(name) && !localUrl(value)) {
          add(/^javascript:|^data:|^file:/i.test(value) ? 'INSECURE_REFERENCE' : 'EXTERNAL_RESOURCE', page.file, node.pos);
        }
        if (name === 'srcset' && value.split(',').some(item => !localUrl(item.trim().split(/\s+/)[0] ?? ''))) {
          add('EXTERNAL_RESOURCE', page.file, node.pos);
        }
        if (name === 'tabindex' && Number(value) > 0) add('TABINDEX', page.file, node.pos);
        if (name === 'dir' && !['ltr', 'rtl', 'auto'].includes(value)) add('BAD_DIRECTION', page.file, node.pos);
      }
      if (node.name === 'meta' && node.attrs['http-equiv']?.toLowerCase() === 'refresh') {
        add('AUTO_REFRESH', page.file, node.pos);
      }
      if (['video', 'audio'].includes(node.name) && Object.hasOwn(node.attrs, 'autoplay')) {
        add('AUTOPLAY', page.file, node.pos);
      }
      if (node.name === 'img' && !Object.hasOwn(node.attrs, 'alt')) add('IMAGE_ALT', page.file, node.pos);
      if (node.name === 'button' && !usableName(node)) add('BUTTON_NAME', page.file, node.pos);
      if (node.name === 'a' && !usableName(node)) add('LINK_NAME', page.file, node.pos);
      if (['button', 'a', 'select', 'input', 'textarea'].includes(node.name) &&
          node.attrs.type !== 'hidden' && !targetSize(node)) add('TOUCH_TARGET', page.file, node.pos);
      if (['input', 'select', 'textarea'].includes(node.name) && node.attrs.type !== 'hidden') {
        const labelled = Boolean(node.attrs['aria-label'] || node.attrs['aria-labelledby'] ||
          (node.attrs.id && nodes.some(other => other.name === 'label' && other.attrs.for === node.attrs.id)) ||
          (node.name === 'input' && ['submit', 'reset', 'button'].includes(node.attrs.type ?? '') && node.attrs.value));
        if (!labelled) add('FORM_LABEL', page.file, node.pos);
      }
    }
    if (/:focus(?:-visible)?\s*\{[^}]*outline\s*:\s*(?:none|0(?:px)?)(?:\s*!important)?\s*;/i.test(html)) {
      add('FOCUS_HIDDEN', page.file);
    }
    if (/\b(?:accessible|accessibility)\s*[:=]\s*["']?(?:yes|true)/i.test(html) &&
        !/\bUNKNOWN\b/.test(html)) add('UNKNOWN_CLAIM', page.file);
    const source = nodes.find(node => node.name === 'meta' && node.attrs.name === 'data-source');
    const licence = nodes.find(node => node.name === 'meta' && node.attrs.name === 'data-licence');
    const observed = nodes.find(node => node.name === 'meta' && node.attrs.name === 'data-observed-on');
    if (!source?.attrs.content?.trim()) add('MISSING_PROVENANCE', page.file);
    if (!licence?.attrs.content?.trim() ||
        !(OPEN_LICENCES as readonly string[]).includes(licence.attrs.content)) {
      add('MISSING_LICENCE', page.file);
    }
    if (!dateValid(observed?.attrs.content)) add('MISSING_DATE', page.file);
  }
  if (pages.length > 0 && !(langs.has('en') && langs.has('fr'))) add('LANG_PAIR', 'pages');
  return { ok: issues.length === 0, pages: pages.length,
    issues: issues.sort((a, b) => a.file.localeCompare(b.file) || a.position - b.position || a.code.localeCompare(b.code)) };
}

export function pageText(report: PageReport, languageCode: 'en' | 'fr'): string {
  const title = languageCode === 'en' ? 'Offline page checks' : 'Contrôles des pages hors ligne';
  const status = report.ok ? (languageCode === 'en' ? 'PASS' : 'RÉUSSI') :
    (languageCode === 'en' ? 'BLOCKED' : 'BLOQUÉ');
  return [title, status, ...report.issues.map(item =>
    `${item.code} ${item.file}:${item.position}: ${item[languageCode]}`)].join('\n') + '\n';
}
