import {fail,exact,date,hash,array,unique,bodyHash,sorted} from './p15-custody-contract.mjs';
import {validateCustodyLedger} from './p15-custody-ledger.mjs';
import {validateRetentionPolicySet,validateRetentionReviewPlan} from './p15aj-retention.mjs';
import {validateExceptionRegister} from './p15ak-exceptions.mjs';

export function auditRetentionExceptions(exceptionInput,ledgerInput,policyInput,planInput,{asOf}={}){
 const register=validateExceptionRegister(exceptionInput),ledger=validateCustodyLedger(ledgerInput);
 const policies=validateRetentionPolicySet(policyInput),plan=validateRetentionReviewPlan(planInput,ledger,policies);
 date(asOf);const findings=[];
 for(const row of register.exceptions){
  const item=ledger.items.find(value=>value.itemId===row.itemId);
  if(!item){findings.push({code:'ITEM_MISSING',exceptionId:row.exceptionId});continue;}
  if(row.ledgerDigest!==ledger.digest||row.itemDigest!==bodyHash(item))
   findings.push({code:'CUSTODY_REVISION_CHANGED',exceptionId:row.exceptionId});
  if(row.policySetDigest!==policies.digest)
   findings.push({code:'POLICY_REVISION_CHANGED',exceptionId:row.exceptionId});
  if(row.retentionPlanDigest!==plan.digest)
   findings.push({code:'RETENTION_PLAN_CHANGED',exceptionId:row.exceptionId});
  if(row.state==='approved'&&row.requestedUntil<asOf)
   findings.push({code:'APPROVED_EXCEPTION_EXPIRED',exceptionId:row.exceptionId});
  if(row.state==='approved'&&row.requestedOn>asOf)
   findings.push({code:'APPROVAL_NOT_YET_ACTIVE',exceptionId:row.exceptionId});
  if(row.state==='requested'&&row.requestedUntil<asOf)
   findings.push({code:'PENDING_REQUEST_PAST_END',exceptionId:row.exceptionId});
 }
 const ordered=sorted(findings,row=>`${row.code}:${row.exceptionId}`);
 const result={registerId:register.registerId,registerDigest:register.digest,
  ledgerDigest:ledger.digest,policySetDigest:policies.digest,retentionPlanDigest:plan.digest,
  asOf,findings:ordered,summary:{total:register.exceptions.length,findings:ordered.length,
   active:register.exceptions.filter(row=>row.state==='approved'&&row.requestedOn<=asOf&&row.requestedUntil>=asOf).length},
  digest:''};
 result.digest=bodyHash(result);return result;
}
export function validateExceptionAudit(input){
 exact(input,['registerId','registerDigest','ledgerDigest','policySetDigest','retentionPlanDigest',
  'asOf','findings','summary','digest']);
 const {digest,...body}=input;hash(digest);
 fail(digest===bodyHash(body),'HASH','Exception audit digest invalid.');
 date(input.asOf);array(input.findings,'findings',{max:50000});
 unique(input.findings.map(row=>`${row.code}:${row.exceptionId}`),'audit findings');
 exact(input.summary,['total','findings','active']);
 fail(input.summary.findings===input.findings.length,'SUMMARY','Finding count differs from summary.');
 hash(input.registerDigest);hash(input.ledgerDigest);
 hash(input.policySetDigest);hash(input.retentionPlanDigest);
 for(const row of input.findings){
  if(!['ITEM_MISSING','CUSTODY_REVISION_CHANGED','POLICY_REVISION_CHANGED',
   'RETENTION_PLAN_CHANGED','APPROVED_EXCEPTION_EXPIRED','APPROVAL_NOT_YET_ACTIVE',
   'PENDING_REQUEST_PAST_END'].includes(row.code))fail(false,'FINDING_CODE','Unsupported finding code.');
 }
 return structuredClone(input);
}
