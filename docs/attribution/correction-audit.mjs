/** Fail-closed correction review gate; never consults a clock or remote service. */
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';
import { UNKNOWN, sourceMap, evidenceMap, caseMap } from './correction-core.mjs';

export const BLOCK = 'block';
export const ATTENTION = 'attention';
export const INFORMATION = 'info';
export function issue(code, level, path, detail, sourceId = null, surfaceId = null, caseId = null) {
  return { code, level, path, detail, sourceId, surfaceId, caseId };
}
export function containsNotice(text, needle) {
  return typeof text === 'string' && text.normalize('NFC').replace(/\s+/gu,' ').includes(needle.normalize('NFC').replace(/\s+/gu,' '));
}
export function expectedNotices(source) {
  if (source.provider === 'osm') return [SOURCES.osm.notices.en[0], 'Open Database License (ODbL) 1.0'];
  if (source.provider === 'ltc') return [SOURCES.ltc.notices.en[0]];
  if (source.provider !== 'metrolinx') return [];
  if (source.licence === 'Metrolinx-AUA') return [METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR];
  if (source.licence === 'OGL-Ontario-Metrolinx') return [METROLINX_OGL_NOTICE];
  return [];
}
export function auditCorrections(register, options = {}) {
  const findings = [];
  const add = (...args)=>findings.push(issue(...args));
  const sources = sourceMap(register), evidence = evidenceMap(register), cases = caseMap(register);
  const today = options.today ?? UNKNOWN;
  const requireOffline = options.requireOffline === true;
  const requirePairs = options.requirePairs ?? register.localePairRequired;
  const affected = new Map(register.surfaces.map(s=>[s.id, []]));
  if (!register.sources.length) add('NO_SOURCES', BLOCK,'sources','No source records');
  if (!register.surfaces.length) add('NO_SURFACES', BLOCK,'surfaces','No publication surfaces');
  if (today !== UNKNOWN && !/^\d{4}-\d{2}-\d{2}$/u.test(today)) throw new Error('today must be ISO date or UNKNOWN');
  for (const source of register.sources) {
    const path = `sources.${source.id}`;
    const used = register.surfaces.some(s=>s.sourceIds.includes(source.id));
    if (!used) add('SOURCE_UNUSED', INFORMATION,path,'No linked publication surface',source.id);
    if (source.included !== 'YES') continue;
    if (source.permission !== 'YES') add('SOURCE_PERMISSION', BLOCK,`${path}.permission`,'Publication needs explicit permission',source.id);
    if (source.sourceUrl === UNKNOWN) add('SOURCE_URL_UNKNOWN', BLOCK,`${path}.sourceUrl`,'Source URL is UNKNOWN',source.id);
    if (source.licenceUrl === UNKNOWN) add('LICENCE_URL_UNKNOWN', BLOCK,`${path}.licenceUrl`,'Licence URL is UNKNOWN',source.id);
    if (source.licence === UNKNOWN) add('LICENCE_UNKNOWN', BLOCK,`${path}.licence`,'Licence is UNKNOWN',source.id);
    if (source.termsDate === UNKNOWN) add('TERMS_DATE_UNKNOWN', BLOCK,`${path}.termsDate`,'Terms date is UNKNOWN',source.id);
    if (source.acquisitionDate === UNKNOWN) add('ACQUISITION_UNKNOWN', BLOCK,`${path}.acquisitionDate`,'Acquisition date is UNKNOWN',source.id);
    if (source.datasetDate === UNKNOWN) add('DATASET_DATE_UNKNOWN', INFORMATION,`${path}.datasetDate`,'Dataset date remains UNKNOWN',source.id);
    if (source.tier === UNKNOWN) add('SOURCE_TIER_UNKNOWN', ATTENTION,`${path}.tier`,'Evidence tier is UNKNOWN',source.id);
    if (!source.notice.trim()) add('NOTICE_EMPTY', BLOCK,`${path}.notice`,'Required source notice missing',source.id);
    if (source.provider === 'osm' && !/ODbL/i.test(source.licence)) add('ODBL_LICENCE', BLOCK,`${path}.licence`,'ODbL terms not recorded',source.id);
    if (source.provider === 'ltc' && source.licence !== 'LTC-Open-Data-Terms') add('LTC_TERMS', BLOCK,`${path}.licence`,'LTC terms not recorded',source.id);
    if (source.provider === 'metrolinx' && !['Metrolinx-AUA','OGL-Ontario-Metrolinx'].includes(source.licence))
      add('METROLINX_TERMS', BLOCK,`${path}.licence`,'Specific feed terms required',source.id);
    if (source.provider === 'other' && !['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','ODbL-1.0','OGL-Canada-2.0','OGL-Ontario-1.0'].includes(source.licence))
      add('OTHER_LICENCE',BLOCK,`${path}.licence`,'Recognized open licence evidence required',source.id);
    for (const notice of expectedNotices(source)) if (!containsNotice(source.notice,notice))
      add('NOTICE_MISSING',BLOCK,`${path}.notice`,'Recorded notice absent',source.id);
    if (source.provider === 'metrolinx' && source.licence === 'Metrolinx-AUA' && containsNotice(source.notice,METROLINX_OGL_NOTICE))
      add('MIXED_METROLINX_TERMS',BLOCK,`${path}.notice`,'OGL line mixed into AUA feed',source.id);
    if (source.provider === 'metrolinx' && source.licence === 'OGL-Ontario-Metrolinx' && containsNotice(source.notice,METROLINX_AUA_LEGEND))
      add('MIXED_METROLINX_TERMS',BLOCK,`${path}.notice`,'AUA legend mixed into OGL feed',source.id);
    if (source.termsDate !== UNKNOWN && source.acquisitionDate !== UNKNOWN && source.termsDate > source.acquisitionDate)
      add('TERMS_AFTER_ACQUISITION',ATTENTION,path,'Terms recorded later than acquisition',source.id);
    if (today !== UNKNOWN) {
      for (const key of ['termsDate','acquisitionDate','datasetDate'])
        if (source[key] !== UNKNOWN && source[key] > today) add('FUTURE_DATE',BLOCK,`${path}.${key}`,'Date later than supplied reference',source.id);
    }
  }
  for (const entry of register.evidence) {
    const path = `evidence.${entry.id}`;
    if (!sources.has(entry.sourceId)) add('EVIDENCE_SOURCE_MISSING',BLOCK,`${path}.sourceId`,'Referenced source absent',entry.sourceId);
    if (entry.url === UNKNOWN) add('EVIDENCE_URL_UNKNOWN',ATTENTION,`${path}.url`,'Evidence URL is UNKNOWN',entry.sourceId);
    if (entry.licenceUrl === UNKNOWN) add('EVIDENCE_LICENCE_UNKNOWN',ATTENTION,`${path}.licenceUrl`,'Evidence licence URL is UNKNOWN',entry.sourceId);
    if (entry.collectedOn === UNKNOWN) add('EVIDENCE_DATE_UNKNOWN',ATTENTION,`${path}.collectedOn`,'Evidence collection date UNKNOWN',entry.sourceId);
    if (entry.tier === UNKNOWN) add('EVIDENCE_TIER_UNKNOWN',ATTENTION,`${path}.tier`,'Evidence tier UNKNOWN',entry.sourceId);
    if (!register.cases.some(c=>c.evidenceIds.includes(entry.id))) add('EVIDENCE_UNUSED',INFORMATION,path,'No correction refers to evidence',entry.sourceId);
  }
  for (const entry of register.cases) {
    const path = `cases.${entry.id}`;
    const source = sources.get(entry.sourceId);
    if (!source) add('CASE_SOURCE_MISSING',BLOCK,`${path}.sourceId`,'Case source absent',entry.sourceId,entry.surfaceId,entry.id);
    const surface = register.surfaces.find(s=>s.id===entry.surfaceId);
    if (!surface) add('CASE_SURFACE_MISSING',BLOCK,`${path}.surfaceId`,'Publication surface absent',entry.sourceId,entry.surfaceId,entry.id);
    else {
      affected.get(entry.surfaceId)?.push(entry.id);
      if (!surface.sourceIds.includes(entry.sourceId)) add('CASE_SURFACE_SOURCE',BLOCK,path,'Case source not on surface',entry.sourceId,entry.surfaceId,entry.id);
      if (!surface.caseIds.includes(entry.id)) add('CASE_UNLINKED',BLOCK,path,'Case not linked from surface',entry.sourceId,entry.surfaceId,entry.id);
    }
    for (const id of entry.evidenceIds) {
      const supporting = evidence.get(id);
      if (!supporting) add('CASE_EVIDENCE_MISSING',BLOCK,`${path}.evidenceIds`,'Evidence ID absent',entry.sourceId,entry.surfaceId,entry.id);
      else if (supporting.sourceId !== entry.sourceId) add('EVIDENCE_SOURCE_MISMATCH',BLOCK,`${path}.evidenceIds`,'Evidence belongs to a different source',entry.sourceId,entry.surfaceId,entry.id);
    }
    if (entry.openedOn === UNKNOWN) add('CASE_DATE_UNKNOWN',ATTENTION,`${path}.openedOn`,'Case opening date UNKNOWN',entry.sourceId,entry.surfaceId,entry.id);
    if (entry.openedOn !== UNKNOWN && entry.updatedOn !== UNKNOWN && entry.updatedOn < entry.openedOn)
      add('CASE_DATE_ORDER',BLOCK,path,'Update date precedes opening',entry.sourceId,entry.surfaceId,entry.id);
    if (entry.state === 'open' || entry.state === 'under-review') {
      if (entry.decision !== UNKNOWN) add('PREMATURE_DECISION',BLOCK,`${path}.decision`,'Open case has a final decision',entry.sourceId,entry.surfaceId,entry.id);
      if (source?.included === 'YES') add('UNRESOLVED_INCLUDED',BLOCK,path,'Unresolved correction affects an included source',entry.sourceId,entry.surfaceId,entry.id);
      if (!entry.evidenceIds.length) add('CASE_EVIDENCE_EMPTY',ATTENTION,`${path}.evidenceIds`,'No supporting evidence',entry.sourceId,entry.surfaceId,entry.id);
    }
    if (entry.state === 'resolved' || entry.state === 'rejected') {
      if (entry.decision === UNKNOWN || entry.decision === 'defer') add('DECISION_MISSING',BLOCK,`${path}.decision`,'Final case needs an explicit decision',entry.sourceId,entry.surfaceId,entry.id);
      if (entry.decisionOn === UNKNOWN) add('DECISION_DATE_UNKNOWN',BLOCK,`${path}.decisionOn`,'Decision date is UNKNOWN',entry.sourceId,entry.surfaceId,entry.id);
      if (!entry.decisionNote.trim()) add('DECISION_NOTE_MISSING',BLOCK,`${path}.decisionNote`,'Decision rationale missing',entry.sourceId,entry.surfaceId,entry.id);
      if (!entry.evidenceIds.length) add('DECISION_EVIDENCE_MISSING',BLOCK,`${path}.evidenceIds`,'Final decision lacks evidence',entry.sourceId,entry.surfaceId,entry.id);
      if (entry.state === 'resolved' && entry.decision !== 'accept') add('DECISION_STATE_MISMATCH',BLOCK,`${path}.state`,'Resolved case requires accepted decision',entry.sourceId,entry.surfaceId,entry.id);
      if (entry.state === 'rejected' && entry.decision !== 'decline') add('DECISION_STATE_MISMATCH',BLOCK,`${path}.state`,'Rejected case requires declined decision',entry.sourceId,entry.surfaceId,entry.id);
    }
    if (entry.state === 'withdrawn' && entry.decision === 'accept') add('WITHDRAWN_ACCEPTED',BLOCK,path,'Withdrawn case cannot be accepted',entry.sourceId,entry.surfaceId,entry.id);
    if (entry.decisionOn !== UNKNOWN && entry.openedOn !== UNKNOWN && entry.decisionOn < entry.openedOn)
      add('DECISION_BEFORE_OPEN',BLOCK,path,'Decision predates opening',entry.sourceId,entry.surfaceId,entry.id);
    if (entry.permission !== 'YES' && entry.decision === 'accept') add('CASE_PERMISSION',BLOCK,path,'Acceptance requires explicit permission',entry.sourceId,entry.surfaceId,entry.id);
    if (entry.decision === 'accept' && !entry.proposedText.trim()) add('PROPOSAL_MISSING',BLOCK,`${path}.proposedText`,'Accepted case lacks proposed text',entry.sourceId,entry.surfaceId,entry.id);
    if (entry.locale === UNKNOWN) add('CASE_LOCALE_UNKNOWN',ATTENTION,`${path}.locale`,'Case locale UNKNOWN',entry.sourceId,entry.surfaceId,entry.id);
    if (today !== UNKNOWN) for (const key of ['openedOn','updatedOn','decisionOn'])
      if (entry[key] !== UNKNOWN && entry[key] > today) add('FUTURE_DATE',BLOCK,`${path}.${key}`,'Date later than reference',entry.sourceId,entry.surfaceId,entry.id);
  }
  for (const surface of register.surfaces) {
    const path=`surfaces.${surface.id}`;
    if (!surface.sourceIds.length) add('SURFACE_NO_SOURCES',BLOCK,`${path}.sourceIds`,'Surface has no sources',null,surface.id);
    for (const id of surface.sourceIds) {
      const source=sources.get(id);
      if (!source) add('SURFACE_SOURCE_MISSING',BLOCK,`${path}.sourceIds`,'Source not found',id,surface.id);
      else if (source.included !== 'YES') add('SURFACE_SOURCE_HELD',BLOCK,`${path}.sourceIds`,'Surface links to excluded source',id,surface.id);
    }
    for (const id of surface.caseIds) {
      const item=cases.get(id);
      if (!item) add('SURFACE_CASE_MISSING',BLOCK,`${path}.caseIds`,'Case absent',null,surface.id,id);
      else if (item.surfaceId !== surface.id) add('SURFACE_CASE_MISMATCH',BLOCK,`${path}.caseIds`,'Case assigned to another surface',item.sourceId,surface.id,id);
    }
    if (requireOffline && surface.offline !== 'YES') add('SURFACE_OFFLINE',BLOCK,`${path}.offline`,'Offline evidence must be YES',null,surface.id);
    if (surface.keyboard !== 'YES') add('KEYBOARD_EVIDENCE',BLOCK,`${path}.keyboard`,'Keyboard evidence absent',null,surface.id);
    if (surface.screenReader !== 'YES') add('SCREEN_READER_EVIDENCE',BLOCK,`${path}.screenReader`,'Screen reader evidence absent',null,surface.id);
    if (surface.minimumTargetPx === UNKNOWN) add('TARGET_UNKNOWN',BLOCK,`${path}.minimumTargetPx`,'Target size UNKNOWN',null,surface.id);
    else if (surface.minimumTargetPx < 44) add('TARGET_TOO_SMALL',BLOCK,`${path}.minimumTargetPx`,'Target smaller than 44px',null,surface.id);
    if (surface.publishedOn === UNKNOWN) add('SURFACE_DATE_UNKNOWN',INFORMATION,`${path}.publishedOn`,'Publication date UNKNOWN',null,surface.id);
    if (today !== UNKNOWN && surface.publishedOn !== UNKNOWN && surface.publishedOn > today) add('FUTURE_DATE',BLOCK,`${path}.publishedOn`,'Date later than reference',null,surface.id);
    if (requirePairs && !register.surfaces.some(s=>s.id!==surface.id && s.locale!==surface.locale && s.route.replace(/(?:-en|-fr)(?=\.)/u,'')===surface.route.replace(/(?:-en|-fr)(?=\.)/u,'')))
      add('LANGUAGE_PAIR_MISSING',BLOCK,`${path}.locale`,'Missing EN/FR surface companion',null,surface.id);
  }
  findings.sort((a,b)=>a.path.localeCompare(b.path)||a.code.localeCompare(b.code));
  return {
    releaseId:register.releaseId, blocked:findings.some(f=>f.level===BLOCK), findings,
    blockingCount:findings.filter(f=>f.level===BLOCK).length,
    attentionCount:findings.filter(f=>f.level===ATTENTION).length,
    informationCount:findings.filter(f=>f.level===INFORMATION).length,
    sourceCount:register.sources.length,caseCount:register.cases.length,evidenceCount:register.evidence.length,
    surfaceCount:register.surfaces.length, casesBySurface:Object.fromEntries(affected),
  };
}
