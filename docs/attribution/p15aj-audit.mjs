import {
 fail,exact,id,date,hash,array,unique,bodyHash,copy,sorted
} from './p15-custody-contract.mjs';
import {validateCustodyLedger} from './p15-custody-ledger.mjs';
import {validateRetentionPolicySet,buildRetentionReviewPlan,validateRetentionReviewLedger} from './p15aj-retention.mjs';
import {validateHoldLedger,activeHoldsForItem,holdSummary} from './p15aj-holds.mjs';
import {validateDispositionRegister,dispositionSummary,activeDispositionForItem} from './p15aj-disposition.mjs';

export const GOVERNANCE_SNAPSHOT_SCHEMA='access-maps-evidence-governance-snapshot/1';
export function auditEvidenceGovernance(ledgerInput,policyInput,reviewInput,holdInput,dispositionInput,{asOf}={}){
 const ledger=validateCustodyLedger(ledgerInput),policies=validateRetentionPolicySet(policyInput);
 const reviews=validateRetentionReviewLedger(reviewInput,ledger,policies);
 const holds=validateHoldLedger(holdInput,ledger),dispositions=validateDispositionRegister(dispositionInput);
 date(asOf);
 const plan=buildRetentionReviewPlan(ledger,policies,{planId:'audit-plan',asOf});
 const findings=[];
 for(const item of ledger.items){
  const retention=plan.items.find(row=>row.itemId===item.itemId);
  const activeHolds=activeHoldsForItem(holds,ledger,item.itemId);
  const activeProposals=activeDispositionForItem(dispositions,item.itemId);
  const latestReview=reviews.reviews.filter(row=>row.itemId===item.itemId).at(-1)??null;
  if(retention.state==='unknown')findings.push({code:'RETENTION_POLICY_UNKNOWN',itemId:item.itemId});
  if(retention.state==='expired'&&!latestReview)findings.push({code:'EXPIRED_WITHOUT_REVIEW',itemId:item.itemId});
  if(activeHolds.length&&activeProposals.length)findings.push({code:'HOLD_AND_DISPOSITION_CONFLICT',itemId:item.itemId});
  if(activeProposals.length&&activeHolds.length===0&&retention.state!=='expired')
   findings.push({code:'DISPOSITION_WITHOUT_EXPIRY',itemId:item.itemId});
  if(activeProposals.length&&latestReview?.decision!=='propose-disposition')
   findings.push({code:'DISPOSITION_REVIEW_MISMATCH',itemId:item.itemId});
 }
 const ordered=sorted(findings,row=>`${row.code}:${row.itemId}`);
 const result={ledgerId:ledger.ledgerId,ledgerDigest:ledger.digest,policySetDigest:policies.digest,
  retentionPlanDigest:plan.digest,reviewLedgerDigest:reviews.digest,holdLedgerDigest:holds.digest,
  dispositionRegisterDigest:dispositions.digest,asOf,findings:ordered,
  summary:{items:ledger.items.length,findings:ordered.length,
   activeHolds:holdSummary(holds,ledger).active,
   activeProposals:dispositionSummary(dispositions).proposed+
    dispositionSummary(dispositions).approvedForManualReview},
  digest:''};
 result.digest=bodyHash(result);return result;
}
export function createGovernanceSnapshot(input,{snapshotId,createdOn}={}){
 id(snapshotId);date(createdOn);date(input.asOf);
 fail(createdOn>=input.asOf,'DATE_ORDER','Snapshot date predates audit date.');
 const result={schema:GOVERNANCE_SNAPSHOT_SCHEMA,snapshotId,createdOn,
  ledgerId:input.ledgerId,ledgerDigest:input.ledgerDigest,policySetDigest:input.policySetDigest,
  retentionPlanDigest:input.retentionPlanDigest,reviewLedgerDigest:input.reviewLedgerDigest,
  holdLedgerDigest:input.holdLedgerDigest,dispositionRegisterDigest:input.dispositionRegisterDigest,
  asOf:input.asOf,findings:copy(input.findings),summary:copy(input.summary),digest:''};
 result.digest=bodyHash(result);return result;
}
export function validateGovernanceSnapshot(input){
 exact(input,['schema','snapshotId','createdOn','ledgerId','ledgerDigest','policySetDigest',
  'retentionPlanDigest','reviewLedgerDigest','holdLedgerDigest','dispositionRegisterDigest',
  'asOf','findings','summary','digest']);
 fail(input.schema===GOVERNANCE_SNAPSHOT_SCHEMA,'SCHEMA','Unsupported governance snapshot.');
 id(input.snapshotId);date(input.createdOn);id(input.ledgerId);date(input.asOf);
 for(const field of ['ledgerDigest','policySetDigest','retentionPlanDigest','reviewLedgerDigest',
  'holdLedgerDigest','dispositionRegisterDigest','digest'])hash(input[field],field);
 array(input.findings,'findings',{max:50000});
 unique(input.findings.map(row=>`${row.code}:${row.itemId}`),'governance findings');
 for(const row of input.findings){exact(row,['code','itemId']);id(row.itemId);fail(typeof row.code==='string'&&/^[A-Z][A-Z0-9_]*$/u.test(row.code),'FINDING_CODE','Finding code invalid.');}
 fail(input.createdOn>=input.asOf,'DATE_ORDER','Snapshot date predates audit date.');
 fail(input.digest===bodyHash(input),'HASH','Governance snapshot digest invalid.');
 return copy(input);
}
export function compareGovernanceSnapshots(previousInput,currentInput){
 const previous=validateGovernanceSnapshot(previousInput),current=validateGovernanceSnapshot(currentInput);
 fail(current.createdOn>=previous.createdOn,'DATE_ORDER','Snapshot dates moved backwards.');
 const before=new Map(previous.findings.map(row=>[`${row.code}:${row.itemId}`,row]));
 const after=new Map(current.findings.map(row=>[`${row.code}:${row.itemId}`,row]));
 const keys=[...new Set([...before.keys(),...after.keys()])].sort();
 const changes=keys.map(key=>({key,state:!before.has(key)?'added':!after.has(key)?'cleared':'persisting'}));
 const summary={added:changes.filter(row=>row.state==='added').length,
  cleared:changes.filter(row=>row.state==='cleared').length,
  persisting:changes.filter(row=>row.state==='persisting').length};
 const result={previousSnapshotDigest:previous.digest,currentSnapshotDigest:current.digest,
  changes,summary,digest:''};result.digest=bodyHash(result);return result;
}
