import test from 'node:test';
import assert from 'node:assert/strict';
import {reference,DAY} from './p15ad-fixtures.mjs';
import {createReviewSample,validateReviewSample,sampleCoverage} from './p15ad-sampling.mjs';
import {QualityError} from './p15ad-contract.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof QualityError&&error.code===code);
const sample=(options={})=>createReviewSample(reference({count:options.count??30}),{
 sampleId:'sample-one',seed:options.seed??'seed-one',createdOn:DAY,size:options.size??12,
 strata:options.strata??['feature','tier','referenceState']});

test('sample builder selects the requested number of unique items',()=>{
 const value=sample();assert.equal(value.sampleSize,12);
 assert.equal(new Set(value.items.map(row=>row.itemId)).size,12);
});
test('sample builder is deterministic for the same seed and population',()=>{
 assert.deepEqual(sample(),sample());
});
test('sample builder changes selected ranking when seed changes',()=>{
 assert.notDeepEqual(sample({seed:'seed-one'}).items,sample({seed:'seed-two'}).items);
});
test('sample builder never exceeds population size',()=>{
 const value=sample({count:6,size:20});assert.equal(value.sampleSize,6);
});
test('sample builder rejects empty population',()=>{
 fails(()=>createReviewSample(reference({count:0}),{sampleId:'sample-empty',seed:'seed',
  createdOn:DAY,size:1}), 'EMPTY');
});
test('sample builder rejects zero requested size',()=>{
 fails(()=>sample({size:0}),'INTEGER');
});
test('sample builder rejects an unknown stratification field',()=>{
 fails(()=>sample({strata:['operator']}),'STRATA');
});
test('sample builder rejects duplicate stratification fields',()=>{
 fails(()=>sample({strata:['feature','feature']}),'DUPLICATE');
});
test('sample builder rejects a date before reference creation',()=>{
 fails(()=>createReviewSample(reference(),{sampleId:'sample-old',seed:'seed',
  createdOn:'2026-11-20',size:2}),'DATE');
});
test('sample allocations sum to selected size',()=>{
 const value=sample({count:50,size:17});
 assert.equal(value.allocations.reduce((sum,row)=>sum+row.sampled,0),17);
});
test('sample allocations do not exceed each stratum population',()=>{
 const value=sample({count:30,size:25});
 assert.ok(value.allocations.every(row=>row.sampled<=row.population));
});
test('sample inclusion probabilities stay within zero and one',()=>{
 const value=sample({count:30,size:15});
 assert.ok(value.items.every(row=>row.inclusionProbability>0&&row.inclusionProbability<=1));
});
test('sample items retain reference state and evidence tier',()=>{
 const value=sample();
 assert.ok(value.items.every(row=>['YES','NO','UNKNOWN'].includes(row.referenceState)));
 assert.ok(value.items.every(row=>Number.isInteger(row.tier)));
});
test('sample validator recomputes exact sample membership',()=>{
 const ref=reference({count:30}),value=createReviewSample(ref,{sampleId:'sample-one',
  seed:'seed-one',createdOn:DAY,size:12});
 assert.equal(validateReviewSample(value,ref).digest,value.digest);
});
test('sample validator rejects altered item membership',()=>{
 const ref=reference({count:30}),value=createReviewSample(ref,{sampleId:'sample-one',
  seed:'seed-one',createdOn:DAY,size:12}),changed=structuredClone(value);
 changed.items.pop();changed.sampleSize--;
 fails(()=>validateReviewSample(changed,ref),'STALE_SAMPLE');
});
test('sample validator rejects a changed reference population',()=>{
 const ref=reference({count:30}),value=createReviewSample(ref,{sampleId:'sample-one',
  seed:'seed-one',createdOn:DAY,size:12}),changed=reference({count:31});
 fails(()=>validateReviewSample(value,changed),'STALE_SAMPLE');
});
test('sample coverage returns stable stratum counts',()=>{
 const value=sample(),coverage=sampleCoverage(value);
 assert.equal(coverage.sampleSize,value.sampleSize);
 assert.ok(Object.keys(coverage.strata).length>0);
});
test('sample coverage fraction is bounded',()=>{
 const value=sample(),coverage=sampleCoverage(value);
 assert.ok(coverage.fraction>0&&coverage.fraction<=1);
});
test('sample coverage rejects a malformed digest',()=>{
 const value=sample();value.digest='not-a-hash';fails(()=>sampleCoverage(value),'HASH');
});
test('sample uses deterministic ranks to break ties',()=>{
 const a=sample({count:24,size:10}),b=sample({count:24,size:10});
 assert.deepEqual(a.items.map(row=>row.rank),b.items.map(row=>row.rank));
});
test('sample output does not include names or direct record identifiers',()=>{
 const value=sample();
 assert.ok(value.items.every(row=>!Object.hasOwn(row,'recordName')));
 assert.ok(value.items.every(row=>!Object.hasOwn(row,'recordId')));
});

test('sample stratification can be limited to a single explicit feature',()=>{
 const value=sample({strata:['feature']});
 assert.ok(value.allocations.every(row=>row.stratum.startsWith('feature=')));
});
test('sample stratification can preserve tier and access-state groups',()=>{
 const value=sample({strata:['tier','referenceState']});
 assert.ok(value.allocations.every(row=>row.stratum.includes('tier=')&&row.stratum.includes('referenceState=')));
});
test('sample allocator includes every stratum when sample size permits',()=>{
 const value=sample({count:30,size:30});
 assert.equal(value.allocations.filter(row=>row.sampled>0).length,value.allocations.length);
});
test('sample allocator keeps all items when sample size equals population',()=>{
 const value=sample({count:15,size:15});
 assert.equal(value.sampleSize,value.population);
 assert.ok(value.allocations.every(row=>row.sampled===row.population));
});
test('sample ranks are unique within the generated sample',()=>{
 const value=sample({count:50,size:30});
 assert.equal(new Set(value.items.map(row=>row.rank)).size,value.items.length);
});
test('sample seed must be a valid identifier',()=>{
 const ref=reference();
 fails(()=>createReviewSample(ref,{sampleId:'sample-one',seed:'bad seed',createdOn:DAY,size:4}),'ID');
});
test('sample ID must be a valid identifier',()=>{
 const ref=reference();
 fails(()=>createReviewSample(ref,{sampleId:'BadSample',seed:'seed',createdOn:DAY,size:4}),'ID');
});
test('sample cannot be created from a forged reference digest',()=>{
 const ref=reference();ref.digest='f'.repeat(64);
 fails(()=>createReviewSample(ref,{sampleId:'sample-one',seed:'seed',createdOn:DAY,size:4}),'HASH');
});
test('sample allocations are stable across repeated invocations',()=>{
 assert.deepEqual(sample({count:42,size:21}).allocations,sample({count:42,size:21}).allocations);
});
test('sample coverage reflects all selected strata',()=>{
 const value=sample({count:36,size:36}),coverage=sampleCoverage(value);
 assert.equal(Object.values(coverage.strata).reduce((a,b)=>a+b,0),36);
});
