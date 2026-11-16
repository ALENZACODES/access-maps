import {
  SOURCE_IDS,
  SOURCES,
  MESSAGES,
  countLabel,
  exportFilename,
  exportText,
  normalizeLocale,
  parseSelection,
  presentation,
  safeExternalUrl,
  serializeSelection,
  toggleSource,
} from './attribution-utils.mjs';

/**
 * A progressively enhanced standalone attribution route. It works without a
 * backend and does not transmit selection state. Its only outbound links are
 * explicit provider terms URLs that the person chooses to open.
 */
function element(doc, tag, options = {}) {
  const node = doc.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.id) node.id = options.id;
  if (options.text !== undefined) node.textContent = options.text;
  return node;
}

function append(parent, ...children) {
  for (const child of children) parent.appendChild(child);
  return parent;
}

function button(doc, text, action, className = 'action') {
  const node = element(doc, 'button', { text, className });
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function paragraph(doc, text, className = '') {
  return element(doc, 'p', { text, className });
}

function link(doc, url, text, labels) {
  const safe = safeExternalUrl(url);
  if (!safe) return paragraph(doc, labels.unknown);
  const node = element(doc, 'a', { text });
  node.href = safe;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  node.setAttribute('aria-label', `${text} (${labels.external})`);
  return node;
}

function description(doc, label, value) {
  const wrapper = element(doc, 'div', { className: 'detail' });
  const term = element(doc, 'dt', { text: label });
  const definition = element(doc, 'dd');
  if (typeof value === 'string') definition.textContent = value;
  else definition.appendChild(value);
  append(wrapper, term, definition);
  return wrapper;
}

function makeSourceCard(doc, source, labels) {
  const article = element(doc, 'article', { className: 'source-card', id: `source-${source.id}` });
  article.setAttribute('aria-labelledby', `title-${source.id}`);
  const header = element(doc, 'h3', { text: source.name, id: `title-${source.id}` });
  const descriptionList = element(doc, 'dl', { className: 'source-meta' });
  append(descriptionList,
    description(doc, labels.licence, source.licence),
    description(doc, labels.reviewed, source.reviewed),
    description(doc, labels.updated, source.datasetAsOf),
    description(doc, labels.source, link(doc, source.sourceUrl, labels.terms, labels)),
    description(doc, labels.openLicence, link(doc, source.licenceUrl, labels.openLicence, labels)),
  );
  const noticeHeading = element(doc, 'h4', { text: labels.notices });
  const noticeList = element(doc, 'ul', { className: 'notices' });
  for (const notice of source.notices) {
    const item = element(doc, 'li', { className: 'notice', text: notice });
    noticeList.appendChild(item);
  }
  append(article,
    header,
    paragraph(doc, source.notes),
    descriptionList,
    noticeHeading,
    noticeList,
  );
  if (source.datasetAsOf === 'UNKNOWN') {
    article.appendChild(paragraph(doc, labels.unknownHelp, 'unknown-note'));
  }
  if (source.id === 'osm') article.appendChild(paragraph(doc, labels.osmMap));
  if (source.id === 'metrolinx') article.appendChild(paragraph(doc, labels.feedNotice));
  return article;
}

function setStatus(node, message) {
  node.textContent = message;
}

function selectAllButton(doc, labels, update, select) {
  return button(doc, labels.all, () => update([...SOURCE_IDS], select));
}

function createControls(doc, labels, selected, update, status) {
  const section = element(doc, 'section', { className: 'controls', id: 'controls' });
  section.setAttribute('aria-labelledby', 'control-heading');
  const heading = element(doc, 'h2', { id: 'control-heading', text: labels.sourceOptions });
  const help = paragraph(doc, labels.filterHelp, 'help');
  const fieldset = element(doc, 'fieldset', { className: 'source-picker' });
  const legend = element(doc, 'legend', { text: labels.showSources });
  fieldset.appendChild(legend);
  for (const id of SOURCE_IDS) {
    const row = element(doc, 'div', { className: 'check-row' });
    const checkbox = element(doc, 'input');
    checkbox.type = 'checkbox';
    checkbox.id = `choice-${id}`;
    checkbox.name = 'source';
    checkbox.value = id;
    checkbox.checked = selected.includes(id);
    const label = element(doc, 'label', {
      text: id === 'osm' ? labels.osmlabel : id === 'metrolinx' ? labels.metrolinxlabel : labels.ltclabel,
    });
    label.htmlFor = checkbox.id;
    checkbox.addEventListener('change', () => {
      const next = toggleSource(readSelection(fieldset), id, checkbox.checked);
      update(next, checkbox);
    });
    append(row, checkbox, label);
    fieldset.appendChild(row);
  }
  const actions = element(doc, 'div', { className: 'action-row' });
  const all = selectAllButton(doc, labels, update, doc.activeElement);
  const clear = button(doc, labels.none, () => update([], doc.activeElement));
  append(actions, all, clear);
  append(section, heading, help, fieldset, actions);
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  return section;
}

function readSelection(fieldset) {
  return Array.from(fieldset.querySelectorAll('input[type="checkbox"]'))
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function inferConnection(win) {
  if (!win.navigator || typeof win.navigator.onLine !== 'boolean') return null;
  return win.navigator.onLine;
}

async function copyLink(win, labels, status) {
  try {
    if (!win.navigator?.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await win.navigator.clipboard.writeText(win.location.href);
    setStatus(status, labels.copied);
  } catch {
    setStatus(status, labels.copyFailed);
  }
}

function exportNotices(win, doc, locale, selected, status, labels) {
  if (typeof win.Blob !== 'function' || !win.URL?.createObjectURL) {
    setStatus(status, labels.copyFailed);
    return;
  }
  const blob = new win.Blob([exportText(locale, selected)], {
    type: 'text/plain;charset=utf-8',
  });
  const objectUrl = win.URL.createObjectURL(blob);
  try {
    const a = element(doc, 'a');
    a.href = objectUrl;
    a.download = exportFilename(locale);
    a.hidden = true;
    doc.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Releasing this blob does not require a network connection.
    win.URL.revokeObjectURL(objectUrl);
  }
}

function updateAddress(win, locale, selected) {
  if (!win.history?.replaceState) return;
  try {
    const url = new URL(win.location.href);
    url.search = serializeSelection(locale, selected);
    win.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    // The view is still usable in embedded, file, or restricted contexts.
  }
}

function actionBar(doc, win, locale, selected, labels, status) {
  const section = element(doc, 'section', { className: 'actions' });
  section.setAttribute('aria-label', labels.tools);
  append(section,
    button(doc, labels.copy, () => { void copyLink(win, labels, status); }),
    button(doc, labels.print, () => { if (typeof win.print === 'function') win.print(); }),
    button(doc, labels.save, () => exportNotices(win, doc, locale, selected, status, labels)),
  );
  section.appendChild(paragraph(doc, labels.downloadHint, 'help'));
  return section;
}

function languageSwitcher(doc, locale, change, labels) {
  const group = element(doc, 'div', { className: 'language-switch' });
  const label = element(doc, 'span', { text: `${labels.language}: ` });
  label.id = 'language-label';
  const select = element(doc, 'select');
  select.id = 'language-select';
  select.setAttribute('aria-labelledby', 'language-label');
  for (const id of ['en', 'fr']) {
    const option = element(doc, 'option', { text: id === 'en' ? labels.english : labels.french });
    option.value = id;
    option.selected = id === locale;
    select.appendChild(option);
  }
  select.addEventListener('change', () => change(normalizeLocale(select.value), select));
  append(group, label, select);
  return group;
}

function sourceSection(doc, page) {
  const section = element(doc, 'section', { id: 'sources' });
  section.setAttribute('aria-labelledby', 'sources-heading');
  section.appendChild(element(doc, 'h2', { id: 'sources-heading', text: page.labels.details }));
  section.appendChild(paragraph(doc, countLabel(page.locale, page.sources.length), 'count'));
  if (page.sources.length === 0) {
    section.appendChild(paragraph(doc, page.labels.selectedNone));
  } else {
    for (const source of page.sources) section.appendChild(makeSourceCard(doc, source, page.labels));
  }
  return section;
}

/**
 * Mount the live route into #attribution-root. The function owns only content
 * inside that mount point; callers can provide their own shell and styles.
 */
export function mountAttribution(doc, win) {
  const root = doc.getElementById('attribution-root');
  if (!root) throw new Error('Missing attribution-root');
  const parsed = parseSelection(win.location?.search ?? '');
  let locale = parsed.locale;
  let selected = parsed.selected;
  function render(focusId = null) {
    const page = presentation(locale, selected);
    const labels = MESSAGES[locale];
    doc.documentElement.lang = locale;
    doc.title = `${labels.pageTitle} — ${labels.appName}`;
    root.replaceChildren();
    const header = element(doc, 'header', { className: 'page-header' });
    const heading = element(doc, 'h1', { text: labels.pageTitle });
    const status = element(doc, 'p', { className: 'status', id: 'status' });
    const connectivity = inferConnection(win);
    const connectivityLabel = connectivity === null ? labels.connectionUnknown
      : connectivity ? labels.online : labels.offline;
    append(header, languageSwitcher(doc, locale, (next, control) => {
      locale = next;
      updateAddress(win, locale, selected);
      render(control.id);
    }, labels), heading, paragraph(doc, labels.intro),
    paragraph(doc, `${connectivityLabel}. ${labels.offlineHelp}`, 'connection'));
    const workbench = element(doc, 'a', { text: labels.workbench });
    workbench.href = 'provenance.html';
    const navigation = element(doc, 'nav');
    navigation.setAttribute('aria-label', labels.tools);
    navigation.appendChild(workbench);
    const publication = element(doc, 'a', { text: locale === 'fr' ? 'Registre des surfaces' : 'Publication surfaces' });
    publication.href = 'disclosure.html';
    navigation.appendChild(publication);
    const impact = element(doc, 'a', { text: locale === 'fr' ? 'Examen des changements' : 'Change review' });
    impact.href = 'impact.html';
    navigation.appendChild(impact);
    const receipts = element(doc, 'a', { text: locale === 'fr' ? 'Reçus des sources' : 'Source receipts' });
    receipts.href = 'receipt.html';
    navigation.appendChild(receipts);
    header.appendChild(navigation);
    const main = element(doc, 'main', { id: 'main-content', className: 'content' });
    main.tabIndex = -1;
    const update = (next, control) => {
      selected = next;
      updateAddress(win, locale, selected);
      render(control?.id ?? null);
      const live = doc.getElementById('status');
      if (live) setStatus(live, labels.refreshed);
    };
    const controlSection = createControls(doc, labels, selected, update, status);
    append(main, controlSection, sourceSection(doc, page),
      actionBar(doc, win, locale, selected, labels, status),
      paragraph(doc, labels.disclaimer, 'disclaimer'),
      paragraph(doc, labels.noEndorsement, 'disclaimer'),
      paragraph(doc, labels.security, 'help'));
    root.appendChild(header);
    root.appendChild(main);
    root.appendChild(status);
    if (parsed.rejected.length > 0) setStatus(status, labels.selectionInvalid);
    if (focusId) doc.getElementById(focusId)?.focus();
  }
  render();
  const connectionChanged = () => render(doc.activeElement?.id ?? null);
  win.addEventListener?.('online', connectionChanged);
  win.addEventListener?.('offline', connectionChanged);
  return () => {
    win.removeEventListener?.('online', connectionChanged);
    win.removeEventListener?.('offline', connectionChanged);
    root.replaceChildren();
  };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const root = document.getElementById('attribution-root');
  if (root) mountAttribution(document, window);
}
