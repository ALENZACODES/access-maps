/** Deterministic fail-closed audit of offline reference packs. */
import { SOURCE_IDS, SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';
import { referenceIndex, REFERENCE_SCHEMA } from './reference-core.mjs';

const NORMALIZE = /\s+/gu;
const trim = (value) => value.normalize('NFC').replace(NORMALIZE, ' ').trim();
const noticeIncludes = (text, required) => trim(text).includes(trim(required));
const legalNotices = Object.freeze({
  'Metrolinx-AUA': Object.freeze([METROLINX_AUA_LEGEND, METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR]),
  'OGL-Ontario-Metrolinx': Object.freeze([METROLINX_OGL_NOTICE]),
  'ODbL-1.0': Object.freeze([SOURCES.osm.notices.en[0], SOURCES.osm.notices.en[1]]),
  'LTC-Open-Data-Terms': Object.freeze([SOURCES.ltc.notices.en[0]]),
});
export const BLOCKING_CODES = Object.freeze([
  'NO_INCLUDED_SOURCES', 'NO_SURFACES', 'SOURCE_NOT_FOUND', 'SOURCE_NOT_INCLUDED',
  'REFERENCE_NOT_FOUND', 'REFERENCE_SOURCE_MISMATCH', 'REFERENCE_NOT_LINKED',
  'SOURCE_UNKNOWN', 'SOURCE_URL_UNKNOWN', 'LICENCE_UNKNOWN', 'LICENCE_URL_UNKNOWN',
  'PERMISSION_UNKNOWN', 'PERMISSION_NO', 'TIER_UNKNOWN', 'ACQUIRED_DATE_UNKNOWN',
  'TERMS_DATE_UNKNOWN', 'SOURCE_NOTICE_MISSING', 'REFERENCE_URL_UNKNOWN',
  'REFERENCE_LICENCE_UNKNOWN', 'REFERENCE_DATE_UNKNOWN', 'REFERENCE_TIER_UNKNOWN',
  'REFERENCE_HASH_UNKNOWN', 'NOTICE_MISSING', 'NOTICE_INCOMPATIBLE', 'MAP_CREDIT_MISSING',
  'MAP_CREDIT_UNKNOWN', 'OFFLINE_NO', 'OFFLINE_UNKNOWN', 'KEYBOARD_NO', 'KEYBOARD_UNKNOWN',
  'SCREEN_READER_NO', 'SCREEN_READER_UNKNOWN', 'TARGET_TOO_SMALL', 'TARGET_UNKNOWN',
  'SURFACE_EMPTY', 'SOURCE_NO_REFERENCES', 'REFERENCE_NOT_USED', 'SOURCE_MISSING_LICENCE',
  'REFERENCE_LICENCE_MISMATCH', 'REFERENCE_DATE_CONFLICT', 'REFERENCE_TIER_CONFLICT',
  'SOURCE_DATE_CONFLICT', 'MIXED_SOURCE_RIGHTS', 'OTHER_LICENCE_UNKNOWN',
]);
function message(code, level, path, subject, detail) {return {code,level,path,subject,detail};}
function chronological(a,b) {return a !== 'UNKNOWN' && b !== 'UNKNOWN' && a > b;}
function providerLicenceMismatch(source) {
  if (source.provider === 'osm' && source.licence !== 'ODbL-1.0') return true;
  if (source.provider === 'ltc' && source.licence !== 'LTC-Open-Data-Terms') return true;
  if (source.provider === 'metrolinx' && !['Metrolinx-AUA','OGL-Ontario-Metrolinx'].includes(source.licence)) return true;
  if (source.provider === 'other' && !['OTHER-OPEN','UNKNOWN'].includes(source.licence)) return true;
  return false;
}
export function auditReferencePack(pack) {
  if (pack.schema !== REFERENCE_SCHEMA) throw new TypeError('Unsupported reference pack');
  const findings = [];
  const add = (code, path, subject, detail = '', level = 'block') => findings.push(message(code,level,path,subject,detail));
  const lookup = referenceIndex(pack);
  const usedReferences = new Set();
  const usedSources = new Set();
  const included = pack.sources.filter((source)=>source.state==='included');
  if (included.length===0) add('NO_INCLUDED_SOURCES','sources',pack.releaseId);
  if (pack.surfaces.length===0) add('NO_SURFACES','surfaces',pack.releaseId);
  for (const source of pack.sources) {
    const path = `sources.${source.id}`;
    if (source.state!=='included') continue;
    if (source.provider==='UNKNOWN') add('SOURCE_UNKNOWN',path,source.id);
    if (source.sourceUrl==='UNKNOWN') add('SOURCE_URL_UNKNOWN',path,source.id);
    if (source.licence==='UNKNOWN') add('LICENCE_UNKNOWN',path,source.id);
    if (source.licenceUrl==='UNKNOWN') add('LICENCE_URL_UNKNOWN',path,source.id);
    if (source.permission!=='YES') add(source.permission==='NO'?'PERMISSION_NO':'PERMISSION_UNKNOWN',path,source.id);
    if (source.tier==='UNKNOWN') add('TIER_UNKNOWN',path,source.id);
    if (source.acquiredDate==='UNKNOWN') add('ACQUIRED_DATE_UNKNOWN',path,source.id);
    if (source.termsDate==='UNKNOWN') add('TERMS_DATE_UNKNOWN',path,source.id);
    if (source.datasetDate==='UNKNOWN') add('DATASET_DATE_UNKNOWN',path,source.id,'', 'info');
    if (!source.notice.trim()) add('SOURCE_NOTICE_MISSING',path,source.id);
    if (providerLicenceMismatch(source)) add('SOURCE_MISSING_LICENCE',path,source.id,source.licence);
    if (chronological(source.datasetDate,source.acquiredDate)) add('SOURCE_DATE_CONFLICT',path,source.id,'Dataset date after acquisition', 'notice');
    if (source.referenceIds.length===0) add('SOURCE_NO_REFERENCES',path,source.id);
    for (const refId of source.referenceIds) {
      const ref=lookup.references.get(refId);
      if (!ref) add('REFERENCE_NOT_FOUND',path,refId);
      else if (ref.sourceId!==source.id) add('REFERENCE_SOURCE_MISMATCH',path,refId);
    }
    const needs=legalNotices[source.licence]??[];
    for(const required of needs) if(!noticeIncludes(source.notice,required)) add('NOTICE_MISSING',path,source.id,required.slice(0,90));
    if(source.licence==='Metrolinx-AUA' && noticeIncludes(source.notice,METROLINX_OGL_NOTICE)) add('NOTICE_INCOMPATIBLE',path,source.id,'OGL notice in AUA record');
    if(source.licence==='OGL-Ontario-Metrolinx' && noticeIncludes(source.notice,METROLINX_AUA_LEGEND)) add('NOTICE_INCOMPATIBLE',path,source.id,'AUA notice in OGL record');
    if(source.licence==='OTHER-OPEN' && source.licenceUrl==='UNKNOWN') add('OTHER_LICENCE_UNKNOWN',path,source.id);
  }
  for(const ref of pack.references) {
    const path=`references.${ref.id}`;
    const source=lookup.sources.get(ref.sourceId);
    if(!source) {add('SOURCE_NOT_FOUND',path,ref.sourceId);continue;}
    if(source.state!=='included') continue;
    if(!source.referenceIds.includes(ref.id)) add('REFERENCE_NOT_LINKED',path,ref.id);
    if(ref.url==='UNKNOWN') add('REFERENCE_URL_UNKNOWN',path,ref.id);
    if(ref.licenceUrl==='UNKNOWN') add('REFERENCE_LICENCE_UNKNOWN',path,ref.id);
    if(ref.collectedDate==='UNKNOWN') add('REFERENCE_DATE_UNKNOWN',path,ref.id);
    if(ref.tier==='UNKNOWN') add('REFERENCE_TIER_UNKNOWN',path,ref.id);
    if(ref.sha256==='UNKNOWN') add('REFERENCE_HASH_UNKNOWN',path,ref.id,'Local capture digest not supplied','notice');
    if(ref.licenceUrl!=='UNKNOWN' && source.licenceUrl!=='UNKNOWN' && ref.licenceUrl!==source.licenceUrl) add('REFERENCE_LICENCE_MISMATCH',path,ref.id);
    if(ref.tier!=='UNKNOWN' && source.tier!=='UNKNOWN' && ref.tier!==source.tier) add('REFERENCE_TIER_CONFLICT',path,ref.id,'Reference and source evidence tiers differ','notice');
    if(chronological(ref.collectedDate,source.acquiredDate)) add('REFERENCE_DATE_CONFLICT',path,ref.id,'Reference collected after recorded acquisition','notice');
    if(chronological(ref.termsDate,ref.collectedDate)) add('REFERENCE_DATE_CONFLICT',path,ref.id,'Terms date after reference capture','notice');
  }
  for(const surface of pack.surfaces){
    const path=`surfaces.${surface.id}`;
    if(surface.sourceIds.length===0) add('SURFACE_EMPTY',path,surface.id);
    if(surface.offline!=='YES') add(surface.offline==='NO'?'OFFLINE_NO':'OFFLINE_UNKNOWN',path,surface.id);
    if(surface.keyboard!=='YES') add(surface.keyboard==='NO'?'KEYBOARD_NO':'KEYBOARD_UNKNOWN',path,surface.id);
    if(surface.screenReader!=='YES') add(surface.screenReader==='NO'?'SCREEN_READER_NO':'SCREEN_READER_UNKNOWN',path,surface.id);
    if(surface.targetPx==='UNKNOWN') add('TARGET_UNKNOWN',path,surface.id);
    else if(surface.targetPx<44) add('TARGET_TOO_SMALL',path,surface.id,String(surface.targetPx));
    const linked=[];
    for(const sourceId of surface.sourceIds){
      usedSources.add(sourceId);
      const source=lookup.sources.get(sourceId);
      if(!source) add('SOURCE_NOT_FOUND',path,sourceId);
      else if(source.state!=='included') add('SOURCE_NOT_INCLUDED',path,sourceId);
      else linked.push(source);
    }
    if(linked.some(s=>s.provider==='osm')) {
      if(surface.mapCredit!=='YES') add(surface.mapCredit==='UNKNOWN'?'MAP_CREDIT_UNKNOWN':'MAP_CREDIT_MISSING',path,surface.id);
    }
    const byId=new Set(surface.referenceIds);
    for(const refId of surface.referenceIds){
      usedReferences.add(refId);
      const ref=lookup.references.get(refId);
      if(!ref) add('REFERENCE_NOT_FOUND',path,refId);
      else if(!surface.sourceIds.includes(ref.sourceId)) add('REFERENCE_SOURCE_MISMATCH',path,refId);
    }
    for(const source of linked){
      if(!source.referenceIds.some(refId=>byId.has(refId))) add('REFERENCE_NOT_LINKED',path,source.id);
    }
    if(linked.some(s=>s.licence==='ODbL-1.0')&&linked.some(s=>s.licence!=='ODbL-1.0')) {
      add('MIXED_SOURCE_RIGHTS',path,surface.id,'Mixed data rights require separate handling','notice');
    }
  }
  for(const ref of pack.references) {
    if(lookup.sources.get(ref.sourceId)?.state==='included'&&!usedReferences.has(ref.id)) add('REFERENCE_NOT_USED',`references.${ref.id}`,ref.id,'Unused reference','info');
  }
  for(const source of included) if(!usedSources.has(source.id)) add('SOURCE_NOT_USED',`sources.${source.id}`,source.id,'Unused source','info');
  findings.sort((a,b)=>a.path.localeCompare(b.path)||a.code.localeCompare(b.code)||a.subject.localeCompare(b.subject));
  return Object.freeze({releaseId:pack.releaseId,blocked:findings.some(f=>f.level==='block'),findings:Object.freeze(findings),sources:pack.sources.length,references:pack.references.length,surfaces:pack.surfaces.length,blockingCount:findings.filter(f=>f.level==='block').length,noticeCount:findings.filter(f=>f.level==='notice').length,informationCount:findings.filter(f=>f.level==='info').length});
}
export function compareReferencePacks(previous, candidate) {
  const before=referenceIndex(previous), after=referenceIndex(candidate);
  const changes=[];
  const add=(code,id,beforeValue,afterValue,blocking=true)=>changes.push({code,id,before:beforeValue,after:afterValue,blocking});
  for(const source of previous.sources.filter(s=>s.state==='included')) {
    const now=after.sources.get(source.id);
    if(!now||now.state!=='included') {add('SOURCE_REMOVED',source.id,source.state,now?.state??'ABSENT');continue;}
    for(const field of ['provider','licence','licenceUrl','sourceUrl','permission','tier','datasetDate','acquiredDate','termsDate','notice']) {
      if(source[field]!==now[field]) add(`SOURCE_${field.toUpperCase()}`,source.id,String(source[field]),String(now[field]),field!=='datasetDate');
    }
    for(const refId of source.referenceIds) if(!now.referenceIds.includes(refId)) add('SOURCE_REFERENCE_REMOVED',source.id,refId,'ABSENT');
  }
  for(const ref of previous.references) {
    const now=after.references.get(ref.id);
    if(!now) {add('REFERENCE_REMOVED',ref.id,ref.sourceId,'ABSENT');continue;}
    for(const field of ['sourceId','url','licenceUrl','collectedDate','tier','sha256']) if(ref[field]!==now[field]) add(`REFERENCE_${field.toUpperCase()}`,ref.id,String(ref[field]),String(now[field]),field!=='sha256');
  }
  for(const surface of previous.surfaces) {
    const now=after.surfaces.get(surface.id);
    if(!now) {add('SURFACE_REMOVED',surface.id,surface.route,'ABSENT');continue;}
    for(const field of ['language','offline','keyboard','screenReader','targetPx','mapCredit','route']) if(surface[field]!==now[field]) add(`SURFACE_${field.toUpperCase()}`,surface.id,String(surface[field]),String(now[field]),field!=='route');
    for(const sourceId of surface.sourceIds) if(!now.sourceIds.includes(sourceId)) add('SURFACE_SOURCE_REMOVED',surface.id,sourceId,'ABSENT');
    for(const refId of surface.referenceIds) if(!now.referenceIds.includes(refId)) add('SURFACE_REFERENCE_REMOVED',surface.id,refId,'ABSENT');
  }
  const audit=auditReferencePack(candidate);
  changes.sort((a,b)=>a.id.localeCompare(b.id)||a.code.localeCompare(b.code));
  return Object.freeze({beforeId:previous.releaseId,afterId:candidate.releaseId,changes:Object.freeze(changes),audit,blocked:audit.blocked||changes.some(c=>c.blocking)});
}
