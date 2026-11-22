import {
 PACK_SCHEMA,LEGACY_PACK_SCHEMA,EVIDENCE_TIERS,ITEM_STATES,ACCESS_PURPOSES,fail,exact,id,role,text,date,timestamp,hash,integer,oneOf,array,unique,copy,sorted,bodyHash,noIdentity
} from './p15-custody-contract.mjs';
import {validateCustodyLedger,custodySummary} from './p15-custody-ledger.mjs';
import {validateRedactionManifest,redactionSummary} from './p15-custody-redaction.mjs';

export function createCustodyPack(ledgerInput,{packId,createdOn,createdBy,manifest=null,itemIds=[],
 includeAccess=false,includeEventHistory=true}={}){
 const ledger=validateCustodyLedger(ledgerInput);id(packId);date(createdOn);role(createdBy);
 fail(createdOn>=ledger.openedOn,'DATE_ORDER','Pack predates custody ledger.');
 fail(typeof includeAccess==='boolean'&&typeof includeEventHistory==='boolean','BOOLEAN','Pack switches must be boolean.');
 array(itemIds,'itemIds');itemIds.forEach(id);unique(itemIds,'item IDs');
 const selected=itemIds.length?itemIds:ledger.items.map(row=>row.itemId);
 const byId = new Map(ledger.items.map(item => [item.itemId, item]));
 const selectedIds = new Set(selected);
 const redaction=manifest===null?null:validateRedactionManifest(manifest,ledger);
 const receiptsByItem = new Map();
 for (const receipt of ledger.redactions) {
  if (!receiptsByItem.has(receipt.itemId)) receiptsByItem.set(receipt.itemId, []);
  receiptsByItem.get(receipt.itemId).push(receipt);
 }
 const entries=selected.map(itemId=>{
  const item = byId.get(itemId);
  fail(item, 'ITEM_REFERENCE', 'Pack item missing.');
  const redactions = receiptsByItem.get(itemId) ?? [];
  const entry = {itemId,kind:item.kind,label:item.label,reference:item.reference,
   contentDigest:item.contentDigest,sourceId:item.sourceId,sourceDigest:item.sourceDigest,
   licence:item.licence,licenceReference:item.licenceReference,retrievedOn:item.retrievedOn,
   capturedOn:item.capturedOn,tier:item.tier??'UNKNOWN',state:item.state,supersedes:item.supersedes,
   redactions:redactions.map(row=>({fieldPath:row.fieldPath,reason:row.reason,
    replacement:row.replacement,originalDigest:row.originalDigest,appliedOn:row.appliedOn})),
   itemDigest:bodyHash(item)};
  for (const receipt of redactions) {
   const field = receipt.fieldPath.split('.')[0];
   if (['label','reference','licenceReference','sourceDigest','contentDigest'].includes(field)) {
    entry[field] = null;
   }
  }
  return entry;
 });
 const access=includeAccess?ledger.accessRecords.filter(row=>selectedIds.has(row.itemId)).map(row=>({
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
 const legacy=input.schema===LEGACY_PACK_SCHEMA;
 fail(legacy||input.schema===PACK_SCHEMA,'SCHEMA','Unsupported custody pack.');
 id(input.packId);date(input.createdOn);role(input.createdBy);id(input.ledgerId);
 hash(input.ledgerDigest);array(input.items,'items');
 unique(input.items.map(row=>row.itemId),'pack item IDs');
 for(const row of input.items){
  exact(row,['itemId','kind','label','reference','contentDigest','sourceId','sourceDigest','licence',
   'licenceReference','retrievedOn','capturedOn','state','supersedes','redactions','itemDigest',...(legacy?[]:['tier'])]);
  if(!legacy)oneOf(row.tier,EVIDENCE_TIERS,'tier');
  id(row.itemId);oneOf(row.kind,['source-capture','document-reference','observation-note','licence-record','change-notice','correspondence-summary','review-artifact','other'],'kind');
  id(row.sourceId);
  array(row.redactions,'redactions');
  const hidden = new Set(legacy ? [] : row.redactions.map(receipt => String(receipt?.fieldPath).split('.')[0]));
  for (const [field, max] of [['label',180],['reference',500],['licenceReference',500]]) {
   if (hidden.has(field)) fail(row[field]===null,'REDACTION','Withdrawn pack field is visible.');
   else text(row[field],field,{max,empty:field==='licenceReference'});
  }
  for (const field of ['contentDigest','sourceDigest']) {
   if (hidden.has(field)) fail(row[field]===null,'REDACTION','Withdrawn pack digest is visible.');
   else hash(row[field],field);
  }
  oneOf(row.licence,['CC0-1.0','CC-BY-4.0','OGL-Canada-2.0','OGL-ON-1.0','ODbL-1.0','UNKNOWN','NOT-APPLICABLE'],'licence');
  oneOf(row.state,ITEM_STATES,'state');
  hash(row.itemDigest);date(row.retrievedOn);date(row.capturedOn);
  row.redactions.forEach(redaction=>{
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
  items:'Éléments',access:'Accès consignés',redactions:'Caviardages',omitted:'non inclus',
  note:'Ce dossier conserve des références et des empreintes\u202f; il ne confirme aucun fait sur l’accessibilité.'}:
  {title:'Evidence custody pack summary',created:'Created',items:'Items',
   access:'Recorded accesses',redactions:'Redactions',omitted:'not included',
   note:'This pack preserves references and digests; it does not establish accessibility facts.'};
 const colon = fr ? '\u00a0: ' : ': ';
 const lines=[labels.title,labels.created+colon+pack.createdOn,
  labels.items+colon+pack.items.length,
  labels.access+colon+(pack.access?.length??labels.omitted),
  labels.redactions+colon+pack.items.reduce((n,row)=>n+row.redactions.length,0),
  labels.note,'SHA-256'+colon+pack.digest];
 return lines.join('\n')+'\n';
}
