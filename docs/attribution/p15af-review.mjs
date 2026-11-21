import {fail,exact,id,token,date,hash,safeText,bodyDigest,copy,noIdentity} from './p15af-contract.mjs';
import {validateImpactCatalog} from './p15af-catalog.mjs';
export const REVIEW_SCHEMA='access-maps-source-revalidation/1';
const REVIEW_OUTCOMES=['retain-active','continue-hold','retire-source','supersede-source'];
export function assessSourceForRelease(catalogInput,{sourceId,reviewId,reviewedOn,reviewerToken,
 sourceSnapshotDigest,licenceConfirmed,attributionConfirmed,observationCurrent,reason}={}){
 const catalog=validateImpactCatalog(catalogInput);id(sourceId);id(reviewId);date(reviewedOn);
 token(reviewerToken);hash(sourceSnapshotDigest);safeText(reason,'reason',500);
 const source=catalog.sources.find(row=>row.sourceId===sourceId);
 fail(source,'SOURCE_REF','Source does not exist in catalog.');
 const checks=[
  {check:'source-state',passed:source.status==='active'},
  {check:'snapshot-integrity',passed:source.sourceDigest===sourceSnapshotDigest},
  {check:'licence-confirmed',passed:licenceConfirmed===true},
  {check:'attribution-confirmed',passed:attributionConfirmed===true},
  {check:'observation-current',passed:observationCurrent===true},
  {check:'retrieval-not-future',passed:source.retrievedOn<=reviewedOn},
  {check:'licence-known',passed:source.licence!=='UNKNOWN'},
 ];
 const result={schema:REVIEW_SCHEMA,reviewId,sourceId,reviewedOn,reviewerToken,
  catalogDigest:catalog.digest,sourceDigest:source.sourceDigest,sourceSnapshotDigest,
  checks,eligible:checks.every(row=>row.passed),outcome:checks.every(row=>row.passed)?'retain-active':'continue-hold',
  reason,automaticRelease:false,digest:''};
 result.digest=bodyDigest(result);noIdentity(result);return result;
}
export function validateSourceReview(input,{catalog}={}){
 exact(input,['schema','reviewId','sourceId','reviewedOn','reviewerToken','catalogDigest',
  'sourceDigest','sourceSnapshotDigest','checks','eligible','outcome','reason','automaticRelease','digest']);
 fail(input.schema===REVIEW_SCHEMA,'SCHEMA','Unsupported source review.');
 id(input.reviewId);id(input.sourceId);date(input.reviewedOn);token(input.reviewerToken);
 hash(input.catalogDigest);hash(input.sourceDigest);hash(input.sourceSnapshotDigest);
 safeText(input.reason,'reason',500);
 const expectedChecks=['source-state','snapshot-integrity','licence-confirmed','attribution-confirmed',
  'observation-current','retrieval-not-future','licence-known'];
 fail(Array.isArray(input.checks)&&input.checks.length===expectedChecks.length,'CHECKS','Source review checks invalid.');
 input.checks.forEach((row,index)=>{
  exact(row,['check','passed']);
  fail(row.check===expectedChecks[index]&&typeof row.passed==='boolean','CHECKS','Source review check order or value invalid.');
 });
 const eligible=input.checks.every(row=>row.passed);
 fail(input.eligible===eligible&&input.outcome===(eligible?'retain-active':'continue-hold'),
  'REVIEW_RESULT','Source review outcome does not match checks.');
 hash(input.digest);fail(input.digest===bodyDigest(input),'HASH','Source review digest invalid.');
 fail(input.automaticRelease===false,'AUTOMATION','Source review cannot release automatically.');
 noIdentity(input);
 if(catalog){
  const expected=assessSourceForRelease(catalog,{sourceId:input.sourceId,reviewId:input.reviewId,
   reviewedOn:input.reviewedOn,reviewerToken:input.reviewerToken,sourceSnapshotDigest:input.sourceSnapshotDigest,
   licenceConfirmed:input.checks.find(row=>row.check==='licence-confirmed')?.passed,
   attributionConfirmed:input.checks.find(row=>row.check==='attribution-confirmed')?.passed,
   observationCurrent:input.checks.find(row=>row.check==='observation-current')?.passed,reason:input.reason});
  fail(expected.digest===input.digest,'STALE_REVIEW','Review does not match current source metadata.');
 }
 return copy(input);
}
export function reviewCanRelease(input){
 const row=validateSourceReview(input);
 return {eligible:row.eligible&&row.outcome==='retain-active',automaticRelease:false,
  sourceId:row.sourceId,reviewDigest:row.digest,failedChecks:row.checks.filter(item=>!item.passed).map(item=>item.check),
  digest:bodyDigest({eligible:row.eligible&&row.outcome==='retain-active',automaticRelease:false,
   sourceId:row.sourceId,reviewDigest:row.digest,failedChecks:row.checks.filter(item=>!item.passed).map(item=>item.check)})};
}
export function buildSourceReviewBatch(catalogInput,{sourceIds,reviewedOn,reviewerToken}={}){
 const catalog=validateImpactCatalog(catalogInput);date(reviewedOn);id(reviewerToken);
 fail(Array.isArray(sourceIds)&&sourceIds.length<=5000,'LIMIT','Review batch too large.');
 sourceIds.forEach(id);const uniqueIds=[...new Set(sourceIds)];fail(uniqueIds.length===sourceIds.length,'DUPLICATE','Review source IDs repeat.');
 const rows=sourceIds.map(sourceId=>{
  const source=catalog.sources.find(row=>row.sourceId===sourceId);
  fail(source,'SOURCE_REF','Review source is missing.');
  return {sourceId,sourceDigest:source.sourceDigest,status:source.status,
   licence:source.licence,observedOn:source.observedOn,retrievedOn:source.retrievedOn,
   requiresReview:source.status!=='active'||source.licence==='UNKNOWN'};
 });
 const result={catalogDigest:catalog.digest,reviewedOn,reviewerToken,
  sources:rows.sort((a,b)=>a.sourceId.localeCompare(b.sourceId)),digest:''};
 result.digest=bodyDigest(result);return result;
}
