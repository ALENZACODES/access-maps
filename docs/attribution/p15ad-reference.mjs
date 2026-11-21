import {STATES,DECISIONS,MAX_ITEMS,fail,exact,id,text,date,hash,integer,unique,sorted,copy,bodyHash,noIdentity,pseudonym} from './p15ad-contract.mjs';
export const REFERENCE_SCHEMA='access-maps-review-reference-set/1';
export const RESPONSE_SCHEMA='access-maps-review-response-set/1';
const ITEM=['itemId','recordDigest','evidenceDigest','field','feature','tier','referenceState','adjudication','adjudicatedOn','adjudicatorToken','rationale','sourceDigests'];
const RESPONSE=['responseId','itemId','reviewerToken','decision','observedState','reviewedOn','evidenceDigest','sourceDigests','rationale'];
function itemRow(row){
 exact(row,ITEM);
 id(row.itemId,'itemId');
 hash(row.recordDigest,'recordDigest');
 hash(row.evidenceDigest,'evidenceDigest');
 text(row.field,'field',{max:120});
 id(row.feature,'feature');
 integer(row.tier,'tier',{max:3});
 fail(STATES.includes(row.referenceState),'STATE','Reference state invalid.');
 fail(['YES','NO','UNKNOWN'].includes(row.adjudication),'ADJUDICATION','Adjudication invalid.');
 date(row.adjudicatedOn,'adjudicatedOn');
 pseudonym(row.adjudicatorToken,'adjudicatorToken');
 text(row.rationale,'rationale',{max:1000});
 fail(Array.isArray(row.sourceDigests)&&row.sourceDigests.length<=100,'SOURCES','Source digest list invalid.');
 row.sourceDigests.forEach((value)=>hash(value,'sourceDigest'));
 unique(row.sourceDigests,'source digests');
 fail(row.referenceState==='UNKNOWN'||row.sourceDigests.length>0,'SOURCES','Known reference state requires source digests.');
 fail(row.adjudication!=='UNKNOWN'||row.referenceState==='UNKNOWN','UNKNOWN','An unknown adjudication cannot assert an access state.');
 fail(row.adjudication==='UNKNOWN'||row.adjudication===row.referenceState,'REFERENCE_MISMATCH','Adjudication and reference state differ.');
 return copy(row);
}
export function createReferenceSet({referenceSetId,version,createdOn,items=[]}={}){
 id(referenceSetId,'referenceSetId');
 integer(version,'version',{min:1,max:100000});
 date(createdOn,'createdOn');
 fail(Array.isArray(items)&&items.length<=MAX_ITEMS,'LIMIT','Reference set too large.');
 const rows=items.map(itemRow);
 unique(rows.map(row=>row.itemId),'reference item IDs');
 fail(rows.every(row=>row.adjudicatedOn<=createdOn),'FUTURE_REFERENCE','Reference item postdates reference set.');
 const value={schema:REFERENCE_SCHEMA,referenceSetId,version,createdOn,
  items:sorted(rows,row=>row.itemId),digest:''};
 value.digest=bodyHash(value);
 noIdentity(value);
 return value;
}
export function validateReferenceSet(input){
 exact(input,['schema','referenceSetId','version','createdOn','items','digest']);
 fail(input.schema===REFERENCE_SCHEMA,'SCHEMA','Unsupported reference set schema.');
 const result=createReferenceSet(input);
 hash(input.digest);
 fail(result.digest===input.digest,'HASH','Reference set digest invalid.');
 return result;
}
export function createResponseSet({responseSetId,createdOn,responses=[]}={}){
 id(responseSetId,'responseSetId');
 date(createdOn,'createdOn');
 fail(Array.isArray(responses)&&responses.length<=50000,'LIMIT','Response set too large.');
 const rows=responses.map(responseRow);
 unique(rows.map(row=>row.responseId),'response IDs');
 unique(rows.map(row=>`${row.itemId}:${row.reviewerToken}`),'reviewer-item responses');
 fail(rows.every(row=>row.reviewedOn<=createdOn),'FUTURE_RESPONSE','Response postdates response set.');
 const value={schema:RESPONSE_SCHEMA,responseSetId,createdOn,
  responses:sorted(rows,row=>`${row.itemId}:${row.reviewerToken}`),digest:''};
 value.digest=bodyHash(value);
 noIdentity(value);
 return value;
}
function responseRow(row){
 exact(row,RESPONSE);
 id(row.responseId,'responseId');
 id(row.itemId,'itemId');
 id(row.reviewerToken,'reviewerToken');
 fail(!/(?:reviewer|person|email|phone|identity|name)/iu.test(row.reviewerToken),'IDENTITY','Reviewer token must be opaque.');
 fail(DECISIONS.includes(row.decision),'DECISION','Decision invalid.');
 fail(STATES.includes(row.observedState),'STATE','Observed state invalid.');
 date(row.reviewedOn,'reviewedOn');
 hash(row.evidenceDigest,'evidenceDigest');
 fail(Array.isArray(row.sourceDigests)&&row.sourceDigests.length<=100,'SOURCES','Response sources invalid.');
 row.sourceDigests.forEach(value=>hash(value,'sourceDigest'));
 unique(row.sourceDigests,'response source digests');
 fail(row.decision!=='supported'||row.observedState!=='UNKNOWN','UNKNOWN','UNKNOWN cannot be a supported finding.');
 fail(row.decision!=='contradicted'||row.observedState!=='UNKNOWN','UNKNOWN','A contradiction requires a known state.');
 text(row.rationale,'rationale',{max:1000});
 return copy(row);
}
export function validateResponseSet(input){
 exact(input,['schema','responseSetId','createdOn','responses','digest']);
 fail(input.schema===RESPONSE_SCHEMA,'SCHEMA','Unsupported response set schema.');
 const result=createResponseSet(input);
 hash(input.digest);
 fail(result.digest===input.digest,'HASH','Response set digest invalid.');
 return result;
}
export function joinReviewEvidence(referenceInput,responseInput){
 const reference=validateReferenceSet(referenceInput);
 const responses=validateResponseSet(responseInput);
 const refs=new Map(reference.items.map(row=>[row.itemId,row]));
 const joined=[];
 for(const response of responses.responses){
  const ref=refs.get(response.itemId);
  fail(ref,'REFERENCE_MISSING','Response item has no adjudicated reference.');
  fail(response.evidenceDigest===ref.evidenceDigest,'STALE_EVIDENCE','Response evidence digest differs from reference.');
  fail(response.reviewedOn>=ref.adjudicatedOn,'DATE_ORDER','Response predates reference adjudication.');
  joined.push({responseId:response.responseId,itemId:response.itemId,
   reviewerToken:response.reviewerToken,decision:response.decision,
   observedState:response.observedState,referenceState:ref.referenceState,feature:ref.feature,tier:ref.tier,
   referenceDigest:reference.digest,evidenceDigest:response.evidenceDigest,
   reviewedOn:response.reviewedOn});
 }
 return sorted(joined,row=>`${row.reviewerToken}:${row.itemId}`);
}
export function referenceCoverage(referenceInput,responseInput){
 const reference=validateReferenceSet(referenceInput),responses=validateResponseSet(responseInput);
 const counts=new Map();
 for(const row of responses.responses)counts.set(row.itemId,(counts.get(row.itemId)??0)+1);
 const covered=reference.items.filter(row=>(counts.get(row.itemId)??0)>0).length;
 return {referenceItems:reference.items.length,responseItems:responses.responses.length,
  coveredItems:covered,unreviewedItems:reference.items.length-covered,
  coverage:reference.items.length?covered/reference.items.length:1};
}
