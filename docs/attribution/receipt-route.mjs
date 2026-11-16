/** Browser entry for printable local attribution receipts. */
import { parseReleasePackageText } from './disclosure-core.mjs';
import { createReceipt, encodeReceipt, receiptAsText, receiptSummary } from './receipt-core.mjs';
import { auditReceipt, auditReportAsText, RECEIPT_RULES } from './receipt-audit.mjs';
import { receiptCopy, receiptLocale, receiptCodes } from './receipt-messages.mjs';
import { UNKNOWN } from './provenance-core.mjs';

export const MAX_IMPORT_BYTES = 2_097_152;

function el(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function children(parent, ...nodes) {
  for (const node of nodes) parent.appendChild(node);
  return parent;
}
function heading(doc, level, text) { return el(doc, `h${level}`, text); }
function paragraph(doc, text, className) { return el(doc, 'p', text, className); }
function action(doc, label, callback) {
  const node = el(doc, 'button', label);
  node.type = 'button';
  node.addEventListener('click', callback);
  return node;
}
function link(doc, href, label, external = false) {
  const node = el(doc, 'a', label);
  node.href = href;
  if (external) {
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  return node;
}
function value(doc, list, label, data) {
  children(list, el(doc, 'dt', label), el(doc, 'dd', data === undefined ? UNKNOWN : data));
}
function safeLink(doc, url, label, help) {
  if (url === UNKNOWN) return paragraph(doc, help.invalidLink);
  let parsed;
  try { parsed = new URL(url); } catch { return paragraph(doc, help.invalidLink); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return paragraph(doc, help.invalidLink);
  }
  const node = link(doc, url, label, true);
  node.setAttribute('aria-label', `${label} (${help.external})`);
  return node;
}
function createDownload(win, name, content, type = 'text/plain;charset=utf-8') {
  const blob = new win.Blob([content], { type });
  const url = win.URL.createObjectURL(blob);
  const a = win.document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  win.document.body.appendChild(a);
  try { a.click(); }
  finally {
    a.remove();
    win.URL.revokeObjectURL(url);
  }
}
function safeFilename(id, language, suffix) {
  return `source-receipt-${id}-${language}.${suffix}`;
}
function statusLabel(doc, state, labels) {
  return paragraph(doc, state ? labels.blocked : labels.ready, 'receipt-status');
}
function renderDataset(doc, data, labels, index) {
  const card = el(doc, 'section', null, 'receipt-card');
  card.setAttribute('aria-labelledby', `receipt-source-${index}`);
  const title = heading(doc, 3, `${data.name} (${data.id})`);
  title.id = `receipt-source-${index}`;
  const details = el(doc, 'dl');
  value(doc, details, labels.licence, data.licence);
  value(doc, details, labels.asOf, data.datasetAsOf);
  value(doc, details, labels.acquired, data.acquiredOn);
  value(doc, details, labels.reviewed, data.termsReviewedOn);
  value(doc, details, labels.permission, data.permission);
  value(doc, details, labels.status, data.status);
  const nav = el(doc, 'div', null, 'receipt-nav');
  children(nav,
    safeLink(doc, data.sourceUrl, labels.sourceLink, labels),
    safeLink(doc, data.licenceUrl, labels.licenceLink, labels));
  children(card, title, details, nav);
  if (data.notices.length) {
    card.appendChild(heading(doc, 4, labels.providerNotices));
    for (const text of data.notices) card.appendChild(paragraph(doc, text, 'receipt-notice'));
  }
  if (data.datasetAsOf === UNKNOWN) card.appendChild(paragraph(doc, labels.unknownHelp));
  return card;
}
function renderDetails(doc, receipt, report, labels) {
  const wrapper = el(doc, 'div', null, 'receipt-output');
  const headingNode = heading(doc, 2, receipt.title);
  headingNode.id = 'receipt-details';
  const meta = el(doc, 'section', null, 'receipt-meta');
  meta.setAttribute('aria-labelledby', 'receipt-details');
  const summary = receiptSummary(receipt);
  const stats = el(doc, 'dl');
  value(doc, stats, labels.route, receipt.route);
  value(doc, stats, labels.delivery, receipt.delivery);
  value(doc, stats, labels.asOf, receipt.surfaceDate);
  value(doc, stats, labels.reviewed, receipt.reviewedOn);
  value(doc, stats, labels.sourceCount, summary.sources);
  value(doc, stats, labels.unknownDates, summary.datesUnknown);
  value(doc, stats, labels.keyboard, receipt.keyboard);
  value(doc, stats, labels.screenReader, receipt.screenReader);
  value(doc, stats, labels.target, receipt.minimumTargetPx);
  const summaryHeading = heading(doc, 3, labels.summary);
  children(meta, summaryHeading, stats,
    heading(doc, 3, labels.credits), paragraph(doc, receipt.credits, 'receipt-notice'),
    heading(doc, 3, labels.notices), paragraph(doc, receipt.sourceNotices, 'receipt-notice'),
    paragraph(doc, labels.accessHelp, 'receipt-muted'));
  const sources = el(doc, 'section');
  sources.setAttribute('aria-label', labels.source);
  sources.appendChild(heading(doc, 2, labels.dataset));
  const cards = el(doc, 'div', null, 'receipt-columns');
  if (!receipt.datasets.length) cards.appendChild(paragraph(doc, labels.noData));
  for (const [index, data] of receipt.datasets.entries()) {
    cards.appendChild(renderDataset(doc, data, labels, index));
  }
  sources.appendChild(cards);
  const findings = el(doc, 'section', null, 'receipt-audit');
  findings.setAttribute('aria-labelledby', 'receipt-findings');
  const findingsHeading = heading(doc, 2, labels.audit);
  findingsHeading.id = 'receipt-findings';
  children(findings, findingsHeading, statusLabel(doc, report.blocked, labels));
  if (!report.findings.length) findings.appendChild(paragraph(doc, labels.noFindings));
  else {
    const list = el(doc, 'ul');
    for (const item of receiptCodes(receipt.language, report.findings, RECEIPT_RULES)) {
      const row = el(doc, 'li', `${item.level}: ${item.code}${item.datasetId ? ` (${item.datasetId})` : ''} — ${item.label}`);
      row.dataset.severity = item.severity;
      list.appendChild(row);
    }
    findings.appendChild(list);
  }
  children(wrapper, headingNode, meta, sources, findings);
  return wrapper;
}

/** The route is opt-in and never reads a file until the file input changes. */
export function mountReceiptRoute(doc, win) {
  const root = doc.getElementById('receipt-root');
  if (!root) return null;
  let locale = receiptLocale(new URL(win.location.href).searchParams.get('lang') || doc.documentElement.lang);
  let bundle = null;
  let selected = null;
  let importName = '';
  const updateLocale = (next) => {
    locale = receiptLocale(next);
    const target = new URL(win.location.href);
    target.searchParams.set('lang', locale);
    if (typeof win.history?.replaceState === 'function') win.history.replaceState(null, '', target);
    render();
  };
  function render() {
    const t = receiptCopy(locale);
    doc.documentElement.lang = locale;
    doc.title = `${t.title} — ${t.app}`;
    root.replaceChildren();
    const page = el(doc, 'div', null, 'receipt-page');
    const header = el(doc, 'header', null, 'receipt-header');
    const language = el(doc, 'div', null, 'receipt-language');
    const languageLabel = el(doc, 'label', locale === 'fr' ? 'Langue\u00a0:' : 'Language:');
    languageLabel.htmlFor = 'receipt-lang';
    const languageSelect = el(doc, 'select');
    languageSelect.id = 'receipt-lang';
    for (const [code, name] of [['en', 'English'], ['fr', 'Français']]) {
      const option = el(doc, 'option', name);
      option.value = code;
      languageSelect.appendChild(option);
    }
    languageSelect.value = locale;
    languageSelect.addEventListener('change', () => updateLocale(languageSelect.value));
    children(language, languageLabel, languageSelect);
    const nav = el(doc, 'nav', null, 'receipt-nav');
    nav.setAttribute('aria-label', t.back);
    children(nav, link(doc, 'index.html', t.back), link(doc, 'provenance.html', t.provenance),
      link(doc, 'disclosure.html', t.publication), link(doc, 'impact.html', t.impact));
    children(header, language, heading(doc, 1, t.title), paragraph(doc, t.subtitle), nav);
    const main = el(doc, 'main', null, 'receipt-main');
    main.id = 'main-content';
    const controls = el(doc, 'section', null, 'receipt-controls');
    controls.setAttribute('aria-labelledby', 'receipt-import-title');
    const importHeading = heading(doc, 2, t.package);
    importHeading.id = 'receipt-import-title';
    const fileLabel = el(doc, 'label', t.browse);
    fileLabel.htmlFor = 'receipt-file';
    const file = el(doc, 'input');
    file.id = 'receipt-file';
    file.type = 'file';
    file.accept = '.json,application/json';
    const message = paragraph(doc, bundle ? `${t.loaded} ${importName}` : t.empty, 'receipt-status');
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    file.addEventListener('change', async () => {
      const candidate = file.files?.[0];
      if (!candidate) return;
      try {
        if (candidate.size > MAX_IMPORT_BYTES) throw new Error('FILE_TOO_LARGE');
        const text = await candidate.text();
        bundle = parseReleasePackageText(text);
        selected = bundle.register.surfaces[0]?.id ?? null;
        importName = candidate.name.slice(0, 180);
        render();
      } catch {
        message.textContent = t.invalid;
      }
    });
    const selectionLabel = el(doc, 'label', t.select);
    selectionLabel.htmlFor = 'receipt-select';
    const selection = el(doc, 'select');
    selection.id = 'receipt-select';
    selection.disabled = !bundle || !bundle.register.surfaces.length;
    if (bundle) for (const surface of bundle.register.surfaces) {
      const label = locale === 'fr' ? surface.titleFr : surface.titleEn;
      const option = el(doc, 'option', `${label} (${surface.id})`);
      option.value = surface.id;
      selection.appendChild(option);
    }
    if (selected) selection.value = selected;
    selection.addEventListener('change', () => { selected = selection.value; render(); });
    const clear = action(doc, t.clear, () => { bundle = null; selected = null; importName = ''; render(); });
    clear.disabled = !bundle;
    children(controls, importHeading, paragraph(doc, t.packageHelp), paragraph(doc, t.size),
      fileLabel, file, message, selectionLabel, selection, clear);
    main.appendChild(controls);
    if (bundle && selected) {
      const receipt = createReceipt(bundle, selected, locale);
      const report = auditReceipt(receipt, bundle, { locale, withReleaseAudit: true });
      const buttons = el(doc, 'div', null, 'receipt-actions');
      children(buttons,
        action(doc, t.exportJson, () => createDownload(win, safeFilename(selected, locale, 'json'),
          encodeReceipt(receipt), 'application/json;charset=utf-8')),
        action(doc, t.exportText, () => createDownload(win, safeFilename(selected, locale, 'txt'),
          receiptAsText(receipt))),
        action(doc, t.exportAudit, () => createDownload(win, `receipt-findings-${selected}-${locale}.txt`,
          auditReportAsText(report, locale))),
        action(doc, t.print, () => win.print()));
      main.appendChild(buttons);
      main.appendChild(renderDetails(doc, receipt, report, t));
    } else if (bundle) main.appendChild(paragraph(doc, t.noSurfaces));
    children(main, paragraph(doc, t.unknownHelp), paragraph(doc, t.disclaimer), paragraph(doc, t.offline));
    children(page, header, main);
    root.appendChild(page);
  }
  render();
  return Object.freeze({
    getLocale: () => locale,
    getBundle: () => bundle,
    getSelection: () => selected,
    setLanguage: updateLocale,
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  mountReceiptRoute(document, window);
}
