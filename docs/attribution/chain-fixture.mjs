import {CHAIN_SCHEMA,UNKNOWN,OSM_CREDIT} from './chain-core.mjs';
export const HASH_A='a'.repeat(64);
export const HASH_B='b'.repeat(64);
export const HASH_C='c'.repeat(64);
/** Every test entity is explicitly fictional, not a claim about an Ontario place. */
export function fixture(){
  return {schema:CHAIN_SCHEMA,id:'fictional-evidence-chain',title:'Fictional bilingual overlay release',reviewedOn:'2026-11-20',
    sources:[{
      id:'osm-fictional',label:'Fictional OSM geometry record',url:'https://www.openstreetmap.org/copyright',
      licence:'ODbL',licenceUrl:'https://www.openstreetmap.org/copyright',retrievedOn:'2026-11-18',
      tier:'imported',credit:OSM_CREDIT,permission:'yes',notes:'Fictional test record only'
    }],
    assets:[{
      id:'geometry-fixture',label:'Fictional geometry file',kind:'geometry',state:'included',
      sourceIds:['osm-fictional'],parentIds:[],sha256:HASH_A,bytes:128,retrievedOn:'2026-11-18',
      notes:'Fictional derived geometry used only by tests'
    }],
    surfaces:[{
      id:'map-fixture-en',label:'Fictional English map',route:'/fictional-map-en',locale:'en',
      kind:'map',included:'yes',mapShown:'yes',keyboard:'yes',screenReader:'yes',focusVisible:'yes',minimumTargetPx:44
    },{
      id:'map-fixture-fr',label:'Carte fictive française',route:'/fictional-map-fr',locale:'fr',
      kind:'map',included:'yes',mapShown:'yes',keyboard:'yes',screenReader:'yes',focusVisible:'yes',minimumTargetPx:44
    }],
    notices:[{
      id:'notice-fixture-en',assetId:'geometry-fixture',sourceId:'osm-fictional',surfaceId:'map-fixture-en',
      text:OSM_CREDIT,placement:'near-map',observedOn:'2026-11-19',visible:'yes',readable:'yes',
      keyboard:'yes',evidenceRef:'https://example.org/fictional-evidence/en'
    },{
      id:'notice-fixture-fr',assetId:'geometry-fixture',sourceId:'osm-fictional',surfaceId:'map-fixture-fr',
      text:OSM_CREDIT,placement:'near-map',observedOn:'2026-11-19',visible:'yes',readable:'yes',
      keyboard:'yes',evidenceRef:'https://example.org/fictional-evidence/fr'
    }],
    receipts:[{
      id:'receipt-fixture',assetId:'geometry-fixture',sourceId:'osm-fictional',parentIds:[],
      contentHash:HASH_A,issuedOn:'2026-11-19',tier:'manual',status:'reviewed',reviewerRef:'fictional-review-role',
      evidenceRef:'https://example.org/fictional-receipt',notes:'A recorded test claim, not an endorsement'
    }]
  };
}
export const clone=()=>structuredClone(fixture());
export function withSecondSource(){
  const chain=clone();
  chain.sources.push({id:'other-fictional',label:'Fictional non-OSM record',url:'https://example.org/source',
    licence:'OGL',licenceUrl:'https://example.org/licence',retrievedOn:'2026-11-18',tier:'publisher',
    credit:'Fictional provider credit',permission:'yes',notes:'Fictional test only'});
  chain.assets.push({id:'other-fixture',label:'Fictional transit file',kind:'timetable',state:'included',
    sourceIds:['other-fictional'],parentIds:[],sha256:HASH_B,bytes:256,retrievedOn:'2026-11-19',notes:''});
  chain.notices.push({id:'other-notice',assetId:'other-fixture',sourceId:'other-fictional',surfaceId:'map-fixture-en',
    text:'Fictional provider credit',placement:'visible-panel',observedOn:'2026-11-20',visible:'yes',readable:'yes',
    keyboard:'yes',evidenceRef:'https://example.org/fictional-evidence/other'});
  chain.receipts.push({id:'other-receipt',assetId:'other-fixture',sourceId:'other-fictional',parentIds:[],
    contentHash:HASH_B,issuedOn:'2026-11-20',tier:'publisher',status:'reviewed',reviewerRef:'fictional-review-role',
    evidenceRef:'https://example.org/other-receipt',notes:''});
  return chain;
}
export function withAssetLineage(){
  const chain=clone();
  chain.assets.push({id:'derived-fixture',label:'Fictional derived tile file',kind:'tiles',state:'included',
    sourceIds:['osm-fictional'],parentIds:['geometry-fixture'],sha256:HASH_C,bytes:320,
    retrievedOn:'2026-11-19',notes:'Derived fictional file'});
  chain.notices.push({id:'derived-notice',assetId:'derived-fixture',sourceId:'osm-fictional',
    surfaceId:'map-fixture-en',text:OSM_CREDIT,placement:'near-map',observedOn:'2026-11-20',
    visible:'yes',readable:'yes',keyboard:'yes',evidenceRef:'https://example.org/derived-notice'});
  chain.receipts.push({id:'derived-receipt',assetId:'derived-fixture',sourceId:'osm-fictional',
    parentIds:['receipt-fixture'],contentHash:HASH_C,issuedOn:'2026-11-20',tier:'manual',
    status:'reviewed',reviewerRef:'fictional-review-role',evidenceRef:'https://example.org/derived-receipt',notes:''});
  return chain;
}
export function sourceRemovalCandidate(){
  const chain=clone();
  chain.sources=[];chain.assets=[];chain.notices=[];chain.receipts=[];
  return chain;
}
