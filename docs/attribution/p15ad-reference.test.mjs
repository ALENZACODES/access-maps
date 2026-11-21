import test from 'node:test';
import assert from 'node:assert/strict';
import {reference,responseSet,responseFor,DAY,NEXT,LATER} from './p15ad-fixtures.mjs';
import {createReferenceSet,validateReferenceSet,createResponseSet,validateResponseSet,
 joinReviewEvidence,referenceCoverage} from './p15ad-reference.mjs';
import {QualityError,sha,bodyHash} from './p15ad-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof QualityError&&error.code===code);

test('reference set validates its stable digest',()=>{
 const value=reference();assert.equal(validateReferenceSet(value).digest,value.digest);
});
test('reference set sorts records by stable item ID',()=>{
 const value=reference({count:4});assert.deepEqual(value.items.map(row=>row.itemId),
  ['item-001','item-002','item-003','item-004']);
});
test('reference set rejects duplicate item IDs',()=>{
 const value=reference();fails(()=>createReferenceSet({...value,items:[...value.items,value.items[0]]}),'DUPLICATE');
});
test('reference set rejects a malformed record digest',()=>{
 const value=reference();fails(()=>createReferenceSet({...value,items:value.items.map((row,index)=>
  index===0?{...row,recordDigest:'bad'}:row)}),'HASH');
});
test('reference set rejects a malformed evidence digest',()=>{
 const value=reference();fails(()=>createReferenceSet({...value,items:value.items.map((row,index)=>
  index===0?{...row,evidenceDigest:'bad'}:row)}),'HASH');
});
test('reference set rejects unsupported access states',()=>{
 const value=reference();fails(()=>createReferenceSet({...value,items:value.items.map((row,index)=>
  index===0?{...row,referenceState:'MAYBE'}:row)}),'STATE');
});
test('reference set rejects adjudication that conflicts with reference state',()=>{
 const value=reference();fails(()=>createReferenceSet({...value,items:value.items.map((row,index)=>
  index===0?{...row,adjudication:'NO'}:row)}),'REFERENCE_MISMATCH');
});
test('reference set keeps unknown adjudication unknown',()=>{
 const value=reference();const unknown=value.items.find(row=>row.referenceState==='UNKNOWN');
 assert.equal(unknown.adjudication,'UNKNOWN');
});
test('reference set rejects unknown adjudication paired with a positive reference',()=>{
 const value=reference();fails(()=>createReferenceSet({...value,items:value.items.map((row,index)=>
  index===0?{...row,adjudication:'UNKNOWN'}:row)}),'UNKNOWN');
});
test('reference set rejects future adjudication dates',()=>{
 const value=reference();fails(()=>createReferenceSet({...value,items:value.items.map((row,index)=>
  index===0?{...row,adjudicatedOn:LATER}:row)}),'FUTURE_REFERENCE');
});
test('reference set rejects personal content in rationale',()=>{
 const value=reference();fails(()=>createReferenceSet({...value,items:value.items.map((row,index)=>
  index===0?{...row,rationale:'Contact reviewer@example.invalid'}:row)}),'PRIVATE');
});
test('reference set detects a changed rationale',()=>{
 const value=reference(),copy=structuredClone(value);copy.items[0].rationale='Different rationale';
 fails(()=>validateReferenceSet(copy),'HASH');
});
test('reference set requires all fields in an item',()=>{
 const value=reference();fails(()=>createReferenceSet({...value,items:value.items.map((row,index)=>{
  if(index!==0)return row;const {tier,...rest}=row;return rest;
 })}),'SHAPE');
});
test('reference set rejects unrecognized item properties',()=>{
 const value=reference();fails(()=>createReferenceSet({...value,items:value.items.map((row,index)=>
  index===0?{...row,reviewerName:'Alice'}:row)}),'SHAPE');
});
test('reference set accepts source digest lists with multiple unique sources',()=>{
 const value=reference();const row={...value.items[0],sourceDigests:[sha('source-a'),sha('source-b')]};
 const result=createReferenceSet({...value,items:value.items.map((item,index)=>index===0?row:item)});
 assert.equal(result.items[0].sourceDigests.length,2);
});
test('reference set rejects duplicate source digests',()=>{
 const value=reference();const row={...value.items[0],sourceDigests:[sha('source-a'),sha('source-a')]};
 fails(()=>createReferenceSet({...value,items:value.items.map((item,index)=>index===0?row:item)}),'DUPLICATE');
});
test('response set validates its stable digest',()=>{
 const ref=reference();const value=responseSet({referenceSet:ref});
 assert.equal(validateResponseSet(value).digest,value.digest);
});
test('response set rejects duplicate response identifiers',()=>{
 const ref=reference(),value=responseSet({referenceSet:ref});
 fails(()=>createResponseSet({...value,responses:[...value.responses,value.responses[0]]}),'DUPLICATE');
});
test('response set rejects a reviewer answering the same item twice',()=>{
 const ref=reference(),value=responseSet({referenceSet:ref});
 const duplicate={...value.responses[0],responseId:'response-duplicate'};
 fails(()=>createResponseSet({...value,responses:[...value.responses,duplicate]}),'DUPLICATE');
});
test('response set rejects a future review date',()=>{
 const ref=reference(),value=responseSet({referenceSet:ref});
 fails(()=>createResponseSet({...value,responses:value.responses.map((row,index)=>
  index===0?{...row,reviewedOn:LATER}:row)}),'FUTURE_RESPONSE');
});
test('response set rejects unsupported review decisions',()=>{
 const ref=reference(),value=responseSet({referenceSet:ref});
 fails(()=>createResponseSet({...value,responses:value.responses.map((row,index)=>
  index===0?{...row,decision:'guess'}:row)}),'DECISION');
});
test('response set rejects unknown observed states',()=>{
 const ref=reference(),value=responseSet({referenceSet:ref});
 fails(()=>createResponseSet({...value,responses:value.responses.map((row,index)=>
  index===0?{...row,observedState:'MAYBE'}:row)}),'STATE');
});
test('response set rejects supported UNKNOWN observations',()=>{
 const ref=reference(),value=responseSet({referenceSet:ref});
 fails(()=>createResponseSet({...value,responses:value.responses.map((row,index)=>
  index===0?{...row,decision:'supported',observedState:'UNKNOWN'}:row)}),'UNKNOWN');
});
test('response set rejects contradiction without a known state',()=>{
 const ref=reference(),value=responseSet({referenceSet:ref});
 fails(()=>createResponseSet({...value,responses:value.responses.map((row,index)=>
  index===0?{...row,decision:'contradicted',observedState:'UNKNOWN'}:row)}),'UNKNOWN');
});
test('response set rejects duplicate source digests',()=>{
 const ref=reference(),value=responseSet({referenceSet:ref});
 fails(()=>createResponseSet({...value,responses:value.responses.map((row,index)=>
  index===0?{...row,sourceDigests:[sha('a'),sha('a')]}:row)}),'DUPLICATE');
});
test('response set rejects identity-shaped reviewer tokens',()=>{
 const ref=reference(),value=responseSet({referenceSet:ref});
 fails(()=>createResponseSet({...value,responses:value.responses.map((row,index)=>
  index===0?{...row,reviewerToken:'reviewer-alice'}:row)}),'IDENTITY');
});
test('response set digest detects a modified rationale',()=>{
 const ref=reference(),value=responseSet({referenceSet:ref}),copy=structuredClone(value);
 copy.responses[0].rationale='Changed';fails(()=>validateResponseSet(copy),'HASH');
});
test('join operation binds every response to reference evidence digest',()=>{
 const ref=reference(),responses=responseSet({referenceSet:ref});
 assert.equal(joinReviewEvidence(ref,responses).length,responses.responses.length);
});
test('join operation rejects missing reference item',()=>{
 const ref=reference(),responses=responseSet({referenceSet:ref});
 const changed=createResponseSet({...responses,responses:responses.responses.map((row,index)=>
  index===0?{...row,itemId:'item-missing'}:row)});
 fails(()=>joinReviewEvidence(ref,changed),'REFERENCE_MISSING');
});
test('join operation rejects stale evidence digest',()=>{
 const ref=reference(),responses=responseSet({referenceSet:ref});
 const changed=createResponseSet({...responses,responses:responses.responses.map((row,index)=>
  index===0?{...row,evidenceDigest:sha('other')}:row)});
 fails(()=>joinReviewEvidence(ref,changed),'STALE_EVIDENCE');
});
test('join operation rejects a response predating adjudication',()=>{
 const ref=reference(),responses=responseSet({referenceSet:ref,reviewedOn:'2026-11-20'});
 fails(()=>joinReviewEvidence(ref,responses),'DATE_ORDER');
});
test('join operation preserves reviewer tokens and state labels only',()=>{
 const ref=reference(),responses=responseSet({referenceSet:ref});
 const joined=joinReviewEvidence(ref,responses);
 assert.ok(joined.every(row=>row.reviewerToken.startsWith('blind-')));
 assert.ok(joined.every(row=>['YES','NO','UNKNOWN'].includes(row.referenceState)));
});
test('reference coverage counts unique reviewed items',()=>{
 const ref=reference(),responses=responseSet({referenceSet:ref});
 const result=referenceCoverage(ref,responses);
 assert.equal(result.coveredItems,ref.items.length);
 assert.equal(result.coverage,1);
});
test('reference coverage reports unreviewed items',()=>{
 const ref=reference({count:6}),responses=responseSet({referenceSet:ref});
 const partial={...responses,responses:responses.responses.filter(row=>row.itemId!=='item-006')};
 partial.digest=sha({schema:partial.schema,responseSetId:partial.responseSetId,
  createdOn:partial.createdOn,responses:partial.responses});
 const result=referenceCoverage(ref,partial);
 assert.equal(result.unreviewedItems,1);
});

test('reference set supports an empty adjudicated source list only when evidence is UNKNOWN',()=>{
 const value=reference();
 const first=value.items[0];
 const changed={...first,referenceState:'UNKNOWN',adjudication:'UNKNOWN',sourceDigests:[]};
 const result=createReferenceSet({...value,items:value.items.map((row,index)=>index===0?changed:row)});
 assert.equal(result.items[0].sourceDigests.length,0);
});
test('reference set refuses a future creation date relative to item adjudication',()=>{
 const value=reference();
 fails(()=>createReferenceSet({...value,createdOn:'2026-11-20'}),'FUTURE_REFERENCE');
});
test('reference set item IDs remain unique after normalization',()=>{
 const value=reference();
 fails(()=>createReferenceSet({...value,items:value.items.map(row=>({...row,itemId:'same-item'}))}),'DUPLICATE');
});
test('response set retains a distinct response for each reviewer token',()=>{
 const ref=reference({count:3}),value=responseSet({referenceSet:ref,
  reviewers:['blind-alpha','blind-bravo','blind-charlie']});
 assert.equal(value.responses.length,9);
});
test('response set rejects a reviewer response with a changed evidence digest at join time',()=>{
 const ref=reference(),responses=responseSet({referenceSet:ref});
 const changed=createResponseSet({...responses,responses:responses.responses.map((row,index)=>
  index===0?{...row,evidenceDigest:sha('wrong-evidence')}:row)});
 fails(()=>joinReviewEvidence(ref,changed),'STALE_EVIDENCE');
});
test('response set can contain an explicit abstention with UNKNOWN observed state',()=>{
 const ref=reference(),base=responseSet({referenceSet:ref});
 const first={...base.responses[0],decision:'abstain',observedState:'UNKNOWN'};
 const result=createResponseSet({...base,responses:base.responses.map((row,index)=>index===0?first:row)});
 assert.equal(result.responses.find(row=>row.responseId===first.responseId).decision,'abstain');
});
test('response set cannot mark UNKNOWN as a contradiction',()=>{
 const ref=reference(),base=responseSet({referenceSet:ref});
 fails(()=>createResponseSet({...base,responses:base.responses.map((row,index)=>
  index===0?{...row,decision:'contradicted',observedState:'UNKNOWN'}:row)}),'UNKNOWN');
});
test('join result remains deterministically ordered by reviewer and item',()=>{
 const ref=reference(),responses=responseSet({referenceSet:ref});
 const rows=joinReviewEvidence(ref,responses);
 assert.deepEqual(rows.map(row=>`${row.reviewerToken}:${row.itemId}`),
  [...rows].map(row=>`${row.reviewerToken}:${row.itemId}`).sort());
});
test('coverage reports one item even when multiple reviewers reviewed it',()=>{
 const ref=reference({count:4}),responses=responseSet({referenceSet:ref,
  reviewers:['blind-alpha','blind-bravo','blind-charlie']});
 const result=referenceCoverage(ref,responses);
 assert.equal(result.coveredItems,4);
 assert.equal(result.responseItems,12);
});
test('coverage of an empty response set remains zero when reference is nonempty',()=>{
 const ref=reference({count:4});
 const empty=createResponseSet({responseSetId:'responses-empty',createdOn:NEXT,responses:[]});
 const result=referenceCoverage(ref,empty);
 assert.equal(result.coverage,0);
 assert.equal(result.unreviewedItems,4);
});

test('reference adjudicator token must be opaque',()=>{
 const value=reference();
 fails(()=>createReferenceSet({...value,items:value.items.map((row,index)=>
  index===0?{...row,adjudicatorToken:'reviewer-alice'}:row)}),'IDENTITY');
});
test('known reference states require at least one source digest',()=>{
 const value=reference();
 fails(()=>createReferenceSet({...value,items:value.items.map((row,index)=>
  index===0?{...row,sourceDigests:[]}:row)}),'SOURCES');
});
test('unknown reference states may remain without source digests',()=>{
 const value=reference(),index=value.items.findIndex(row=>row.referenceState==='UNKNOWN');
 const result=createReferenceSet({...value,items:value.items.map((row,i)=>
  i===index?{...row,sourceDigests:[]}:row)});
 assert.equal(result.items[index].referenceState,'UNKNOWN');
});
