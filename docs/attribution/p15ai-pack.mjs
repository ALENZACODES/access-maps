import {
 PACK_SCHEMA,ITEM_STATES,ACCESS_PURPOSES,fail,exact,id,role,text,date,timestamp,hash,integer,oneOf,array,unique,copy,sorted,bodyHash,noIdentity
} from './p15ai-contract.mjs';
import {validateCustodyLedger,custodySummary} from './p15ai-ledger.mjs';
import {validateRedactionManifest,redactionSummary} from './p15ai-redaction.mjs';

export function createCustodyPack(ledgerInput,{packId,createdOn,createdBy,manifest=null,itemIds=[],
 includeAccess=false,includeEventHistory=true}={}){
 const ledger=validateCustodyLedger(ledgerInput);id(packId);date(createdOn);role(createdBy);
 fail(createdOn>=ledger.openedOn,'DATE_ORDER','Pack predates custody ledger.');
 fail(typeof includeAccess==='boolean'&&typeof includeEventHistory==='boolean','BOOLEAN','Pack switches must be boolean.');
 array(itemIds,'itemIds');itemIds.forEach(id);unique(itemIds,'item IDs');
 const selected=itemIds.length?itemIds:ledger.items.map(row=>row.itemId);
 for(const itemId of selected)fail(ledger.items.some(row=>row.itemId===itemId),'ITEM_REFERENCE','Pack item missing.');
 const redaction=manifest===null?null:validateRedactionManifest(manifest,ledger);
 const entries=selected.map(itemId=>{
  const item=ledger.items.find(row=>row.itemId===itemId);
  const redactions=redaction?.entries.filter(row=>row.itemId===itemId)??[];
  return {itemId,kind:item.kind,label:item.label,reference:item.reference,
   contentDigest:item.contentDigest,sourceId:item.sourceId,sourceDigest:item.sourceDigest,
   licence:item.licence,licenceReference:item.licenceReference,retrievedOn:item.retrievedOn,
   capturedOn:item.capturedOn,state:item.state,supersedes:item.supersedes,
   redactions:redactions.map(row=>({fieldPath:row.fieldPath,reason:row.reason,
    replacement:row.replacement,originalDigest:row.originalDigest,appliedOn:row.appliedOn})),
   itemDigest:bodyHash(item)};
 });
 const access=includeAccess?ledger.accessRecords.filter(row=>selected.includes(row.itemId)).map(row=>({
  accessId:row.accessId,itemId:row.itemId,purpose:row.purpose,accessedAt:row.accessedAt,
  result:row.result,exportDigest:row.exportDigest,reason:row.reason})):null;
 const events=includeEventHistory?ledger.events.map(row=>({
  sequence:row.sequence,type:row.type,at:row.at,previousHash:row.previousHash,hash:row.hash})):null;
 const result={schema:PACK_SCHEMA,packId,createdOn,createdBy,ledgerId:ledger.ledgerId,
  ledgerDigest:ledger.digest,items:sorted(entries,row=>row.itemId),
  access,events,redactionManifestDigest:redaction?.digest??null,
  summaries:{ledger:custodySummary(ledger),redaction:redaction?redactionSummary(redaction):null},
  digest:''};
 result.digest=bodyHash(result);noIdentity(result);return result;
}
export function validateCustodyPack(input){
 exact(input,['schema','packId','createdOn','createdBy','ledgerId','ledgerDigest','items',
  'access','events','redactionManifestDigest','summaries','digest']);
 fail(input.schema===PACK_SCHEMA,'SCHEMA','Unsupported custody pack.');
 id(input.packId);date(input.createdOn);role(input.createdBy);id(input.ledgerId);
 hash(input.ledgerDigest);array(input.items,'items');
 unique(input.items.map(row=>row.itemId),'pack item IDs');
 for(const row of input.items){
  exact(row,['itemId','kind','label','reference','contentDigest','sourceId','sourceDigest','licence',
   'licenceReference','retrievedOn','capturedOn','state','supersedes','redactions','itemDigest']);
  id(row.itemId);oneOf(row.kind,['source-capture','document-reference','observation-note','licence-record','change-notice','correspondence-summary','review-artifact','other'],'kind');
  text(row.label,'label',{max:180});text(row.reference,'reference',{max:500});hash(row.contentDigest);hash(row.sourceDigest);
  oneOf(row.licence,['CC0-1.0','CC-BY-4.0','OGL-Canada-2.0','OGL-ON-1.0','ODbL-1.0','UNKNOWN','NOT-APPLICABLE'],'licence');
  oneOf(row.state,ITEM_STATES,'state');
  hash(row.itemDigest);date(row.retrievedOn);date(row.capturedOn);
  array(row.redactions,'redactions');row.redactions.forEach(redaction=>{
   exact(redaction,['fieldPath','reason','replacement','originalDigest','appliedOn']);
   text(redaction.fieldPath,'fieldPath');text(redaction.reason,'reason');
   text(redaction.replacement,'replacement');hash(redaction.originalDigest);date(redaction.appliedOn);
  });
 }
 if(input.access!==null){
  array(input.access,'access');input.access.forEach(row=>{
   exact(row,['accessId','itemId','purpose','accessedAt','result','exportDigest','reason']);
   id(row.accessId);id(row.itemId);oneOf(row.purpose,ACCESS_PURPOSES,'purpose');timestamp(row.accessedAt);
   oneOf(row.result,['allowed','denied','not-recorded'],'result');text(row.reason,'reason');
   if(row.exportDigest!==null)hash(row.exportDigest);
  });
 }
 if(input.events!==null){
  array(input.events,'events');input.events.forEach(row=>{
   exact(row,['sequence','type','at','previousHash','hash']);integer(row.sequence,'sequence',{min:1});
   timestamp(row.at);hash(row.previousHash);hash(row.hash);
  });
 }
 if(input.redactionManifestDigest!==null)hash(input.redactionManifestDigest);
 hash(input.digest);fail(input.digest===bodyHash(input),'HASH','Custody pack digest invalid.');
 noIdentity(input);return copy(input);
}
export function renderCustodyPackSummary(input,{lang='en'}={}){
 const pack=validateCustodyPack(input);fail(['en','fr'].includes(lang),'LANGUAGE','Language must be en or fr.');
 const fr=lang==='fr';
 const labels=fr?{title:'Résumé du dossier de conservation des preuves',created:'Créé le',
  items:'Éléments',access:'Accès consignés',redactions:'Caviardages',
  note:'Ce dossier conserve des références et des empreintes; il ne confirme aucun fait sur l’accessibilité.'}:
  {title:'Evidence custody pack summary',created:'Created',items:'Items',
   access:'Recorded accesses',redactions:'Redactions',
   note:'This pack preserves references and digests; it does not establish accessibility facts.'};
 const lines=[labels.title,`${labels.created}${fr?'\u00a0: ':': '}${pack.createdOn}`,
  `${labels.items}${fr?'\u00a0: ':': '}${pack.items.length}`,
  `${labels.access}${fr?'\u00a0: ':': '}${pack.access?.length??'not included'}`,
  `${labels.redactions}${fr?'\u00a0: ':': '}${pack.items.reduce((n,row)=>n+row.redactions.length,0)}`,
  labels.note,`SHA-256: ${pack.digest}`];
 return lines.join('\n')+'\n';
}
