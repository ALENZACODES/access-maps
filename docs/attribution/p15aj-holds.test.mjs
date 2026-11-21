import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,NEXT,LATER,FOURTH,FIFTH,AT,NEXT_AT,LATER_AT,FOURTH_AT,FIFTH_AT,SIXTH,
 custody,holds,heldLedger,evidence} from './p15aj-fixtures.mjs';
import {sha,bodyHash,CustodyError} from './p15ai-contract.mjs';
import {registerEvidence} from './p15ai-ledger.mjs';
import {createHoldLedger,validateHoldLedger,placeHold,reviewHold,releaseHold,withdrawHold,
 activeHoldsForItem,isItemPreserved,holdSummary} from './p15aj-holds.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
function place(patch={},row=custody()){
 const empty=holds({ledger:row});
 return placeHold(empty,row,{holdId:'hold-one',itemIds:['evidence-one'],
  scope:'Preserve this evidence during internal review.',reason:'Review request remains open.',
  placedOn:NEXT,placedBy:'actor-hold-placer',reviewOn:FOURTH,at:NEXT_AT,...patch});
}
test('hold ledger opens with genesis event',()=>{
 const row=holds();assert.equal(validateHoldLedger(row,custody()).digest,row.digest);
 assert.equal(row.events[0].type,'hold-ledger-opened');
});
test('hold ledger rejects unsupported schema',()=>{
 fails(()=>validateHoldLedger({...holds(),schema:'other'},custody()),'SCHEMA');
});
test('hold ledger rejects invalid identifier',()=>{
 fails(()=>createHoldLedger({holdLedgerId:'Bad ID',createdOn:DAY,createdAt:AT,
  createdBy:'actor-coordinator'}),'ID');
});
test('hold ledger rejects personal creator token',()=>{
 fails(()=>createHoldLedger({holdLedgerId:'hold-two',createdOn:DAY,createdAt:AT,
  createdBy:'person-alex'}),'PRIVATE');
});
test('hold ledger rejects creation timestamp on another date',()=>{
 fails(()=>createHoldLedger({holdLedgerId:'hold-two',createdOn:DAY,createdAt:NEXT_AT,
  createdBy:'actor-coordinator'}),'DATE_ORDER');
});
test('hold placement records scoped item list',()=>{
 const row=place();assert.deepEqual(row.holds[0].itemIds,['evidence-one']);
});
test('hold placement begins active',()=>{
 assert.equal(place().holds[0].state,'active');
});
test('hold placement creates immutable event digest',()=>{
 const row=place();assert.equal(row.events.at(-1).type,'hold-placed');
 assert.equal(row.events.at(-1).payload.holdDigest,bodyHash(row.holds[0]));
});
test('hold placement rejects duplicate hold identifier',()=>{
 const row=place();fails(()=>placeHold(row,custody(),{holdId:'hold-one',itemIds:['evidence-one'],
  scope:'Another scope.',reason:'Another reason.',placedOn:NEXT,placedBy:'actor-other',
  reviewOn:FOURTH,at:NEXT_AT}),'DUPLICATE');
});
test('hold placement rejects empty item list',()=>{
 fails(()=>placeHold(holds(),custody(),{holdId:'hold-two',itemIds:[],
  scope:'Scope.',reason:'Reason.',placedOn:NEXT,placedBy:'actor-holder',
  reviewOn:FOURTH,at:NEXT_AT}),'LIMIT');
});
test('hold placement rejects duplicate item IDs',()=>{
 fails(()=>placeHold(holds(),custody(),{holdId:'hold-two',itemIds:['evidence-one','evidence-one'],
  scope:'Scope.',reason:'Reason.',placedOn:NEXT,placedBy:'actor-holder',
  reviewOn:FOURTH,at:NEXT_AT}),'DUPLICATE');
});
test('hold placement rejects unknown evidence item',()=>{
 fails(()=>placeHold(holds(),custody(),{holdId:'hold-two',itemIds:['missing'],
  scope:'Scope.',reason:'Reason.',placedOn:NEXT,placedBy:'actor-holder',
  reviewOn:FOURTH,at:NEXT_AT}),'ITEM_REFERENCE');
});
test('hold placement rejects malformed hold ID',()=>{
 fails(()=>place({holdId:'Bad ID'}),'ID');
});
test('hold placement rejects invalid placing actor',()=>{
 fails(()=>place({placedBy:'person-alex'}),'PRIVATE');
});
test('hold placement rejects empty scope',()=>{
 fails(()=>place({scope:''}),'TEXT');
});
test('hold placement rejects contact information in reason',()=>{
 fails(()=>place({reason:'Call 416-555-0199'}),'PRIVATE');
});
test('hold placement rejects review date before placement',()=>{
 fails(()=>place({reviewOn:DAY}),'DATE_ORDER');
});
test('hold placement requires event date to match placement date',()=>{
 fails(()=>place({at:LATER_AT}),'DATE');
});
test('hold placement rejects event before ledger creation',()=>{
 fails(()=>place({placedOn:DAY,at:'2026-11-21T09:00:00.000Z'}),'EVENT_ORDER');
});
test('active hold marks item preserved',()=>{
 const row=place();assert.equal(isItemPreserved(row,custody(),'evidence-one'),true);
});
test('active hold lookup returns only matching item holds',()=>{
 const row=place();assert.equal(activeHoldsForItem(row,custody(),'evidence-one').length,1);
});
test('active hold lookup returns empty for another item',()=>{
 assert.equal(activeHoldsForItem(place(),custody(),'other-item').length,0);
});
test('active hold lookup rejects malformed item ID',()=>{
 fails(()=>activeHoldsForItem(place(),custody(),'Bad ID'),'ID');
});
test('hold review updates next review date',()=>{
 const row=reviewHold(place(),custody(),{holdId:'hold-one',reviewOn:FOURTH,
  reviewedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Hold remains necessary.',
  nextReviewOn:FIFTH});
 assert.equal(row.holds[0].reviewOn,FIFTH);
});
test('hold review records an event with next review date',()=>{
 const row=reviewHold(place(),custody(),{holdId:'hold-one',reviewOn:FOURTH,
  reviewedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Review completed.',
  nextReviewOn:FIFTH});
 assert.equal(row.events.at(-1).type,'hold-reviewed');
 assert.equal(row.events.at(-1).payload.reviewOn,FIFTH);
});
test('hold review rejects unknown hold',()=>{
 fails(()=>reviewHold(place(),custody(),{holdId:'missing',reviewOn:FOURTH,
  reviewedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Review.',nextReviewOn:FIFTH}),'HOLD_REFERENCE');
});
test('hold review rejects review date mismatch',()=>{
 fails(()=>reviewHold(place(),custody(),{holdId:'hold-one',reviewOn:FOURTH,
  reviewedBy:'actor-hold-reviewer',at:NEXT_AT,reason:'Review.',nextReviewOn:FIFTH}),'TIMESTAMP');
});
test('hold review rejects next review date before review',()=>{
 fails(()=>reviewHold(place(),custody(),{holdId:'hold-one',reviewOn:FOURTH,
  reviewedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Review.',nextReviewOn:NEXT}),'DATE_ORDER');
});
test('hold review rejects empty reason',()=>{
 fails(()=>reviewHold(place(),custody(),{holdId:'hold-one',reviewOn:FOURTH,
  reviewedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'',nextReviewOn:FIFTH}),'TEXT');
});
test('hold release requires a distinct actor',()=>{
 fails(()=>releaseHold(place(),custody(),{holdId:'hold-one',releasedOn:FOURTH,
  releasedBy:'actor-hold-placer',at:FOURTH_AT,reason:'Review complete.'}),'SEPARATION');
});
test('hold release records release metadata',()=>{
 const row=releaseHold(place(),custody(),{holdId:'hold-one',releasedOn:FOURTH,
  releasedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Preservation review concluded.'});
 assert.equal(row.holds[0].state,'released');assert.equal(row.holds[0].releasedBy,'actor-hold-reviewer');
});
test('hold release removes preservation status',()=>{
 const row=releaseHold(place(),custody(),{holdId:'hold-one',releasedOn:FOURTH,
  releasedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Review concluded.'});
 assert.equal(isItemPreserved(row,custody(),'evidence-one'),false);
});
test('hold release creates auditable event',()=>{
 const row=releaseHold(place(),custody(),{holdId:'hold-one',releasedOn:FOURTH,
  releasedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Review concluded.'});
 assert.equal(row.events.at(-1).type,'hold-released');
});
test('hold release rejects unknown hold',()=>{
 fails(()=>releaseHold(place(),custody(),{holdId:'missing',releasedOn:FOURTH,
  releasedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Release.'}),'HOLD_REFERENCE');
});
test('hold release rejects empty reason',()=>{
 fails(()=>releaseHold(place(),custody(),{holdId:'hold-one',releasedOn:FOURTH,
  releasedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:''}),'TEXT');
});
test('hold release rejects event timestamp mismatch',()=>{
 fails(()=>releaseHold(place(),custody(),{holdId:'hold-one',releasedOn:FOURTH,
  releasedBy:'actor-hold-reviewer',at:NEXT_AT,reason:'Release.'}),'TIMESTAMP');
});
test('hold release rejects release before placement',()=>{
 fails(()=>releaseHold(place(),custody(),{holdId:'hold-one',releasedOn:DAY,
  releasedBy:'actor-hold-reviewer',at:AT,reason:'Release.'}),'DATE_ORDER');
});
test('hold release rejects repeated release',()=>{
 const row=releaseHold(place(),custody(),{holdId:'hold-one',releasedOn:FOURTH,
  releasedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Release.'});
 fails(()=>releaseHold(row,custody(),{holdId:'hold-one',releasedOn:FIFTH,
  releasedBy:'actor-other',at:'2026-11-25T10:00:00.000Z',reason:'Again.'}),'HOLD_TERMINAL');
});
test('hold withdrawal requires distinct actor',()=>{
 fails(()=>withdrawHold(place(),custody(),{holdId:'hold-one',withdrawnOn:FOURTH,
  withdrawnBy:'actor-hold-placer',at:FOURTH_AT,reason:'Withdraw.'}),'SEPARATION');
});
test('hold withdrawal creates terminal state',()=>{
 const row=withdrawHold(place(),custody(),{holdId:'hold-one',withdrawnOn:FOURTH,
  withdrawnBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Duplicate hold request.'});
 assert.equal(row.holds[0].state,'withdrawn');
});
test('hold withdrawal is auditable',()=>{
 const row=withdrawHold(place(),custody(),{holdId:'hold-one',withdrawnOn:FOURTH,
  withdrawnBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Withdraw.'});
 assert.equal(row.events.at(-1).type,'hold-withdrawn');
});
test('hold withdrawal rejects repeated withdrawal',()=>{
 const row=withdrawHold(place(),custody(),{holdId:'hold-one',withdrawnOn:FOURTH,
  withdrawnBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Withdraw.'});
 fails(()=>withdrawHold(row,custody(),{holdId:'hold-one',withdrawnOn:FIFTH,
  withdrawnBy:'actor-other',at:'2026-11-25T10:00:00.000Z',reason:'Again.'}),'HOLD_TERMINAL');
});
test('hold summary counts active holds',()=>{
 assert.equal(holdSummary(place(),custody()).active,1);
});
test('hold summary counts released holds',()=>{
 const row=releaseHold(place(),custody(),{holdId:'hold-one',releasedOn:FOURTH,
  releasedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Release.'});
 assert.equal(holdSummary(row,custody()).released,1);
});
test('hold summary counts unique held items',()=>{
 assert.equal(holdSummary(place(),custody()).heldItems,1);
});
test('hold validator rejects hold item absent from custody',()=>{
 const row=place(),changed=structuredClone(row);changed.holds[0].itemIds=['missing'];
 changed.digest=bodyHash(changed);fails(()=>validateHoldLedger(changed,custody()),'ITEM_REFERENCE');
});
test('hold validator rejects event tampering',()=>{
 const row=place(),changed=structuredClone(row);changed.events.at(-1).payload.holdId='other';
 fails(()=>validateHoldLedger(changed,custody()),'HOLD_HISTORY');
});
test('hold validator rejects changed hold state without event',()=>{
 const row=place(),changed=structuredClone(row);changed.holds[0].state='released';
 changed.holds[0].releasedOn=FOURTH;changed.holds[0].releasedBy='actor-hold-reviewer';
 changed.holds[0].releaseReason='Forged';changed.digest=bodyHash(changed);
 fails(()=>validateHoldLedger(changed,custody()),'HOLD_STATE_HISTORY');
});
test('hold validator rejects extra root field',()=>{
 fails(()=>validateHoldLedger({...holds(),privateNote:'x'},custody()),'SHAPE');
});
test('hold operations do not mutate prior ledger',()=>{
 const row=place(),digest=row.digest;
 releaseHold(row,custody(),{holdId:'hold-one',releasedOn:FOURTH,
  releasedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Release.'});
 assert.equal(row.digest,digest);assert.equal(row.holds[0].state,'active');
});
test('hold ledger allows multiple active holds on one item',()=>{
 let row=place();
 row=placeHold(row,custody(),{holdId:'hold-two',itemIds:['evidence-one'],
  scope:'Secondary preservation scope.',reason:'Second review remains open.',
  placedOn:FOURTH,placedBy:'actor-other-placer',reviewOn:FIFTH,at:FOURTH_AT});
 assert.equal(activeHoldsForItem(row,custody(),'evidence-one').length,2);
});

test('hold review history rejects changed review date without matching event',()=>{
 const row=reviewHold(place(),custody(),{holdId:'hold-one',reviewOn:FOURTH,
  reviewedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Review remains open.',nextReviewOn:FIFTH});
 const changed=structuredClone(row);changed.holds[0].reviewOn=SIXTH;
 changed.digest=bodyHash(changed);
 fails(()=>validateHoldLedger(changed,custody()),'HOLD_REVIEW_HISTORY');
});
test('hold event chronology rejects timestamp earlier than genesis',()=>{
 const empty=holds();
 fails(()=>placeHold(empty,custody(),{holdId:'hold-early',itemIds:['evidence-one'],
  scope:'Scope.',reason:'Reason.',placedOn:DAY,placedBy:'actor-holder',
  reviewOn:NEXT,at:'2026-11-21T09:00:00.000Z'}),'EVENT_ORDER');
});
test('hold review event chronology rejects event before placement',()=>{
 fails(()=>reviewHold(place(),custody(),{holdId:'hold-one',reviewOn:NEXT,
  reviewedBy:'actor-hold-reviewer',at:'2026-11-21T09:00:00.000Z',
  reason:'Review.',nextReviewOn:FOURTH}),'TIMESTAMP');
});
test('hold release event chronology rejects event before placement',()=>{
 fails(()=>releaseHold(place(),custody(),{holdId:'hold-one',releasedOn:NEXT,
  releasedBy:'actor-hold-reviewer',at:'2026-11-21T09:00:00.000Z',reason:'Release.'}),'TIMESTAMP');
});
test('hold withdrawal rejects unknown hold',()=>{
 fails(()=>withdrawHold(place(),custody(),{holdId:'missing',withdrawnOn:FOURTH,
  withdrawnBy:'actor-reviewer',at:FOURTH_AT,reason:'Withdraw.'}),'HOLD_REFERENCE');
});
test('hold withdrawal rejects event date mismatch',()=>{
 fails(()=>withdrawHold(place(),custody(),{holdId:'hold-one',withdrawnOn:FOURTH,
  withdrawnBy:'actor-reviewer',at:NEXT_AT,reason:'Withdraw.'}),'TIMESTAMP');
});
test('hold withdrawal rejects empty reason',()=>{
 fails(()=>withdrawHold(place(),custody(),{holdId:'hold-one',withdrawnOn:FOURTH,
  withdrawnBy:'actor-reviewer',at:FOURTH_AT,reason:''}),'TEXT');
});
test('hold ledger summary returns deterministic digest',()=>{
 const row=place();assert.deepEqual(holdSummary(row,custody()),holdSummary(row,custody()));
});
test('hold ledger summary counts multiple holds across same item once',()=>{
 let row=place();
 row=placeHold(row,custody(),{holdId:'hold-two',itemIds:['evidence-one'],
  scope:'Second scope.',reason:'Second preservation reason.',placedOn:FOURTH,
  placedBy:'actor-other-placer',reviewOn:FIFTH,at:FOURTH_AT});
 assert.equal(holdSummary(row,custody()).heldItems,1);
});
test('hold validator rejects event actor changed without rehash',()=>{
 const row=place(),changed=structuredClone(row);changed.events[1].actorToken='actor-other';
 fails(()=>validateHoldLedger(changed,custody()),'EVENT_HASH');
});
test('hold validator rejects altered placement digest',()=>{
 const row=place(),changed=structuredClone(row);changed.events[1].payload.holdDigest=sha('different');
 fails(()=>validateHoldLedger(changed,custody()),'EVENT_HASH');
});
test('hold validator rejects released state without release receipt',()=>{
 const row=place(),changed=structuredClone(row);
 changed.holds[0].state='released';changed.holds[0].releasedOn=FOURTH;
 changed.holds[0].releasedBy='actor-hold-reviewer';changed.holds[0].releaseReason='Forged.';
 changed.digest=bodyHash(changed);
 fails(()=>validateHoldLedger(changed,custody()),'HOLD_STATE_HISTORY');
});
test('hold review preserves hold scope and item list',()=>{
 const row=reviewHold(place(),custody(),{holdId:'hold-one',reviewOn:FOURTH,
  reviewedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Review.',nextReviewOn:FIFTH});
 assert.equal(row.holds[0].scope,'Preserve this evidence during internal review.');
 assert.deepEqual(row.holds[0].itemIds,['evidence-one']);
});
test('hold release preserves hold scope and placement metadata',()=>{
 const row=releaseHold(place(),custody(),{holdId:'hold-one',releasedOn:FOURTH,
  releasedBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Review concluded.'});
 assert.equal(row.holds[0].placedBy,'actor-hold-placer');
 assert.equal(row.holds[0].reason,'Review request remains open.');
});
test('hold withdrawal does not remove the evidence item',()=>{
 const row=withdrawHold(place(),custody(),{holdId:'hold-one',withdrawnOn:FOURTH,
  withdrawnBy:'actor-hold-reviewer',at:FOURTH_AT,reason:'Duplicate hold request.'});
 assert.equal(custody().items.length,1);
 assert.equal(row.holds.length,1);
});
