import { SOURCE_IDS, SOURCES, normalizeLocale } from './attribution-utils.mjs';
import { MAX_BYTES, UNKNOWN, TIERS, MODES, LOCATIONS, STATES,
  blankPlan, addSurface, removeSurface, setSurface, setUse, dropUse, requiredNotices,
  parsePlan, serializePlan, downloadName } from './placement-core.mjs';
import { auditPlacement, auditSummary } from './placement-audit.mjs';
import { COPY, FINDING_COPY } from './placement-messages.mjs';

const doc = document;
const root = doc.getElementById('planner-root');
const params = new URLSearchParams(location.search);
let locale = normalizeLocale(params.get('lang') ?? 'en');
let plan = blankPlan();
const t = () => COPY[locale];
const el = (tag, text, className) => {
  const node = doc.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const append = (parent, ...nodes) => { nodes.forEach((node) => parent.append(node)); return parent; };
const status = doc.getElementById('planner-status');
function announce(text) { status.textContent = text; }
function makeButton(label, action, className = 'planner-button') {
  const button = el('button', label, className);
  button.type = 'button';
  button.addEventListener('click', action);
  return button;
}
function field(label, value, onChange, settings = {}) {
  const wrap = el('div', undefined, 'planner-field');
  const id = `field-${++field.sequence}`;
  const caption = el('label', label);
  caption.htmlFor = id;
  let control;
  if (settings.options) {
    control = el('select');
    for (const [key, text] of settings.options) {
      const option = el('option', text);
      option.value = key;
      control.append(option);
    }
    control.value = String(value);
  } else if (settings.multiline) {
    control = el('textarea');
    control.rows = 4;
    control.value = String(value);
  } else {
    control = el('input');
    control.type = settings.type ?? 'text';
    control.value = String(value);
    if (settings.maxLength) control.maxLength = settings.maxLength;
  }
  control.id = id;
  control.addEventListener('change', () => onChange(control.value));
  append(wrap, caption, control);
  return wrap;
}
field.sequence = 0;
function update(next, message = t().changed) {
  const focusedId = doc.activeElement?.id;
  plan = parsePlan(next);
  render();
  if (focusedId) doc.getElementById(focusedId)?.focus();
  announce(message);
}
function changeUse(view, sourceId, patch) {
  try { update(setUse(plan, view.id, sourceId, patch)); }
  catch { announce(t().errors); }
}
function changeSurface(view, patch) {
  try { update(setSurface(plan, view.id, patch)); }
  catch { announce(t().errors); }
}
function download(content, filename, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = el('a');
  anchor.href = url;
  anchor.download = filename;
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  announce(t().exported);
}
function options(values, labels = {}) { return values.map((value) => [value, labels[value] ?? value]); }
function useEditor(view, entry) {
  const section = el('section', undefined, 'planner-use');
  const heading = el('h4', SOURCES[entry.sourceId].name);
  append(section, heading,
    field(t().source, entry.source, (value) => changeUse(view, entry.sourceId, { source: value }), { maxLength: 160 }),
    field(t().licence, entry.licence, (value) => changeUse(view, entry.sourceId, { licence: value }), { maxLength: 160 }),
    field(t().retrievedOn, entry.retrievedOn, (value) => changeUse(view, entry.sourceId, { retrievedOn: value }), { maxLength: 10 }),
    field(t().tier, entry.tier, (value) => changeUse(view, entry.sourceId, { tier: value }), { options: options(TIERS) }),
    field(t().location, entry.location, (value) => changeUse(view, entry.sourceId, { location: value }), {
      options: options(LOCATIONS, { 'near-content': t().near, details: t().details, footer: t().footer, missing: t().missing }),
    }),
    field(t().credit, entry.credit, (value) => changeUse(view, entry.sourceId, { credit: value }), { multiline: true }),
  );
  const reference = el('details', undefined, 'planner-reference');
  reference.append(el('summary', t().show), el('p', t().note));
  const noticeList = el('ul');
  for (const notice of requiredNotices(entry.sourceId, locale)) noticeList.append(el('li', notice));
  reference.append(noticeList);
  section.append(reference);
  section.append(makeButton(t().addNotice, () => {
    const existing = entry.credit === UNKNOWN ? '' : entry.credit;
    const missing = requiredNotices(entry.sourceId, locale).filter((notice) => !existing.includes(notice));
    changeUse(view, entry.sourceId, { credit: [existing, ...missing].filter(Boolean).join('\n') || UNKNOWN });
  }));
  const yesNo = options(STATES, { yes: t().yes, no: t().no });
  append(section,
    field(t().licenceVisible, entry.licenceVisible, (value) => changeUse(view, entry.sourceId, { licenceVisible: value }), { options: yesNo }),
    field(t().keyboard, entry.keyboard, (value) => changeUse(view, entry.sourceId, { keyboard: value }), { options: yesNo }),
    field(t().screenReader, entry.screenReader, (value) => changeUse(view, entry.sourceId, { screenReader: value }), { options: yesNo }),
    field(t().minTargetPx, entry.minTargetPx, (value) => changeUse(view, entry.sourceId, {
      minTargetPx: value === UNKNOWN || value === '' ? UNKNOWN : Number(value),
    }), { maxLength: 7 }),
    field(t().notes, entry.notes, (value) => changeUse(view, entry.sourceId, { notes: value }), { multiline: true }),
    makeButton(t().remove, () => update(dropUse(plan, view.id, entry.sourceId))),
  );
  return section;
}
function viewEditor(view) {
  const article = el('article', undefined, 'planner-view');
  const heading = el('h3', view.name);
  heading.id = `view-${view.id}`;
  article.setAttribute('aria-labelledby', heading.id);
  article.append(heading,
    field(t().name, view.name, (value) => changeSurface(view, { name: value }), { maxLength: 160 }),
    field(t().mode, view.mode, (value) => changeSurface(view, { mode: value }), {
      options: options(MODES, Object.fromEntries(MODES.map((mode) => [mode, t()[mode]]))),
    }),
    field(t().route, view.route, (value) => changeSurface(view, { route: value }), { maxLength: 240 }),
    el('h4', t().sources),
  );
  if (view.uses.length === 0) article.append(el('p', t().none));
  for (const entry of view.uses) article.append(useEditor(view, entry));
  const candidates = SOURCE_IDS.filter((id) => !view.uses.some((entry) => entry.sourceId === id));
  if (candidates.length) {
    const picker = el('select');
    picker.setAttribute('aria-label', `${t().choose} — ${view.name}`);
    for (const id of candidates) {
      const option = el('option', SOURCES[id].name);
      option.value = id;
      picker.append(option);
    }
    article.append(append(el('div', undefined, 'planner-actions'), picker,
      makeButton(t().addSource, () => changeUse(view, picker.value, {}))));
  }
  article.append(makeButton(t().removeView, () => update(removeSurface(plan, view.id))));
  return article;
}
function renderFindings(container) {
  const result = auditPlacement(plan, locale);
  const summary = auditSummary(result);
  const sep = locale === 'fr' ? '\u00a0:' : ':';
  container.append(el('h2', t().results));
  container.append(el('p', `${t().blocks}${sep} ${summary.blocking}. ${t().infos}${sep} ${summary.information}.`));
  if (result.findings.length === 0) container.append(el('p', t().noFindings));
  const list = el('ul');
  for (const finding of result.findings) {
    const words = FINDING_COPY[locale][finding.code] ?? finding.code;
    list.append(el('li', `${finding.surfaceId} — ${finding.sourceId} — ${words} (${finding.field})`));
  }
  container.append(list);
}
function reportText() {
  const result = auditPlacement(plan, locale);
  const summary = auditSummary(result);
  const sep = locale === 'fr' ? '\u00a0:' : ':';
  return [t().title, `${t().blocks}${sep} ${summary.blocking}`, `${t().infos}${sep} ${summary.information}`, 
    ...result.findings.map((finding) => `${finding.surfaceId}\t${finding.sourceId}\t${finding.severity}\t${FINDING_COPY[locale][finding.code]}`),
    '', t().disclaimer, ''].join('\n');
}
function render() {
  field.sequence = 0;
  doc.documentElement.lang = locale;
  doc.title = t().title;
  root.replaceChildren();
  const header = el('header');
  header.append(el('h1', t().title), el('p', t().intro));
  const language = field(t().language, locale, (value) => { locale = normalizeLocale(value); render(); announce(t().changed); }, {
    options: [['en', 'English'], ['fr', 'Français']],
  });
  header.append(language);
  root.append(header);
  const form = el('form');
  form.append(el('h2', t().newSurface));
  const name = field(t().name, '', () => {}, { maxLength: 160 });
  const mode = field(t().mode, 'other', () => {}, { options: options(MODES, Object.fromEntries(MODES.map((id) => [id, t()[id]]))) });
  form.append(name, mode);
  const add = el('button', t().add);
  add.type = 'submit';
  form.append(add);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = name.querySelector('input');
    const select = mode.querySelector('select');
    try { update(addSurface(plan, input.value, select.value)); }
    catch { announce(t().errors); }
  });
  root.append(form);
  const actions = el('section', undefined, 'planner-actions');
  actions.setAttribute('aria-label', t().actions);
  const file = el('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.setAttribute('aria-label', t().import);
  file.addEventListener('change', async () => {
    try {
      if (!file.files || file.files.length !== 1 || file.files[0].size > MAX_BYTES) throw new TypeError('Invalid size');
      const raw = await file.files[0].text();
      update(parsePlan(raw), t().imported);
    } catch { announce(t().importError); }
    file.value = '';
  });
  actions.append(file,
    makeButton(t().export, () => download(serializePlan(plan), downloadName(locale), 'application/json')),
    makeButton(t().exportFindings, () => download(reportText(), `notice-findings-${locale}.txt`, 'text/plain')),
    makeButton(t().clear, () => update(blankPlan())),
  );
  root.append(actions);
  const list = el('section');
  list.append(el('h2', t().views));
  if (plan.surfaces.length === 0) list.append(el('p', t().noViews));
  for (const view of plan.surfaces) list.append(viewEditor(view));
  root.append(list);
  const results = el('section');
  results.id = 'planner-findings';
  renderFindings(results);
  root.append(results, el('p', t().local), el('p', t().disclaimer));
}
render();
