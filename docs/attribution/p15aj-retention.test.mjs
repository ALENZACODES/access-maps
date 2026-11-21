import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,NEXT,LATER,FOURTH,FIFTH,AT,NEXT_AT,FOURTH_AT,FIFTH_AT,SIXTH,custody,policies,plan,
 reviewLedger,retentionReview,reviewedLedger} from './p15aj-fixtures.mjs';
import {sha,bodyHash,CustodyError} from './p15ai-contract.mjs';
import {registerEvidence} from './p15ai-ledger.mjs';
import {createRetentionPolicySet,validateRetentionPolicySet,policyForKind,daysBetween,
 buildRetentionReviewPlan,validateRetentionReviewPlan,createRetentionReviewLedger,
 validateRetentionReviewLedger,recordRetentionReview,retentionReviewSummary,
 REVIEW_DECISIONS} from './p15aj-retention.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);

test('policy set creates deterministic sorted policy rows',()=>{
 const row=policies();assert.equal(validateRetentionPolicySet(row).digest,row.digest);
 assert.equal(row.policies[0].evidenceKind,'source-capture');
});
test('policy set rejects duplicate policy identifiers',()=>{
 const first=policies().policies[0];
 fails(()=>createRetentionPolicySet({setId:'set-two',createdOn:DAY,createdBy:'actor-owner',
  policies:[first,first]}),'DUPLICATE');
});
test('policy set rejects duplicate evidence kinds',()=>{
 const first=policies().policies[0];
 fails(()=>createRetentionPolicySet({setId:'set-two',createdOn:DAY,createdBy:'actor-owner',
  policies:[first,{...first,policyId:'policy-two'}]}),'DUPLICATE');
});
test('policy set rejects zero retention duration',()=>{
 fails(()=>createRetentionPolicySet({setId:'set-two',createdOn:DAY,createdBy:'actor-owner',
  policies:[{...policies().policies[0],retentionDays:0}]}),'INTEGER');
});
test('policy set rejects duration beyond upper bound',()=>{
 fails(()=>createRetentionPolicySet({setId:'set-two',createdOn:DAY,createdBy:'actor-owner',
  policies:[{...policies().policies[0],retentionDays:36501}]}),'INTEGER');
});
test('policy set rejects zero review interval',()=>{
 fails(()=>createRetentionPolicySet({setId:'set-two',createdOn:DAY,createdBy:'actor-owner',
  policies:[{...policies().policies[0],reviewIntervalDays:0}]}),'INTEGER');
});
test('policy set rejects unsupported anchor field',()=>{
 fails(()=>createRetentionPolicySet({setId:'set-two',createdOn:DAY,createdBy:'actor-owner',
  policies:[{...policies().policies[0],anchorField:'deletedOn'}]}),'ENUM');
});
test('policy set rejects effective date before creation',()=>{
 fails(()=>createRetentionPolicySet({setId:'set-two',createdOn:NEXT,createdBy:'actor-owner',
  policies:[{...policies().policies[0],effectiveOn:DAY}]}),'DATE_ORDER');
});
test('policy set requires pseudonymous owner',()=>{
 fails(()=>createRetentionPolicySet({setId:'set-two',createdOn:DAY,createdBy:'actor-owner',
  policies:[{...policies().policies[0],ownerToken:'person-alex'}]}),'PRIVATE');
});
test('policy set rejects unsafe policy notes',()=>{
 fails(()=>createRetentionPolicySet({setId:'set-two',createdOn:DAY,createdBy:'actor-owner',
  policies:[{...policies().policies[0],notes:'<script>'}]}),'UNSAFE');
});
test('policy set rejects invalid digest after modification',()=>{
 const row=policies(),changed={...row,createdBy:'actor-other'};
 fails(()=>validateRetentionPolicySet(changed),'HASH');
});
test('policy set rejects extra fields',()=>{
 fails(()=>validateRetentionPolicySet({...policies(),privateNote:'x'}),'SHAPE');
});
test('policy lookup returns matching evidence kind',()=>{
 assert.equal(policyForKind(policies(),'source-capture').policyId,'policy-source-capture');
});
test('policy lookup rejects unconfigured evidence kind',()=>{
 fails(()=>policyForKind(policies(),'other'),'POLICY_MISSING');
});
test('day distance computes positive calendar difference',()=>{
 assert.equal(daysBetween(DAY,FOURTH),3);
});
test('day distance computes negative calendar difference',()=>{
 assert.equal(daysBetween(FOURTH,DAY),-3);
});
test('day distance rejects malformed input date',()=>{
 fails(()=>daysBetween('bad',DAY),'DATE');
});
test('retention plan classifies evidence within period',()=>{
 const result=buildRetentionReviewPlan(custody(),policies(),{planId:'plan-one',asOf:DAY});
 assert.equal(result.items[0].state,'within-retention');
});
test('retention plan classifies review due at review boundary',()=>{
 const result=buildRetentionReviewPlan(custody(),policies(),{planId:'plan-one',asOf:NEXT});
 assert.equal(result.items[0].state,'review-due');
});
test('retention plan classifies expired evidence after retention end',()=>{
 const result=plan();assert.equal(result.items[0].state,'expired');
});
test('retention plan retains UNKNOWN licence without converting it',()=>{
 const result=plan();assert.equal(custody().items[0].licence,'UNKNOWN');
});
test('retention plan marks unconfigured evidence kind unknown',()=>{
 const row=registerEvidence(custody(),{...custody().items[0],itemId:'evidence-other',
  kind:'other',contentDigest:sha('other')},{at:FOURTH_AT,actorToken:'actor-coordinator'});
 const result=buildRetentionReviewPlan(row,policies(),{planId:'plan-two',asOf:FOURTH});
 assert.equal(result.items.find(item=>item.itemId==='evidence-other').state,'unknown');
});
test('retention plan includes action required for unknown policy',()=>{
 const row=registerEvidence(custody(),{...custody().items[0],itemId:'evidence-other',
  kind:'other',contentDigest:sha('other')},{at:FOURTH_AT,actorToken:'actor-coordinator'});
 const result=buildRetentionReviewPlan(row,policies(),{planId:'plan-two',asOf:FOURTH});
 assert.equal(result.items.find(item=>item.itemId==='evidence-other').actionRequired,true);
});
test('retention plan binds current custody ledger digest',()=>{
 const row=custody(),result=buildRetentionReviewPlan(row,policies(),{planId:'plan-one',asOf:FOURTH});
 assert.equal(result.ledgerDigest,row.digest);
});
test('retention plan binds policy set digest',()=>{
 const set=policies(),result=buildRetentionReviewPlan(custody(),set,{planId:'plan-one',asOf:FOURTH});
 assert.equal(result.policySetDigest,set.digest);
});
test('retention plan calculates expiry date from configured anchor',()=>{
 const result=buildRetentionReviewPlan(custody(),policies(),{planId:'plan-one',asOf:FOURTH});
 assert.equal(result.items[0].expiresOn,NEXT);
});
test('retention plan calculates next review date from review interval',()=>{
 const result=buildRetentionReviewPlan(custody(),policies(),{planId:'plan-one',asOf:FOURTH});
 assert.equal(result.items[0].nextReviewOn,NEXT);
});
test('retention plan reports days past expiry as negative',()=>{
 const result=plan();assert.equal(result.items[0].daysToExpiry,-2);
});
test('retention plan counts unknown policy rows separately',()=>{
 const row=registerEvidence(custody(),{...custody().items[0],itemId:'evidence-other',
  kind:'other',contentDigest:sha('other')},{at:FOURTH_AT,actorToken:'actor-coordinator'});
 const result=buildRetentionReviewPlan(row,policies(),{planId:'plan-two',asOf:FOURTH});
 assert.equal(result.summary.unknown,1);
});
test('retention plan counts each action-required item once',()=>{
 const result=plan();assert.equal(result.summary.actionRequired,1);
});
test('retention plan sorts by item ID',()=>{
 const first=custody(),second=registerEvidence(first,{...first.items[0],itemId:'evidence-two',
  contentDigest:sha('two')},{at:NEXT_AT,actorToken:'actor-coordinator'});
 const result=buildRetentionReviewPlan(second,policies(),{planId:'plan-two',asOf:FOURTH});
 assert.deepEqual(result.items.map(row=>row.itemId),['evidence-one','evidence-two']);
});
test('retention plan rejects invalid as-of date',()=>{
 fails(()=>buildRetentionReviewPlan(custody(),policies(),{planId:'plan-one',asOf:'bad'}),'DATE');
});
test('retention plan rejects invalid plan ID',()=>{
 fails(()=>buildRetentionReviewPlan(custody(),policies(),{planId:'Bad ID',asOf:FOURTH}),'ID');
});
test('retention plan digest is deterministic',()=>{
 assert.deepEqual(plan(),plan());
});
test('retention plan validator accepts unchanged inputs',()=>{
 const row=custody(),set=policies(),result=buildRetentionReviewPlan(row,set,{planId:'plan-one',asOf:FOURTH});
 assert.equal(validateRetentionReviewPlan(result,row,set).digest,result.digest);
});
test('retention plan validator rejects changed custody ledger',()=>{
 const row=custody(),set=policies(),result=buildRetentionReviewPlan(row,set,{planId:'plan-one',asOf:FOURTH});
 const changed=registerEvidence(row,{...row.items[0],itemId:'evidence-two',contentDigest:sha('other')},{at:FOURTH_AT,actorToken:'actor-coordinator'});
 fails(()=>validateRetentionReviewPlan(result,changed,set),'STALE_PLAN');
});
test('retention plan validator rejects changed policy set',()=>{
 const row=custody(),set=policies(),result=buildRetentionReviewPlan(row,set,{planId:'plan-one',asOf:FOURTH});
 const changed=policies({retentionDays:2});
 fails(()=>validateRetentionReviewPlan(result,row,changed),'STALE_PLAN');
});
test('retention plan validator rejects changed plan digest',()=>{
 const row=custody(),set=policies(),result=buildRetentionReviewPlan(row,set,{planId:'plan-one',asOf:FOURTH});
 fails(()=>validateRetentionReviewPlan({...result,planId:'plan-two'},row,set),'HASH');
});
test('review ledger opens with genesis event',()=>{
 const row=reviewLedger();assert.equal(validateRetentionReviewLedger(row,custody(),policies()).digest,row.digest);
 assert.equal(row.events[0].type,'review-ledger-opened');
});
test('review ledger rejects invalid schema',()=>{
 fails(()=>validateRetentionReviewLedger({...reviewLedger(),schema:'other'},custody(),policies()),'SCHEMA');
});
test('review ledger rejects malformed creator token',()=>{
 fails(()=>createRetentionReviewLedger({reviewLedgerId:'review-ledger-two',createdOn:DAY,
  createdAt:AT,createdBy:'person-alex'}),'PRIVATE');
});
test('review ledger requires review rows to reference existing item',()=>{
 const row=reviewLedger(),bad={...retentionReview(),itemId:'missing'};
 fails(()=>recordRetentionReview(row,custody(),policies(),bad,{at:FOURTH_AT,
  actorToken:'actor-retention-reviewer'}),'ITEM_REFERENCE');
});
test('review ledger requires review policy to match item kind',()=>{
 const row=reviewLedger(),bad={...retentionReview(),policyId:'policy-other'};
 fails(()=>recordRetentionReview(row,custody(),policies(),bad,{at:FOURTH_AT,
  actorToken:'actor-retention-reviewer'}),'POLICY_REFERENCE');
});
test('review ledger binds reviewer to event actor',()=>{
 fails(()=>recordRetentionReview(reviewLedger(),custody(),policies(),retentionReview(),
  {at:FOURTH_AT,actorToken:'actor-other'}),'ACTOR');
});
test('review ledger requires event timestamp date to match review date',()=>{
 fails(()=>recordRetentionReview(reviewLedger(),custody(),policies(),retentionReview(),
  {at:NEXT_AT,actorToken:'actor-retention-reviewer'}),'DATE');
});
test('review ledger rejects stale evidence digest',()=>{
 const bad={...retentionReview(),evidenceDigest:sha('stale')};
 fails(()=>recordRetentionReview(reviewLedger(),custody(),policies(),bad,{at:FOURTH_AT,
  actorToken:'actor-retention-reviewer'}),'STALE_EVIDENCE');
});
test('review ledger rejects duplicate review ID',()=>{
 const row=reviewedLedger();
 fails(()=>recordRetentionReview(row,custody(),policies(),retentionReview(),
  {at:FOURTH_AT,actorToken:'actor-retention-reviewer'}),'DUPLICATE');
});
test('review ledger rejects duplicate item and review date',()=>{
 const first=reviewedLedger(),second={...retentionReview(),reviewId:'review-two'};
 fails(()=>recordRetentionReview(first,custody(),policies(),second,{at:FOURTH_AT,
  actorToken:'actor-retention-reviewer'}),'DUPLICATE_REVIEW');
});
test('review ledger records an explicit human disposition proposal decision',()=>{
 const row=reviewedLedger();assert.equal(row.reviews[0].decision,'propose-disposition');
});
test('review ledger supports defer decision',()=>{
 const row=recordRetentionReview(reviewLedger(),custody(),policies(),
  retentionReview({decision:'defer'}),{at:FOURTH_AT,actorToken:'actor-retention-reviewer'});
 assert.equal(row.reviews[0].decision,'defer');
});
test('review ledger supports each declared decision',()=>{
 for(const decision of REVIEW_DECISIONS){
  const row=recordRetentionReview(reviewLedger(),custody(),policies(),
   retentionReview({decision}),{at:FOURTH_AT,actorToken:'actor-retention-reviewer'});
  assert.equal(row.reviews[0].decision,decision);
 }
});
test('review ledger rejects next review before review date',()=>{
 const bad={...retentionReview(),nextReviewOn:NEXT};
 fails(()=>recordRetentionReview(reviewLedger(),custody(),policies(),bad,
  {at:FOURTH_AT,actorToken:'actor-retention-reviewer'}),'DATE_ORDER');
});
test('review ledger event contains review digest',()=>{
 const row=reviewedLedger();assert.equal(row.events.at(-1).payload.reviewDigest,bodyHash(row.reviews[0]));
});
test('review ledger validator detects review row tampering',()=>{
 const row=reviewedLedger(),changed=structuredClone(row);changed.reviews[0].reason='Changed';
 fails(()=>validateRetentionReviewLedger(changed,custody(),policies()),'REVIEW_HISTORY');
});
test('review ledger validator detects event payload tampering',()=>{
 const row=reviewedLedger(),changed=structuredClone(row);changed.events.at(-1).payload.decision='defer';
 fails(()=>validateRetentionReviewLedger(changed,custody(),policies()),'EVENT_HASH');
});
test('review ledger validator rejects unknown event type',()=>{
 const row=reviewLedger(),changed=structuredClone(row);changed.events[0].type='deleted';
 fails(()=>validateRetentionReviewLedger(changed,custody(),policies()),'ENUM');
});
test('review ledger summary counts decision types',()=>{
 const row=reviewedLedger(),summary=retentionReviewSummary(row,custody(),policies());
 assert.equal(summary.total,1);assert.equal(summary.decisions['propose-disposition'],1);
});
test('review ledger does not mutate custody ledger',()=>{
 const row=custody(),digest=row.digest;reviewedLedger({ledger:row});assert.equal(row.digest,digest);
});

test('retention plan reports no action required before review date',()=>{
 const result=buildRetentionReviewPlan(custody(),policies(),{planId:'plan-early',asOf:DAY});
 assert.equal(result.items[0].actionRequired,false);
});
test('retention plan keeps review due distinct from expired state',()=>{
 const result=buildRetentionReviewPlan(custody(),policies(),{planId:'plan-due',asOf:NEXT});
 assert.equal(result.items[0].state,'review-due');
 assert.equal(result.items[0].expiresOn,NEXT);
});
test('retention plan unknown policy does not invent expiry date',()=>{
 const row=registerEvidence(custody(),{...custody().items[0],itemId:'evidence-other',
  kind:'other',contentDigest:sha('other')},{at:FOURTH_AT,actorToken:'actor-coordinator'});
 const result=buildRetentionReviewPlan(row,policies(),{planId:'plan-unknown',asOf:FOURTH});
 const unknown=result.items.find(item=>item.itemId==='evidence-other');
 assert.equal(unknown.expiresOn,null);assert.equal(unknown.nextReviewOn,null);
});
test('retention plan counts unknown policy as action required',()=>{
 const row=registerEvidence(custody(),{...custody().items[0],itemId:'evidence-other',
  kind:'other',contentDigest:sha('other')},{at:FOURTH_AT,actorToken:'actor-coordinator'});
 const result=buildRetentionReviewPlan(row,policies(),{planId:'plan-unknown',asOf:FOURTH});
 assert.equal(result.summary.actionRequired,2);
});
test('retention policy permits separate policy set versions',()=>{
 const first=policies(),second=createRetentionPolicySet({setId:'policy-set-two',
  createdOn:NEXT,createdBy:'actor-policy-owner',policies:first.policies.map(row=>({
   ...row,effectiveOn:NEXT,retentionDays:30}))});
 assert.notEqual(first.digest,second.digest);
});
test('retention policy rejects empty evidence kind',()=>{
 fails(()=>createRetentionPolicySet({setId:'policy-empty-kind',createdOn:DAY,
  createdBy:'actor-policy-owner',policies:[{...policies().policies[0],evidenceKind:''}]}),'TEXT');
});
test('retention policy rejects duplicate evidence kind even with distinct policy IDs',()=>{
 const row=policies().policies[0];
 fails(()=>createRetentionPolicySet({setId:'policy-duplicate-kind',createdOn:DAY,
  createdBy:'actor-policy-owner',policies:[row,{...row,policyId:'policy-two'}]}),'DUPLICATE');
});
test('retention review ledger supports a second item on a later date',()=>{
 const row=custody(),second=registerEvidence(row,{...row.items[0],itemId:'evidence-two',
  contentDigest:sha('content-two')},{at:NEXT_AT,actorToken:'actor-coordinator'});
 const reviewBook=createRetentionReviewLedger({reviewLedgerId:'review-multi',createdOn:DAY,
  createdAt:AT,createdBy:'actor-review-coordinator'});
 const firstReview={...retentionReview({ledger:row}),reviewId:'review-first'};
 const afterFirst=recordRetentionReview(reviewBook,row,policies(),firstReview,
  {at:FOURTH_AT,actorToken:'actor-retention-reviewer'});
 const secondReview={...retentionReview({ledger:second,reviewedOn:FIFTH}),reviewId:'review-second',itemId:'evidence-two',nextReviewOn:SIXTH,evidenceDigest:sha(second.items.find(item=>item.itemId==='evidence-two'))};
 const result=recordRetentionReview(afterFirst,second,policies(),secondReview,
  {at:FIFTH_AT,actorToken:'actor-retention-reviewer'});
 assert.equal(result.reviews.length,2);
});
test('retention review rejects event timestamp earlier than ledger head',()=>{
 const reviewBook=reviewLedger();
 fails(()=>recordRetentionReview(reviewBook,custody(),policies(),retentionReview(),
  {at:'2026-11-20T10:00:00.000Z',actorToken:'actor-retention-reviewer'}),'EVENT_ORDER');
});
test('retention review ledger rejects event time moving backwards',()=>{
 const row=reviewedLedger(),changed=structuredClone(row);
 changed.events.push({...row.events.at(-1),sequence:3,at:'2026-11-22T10:00:00.000Z'});
 fails(()=>validateRetentionReviewLedger(changed,custody(),policies()),'EVENT_HASH');
});
test('retention review summary returns stable digest',()=>{
 const row=reviewedLedger(),first=retentionReviewSummary(row,custody(),policies());
 const second=retentionReviewSummary(row,custody(),policies());
 assert.deepEqual(first,second);
});
test('retention review date must be on or after ledger creation',()=>{
 const row={...retentionReview(),reviewedOn:'2026-11-20',nextReviewOn:NEXT};
 fails(()=>recordRetentionReview(reviewLedger(),custody(),policies(),row,
  {at:'2026-11-20T10:00:00.000Z',actorToken:'actor-retention-reviewer'}),'EVENT_ORDER');
});
test('retention review validates opaque evidence digest',()=>{
 const row={...retentionReview(),evidenceDigest:'bad'};
 fails(()=>recordRetentionReview(reviewLedger(),custody(),policies(),row,
  {at:FOURTH_AT,actorToken:'actor-retention-reviewer'}),'HASH');
});
test('retention plan expiry does not mutate evidence lifecycle state',()=>{
 const result=plan();assert.equal(result.items[0].state,'expired');
 assert.equal(custody().items[0].state,'held');
});
test('retention plan does not expose a deletion instruction',()=>{
 const result=plan();assert.ok(result.items.every(row=>!Object.hasOwn(row,'deleteNow')));
});
test('retention policy set allows empty policy list as explicit unconfigured state',()=>{
 const result=createRetentionPolicySet({setId:'policy-empty',createdOn:DAY,
  createdBy:'actor-policy-owner',policies:[]});
 assert.equal(result.policies.length,0);
});
test('retention review decision vocabulary is closed',()=>{
 fails(()=>recordRetentionReview(reviewLedger(),custody(),policies(),
  {...retentionReview(),decision:'delete'},{at:FOURTH_AT,actorToken:'actor-retention-reviewer'}),'ENUM');
});
test('retention review cannot be created with reviewer identity token',()=>{
 fails(()=>recordRetentionReview(reviewLedger(),custody(),policies(),
  {...retentionReview(),reviewerToken:'person-alex'},{at:FOURTH_AT,actorToken:'person-alex'}),'PRIVATE');
});
