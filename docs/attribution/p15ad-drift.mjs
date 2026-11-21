import {fail,exact,id,date,hash,sorted,copy,bodyHash,round,wilson,MAX_WINDOWS} from './p15ad-contract.mjs';
import {CALIBRATION_SCHEMA} from './p15ad-calibration.mjs';
export const DRIFT_SCHEMA='access-maps-review-quality-drift/1';
const WINDOW=['windowId','from','to','calibration'];
function windowRow(row){
 exact(row,WINDOW);
 id(row.windowId,'windowId');
 date(row.from,'window.from');
 date(row.to,'window.to');
 fail(row.from<=row.to,'DATE_ORDER','Window dates reversed.');
 fail(row.calibration?.schema===CALIBRATION_SCHEMA,'CALIBRATION','Window needs a calibration.');
 const calibration=row.calibration;
 fail(calibration?.schema===CALIBRATION_SCHEMA,'CALIBRATION','Window needs a calibration.');
 hash(calibration.digest);
 fail(calibration.asOf>=row.to,'WINDOW_DATE','Calibration date precedes window end.');
 fail(calibration.digest===bodyHash(calibration),'HASH','Window calibration digest invalid.');
 return {windowId:row.windowId,from:row.from,to:row.to,calibration};
}
function accuracy(calibration,reviewerToken){
 const row=calibration.reviewers.find(item=>item.reviewerToken===reviewerToken);
 return row?{n:row.scored,correct:row.correct,accuracy:row.accuracy,
  interval:row.accuracyInterval,coverage:row.coverage,disposition:row.disposition}:null;
}
function compareMetric(previous,current,policy){
 if(!previous||!current)return {status:'not-comparable',delta:null,significant:false};
 if(previous.n<policy.minimumScored||current.n<policy.minimumScored)
  return {status:'insufficient-sample',delta:null,significant:false};
 const delta=round(current.accuracy-previous.accuracy);
 const intervalsOverlap=previous.interval.lower<=current.interval.upper&&current.interval.lower<=previous.interval.upper;
 const significant=!intervalsOverlap&&delta<0;
 const status=significant?'regression-signal':delta<=-policy.watchAccuracyDrop?'watch':'stable';
 return {status,delta,significant,intervalsOverlap,
  previousInterval:previous.interval,currentInterval:current.interval};
}
export function compareReviewerWindows(windows,{reviewerToken,policy}={}){
 id(reviewerToken,'reviewerToken');
 fail(Array.isArray(windows)&&windows.length>=2&&windows.length<=MAX_WINDOWS,'WINDOWS','At least two bounded windows are required.');
 const ordered=sorted(windows,row=>row.from).map(windowRow);
 for(let i=1;i<ordered.length;i++)fail(ordered[i].from>ordered[i-1].to,'WINDOW_OVERLAP','Review windows must not overlap.');
 fail(ordered.some(row=>row.calibration.reviewers.some(item=>item.reviewerToken===reviewerToken)),
  'REVIEWER_MISSING','Reviewer is absent from all comparison windows.');
 const rows=ordered.map(row=>{
  const value=row.calibration.reviewers.find(item=>item.reviewerToken===reviewerToken);
  return {windowId:row.windowId,from:row.from,to:row.to,metrics:value?accuracy(row.calibration,reviewerToken):null};
 });
 const comparisons=[];
 for(let i=1;i<rows.length;i++)comparisons.push({
  fromWindow:rows[i-1].windowId,toWindow:rows[i].windowId,
  ...compareMetric(rows[i-1].metrics,rows[i].metrics,policy)});
 return {reviewerToken,windows:rows,comparisons,
  needsHumanReview:comparisons.some(row=>row.status==='regression-signal'||row.status==='watch'),
  automaticRestriction:false};
}
export function buildCohortDriftReport(windows,{policy}={}){
 fail(Array.isArray(windows)&&windows.length>=2&&windows.length<=MAX_WINDOWS,'WINDOWS','At least two windows required.');
 const ordered=sorted(windows,row=>row.from).map(windowRow),results=[];
 for(let i=1;i<ordered.length;i++)fail(ordered[i].from>ordered[i-1].to,'WINDOW_OVERLAP','Review windows must not overlap.');
 for(let i=1;i<ordered.length;i++){
  const previous=ordered[i-1].calibration,current=ordered[i].calibration;
  const before=previous.cohort,after=current.cohort;
  const delta=before.accuracy===null||after.accuracy===null?null:round(after.accuracy-before.accuracy);
  const beforeInterval=wilson(before.correct,before.scored),afterInterval=wilson(after.correct,after.scored);
  const overlap=beforeInterval.lower!==null&&afterInterval.lower!==null&&
   beforeInterval.lower<=afterInterval.upper&&afterInterval.lower<=beforeInterval.upper;
  results.push({fromWindow:ordered[i-1].windowId,toWindow:ordered[i].windowId,
   previous:before,current:after,delta,intervalsOverlap:overlap,
   status:delta===null?'not-comparable':!overlap&&delta<0?'regression-signal':
    delta<=-policy.watchAccuracyDrop?'watch':'stable',
   needsHumanReview:delta!==null&&delta<=-policy.watchAccuracyDrop});
 }
 const report={schema:DRIFT_SCHEMA,comparisons:results,
  summary:{comparisons:results.length,regressions:results.filter(row=>row.status==='regression-signal').length,
   watches:results.filter(row=>row.status==='watch').length,
   automaticRestriction:false},digest:''};
 report.digest=bodyHash(report);return report;
}
export function verifyDriftReport(input){
 exact(input,['schema','comparisons','summary','digest']);
 fail(input.schema===DRIFT_SCHEMA,'SCHEMA','Unsupported drift report.');
 hash(input.digest);
 fail(input.digest===bodyHash(input),'HASH','Drift report digest invalid.');
 fail(input.summary.automaticRestriction===false,'AUTOMATION','Drift report cannot automatically restrict reviewers.');
 return copy(input);
}
