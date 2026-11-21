import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,source,record,asset,pkg,LATER,sourceDigest} from './p15af-fixtures.mjs';
import {assessSourceForRelease,validateSourceReview,reviewCanRelease,buildSourceReviewBatch} from './p15af-review.mjs';
import {ImpactError,sha256} from './p15af-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof ImpactError&&error.code===code);
function review(options={}){
 return assessSourceForRelease(catalog(),{sourceId:'source-one',reviewId:'review-one',
  reviewedOn:LATER,reviewerToken:'actor-reviewer',sourceSnapshotDigest:sourceDigest,
  licenceConfirmed:true,attributionConfirmed:true,observationCurrent:true,
  reason:'Source metadata was checked against the local capture.',...options});
}
test('source review accepts a matching active source snapshot',()=>{
 const value=review();
 assert.equal(value.eligible,true);
 assert.equal(value.outcome,'retain-active');
});
test('source review binds catalog and source digest',()=>{
 const value=review();
 assert.equal(value.catalogDigest,catalog().digest);
 assert.equal(value.sourceDigest,sourceDigest);
});
test('source review never releases source automatically',()=>{
 const value=review();
 assert.equal(value.automaticRelease,false);
 assert.equal(reviewCanRelease(value).automaticRelease,false);
});
test('source review fails when source snapshot digest changed',()=>{
 const value=review({sourceSnapshotDigest:sha256('other snapshot')});
 assert.equal(value.eligible,false);
 assert.ok(value.checks.some(row=>row.check==='snapshot-integrity'&&!row.passed));
});
test('source review fails when licence was not confirmed',()=>{
 const value=review({licenceConfirmed:false});
 assert.equal(value.eligible,false);
});
test('source review fails when attribution was not confirmed',()=>{
 const value=review({attributionConfirmed:false});
 assert.equal(value.eligible,false);
});
test('source review fails when observation currency was not confirmed',()=>{
 const value=review({observationCurrent:false});
 assert.equal(value.eligible,false);
});
test('source review fails when source is not active',()=>{
 const current=catalog({sources:[source({status:'held'})],records:[record({state:'review-required'})],assets:[asset({state:'quarantined'})],packages:[pkg({state:'held'})]});
 const value=assessSourceForRelease(current,{sourceId:'source-one',reviewId:'review-held',
  reviewedOn:LATER,reviewerToken:'actor-reviewer',sourceSnapshotDigest:sourceDigest,
  licenceConfirmed:true,attributionConfirmed:true,observationCurrent:true,reason:'Review held source.'});
 assert.equal(value.eligible,false);
});
test('source review fails when source licence is UNKNOWN',()=>{
 const current=catalog({sources:[source({licence:'UNKNOWN'})]});
 const value=assessSourceForRelease(current,{sourceId:'source-one',reviewId:'review-unknown',
  reviewedOn:LATER,reviewerToken:'actor-reviewer',sourceSnapshotDigest:sourceDigest,
  licenceConfirmed:true,attributionConfirmed:true,observationCurrent:true,reason:'Review unknown licence.'});
 assert.equal(value.eligible,false);
});
test('source review fails when retrieval date is after review date',()=>{
 const current=catalog({sources:[source({retrievedOn:'2026-11-25'})]});
 const value=assessSourceForRelease(current,{sourceId:'source-one',reviewId:'review-future',
  reviewedOn:LATER,reviewerToken:'actor-reviewer',sourceSnapshotDigest:sourceDigest,licenceConfirmed:true,
  attributionConfirmed:true,observationCurrent:true,reason:'Review future retrieval.'});
 assert.equal(value.eligible,false);
});
test('source review rejects missing source',()=>{
 fails(()=>assessSourceForRelease(catalog(),{sourceId:'missing',reviewId:'review-one',
  reviewedOn:LATER,reviewerToken:'actor-reviewer',sourceSnapshotDigest:sourceDigest,
  licenceConfirmed:true,attributionConfirmed:true,observationCurrent:true,reason:'Review source.'}),'SOURCE_REF');
});
test('source review rejects malformed source digest',()=>{
 fails(()=>review({sourceSnapshotDigest:'bad'}),'HASH');
});
test('source review rejects personal reviewer token',()=>{
 fails(()=>review({reviewerToken:'person-alex'}),'PRIVATE');
});
test('source review rejects private contact detail in reason',()=>{
 fails(()=>review({reason:'Contact person@example.invalid'}),'PRIVATE');
});
test('source review digest validates against exact catalog',()=>{
 const value=review();
 assert.equal(validateSourceReview(value,{catalog:catalog()}).digest,value.digest);
});
test('source review rejects altered digest',()=>{
 const value=review(),changed={...value,eligible:false};
 fails(()=>validateSourceReview(changed),'REVIEW_RESULT');
});
test('source review detects stale catalog',()=>{
 const value=review(),changedDigest=sha256('changed');
 const changed=catalog({sources:[source({sourceDigest:changedDigest})],
  records:[record({evidence:[{...record().evidence[0],digest:changedDigest}]})]});
 fails(()=>validateSourceReview(value,{catalog:changed}),'STALE_REVIEW');
});
test('source review cannot set automatic release flag',()=>{
 const value=review(),changed={...value,automaticRelease:true};
 changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>validateSourceReview(changed),'AUTOMATION');
});
test('review release gate reports failed checks explicitly',()=>{
 const value=review({licenceConfirmed:false});
 const result=reviewCanRelease(value);
 assert.equal(result.eligible,false);
 assert.ok(result.failedChecks.includes('licence-confirmed'));
});
test('review release gate is true only when every check passes',()=>{
 const result=reviewCanRelease(review());
 assert.equal(result.eligible,true);
 assert.deepEqual(result.failedChecks,[]);
});
test('review batch selects all requested sources',()=>{
 const result=buildSourceReviewBatch(catalog(),{sourceIds:['source-one'],
  reviewedOn:LATER,reviewerToken:'actor-reviewer'});
 assert.equal(result.sources.length,1);
});
test('review batch flags held and unknown-licence sources',()=>{
 const current=catalog({sources:[source({status:'held',licence:'UNKNOWN'})],
  records:[record({state:'review-required'})],assets:[asset({state:'quarantined'})],packages:[pkg({state:'held'})]});
 const result=buildSourceReviewBatch(current,{sourceIds:['source-one'],
  reviewedOn:LATER,reviewerToken:'actor-reviewer'});
 assert.equal(result.sources[0].requiresReview,true);
});
test('review batch rejects duplicate source IDs',()=>{
 fails(()=>buildSourceReviewBatch(catalog(),{sourceIds:['source-one','source-one'],
  reviewedOn:LATER,reviewerToken:'actor-reviewer'}),'DUPLICATE');
});
test('review batch rejects missing source ID',()=>{
 fails(()=>buildSourceReviewBatch(catalog(),{sourceIds:['missing'],
  reviewedOn:LATER,reviewerToken:'actor-reviewer'}),'SOURCE_REF');
});
test('review batch returns deterministic source order',()=>{
 const s2=source({sourceId:'source-two',sourceDigest:sha256('two'),reference:'sources/two.json'});
 const current=catalog({sources:[s2,source()]});
 const result=buildSourceReviewBatch(current,{sourceIds:['source-two','source-one'],
  reviewedOn:LATER,reviewerToken:'actor-reviewer'});
 assert.deepEqual(result.sources.map(row=>row.sourceId),['source-one','source-two']);
});
test('review batch digest binds requested source set',()=>{
 const first=buildSourceReviewBatch(catalog(),{sourceIds:['source-one'],reviewedOn:LATER,reviewerToken:'actor-reviewer'});
 const second=buildSourceReviewBatch(catalog(),{sourceIds:['source-one'],reviewedOn:'2026-11-24',reviewerToken:'actor-reviewer'});
 assert.notEqual(first.digest,second.digest);
});
test('source review never claims accessibility status',()=>{
 const value=review();
 assert.equal(Object.hasOwn(value,'accessState'),false);
 assert.equal(Object.hasOwn(value,'access'),false);
});

test('source review records all named release checks',()=>{
 const value=review();
 assert.deepEqual(value.checks.map(row=>row.check),[
  'source-state','snapshot-integrity','licence-confirmed','attribution-confirmed',
  'observation-current','retrieval-not-future','licence-known',
 ]);
});
test('source review reason remains attached to reviewer decision',()=>{
 assert.equal(review().reason,'Source metadata was checked against the local capture.');
});
test('source review can be held without modifying catalog source status',()=>{
 const value=review({licenceConfirmed:false});
 assert.equal(value.outcome,'continue-hold');
 assert.equal(catalog().sources[0].status,'active');
});

test('source review validator rejects reordered checks even with recomputed digest',()=>{
 const value=review(),changed={...value,checks:[...value.checks].reverse()};
 changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>validateSourceReview(changed),'CHECKS');
});
test('source review validator rejects a forged eligible flag',()=>{
 const value=review(),changed={...value,eligible:false};
 changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>validateSourceReview(changed),'REVIEW_RESULT');
});
test('source review validator rejects identity-shaped reviewer token',()=>{
 const value=review(),changed={...value,reviewerToken:'person-alex'};
 changed.digest=sha256((({digest,...rest})=>rest)(changed));
 fails(()=>validateSourceReview(changed),'PRIVATE');
});
