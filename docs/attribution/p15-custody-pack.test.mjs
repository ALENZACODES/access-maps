import test from 'node:test';
import assert from 'node:assert/strict';
import {ledger,item,withItem,withAccess,withRedaction,DAY,NEXT,LATER,NEXT_AT} from './p15-custody-fixtures.mjs';
import {bodyHash,CustodyError} from './p15-custody-contract.mjs';
import {createRedactionManifest} from './p15-custody-redaction.mjs';
import {registerEvidence} from './p15-custody-ledger.mjs';
import {createCustodyPack,validateCustodyPack,renderCustodyPackSummary} from './p15-custody-pack.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
function make({access=false,redacted=false,events=true,includeAccess=false}={}){
 let row=withItem();
 if(access)row=withAccess(row);
 let manifest=null;
 if(redacted){
  row=withRedaction(row);
  manifest=createRedactionManifest(row,{manifestId:'manifest-one',createdOn:LATER,
   createdBy:'actor-auditor',entries:row.redactions});
 }
 return {row,manifest,pack:createCustodyPack(row,{packId:'pack-one',createdOn:LATER,
  createdBy:'actor-auditor',manifest,includeAccess,includeEventHistory:events})};
}
import {sha} from './p15-custody-contract.mjs';
test('pack contains selected evidence metadata and digest',()=>{
 const {pack}=make();assert.equal(pack.items.length,1);assert.equal(pack.items[0].itemId,'evidence-one');
});
test('pack excludes access records by default',()=>{
 const {pack}=make({access:true});assert.equal(pack.access,null);
});
test('pack includes access records only when requested',()=>{
 const {pack}=make({access:true,includeAccess:true});assert.equal(pack.access.length,1);
});
test('pack can include access records explicitly',()=>{
 const row=withAccess(withItem());
 const pack=createCustodyPack(row,{packId:'pack-access',createdOn:LATER,
  createdBy:'actor-auditor',includeAccess:true});
 assert.equal(pack.access.length,1);assert.equal(pack.access[0].accessId,'access-evidence-one');
});
test('pack omits event history when requested',()=>{
 const {pack}=make({events:false});assert.equal(pack.events,null);
});
test('pack includes redaction replacements when manifest supplied',()=>{
 const {pack}=make({redacted:true});
 assert.equal(pack.items[0].redactions[0].replacement,'[redacted]');
});
test('pack binds manifest digest',()=>{
 const {pack,manifest}=make({redacted:true});assert.equal(pack.redactionManifestDigest,manifest.digest);
});
test('pack validates generated digest',()=>{
 const {pack}=make();assert.equal(validateCustodyPack(pack).digest,pack.digest);
});
test('pack rejects unsupported schema',()=>{
 const {pack}=make();fails(()=>validateCustodyPack({...pack,schema:'other'}),'SCHEMA');
});
test('pack rejects changed digest',()=>{
 const {pack}=make();fails(()=>validateCustodyPack({...pack,createdOn:NEXT}),'HASH');
});
test('pack rejects duplicate item IDs',()=>{
 const {pack}=make(),changed=structuredClone(pack);changed.items.push(changed.items[0]);
 changed.digest=bodyHash(changed);fails(()=>validateCustodyPack(changed),'DUPLICATE');
});
test('pack rejects malformed item digest',()=>{
 const {pack}=make(),changed=structuredClone(pack);changed.items[0].itemDigest='bad';
 changed.digest=bodyHash(changed);fails(()=>validateCustodyPack(changed),'HASH');
});
test('pack rejects item with extra field',()=>{
 const {pack}=make(),changed=structuredClone(pack);changed.items[0].email='x@y.example';
 changed.digest=bodyHash(changed);fails(()=>validateCustodyPack(changed),'SHAPE');
});
test('pack rejects identity-bearing creator token',()=>{
 const {pack}=make(),changed={...pack,createdBy:'person-alex'};changed.digest=bodyHash(changed);
 fails(()=>validateCustodyPack(changed),'PRIVATE');
});
test('pack rejects malformed redaction digest',()=>{
 const {pack}=make({redacted:true}),changed=structuredClone(pack);
 changed.items[0].redactions[0].originalDigest='bad';changed.digest=bodyHash(changed);
 fails(()=>validateCustodyPack(changed),'HASH');
});
test('pack rejects malformed access row shape',()=>{
 const row=withAccess(withItem()),pack=createCustodyPack(row,{packId:'pack-access',
  createdOn:LATER,createdBy:'actor-auditor',includeAccess:true});
 const changed=structuredClone(pack);changed.access[0].email='x@y.example';changed.digest=bodyHash(changed);
 fails(()=>validateCustodyPack(changed),'SHAPE');
});
test('pack rejects malformed event row shape',()=>{
 const {pack}=make(),changed=structuredClone(pack);changed.events[0].actorToken='actor-leak';
 changed.digest=bodyHash(changed);fails(()=>validateCustodyPack(changed),'SHAPE');
});
test('pack rejects creation date before ledger opening',()=>{
 fails(()=>createCustodyPack(withItem(),{packId:'pack-old',createdOn:'2026-11-20',
  createdBy:'actor-auditor'}),'DATE_ORDER');
});
test('pack rejects item selection outside ledger',()=>{
 fails(()=>createCustodyPack(withItem(),{packId:'pack-missing',createdOn:LATER,
  createdBy:'actor-auditor',itemIds:['missing-item']}),'ITEM_REFERENCE');
});
test('pack can select a subset of ledger items',()=>{
 const row=withItem();const two=withItem(row,awaitItem());
 const pack=createCustodyPack(two,{packId:'pack-subset',createdOn:LATER,createdBy:'actor-auditor',itemIds:['evidence-two']});
 assert.deepEqual(pack.items.map(item=>item.itemId),['evidence-two']);
});
function awaitItem(){
 return {itemId:'evidence-two',kind:'document-reference',label:'Fictional second evidence',
  reference:'catalogue/evidence-two',contentDigest:sha('content-two'),sourceId:'source-one',
  sourceDigest:sha('source-one'),licence:'UNKNOWN',licenceReference:'',
  retrievedOn:DAY,capturedOn:DAY,custodianToken:'actor-custodian',state:'held',
  supersedes:null,notes:'Second fictional item.'};
}
test('pack summary renders English and French',()=>{
 const {pack}=make();assert.match(renderCustodyPackSummary(pack),/Evidence custody pack summary/u);
 assert.match(renderCustodyPackSummary(pack,{lang:'fr'}),/Résumé du dossier/u);
});
test('pack summary rejects unsupported locale',()=>{
 const {pack}=make();fails(()=>renderCustodyPackSummary(pack,{lang:'es'}),'LANGUAGE');
});
test('French pack summary uses nonbreaking colon spacing',()=>{
 const {pack}=make();assert.ok(renderCustodyPackSummary(pack,{lang:'fr'}).includes('Créé le\u00a0:'));
});
test('pack summary includes a safety limitation',()=>{
 const {pack}=make();assert.match(renderCustodyPackSummary(pack),/does not establish accessibility facts/u);
});
test('pack summary ends with newline',()=>{
 const {pack}=make();assert.ok(renderCustodyPackSummary(pack).endsWith(String.fromCharCode(10)));
});
test('pack can include zero items when ledger is empty',()=>{
 const pack=createCustodyPack(ledger(),{packId:'pack-empty',createdOn:NEXT,createdBy:'actor-auditor'});
 assert.equal(pack.items.length,0);
});
test('pack rejects duplicate selected item IDs',()=>{
 const row=withItem();fails(()=>createCustodyPack(row,{packId:'pack-duplicate',
  createdOn:NEXT,createdBy:'actor-auditor',itemIds:['evidence-one','evidence-one']}),'DUPLICATE');
});
test('pack includes source licence uncertainty unchanged',()=>{
 const row=withItem(ledger(),item('evidence-one',{licence:'UNKNOWN'}));
 const pack=createCustodyPack(row,{packId:'pack-unknown',createdOn:NEXT,createdBy:'actor-auditor'});
 assert.equal(pack.items[0].licence,'UNKNOWN');
});
test('pack records supersession relationship without deleting prior item',()=>{
 const first=withItem(),second=registerEvidence(first,item('evidence-two',{
  supersedes:'evidence-one',label:'Replacement evidence',
  contentDigest:sha('content-two'),capturedOn:NEXT,retrievedOn:NEXT
 }),{at:NEXT_AT,actorToken:'actor-coordinator'});
 const pack=createCustodyPack(second,{packId:'pack-two',createdOn:LATER,createdBy:'actor-auditor'});
 assert.equal(pack.items.length,2);
 assert.equal(pack.items.find(row=>row.itemId==='evidence-two').supersedes,'evidence-one');
});
test('pack redaction list is empty when no manifest supplied',()=>{
 const pack=createCustodyPack(withItem(),{packId:'pack-no-redaction',createdOn:NEXT,
  createdBy:'actor-auditor'});
 assert.deepEqual(pack.items[0].redactions,[]);
});
test('pack item metadata excludes custodian token',()=>{
 const {pack}=make();assert.ok(!Object.hasOwn(pack.items[0],'custodianToken'));
});
test('pack does not include raw access actor token',()=>{
 const row=withAccess(withItem()),pack=createCustodyPack(row,{packId:'pack-access',
  createdOn:LATER,createdBy:'actor-auditor',includeAccess:true});
 assert.ok(!Object.hasOwn(pack.access[0],'actorToken'));
});
test('pack event history excludes event actor token',()=>{
 const {pack}=make();assert.ok(!Object.hasOwn(pack.events[0],'actorToken'));
});
test('pack validation rejects missing event previous hash',()=>{
 const {pack}=make(),changed=structuredClone(pack);delete changed.events[0].previousHash;
 changed.digest=bodyHash(changed);fails(()=>validateCustodyPack(changed),'SHAPE');
});
test('pack validation rejects invalid event sequence type',()=>{
 const {pack}=make(),changed=structuredClone(pack);changed.events[0].sequence='one';
 changed.digest=bodyHash(changed);fails(()=>validateCustodyPack(changed),'INTEGER');
});
test('pack validation rejects invalid item state',()=>{
 const {pack}=make(),changed=structuredClone(pack);changed.items[0].state='unknown';
 changed.digest=bodyHash(changed);fails(()=>validateCustodyPack(changed),'ENUM');
});
test('pack validation rejects malformed reference',()=>{
 const {pack}=make(),changed=structuredClone(pack);changed.items[0].reference='<script>';
 changed.digest=bodyHash(changed);fails(()=>validateCustodyPack(changed),'UNSAFE');
});
test('pack validation rejects malformed licence label',()=>{
 const {pack}=make(),changed=structuredClone(pack);changed.items[0].licence='custom';
 changed.digest=bodyHash(changed);fails(()=>validateCustodyPack(changed),'ENUM');
});
test('pack summary distinguishes omitted access records',()=>{
 const {pack}=make();assert.match(renderCustodyPackSummary(pack),/not included/u);
});

test('pack output binds original ledger digest and not only item rows',()=>{
 const row=withItem(),pack=createCustodyPack(row,{packId:'pack-one',createdOn:NEXT,
  createdBy:'actor-auditor'});
 assert.equal(pack.ledgerDigest,row.digest);
});
test('pack access record selection follows selected item set',()=>{
 const first=withItem(),second=withItem(first,awaitItem());
 const withTwoAccess=recordTwoAccess(second);
 const pack=createCustodyPack(withTwoAccess,{packId:'pack-select',createdOn:LATER,
  createdBy:'actor-auditor',itemIds:['evidence-two'],includeAccess:true});
 assert.deepEqual(pack.access.map(row=>row.itemId),['evidence-two']);
});
function recordTwoAccess(input){
 const {recordAccess}=ledgerOps();
 return recordAccess(input,{accessId:'access-evidence-two',itemId:'evidence-two',
  purpose:'review',actorToken:'actor-reviewer',accessedAt:NEXT_AT,
  reason:'Review second evidence item.',result:'allowed',exportDigest:null});
}
function ledgerOps(){return {recordAccess:recordAccessImported};}
import {recordAccess as recordAccessImported} from './p15-custody-ledger.mjs';
test('pack summary reports zero redactions without manifest',()=>{
 const {pack}=make();assert.match(renderCustodyPackSummary(pack),/Redactions: 0/u);
});
test('pack report does not contain custodian identity tokens',()=>{
 const {pack}=make();assert.ok(!JSON.stringify(pack).includes('actor-custodian'));
});
test('pack redaction manifest reference is null when absent',()=>{
 const {pack}=make();assert.equal(pack.redactionManifestDigest,null);
});
test('pack digest is deterministic for identical inputs',()=>{
 assert.deepEqual(make().pack,make().pack);
});
test('pack preserves supersedes null for first evidence record',()=>{
 const {pack}=make();assert.equal(pack.items[0].supersedes,null);
});
test('pack summary includes report date and item count',()=>{
 const {pack}=make(),summary=renderCustodyPackSummary(pack);
 assert.ok(summary.includes(LATER));assert.ok(summary.includes('Items: 1'));
});
