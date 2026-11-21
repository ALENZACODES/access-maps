import {STATES,fail,integer,round} from './p15ad-contract.mjs';
const STATES_N=STATES.length;
function matrix(){
 return Object.fromEntries(STATES.map(actual=>[actual,Object.fromEntries(STATES.map(predicted=>[predicted,0]))]));
}
function counts(rows){
 const value=matrix();
 for(const row of rows)value[row.referenceState][row.observedState]++;
 return value;
}
function total(matrixValue){
 return STATES.reduce((sum,actual)=>sum+STATES.reduce((inner,predicted)=>inner+matrixValue[actual][predicted],0),0);
}
function diagonal(matrixValue){
 return STATES.reduce((sum,state)=>sum+matrixValue[state][state],0);
}
function rowTotals(matrixValue){
 return Object.fromEntries(STATES.map(state=>[state,STATES.reduce((sum,predicted)=>sum+matrixValue[state][predicted],0)]));
}
function columnTotals(matrixValue){
 return Object.fromEntries(STATES.map(state=>[state,STATES.reduce((sum,actual)=>sum+matrixValue[actual][state],0)]));
}
export function confusionMatrix(rows){
 fail(Array.isArray(rows),'SHAPE','Rows must be an array.');
 const value=matrix();
 for(const row of rows){
  fail(STATES.includes(row.referenceState)&&STATES.includes(row.observedState),
   'STATE','Confusion matrix requires known states.');
  value[row.referenceState][row.observedState]++;
 }
 return value;
}
export function matrixMetrics(value){
 const n=total(value),correct=diagonal(value),rows=rowTotals(value),columns=columnTotals(value);
 const precision={},recall={},f1={};
 for(const state of STATES){
  precision[state]=columns[state]?value[state][state]/columns[state]:null;
  recall[state]=rows[state]?value[state][state]/rows[state]:null;
  f1[state]=precision[state]===null||recall[state]===null||precision[state]+recall[state]===0?
   null:2*precision[state]*recall[state]/(precision[state]+recall[state]);
 }
 const recalls=STATES.map(state=>recall[state]).filter(value=>value!==null);
 const f1s=STATES.map(state=>f1[state]).filter(value=>value!==null);
 return {
  n,correct,accuracy:n?round(correct/n):null,
  coverage:n?round((n-value.UNKNOWN.UNKNOWN)/n):null,
  precision:Object.fromEntries(Object.entries(precision).map(([key,value])=>[key,value===null?null:round(value)])),
  recall:Object.fromEntries(Object.entries(recall).map(([key,value])=>[key,value===null?null:round(value)])),
  f1:Object.fromEntries(Object.entries(f1).map(([key,value])=>[key,value===null?null:round(value)])),
  macroRecall:recalls.length?round(recalls.reduce((a,b)=>a+b,0)/recalls.length):null,
  macroF1:f1s.length?round(f1s.reduce((a,b)=>a+b,0)/f1s.length):null,
  rowTotals:rows,columnTotals:columns,
 };
}
export function cohenKappa(left,right){
 fail(Array.isArray(left)&&Array.isArray(right)&&left.length===right.length,'SHAPE','Paired ratings must have equal length.');
 const paired=[];
 for(let i=0;i<left.length;i++){
  fail(STATES.includes(left[i])&&STATES.includes(right[i]),'STATE','Kappa requires YES, NO or UNKNOWN.');
  paired.push([left[i],right[i]]);
 }
 const n=paired.length;
 if(!n)return {n:0,observed:null,expected:null,kappa:null,interpretation:'not-estimable'};
 const leftCounts=Object.fromEntries(STATES.map(state=>[state,left.filter(value=>value===state).length]));
 const rightCounts=Object.fromEntries(STATES.map(state=>[state,right.filter(value=>value===state).length]));
 const observed=paired.filter(([a,b])=>a===b).length/n;
 const expected=STATES.reduce((sum,state)=>sum+leftCounts[state]*rightCounts[state],0)/(n*n);
 const kappa=expected===1?null:(observed-expected)/(1-expected);
 return {n,observed:round(observed),expected:round(expected),kappa:kappa===null?null:round(kappa),
  interpretation:interpretKappa(kappa)};
}
export function interpretKappa(value){
 if(value===null||!Number.isFinite(value))return 'not-estimable';
 if(value<0)return 'below-chance';
 if(value<0.2)return 'slight';
 if(value<0.4)return 'fair';
 if(value<0.6)return 'moderate';
 if(value<0.8)return 'substantial';
 return 'near-perfect';
}
export function fleissKappa(ratings){
 fail(Array.isArray(ratings),'SHAPE','Ratings must be an array.');
 if(!ratings.length)return {items:0,raters:0,observed:null,expected:null,kappa:null,interpretation:'not-estimable'};
 const raters=ratings[0].length;
 integer(raters,'raters',{min:2,max:100});
 const categoryCounts=Object.fromEntries(STATES.map(state=>[state,0]));
 let observedSum=0;
 for(const [index,row] of ratings.entries()){
  fail(Array.isArray(row)&&row.length===raters,'SHAPE',`Item ${index} has inconsistent rater count.`);
  fail(row.every(value=>STATES.includes(value)),'STATE','Fleiss ratings require known states.');
  const tally=Object.fromEntries(STATES.map(state=>[state,row.filter(value=>value===state).length]));
  for(const state of STATES)categoryCounts[state]+=tally[state];
  observedSum+=STATES.reduce((sum,state)=>sum+tally[state]*(tally[state]-1),0)/(raters*(raters-1));
 }
 const items=ratings.length,observed=observedSum/items,totalRatings=items*raters;
 const expected=STATES.reduce((sum,state)=>sum+(categoryCounts[state]/totalRatings)**2,0);
 const kappa=expected===1?null:(observed-expected)/(1-expected);
 return {items,raters,observed:round(observed),expected:round(expected),
  kappa:kappa===null?null:round(kappa),interpretation:interpretKappa(kappa)};
}
export function reviewerAgreement(joined){
 const byItem=new Map();
 const reviewerIds=[...new Set(joined.map(row=>row.reviewerToken))].sort();
 for(const row of joined){
  const values=byItem.get(row.itemId)??new Map();
  values.set(row.reviewerToken,row);
  byItem.set(row.itemId,values);
 }
 const complete=[];
 for(const [itemId,values] of [...byItem].sort(([a],[b])=>a.localeCompare(b))){
  const ratings=reviewerIds.map(reviewer=>values.get(reviewer));
  if(ratings.length>=2&&ratings.every(row=>row&&row.decision!=='abstain')){
   complete.push({itemId,ratings:ratings.map(row=>row.observedState)});
  }
 }
 const pairs=[];
 for(let i=0;i<reviewerIds.length;i++){
  for(let j=i+1;j<reviewerIds.length;j++){
   const left=[],right=[];
   for(const [itemId,values] of byItem){
    const a=values.get(reviewerIds[i]),b=values.get(reviewerIds[j]);
    if(a&&b&&a.decision!=='abstain'&&b.decision!=='abstain'){
     left.push(a.observedState);right.push(b.observedState);
    }
   }
   pairs.push({leftReviewer:reviewerIds[i],rightReviewer:reviewerIds[j],...cohenKappa(left,right)});
  }
 }
 const multiRater=complete.length?fleissKappa(complete.map(row=>row.ratings)):
  {items:0,raters:reviewerIds.length,observed:null,expected:null,kappa:null,interpretation:'not-estimable'};
 return {reviewers:reviewerIds.length,items:byItem.size,completeItems:complete.length,
  pairwise:pairs,multiRater};
}
export function stratifiedMetrics(joined,field){
 const groups=new Map();
 for(const row of joined){
  const key=String(row[field]??'UNKNOWN'),items=groups.get(key)??[];
  items.push(row);groups.set(key,items);
 }
 return Object.fromEntries([...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,rows])=>
  [key,matrixMetrics(confusionMatrix(rows))]));
}
