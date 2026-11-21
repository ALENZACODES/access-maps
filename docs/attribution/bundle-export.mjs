import { parseBundle, UNKNOWN, safeHttps } from './bundle-core.mjs';
import { auditBundle, viewCoverage } from './bundle-audit.mjs';
import { COPY, locale, labelled } from './bundle-copy.mjs';

/** Escape supplied strings before exporting a static HTML document. */
export function htmlEscape(value) {
  return String(value).replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;')
    .replace(/"/gu,'&quot;').replace(/'/gu,'&#39;');
}
export function safeLink(value, label, language) {
  const url = safeHttps(value);
  if(url===null||url===UNKNOWN)return htmlEscape(UNKNOWN);
  return `<a href="${htmlEscape(url)}" target="_blank" rel="noopener noreferrer">${htmlEscape(label)}</a>`;
}
export function selectedView(input, viewId) {
  const bundle=parseBundle(input);
  const view=bundle.views.find(x=>x.id===viewId);
  if(!view)throw new RangeError('Selected view is missing');
  return {bundle,view};
}
export function disclosureModel(input, viewId, language='en') {
  const {bundle,view}=selectedView(input,viewId);
  const lang=locale(language);
  const assets=bundle.assets.filter(x=>x.viewId===view.id&&x.included==='yes').sort((a,b)=>a.id.localeCompare(b.id));
  const uses=bundle.uses.filter(x=>assets.some(a=>a.id===x.assetId)&&x.required==='yes').sort((a,b)=>a.id.localeCompare(b.id));
  const sources=new Map(bundle.sources.map(s=>[s.id,s]));
  const noticeRows=uses.map(use=>({use,source:sources.get(use.sourceId),asset:assets.find(a=>a.id===use.assetId),
    notice:bundle.notices.find(n=>n.useId===use.id&&n.locale===lang)??null}));
  const report=auditBundle(bundle);
  const findings=report.findings.filter(f=>f.viewId===view.id);
  const blocking=findings.filter(f=>f.severity==='block');
  const observations=bundle.observations.filter(o=>o.viewId===view.id);
  return {title:lang==='fr'?view.titleFr:view.titleEn,language:lang,view,assets,noticeRows,
    observations,findings,blocking,status:blocking.length?'draft':'manual-review',
    manifestSources:[...new Set(uses.map(u=>u.sourceId))].sort().map(id=>sources.get(id)),
    warning:lang==='fr'?COPY.fr.caution:COPY.en.caution};
}
/** A static offline HTML document; no JavaScript and no external dependencies. */
export function disclosureHtml(input, viewId, language='en') {
  const model=disclosureModel(input,viewId,language);
  const t=COPY[model.language];
  const sections=model.noticeRows.map(({use,source,asset,notice})=>{
    const credit=notice?.text??UNKNOWN;
    const placement=notice?.placement??UNKNOWN;
    const sourceUrl=safeLink(source.sourceUrl,t.sourceLink,model.language);
    const licenceUrl=safeLink(source.licenceUrl,t.licenceLink,model.language);
    const fields=[
      [t.sourceName,source.name],[t.licence,source.licence],[t.retrieved,source.retrievedOn],
      [t.dataDate,source.datasetAsOf],[t.tier,source.tier],[t.credit,source.credit],
      [t.noticePlacement,placement],
    ].map(([label,value])=>`<div class="detail"><dt>${htmlEscape(label)}</dt><dd>${htmlEscape(value)}</dd></div>`).join('\n');
    return `<article class="notice-card" aria-labelledby="asset-${htmlEscape(use.id)}">
      <h2 id="asset-${htmlEscape(use.id)}">${htmlEscape(asset.label)} — ${htmlEscape(source.name)}</h2>
      <dl>${fields}<div class="detail"><dt>${htmlEscape(t.sourceLink)}</dt><dd>${sourceUrl}</dd></div>
      <div class="detail"><dt>${htmlEscape(t.licenceLink)}</dt><dd>${licenceUrl}</dd></div></dl>
      <h3>${htmlEscape(t.noticesLabel)}</h3><p class="notice">${htmlEscape(credit)}</p>
    </article>`;
  }).join('\n');
  const status=model.status==='draft'?t.draft:t.manual;
  const gaps=model.blocking.map(issue=>`<li>${htmlEscape(issue.code)} — ${htmlEscape(issue.assetId)} / ${htmlEscape(issue.sourceId)} / ${htmlEscape(issue.locale)}</li>`).join('\n');
  const warning=model.blocking.length?t.blockedMessage:t.passMessage;
  const heading=model.title===UNKNOWN?UNKNOWN:model.title;
  const stylesheet=`:root{color-scheme:light dark;font-family:system-ui,sans-serif}body{max-width:72rem;margin:auto;padding:1.25rem;line-height:1.6}a{color:inherit;text-decoration:underline;text-underline-offset:.2em}a:focus-visible{outline:3px solid currentColor;outline-offset:4px}header,article,section{margin-block:1.25rem}article{border:1px solid currentColor;border-radius:.5rem;padding:1rem}dt{font-weight:650}dd{margin:0 0 .8rem}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem}.notice{white-space:pre-wrap;overflow-wrap:anywhere;border-inline-start:4px solid currentColor;padding-inline-start:1rem}.skip{position:absolute;transform:translateY(-250%);padding:.75rem;background:Canvas;color:CanvasText}.skip:focus{transform:none}.status{font-weight:700}@media print{body{max-width:none}.skip{display:none}a{overflow-wrap:anywhere}}`;
  return `<!doctype html>\n<html lang="${model.language}">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${htmlEscape(heading)} — ${htmlEscape(t.noticesLabel)}</title><style>${stylesheet}</style></head><body>
<a class="skip" href="#disclosure-main">${htmlEscape(model.language==='fr'?'Aller au contenu principal':'Skip to main content')}</a>
<main id="disclosure-main"><header><h1>${htmlEscape(heading)}</h1><p class="status">${htmlEscape(status)}</p><p>${htmlEscape(model.warning)}</p><p>${htmlEscape(warning)}</p></header>
<section aria-label="${htmlEscape(t.noticesLabel)}">${sections||`<p>${htmlEscape(t.none)}</p>`}</section>
<section aria-labelledby="issues-heading"><h2 id="issues-heading">${htmlEscape(t.findings)}</h2><ul>${gaps||`<li>${htmlEscape(t.passMessage)}</li>`}</ul></section>
</main></body></html>\n`;
}
export function manifestJson(input, viewId, language='en') {
  const model=disclosureModel(input,viewId,language);
  return `${JSON.stringify({schema:'map-notice-disclosure-manifest/1',viewId,
    locale:model.language,reviewState:model.status,sourceRecords:model.manifestSources,
    assets:model.assets,notices:model.noticeRows.map(x=>({useId:x.use.id,sourceId:x.source.id,
      assetId:x.asset.id,credit:x.notice?.text??UNKNOWN,placement:x.notice?.placement??UNKNOWN,
      observedOn:x.notice?.observedOn??UNKNOWN})),findings:model.findings},null,2)}\n`;
}
export function findingsText(input, language='en', viewId=null) {
  const lang=locale(language),t=COPY[lang],report=auditBundle(input);
  const items=viewId===null?report.findings:report.findings.filter(f=>f.viewId===viewId);
  const lines=[t.title, '',labelled(lang,t.status,report.status),labelled(lang,t.blocked,String(items.filter(x=>x.severity==='block').length)),''];
  for(const item of items)lines.push(`${item.severity.toUpperCase()} ${item.code}`,`${item.viewId} / ${item.assetId} / ${item.sourceId} / ${item.locale}`,'');
  lines.push(t.caution);
  return `${lines.join('\n')}\n`;
}
export function coverageTsv(input) {
  const rows=viewCoverage(input);
  const cols=['viewId','titleEn','titleFr','route','included','assetCount','sourceCount','expectedNotices','recordedNotices','blockingGaps'];
  const cell=value=>{
    let result=String(value??UNKNOWN).replace(/[\r\n\t\u0000-\u001f\u007f]/gu,' ');
    if(/^[\s]*[=+@-]/u.test(result))result=`'${result}`;
    return `"${result.replace(/"/gu,'""')}"`;
  };
  return `${[cols.join('\t'),...rows.map(row=>cols.map(key=>cell(row[key])).join('\t'))].join('\n')}\n`;
}
export function defaultFilename(viewId,language,extension='html') {
  const id=String(viewId).replace(/[^a-z0-9_-]/giu,'-').slice(0,70);
  const lang=locale(language);
  if(!['html','json','txt','tsv'].includes(extension))throw new RangeError('Unsupported format');
  return `notice-bundle-${id}-${lang}.${extension}`;
}
