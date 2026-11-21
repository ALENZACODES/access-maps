import {MAX_REVIEWERS,MAX_ITEMS,fail,exact,id,date,hash,integer,fraction,copy,bodyHash,wilson,round,noIdentity} from './p15ad-contract.mjs';
import {validateReferenceSet,validateResponseSet,joinReviewEvidence} from './p15ad-reference.mjs';
import {confusionMatrix,matrixMetrics} from './p15ad-agreement.mjs';
export const CALIBRATION_SCHEMA='access-maps-review-calibration/1';
export const POLICY_SCHEMA='access-maps-review-quality-policy/1';
const POLICY=['minimumScored','minimumCoverage','minimumAccuracy','minimumUnknownRecall','maximumAbstention','watchAccuracyDrop'];
function policyRow(row){
 exact(row,POLICY);
 integer(row.minimumScored,'minimumScored',{min:1,max:MAX_ITEMS});
 fraction(row.minimumCoverage,'minimumCoverage');
 fraction(row.minimumAccuracy,'minimumAccuracy');
 fraction(row.minimumUnknownRecall,'minimumUnknownRecall');
 fraction(row.maximumAbstention,'maximumAbstention');
 fraction(row.watchAccuracyDrop,'watchAccuracyDrop');
 return copy(row);
}
export function createQualityPolicy(input){
 const value={schema:POLICY_SCHEMA,...policyRow(input),digest:''};
 value.digest=bodyHash(value);return value;
}
export function validateQualityPolicy(input){
 exact(input,['schema',...POLICY,'digest']);
 fail(input.schema===POLICY_SCHEMA,'SCHEMA','Unsupported quality policy.');
 const {schema,digest,...fields}=input;
 const result=createQualityPolicy(fields);
 hash(input.digest);
 fail(result.digest===input.digest,'HASH','Quality policy digest invalid.');
 return result;
}
function metricRows(joined,reviewerToken){
 const allRows=joined.filter(row=>row.reviewerToken===reviewerToken);
 const knownRows=allRows.filter(row=>row.referenceState!=='UNKNOWN');
 const scored=knownRows.filter(row=>row.decision!=='abstain'&&row.observedState!=='UNKNOWN');
 const correct=scored.filter(row=>row.observedState===row.referenceState).length;
 const abstained=knownRows.filter(row=>row.decision==='abstain'||row.observedState==='UNKNOWN').length;
 const matrix=confusionMatrix(scored.map(row=>({referenceState:row.referenceState,observedState:row.observedState})));
 const metrics=matrixMetrics(matrix);
 const unknownRows=allRows.filter(row=>row.referenceState==='UNKNOWN');
 const unknownCorrect=unknownRows.filter(row=>row.observedState==='UNKNOWN'&&row.decision==='insufficient').length;
 const totalEligible=knownRows.length;
 const coverage=totalEligible?scored.length/totalEligible:0;
 const abstentionRate=totalEligible?abstained/totalEligible:0;
 const accuracy=scored.length?correct/scored.length:null;
 const interval=wilson(correct,scored.length);
 return {reviewerToken,totalEligible,scored:scored.length,correct,incorrect:scored.length-correct,
  abstained,coverage:round(coverage),abstentionRate:round(abstentionRate),
  accuracy:accuracy===null?null:round(accuracy),accuracyInterval:interval,
  macroRecall:metrics.macroRecall,macroF1:metrics.macroF1,
  confusion:matrix,unknownReferenceCount:unknownRows.length,
  unknownCorrect,unknownRecall:unknownRows.length?round(unknownCorrect/unknownRows.length):null};
}
function disposition(metrics,policy){
 if(metrics.scored<policy.minimumScored)return 'insufficient-sample';
 if(metrics.coverage<policy.minimumCoverage)return 'coverage-watch';
 if(metrics.accuracy<policy.minimumAccuracy)return 'manual-review';
 if(metrics.unknownRecall!==null&&metrics.unknownRecall<policy.minimumUnknownRecall)return 'unknown-handling-watch';
 if(metrics.abstentionRate>policy.maximumAbstention)return 'abstention-watch';
 return 'within-policy';
}
export function calibrateReviewers(referenceInput,responseInput,{policy:policyInput,calibrationId,asOf}={}){
 const reference=validateReferenceSet(referenceInput),responses=validateResponseSet(responseInput);
 const policy=validateQualityPolicy(policyInput);
 id(calibrationId,'calibrationId');date(asOf,'asOf');
 fail(reference.createdOn<=asOf&&responses.createdOn<=asOf,'DATE','Calibration date predates its inputs.');
 const joined=joinReviewEvidence(reference,responses);
 const reviewerTokens=[...new Set(joined.map(row=>row.reviewerToken))].sort();
 fail(reviewerTokens.length<=MAX_REVIEWERS,'LIMIT','Too many reviewers in calibration.');
 const metrics=reviewerTokens.map(reviewerToken=>{
  const value=metricRows(joined,reviewerToken);
  return {...value,disposition:disposition(value,policy)};
 });
 const totalScored=metrics.reduce((sum,row)=>sum+row.scored,0);
 const totalCorrect=metrics.reduce((sum,row)=>sum+row.correct,0);
 const result={schema:CALIBRATION_SCHEMA,calibrationId,asOf,
  referenceDigest:reference.digest,responseDigest:responses.digest,policyDigest:policy.digest,
  reviewers:metrics,cohort:{reviewers:metrics.length,totalEligible:metrics.reduce((sum,row)=>sum+row.totalEligible,0),
   scored:totalScored,correct:totalCorrect,accuracy:totalScored?round(totalCorrect/totalScored):null,
   insufficient:metrics.filter(row=>row.disposition==='insufficient-sample').length,
   flagged:metrics.filter(row=>row.disposition!=='within-policy'&&row.disposition!=='insufficient-sample').length},
  digest:''};
 result.digest=bodyHash(result);noIdentity(result);return result;
}
export function validateCalibration(input,{reference,responseSet,policy}={}){
 exact(input,['schema','calibrationId','asOf','referenceDigest','responseDigest','policyDigest',
  'reviewers','cohort','digest']);
 fail(input.digest===bodyHash(input),'HASH','Calibration digest invalid.');
 fail(input.schema===CALIBRATION_SCHEMA,'SCHEMA','Unsupported calibration schema.');
 const expected=calibrateReviewers(reference,responseSet,{policy,calibrationId:input.calibrationId,asOf:input.asOf});
 hash(input.digest);fail(input.digest===expected.digest,'STALE_CALIBRATION','Calibration does not match current inputs.');
 return copy(input);
}
export function reviewerDisposition(calibration,reviewerToken){
 hash(calibration.digest);fail(calibration.digest===bodyHash(calibration),'HASH','Calibration digest invalid.');id(reviewerToken,'reviewerToken');
 const row=calibration.reviewers.find(value=>value.reviewerToken===reviewerToken);
 fail(row,'REVIEWER_MISSING','Reviewer is absent from calibration.');
 return {reviewerToken,disposition:row.disposition,scored:row.scored,
  accuracy:row.accuracy,coverage:row.coverage,requiresHumanReview:row.disposition!=='within-policy'&&
   row.disposition!=='insufficient-sample',automaticAction:false};
}
export function calibrationSummary(calibration){
 hash(calibration.digest);fail(calibration.digest===bodyHash(calibration),'HASH','Calibration digest invalid.');
 return {calibrationId:calibration.calibrationId,asOf:calibration.asOf,
  reviewers:calibration.cohort.reviewers,scored:calibration.cohort.scored,
  accuracy:calibration.cohort.accuracy,flagged:calibration.cohort.flagged,
  insufficient:calibration.cohort.insufficient,digest:calibration.digest};
}
