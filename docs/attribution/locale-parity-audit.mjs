import{parseCatalog,pairEntries,extractTokens,OSM_CREDIT,UNKNOWN}from"./locale-parity-core.mjs";
const rank={block:0,high:1,medium:2,low:3,info:4},add=(a,severity,code,path,detail=UNKNOWN)=>a.push({severity,code,path,detail});
const NBSP = "\u00a0";
const NARROW_NBSP = "\u202f";

/**
 * Mask punctuation within a web address or clock time while keeping the
 * UTF-16 offsets into the original notice. Sentence punctuation following a
 * bare URL remains prose. Guillemets are never part of the URL token.
 * @param {string} text
 */
function proseForAudit(text) {
  const webAddress = /\bhttps?:\/\/[^\s<>"«»]+/giu;
  const clockTime = /(?<!\d)(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?!\d)/gu;
  return text.replace(webAddress, (candidate) => {
    const address = candidate.replace(/[:;!?.,…]+$/u, "");
    if (!URL.canParse(address)) return candidate;
    return "_".repeat(address.length) + candidate.slice(address.length);
  }).replace(clockTime, (clock) => "_".repeat(clock.length));
}

/**
 * Audit supplied prose without rewriting the source notice. The detail
 * lists each failing location, even when a different occurrence of the same
 * punctuation is correct. Counts stay at one finding per rule per notice.
 * @param {string} value
 * @param {string} [path]
 */
export function auditFrenchTypography(value, path = "text") {
  const findings = [];
  const punctuation = [];
  const guillemets = [];
  const prose = proseForAudit(value);
  for (const match of prose.matchAll(/[:;!?«»]/gu)) {
    const mark = match[0];
    const expected = mark === ":" ? NBSP : NARROW_NBSP;
    const direction = mark === "«" ? 1 : -1;
    const adjacent = match.index + direction;
    // Reject doubled or mixed-width whitespace as well as a missing space.
    if (prose[adjacent] === expected && !/\s/u.test(prose[adjacent + direction] ?? "")) continue;
    const locations = mark === "«" || mark === "»" ? guillemets : punctuation;
    locations.push({ index: match.index, mark, expected: mark === ":" ? "U+00A0" : "U+202F" });
  }
  if (punctuation.length) add(findings, "high", "FR_NBSP_REQUIRED", path, punctuation);
  if (guillemets.length) add(findings, "high", "FR_GUILLEMET_SPACING", path, guillemets);
  if (prose.includes("  ")) add(findings, "low", "FR_DOUBLE_SPACE", path);
  if (/\b(?:vérifier|vérifiez|vérification|verify|verified)\b/iu.test(prose)) {
    add(findings, "medium", "PROHIBITED_WORDING", path);
  }
  return findings;
}
function tokens(pair,f){if(!pair.en||!pair.fr)return;const a=extractTokens(pair.en.text),b=extractTokens(pair.fr.text);if(JSON.stringify(a)!==JSON.stringify(b))add(f,"block","TOKEN_PARITY_MISMATCH",`pairs.${pair.pairId}.tokens`,{en:a,fr:b});if(JSON.stringify([...pair.en.tokens].sort())!==JSON.stringify(a))add(f,"high","EN_TOKEN_MANIFEST_MISMATCH",`pairs.${pair.pairId}.en.tokens`);if(JSON.stringify([...pair.fr.tokens].sort())!==JSON.stringify(b))add(f,"high","FR_TOKEN_MANIFEST_MISMATCH",`pairs.${pair.pairId}.fr.tokens`)}
export function auditCatalog(input) {
  const catalog = parseCatalog(input);
  const findings = [];
  const seenFrenchPairs = new Set();
  for (const entry of catalog.entries) {
    if (entry.locale !== "fr") continue;
    const path = seenFrenchPairs.has(entry.pairId)
      ? `entries.${entry.id}.text`
      : `pairs.${entry.pairId}.fr.text`;
    seenFrenchPairs.add(entry.pairId);
    findings.push(...auditFrenchTypography(entry.text, path));
  }
  for (const pair of pairEntries(catalog)) {
    const path = `pairs.${pair.pairId}`;
    if (!pair.en) add(findings, "block", "EN_ENTRY_MISSING", path + ".en");
    if (!pair.fr) add(findings, "block", "FR_ENTRY_MISSING", path + ".fr");
    if (pair.duplicates.en > 1) add(findings, "block", "EN_ENTRY_DUPLICATED", path + ".en");
    if (pair.duplicates.fr > 1) add(findings, "block", "FR_ENTRY_DUPLICATED", path + ".fr");
    if (pair.en && pair.fr) {
      if (pair.en.kind !== pair.fr.kind) add(findings, "block", "KIND_MISMATCH", path);
      if (pair.en.sourceId !== pair.fr.sourceId) add(findings, "block", "SOURCE_ID_MISMATCH", path);
      if (pair.en.licence !== pair.fr.licence) add(findings, "block", "LICENCE_MISMATCH", path);
      if (pair.en.required !== pair.fr.required) add(findings, "high", "REQUIRED_FLAG_MISMATCH", path);
      if (pair.en.sourceUrl !== pair.fr.sourceUrl) add(findings, "high", "SOURCE_URL_MISMATCH", path);
      if (pair.en.licenceUrl !== pair.fr.licenceUrl) add(findings, "high", "LICENCE_URL_MISMATCH", path);
      tokens(pair, findings);
    }
    for (const entry of [pair.en, pair.fr].filter(Boolean)) {
      if (entry.required && entry.sourceId === UNKNOWN) add(findings, "high", "REQUIRED_SOURCE_UNKNOWN", `entries.${entry.id}.sourceId`);
      if (entry.required && entry.licence === UNKNOWN) add(findings, "block", "REQUIRED_LICENCE_UNKNOWN", `entries.${entry.id}.licence`);
      if (entry.kind === "provider-credit" && entry.licence === "ODbL" && entry.text !== OSM_CREDIT) {
        add(findings, "block", "OSM_CREDIT_NOT_EXACT", `entries.${entry.id}.text`, entry.text);
      }
      if (entry.kind === "provider-credit" && entry.sourceUrl === UNKNOWN) add(findings, "high", "SOURCE_URL_UNKNOWN", `entries.${entry.id}.sourceUrl`);
    }
  }
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.path.localeCompare(b.path));
  const counts = Object.fromEntries(Object.keys(rank).map(key => [key, findings.filter(f => f.severity === key).length]));
  return {
    schema: "map-notice-locale-audit/1", catalogId: catalog.catalogId,
    decision: counts.block ? "blocked" : counts.high ? "hold-for-review" : "review-needed",
    counts, findings,
  };
}
export function compareCatalogs(before,after){const a=parseCatalog(before),b=parseCatalog(after),left=new Map(a.entries.map(x=>[x.id,x])),right=new Map(b.entries.map(x=>[x.id,x])),out=[];for(const[id,old]of left){const n=right.get(id);if(!n)out.push({kind:"entry-removed",id,severity:"block"});else for(const field of["text","licence","sourceId","required","tokens","sourceUrl","licenceUrl"])if(JSON.stringify(old[field])!==JSON.stringify(n[field]))out.push({kind:`entry-${field}-changed`,id,field,before:old[field],after:n[field],severity:field==="text"?"medium":"high"})}for(const[id]of right)if(!left.has(id))out.push({kind:"entry-added",id,severity:"info"});return out.sort((x,y)=>rank[x.severity]-rank[y.severity]||x.id.localeCompare(y.id))}
export function pairCoverage(input){const p=pairEntries(input);return{total:p.length,complete:p.filter(x=>x.en&&x.fr).length,missingEnglish:p.filter(x=>!x.en).map(x=>x.pairId),missingFrench:p.filter(x=>!x.fr).map(x=>x.pairId),duplicates:p.filter(x=>x.duplicates.en>1||x.duplicates.fr>1).map(x=>x.pairId)}}
export function placeholderUsage(input){const m=new Map();for(const x of parseCatalog(input).entries)for(const t of x.tokens)m.set(t,[...(m.get(t)||[]),{entryId:x.id,pairId:x.pairId,locale:x.locale}]);return[...m].map(([token,entries])=>({token,entries})).sort((a,b)=>a.token.localeCompare(b.token))}

export function auditOsmPairs(input){const out=[];for(const pair of pairEntries(input))for(const item of [pair.en,pair.fr].filter(Boolean))if(item.kind==="provider-credit"&&item.licence==="ODbL"&&item.text!==OSM_CREDIT)out.push({code:"OSM_CREDIT_NOT_EXACT",entryId:item.id,locale:item.locale});return out}
