import {fail,exact,id,date,hash,integer,unique,sorted,copy,sha,bodyHash,MAX_ITEMS} from './p15ad-contract.mjs';
import {validateReferenceSet} from './p15ad-reference.mjs';
export const SAMPLE_SCHEMA='access-maps-review-sample/1';
const STRATA=['feature','tier','referenceState'];
function stratum(row,fields){return fields.map(field=>`${field}=${row[field]}`).join('|');}
export function createReviewSample(referenceInput,{sampleId,seed,createdOn,size,strata=STRATA}={}){
 const reference=validateReferenceSet(referenceInput);
 id(sampleId,'sampleId');id(seed,'seed');date(createdOn,'createdOn');
 integer(size,'size',{min:1,max:MAX_ITEMS});
 fail(reference.createdOn<=createdOn,'DATE','Sample predates reference set.');
 fail(Array.isArray(strata)&&strata.length>0&&strata.every(field=>STRATA.includes(field)),
  'STRATA','Unsupported sampling strata.');
 unique(strata,'sampling strata');
 const groups=new Map();
 for(const item of reference.items){
  const key=stratum(item,strata),rows=groups.get(key)??[];
  rows.push(item);groups.set(key,rows);
 }
 const population=reference.items.length;
 fail(population>0,'EMPTY','Cannot sample an empty reference set.');
 const target=Math.min(size,population),selected=[];
 const groupRows=[...groups].sort(([a],[b])=>a.localeCompare(b));
 const allocations=allocate(groupRows,target);
 for(const [key,rows] of groupRows){
  const count=allocations.get(key);
  const ranked=rows.map(row=>({row,rank:sha(`${seed}\u0000${key}\u0000${row.itemId}`)}))
   .sort((a,b)=>a.rank.localeCompare(b.rank));
  for(const entry of ranked.slice(0,count)){
   selected.push({itemId:entry.row.itemId,stratum:key,rank:entry.rank,
    inclusionProbability:count/rows.length,referenceState:entry.row.referenceState,
    tier:entry.row.tier,feature:entry.row.feature});
  }
 }
 const result={schema:SAMPLE_SCHEMA,sampleId,seed,createdOn,referenceDigest:reference.digest,
  population,sampleSize:selected.length,strata:[...strata],allocations:groupRows.map(([key,rows])=>({
   stratum:key,population:rows.length,sampled:allocations.get(key),inclusionProbability:allocations.get(key)/rows.length})),
  items:sorted(selected,row=>row.itemId),digest:''};
 result.digest=bodyHash(result);return result;
}
function allocate(groups,target){
 const total=groups.reduce((sum,[,rows])=>sum+rows.length,0),result=new Map();
 let assigned=0;
 for(const [key,rows] of groups){
  const exactCount=target*rows.length/total,base=Math.min(rows.length,Math.floor(exactCount));
  result.set(key,base);assigned+=base;
 }
 const ranked=groups.map(([key,rows])=>({key,remainder:target*rows.length/total-Math.floor(target*rows.length/total)}))
  .sort((a,b)=>b.remainder-a.remainder||a.key.localeCompare(b.key));
 for(const row of ranked){
  if(assigned>=target)break;
  if(result.get(row.key)<groups.find(([key])=>key===row.key)[1].length){
   result.set(row.key,result.get(row.key)+1);assigned++;
  }
 }
 return result;
}
export function validateReviewSample(input,referenceInput){
 exact(input,['schema','sampleId','seed','createdOn','referenceDigest','population','sampleSize',
  'strata','allocations','items','digest']);
 fail(input.schema===SAMPLE_SCHEMA,'SCHEMA','Unsupported sample schema.');
 const expected=createReviewSample(referenceInput,{sampleId:input.sampleId,seed:input.seed,
  createdOn:input.createdOn,size:input.sampleSize,strata:input.strata});
 fail(input.referenceDigest===expected.referenceDigest&&input.population===expected.population&&
  input.sampleSize===expected.sampleSize&&input.digest===expected.digest,'STALE_SAMPLE','Sample does not match reference population.');
 return copy(input);
}
export function sampleCoverage(sampleInput){
 hash(sampleInput.digest);
 const counts=new Map();
 for(const row of sampleInput.items)counts.set(row.stratum,(counts.get(row.stratum)??0)+1);
 return {population:sampleInput.population,sampleSize:sampleInput.sampleSize,
  fraction:sampleInput.sampleSize/sampleInput.population,
  strata:Object.fromEntries([...counts].sort(([a],[b])=>a.localeCompare(b)))};
}
