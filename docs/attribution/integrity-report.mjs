import {parseRegister,UNKNOWN,OSM_CREDIT,safeHttps} from './integrity-core.mjs';
import {auditRegister,compareRegisters,coverageRows,sourceImpact} from './integrity-audit.mjs';
import {messages,labelled} from './integrity-copy.mjs';
const escapeHtml=x=>String(x).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const noFormula=x=>{const s=String(x??UNKNOWN).replace(/[\t\r\n\u0000-\u001f\u007f]/gu,' ');return /^\s*[=+@-]/u.test(s)?`'${s}`:s;};
export function safeCell(value) {return `"${noFormula(value).replace(/"/gu,'""')}"`;}
export const COLUMNS=['assetId','asset','status','kind','route','sourceId','source','licence','retrievedOn','tier','expectedSha256','expectedBytes','measurementCount','method','checkId','notice','placement','observedOn','gapCount','state'];
export function reportTsv(input) {
  const rows=coverageRows(input),out=[COLUMNS.map(safeCell).join('\t')];
  for(const row of rows) out.push(COLUMNS.map(key=>safeCell(row[key])).join('\t'));
  return out.join('\n')+'\n';
}
export function reportJson(input) {return JSON.stringify({register:parseRegister(input),audit:auditRegister(input)},null,2)+'\n';}
export function reportText(input,locale='en') {
  const state=parseRegister(input),report=auditRegister(state),t=messages(locale),lines=[t.title,'',state.title,t.warning,'',labelled(locale,'gaps',report.totals.block),''];
  for(const asset of state.assets) {
    lines.push(labelled(locale,'asset',`${asset.label} (${asset.id})`),labelled(locale,'kind',asset.kind),labelled(locale,'route',asset.route),labelled(locale,'status',asset.status),labelled(locale,'sha256',asset.sha256),labelled(locale,'byteLength',asset.byteLength));
    for(const id of asset.sourceIds) {
      const source=state.sources.find(x=>x.id===id);
      lines.push(labelled(locale,'source',source.name),labelled(locale,'licence',source.licence),labelled(locale,'retrievedOn',source.retrievedOn),labelled(locale,'tier',source.tier),labelled(locale,'credit',source.credit));
    }
    for(const check of state.checks.filter(x=>x.assetId===asset.id)) lines.push(labelled(locale,'method',check.method),labelled(locale,'noticeText',check.noticeText),labelled(locale,'placement',check.placement),labelled(locale,'observedOn',check.observedOn));
    for(const m of state.measurements.filter(x=>x.assetId===asset.id)) lines.push(labelled(locale,'measurement',m.id),labelled(locale,'sha256',m.sha256),labelled(locale,'byteLength',m.byteLength),labelled(locale,'checkedOn',m.checkedOn));
    lines.push('');
  }
  for(const finding of report.findings) lines.push(`${finding.severity.toUpperCase()} | ${finding.code} | ${finding.assetId} | ${finding.sourceId} | ${finding.method}`);
  lines.push('',t.footer);
  return lines.join('\n')+'\n';
}
export function comparisonText(previous,candidate,locale='en') {
  const result=compareRegisters(previous,candidate),t=messages(locale);
  const lines=[t.compare,labelled(locale,'introduced',result.introduced.length),labelled(locale,'resolved',result.resolved.length),labelled(locale,'regressions',result.regressions.length),''];
  for(const item of [...result.introduced,...result.regressions]) lines.push(`${item.severity} | ${item.code} | ${item.assetId} | ${item.sourceId} | ${item.detail}`);
  return lines.join('\n')+'\n';
}
export function impactText(input,sourceId,locale='en') {
  const result=sourceImpact(input,sourceId),t=messages(locale);
  const lines=[t.impact,labelled(locale,'sourceId',sourceId),''];
  for(const asset of result.assets) lines.push(`${asset.id} | ${asset.label} | ${asset.route} | ${asset.status}`);
  for(const finding of result.findings) lines.push(`${finding.severity} | ${finding.code} | ${finding.assetId}`);
  return lines.join('\n')+'\n';
}
/** Local downloadable HTML contains no scripts, inline handlers, external assets or remote requests. */
export function reviewHtml(input,locale='en') {
  const state=parseRegister(input),report=auditRegister(state),t=messages(locale),lang=locale==='fr'?'fr':'en';
  const parts=[`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(t.title)}</title><style>body{font:1rem/1.6 system-ui,sans-serif;max-width:72rem;padding:1rem;margin:auto;background:#fff;color:#172735}a{color:#123c83}a:focus-visible{outline:3px solid #a15c00;outline-offset:3px}section{border-top:2px solid #667;padding:1rem 0}dt{font-weight:bold}dd{margin:0 0 .8rem}li{margin:.5rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(prefers-color-scheme:dark){body{background:#141e26;color:#f4f4ee}a{color:#9dc3ff}}@media print{body{color:#000;background:#fff}}</style></head><body><main><h1>${escapeHtml(t.title)}</h1><p>${escapeHtml(state.title)}</p><p>${escapeHtml(t.warning)}</p><p>${escapeHtml(t.privacy)}</p><p>${escapeHtml(labelled(locale,'gaps',report.totals.block))}</p>`];
  for(const asset of state.assets) {
    parts.push(`<section aria-labelledby="asset-${escapeHtml(asset.id)}"><h2 id="asset-${escapeHtml(asset.id)}">${escapeHtml(asset.label)} (${escapeHtml(asset.id)})</h2><dl>`);
    for(const field of ['kind','status','route','fileName','sha256','byteLength']) parts.push(`<dt>${escapeHtml(t[field]??field)}</dt><dd>${escapeHtml(asset[field])}</dd>`);
    parts.push('</dl>');
    for(const sourceId of asset.sourceIds) {
      const source=state.sources.find(x=>x.id===sourceId);
      parts.push(`<section><h3>${escapeHtml(source.name)}</h3><dl>`);
      for(const field of ['licence','retrievedOn','tier','credit','permission']) parts.push(`<dt>${escapeHtml(t[field]??field)}</dt><dd>${escapeHtml(source[field])}</dd>`);
      for(const [field,key] of [['sourceUrl','sourceUrl'],['licenceUrl','licenceUrl']]) {
        const valid=safeHttps(source[field]);
        parts.push(`<dt>${escapeHtml(t[key]??key)}</dt><dd>${valid===UNKNOWN?UNKNOWN:valid===null?UNKNOWN:`<a rel="noopener noreferrer" href="${escapeHtml(valid)}">${escapeHtml(source[field])}</a>`}</dd>`);
      }
      parts.push('</dl><ul>');
      for(const check of state.checks.filter(x=>x.assetId===asset.id && x.sourceId===sourceId)) parts.push(`<li><strong>${escapeHtml(check.method)}</strong> — ${escapeHtml(check.noticeText)} (${escapeHtml(check.placement)}, ${escapeHtml(check.observedOn)})</li>`);
      parts.push('</ul></section>');
    }
    for(const m of state.measurements.filter(x=>x.assetId===asset.id)) parts.push(`<p>${escapeHtml(t.measurement)} ${escapeHtml(m.id)} — SHA-256 ${escapeHtml(m.sha256)} — ${escapeHtml(m.checkedOn)}</p>`);
    parts.push('</section>');
  }
  parts.push(`<section><h2>${escapeHtml(t.gaps)}</h2><ul>`);
  for(const row of report.findings) parts.push(`<li>${escapeHtml(`${row.severity}: ${row.code} — ${row.assetId} / ${row.sourceId} / ${row.method}`)}</li>`);
  parts.push(`</ul></section><p>${escapeHtml(t.footer)}</p><p>${OSM_CREDIT===state.sources.find(s=>s.credit===OSM_CREDIT)?.credit?escapeHtml(OSM_CREDIT):''}</p></main></body></html>\n`);
  return parts.join('');
}
