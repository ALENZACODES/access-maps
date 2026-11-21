import test from 'node:test';
import assert from 'node:assert/strict';
import {cohenKappa,interpretKappa,fleissKappa,confusionMatrix,matrixMetrics,
 reviewerAgreement,stratifiedMetrics} from './p15ad-agreement.mjs';
import {QualityError} from './p15ad-contract.mjs';
import {reference,responseSet} from './p15ad-fixtures.mjs';
import {joinReviewEvidence} from './p15ad-reference.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof QualityError&&error.code===code);

test('Cohen kappa is one for identical nonconstant ratings',()=>{
 const result=cohenKappa(['YES','NO','UNKNOWN'],['YES','NO','UNKNOWN']);
 assert.equal(result.kappa,1);assert.equal(result.interpretation,'near-perfect');
});
test('Cohen kappa is negative for systematically opposing ratings',()=>{
 const result=cohenKappa(['YES','YES','NO','NO'],['NO','NO','YES','YES']);
 assert.ok(result.kappa<0);assert.equal(result.interpretation,'below-chance');
});
test('Cohen kappa reports empty paired sample as not estimable',()=>{
 assert.deepEqual(cohenKappa([],[]),{n:0,observed:null,expected:null,kappa:null,interpretation:'not-estimable'});
});
test('Cohen kappa reports perfect-prevalence denominator as not estimable',()=>{
 const result=cohenKappa(['YES','YES'],['YES','YES']);
 assert.equal(result.kappa,null);
});
test('Cohen kappa rejects different sample lengths',()=>{
 fails(()=>cohenKappa(['YES'],['YES','NO']),'SHAPE');
});
test('Cohen kappa rejects unrecognized category labels',()=>{
 fails(()=>cohenKappa(['YES'],['MAYBE']),'STATE');
});
test('Cohen kappa is invariant to simultaneous category permutation',()=>{
 const first=cohenKappa(['YES','NO','UNKNOWN'],['NO','NO','UNKNOWN']);
 const second=cohenKappa(['NO','YES','UNKNOWN'],['YES','YES','UNKNOWN']);
 assert.equal(first.kappa,second.kappa);
});
test('Kappa interpretation has explicit ordered bands',()=>{
 assert.equal(interpretKappa(-0.1),'below-chance');
 assert.equal(interpretKappa(0.1),'slight');
 assert.equal(interpretKappa(0.3),'fair');
 assert.equal(interpretKappa(0.5),'moderate');
 assert.equal(interpretKappa(0.7),'substantial');
 assert.equal(interpretKappa(0.9),'near-perfect');
 assert.equal(interpretKappa(null),'not-estimable');
});
test('Fleiss kappa returns one for unanimous nonconstant ratings',()=>{
 const result=fleissKappa([['YES','YES','YES'],['NO','NO','NO'],['UNKNOWN','UNKNOWN','UNKNOWN']]);
 assert.equal(result.kappa,1);
});
test('Fleiss kappa is invariant to rater column order',()=>{
 const rows=[['YES','NO','YES'],['NO','NO','UNKNOWN'],['UNKNOWN','YES','UNKNOWN']];
 const reversed=rows.map(row=>[...row].reverse());
 assert.equal(fleissKappa(rows).kappa,fleissKappa(reversed).kappa);
});
test('Fleiss kappa rejects inconsistent number of raters',()=>{
 fails(()=>fleissKappa([['YES','NO'],['NO']]),'SHAPE');
});
test('Fleiss kappa rejects one rater',()=>{
 fails(()=>fleissKappa([['YES']]),'INTEGER');
});
test('Fleiss kappa rejects unsupported rating values',()=>{
 fails(()=>fleissKappa([['YES','MAYBE']]),'STATE');
});
test('Fleiss kappa handles no items',()=>{
 assert.equal(fleissKappa([]).kappa,null);
});
test('Confusion matrix counts every known reference/prediction pair',()=>{
 const matrix=confusionMatrix([
  {referenceState:'YES',observedState:'YES'},
  {referenceState:'YES',observedState:'NO'},
  {referenceState:'NO',observedState:'NO'},
 ]);
 assert.equal(matrix.YES.YES,1);assert.equal(matrix.YES.NO,1);assert.equal(matrix.NO.NO,1);
});
test('Confusion matrix rejects unknown category strings',()=>{
 fails(()=>confusionMatrix([{referenceState:'MAYBE',observedState:'YES'}]),'STATE');
});
test('Matrix metrics calculate accuracy and class recall',()=>{
 const metrics=matrixMetrics(confusionMatrix([
  {referenceState:'YES',observedState:'YES'},
  {referenceState:'YES',observedState:'NO'},
  {referenceState:'NO',observedState:'NO'},
  {referenceState:'UNKNOWN',observedState:'UNKNOWN'},
 ]));
 assert.equal(metrics.n,4);assert.equal(metrics.correct,3);assert.equal(metrics.accuracy,0.75);
 assert.equal(metrics.recall.YES,0.5);assert.equal(metrics.recall.NO,1);
});
test('Matrix metrics return null for a class with no predictions',()=>{
 const metrics=matrixMetrics(confusionMatrix([{referenceState:'YES',observedState:'YES'}]));
 assert.equal(metrics.precision.NO,null);assert.equal(metrics.recall.NO,null);
});
test('Matrix metrics macro F1 excludes undefined classes',()=>{
 const metrics=matrixMetrics(confusionMatrix([{referenceState:'YES',observedState:'YES'}]));
 assert.equal(metrics.macroF1,1);
});
test('Reviewer agreement creates pairwise Cohen metrics',()=>{
 const ref=reference({count:6}),responses=responseSet({referenceSet:ref,reviewers:['blind-alpha','blind-bravo']});
 const joined=joinReviewEvidence(ref,responses),result=reviewerAgreement(joined);
 assert.equal(result.reviewers,2);assert.equal(result.pairwise.length,1);
});
test('Reviewer agreement calculates multi-rater only on complete items',()=>{
 const ref=reference({count:6}),responses=responseSet({referenceSet:ref,reviewers:['blind-alpha','blind-bravo']});
 const joined=joinReviewEvidence(ref,responses),result=reviewerAgreement(joined);
 assert.equal(result.completeItems,6);assert.equal(result.multiRater.items,6);
});
test('Reviewer agreement excludes abstentions from pairwise rating pairs',()=>{
 const ref=reference({count:6}),responses=responseSet({referenceSet:ref,reviewers:['blind-alpha','blind-bravo'],abstainEvery:2});
 const result=reviewerAgreement(joinReviewEvidence(ref,responses));
 assert.ok(result.pairwise[0].n<6);
});
test('Reviewer agreement reports incomplete panels without fabricating ratings',()=>{
 const ref=reference({count:4}),responses=responseSet({referenceSet:ref,reviewers:['blind-alpha','blind-bravo']});
 const joined=joinReviewEvidence(ref,responses).filter(row=>row.reviewerToken!=='blind-bravo'||row.itemId!=='item-001');
 const result=reviewerAgreement(joined);
 assert.equal(result.completeItems,3);
});
test('Stratified metrics separates feature groups',()=>{
 const ref=reference({count:6}),responses=responseSet({referenceSet:ref});
 const joined=joinReviewEvidence(ref,responses);
 const result=stratifiedMetrics(joined,'feature');
 assert.ok(Object.hasOwn(result,'entrance'));assert.ok(Object.hasOwn(result,'washroom'));
});
test('Stratified metrics produces stable sorted groups',()=>{
 const ref=reference({count:6}),responses=responseSet({referenceSet:ref});
 const result=stratifiedMetrics(joinReviewEvidence(ref,responses),'feature');
 assert.deepEqual(Object.keys(result),Object.keys(result).sort());
});

test('Cohen kappa handles a single category with no chance-corrected denominator',()=>{
 const result=cohenKappa(['NO','NO','NO'],['NO','NO','NO']);
 assert.equal(result.kappa,null);
 assert.equal(result.interpretation,'not-estimable');
});
test('Cohen kappa returns a bounded observed agreement value',()=>{
 const result=cohenKappa(['YES','NO','UNKNOWN','YES'],['YES','UNKNOWN','UNKNOWN','NO']);
 assert.ok(result.observed>=0&&result.observed<=1);
});
test('Fleiss kappa uses the declared number of raters for every item',()=>{
 const result=fleissKappa([['YES','NO','YES'],['NO','NO','UNKNOWN']]);
 assert.equal(result.raters,3);
 assert.equal(result.items,2);
});
test('Fleiss kappa rejects too many raters',()=>{
 fails(()=>fleissKappa([Array.from({length:101},()=> 'YES')]),'INTEGER');
});
test('Confusion matrix initializes every state cell to zero',()=>{
 const value=confusionMatrix([]);
 for(const actual of ['YES','NO','UNKNOWN']){
  for(const predicted of ['YES','NO','UNKNOWN'])assert.equal(value[actual][predicted],0);
 }
});
test('Matrix metrics return null accuracy for an empty confusion matrix',()=>{
 const value=matrixMetrics(confusionMatrix([]));
 assert.equal(value.accuracy,null);
 assert.equal(value.n,0);
});
test('Reviewer agreement reports no estimable pair for one reviewer',()=>{
 const ref=reference({count:6}),responses=responseSet({referenceSet:ref,reviewers:['blind-alpha']});
 const value=reviewerAgreement(joinReviewEvidence(ref,responses));
 assert.equal(value.pairwise.length,0);
});
test('Reviewer agreement ignores an abstention for both reviewers on the same item',()=>{
 const ref=reference({count:6}),responses=responseSet({referenceSet:ref,
  reviewers:['blind-alpha','blind-bravo'],abstainEvery:2});
 const value=reviewerAgreement(joinReviewEvidence(ref,responses));
 assert.equal(value.pairwise[0].n,4);
});
test('Stratified metrics includes UNKNOWN reference state as its own group',()=>{
 const ref=reference({count:9}),responses=responseSet({referenceSet:ref});
 const value=stratifiedMetrics(joinReviewEvidence(ref,responses),'referenceState');
 assert.ok(Object.hasOwn(value,'UNKNOWN'));
});
