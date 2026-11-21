import {fail,exact,id,date,hash,copy,bodyDigest,noIdentity} from './p15af-contract.mjs';
import {validateImpactCatalog} from './p15af-catalog.mjs';
import {validateImpactLedger} from './p15af-ledger.mjs';
import {validateRemediationPlan,remediationProgress,readyForRelease} from './p15af-impact.mjs';
import {reconcileSourceImpact} from './p15af-reconcile.mjs';
export const REPORT_SCHEMA='access-maps-source-impact-report/1';
const WORDS={
 en:{title:'Offline source impact review',asOf:'As of',catalog:'Catalog digest',sources:'Sources under review',
  records:'Affected records',assets:'Affected assets',packages:'Affected packages',actions:'Remediation actions',
  accepted:'Accepted',completed:'Completed',blocked:'Blocked actions',release:'Ready for human release review',
  noAuto:'No automatic publication or source release is performed.',unknown:'Unknown access remains UNKNOWN.'},
 fr:{title:'Examen hors ligne des répercussions des sources',asOf:'En date du',catalog:'Empreinte du catalogue',
  sources:'Sources à examiner',records:'Fiches touchées',assets:'Fichiers touchés',packages:'Paquets touchés',
  actions:'Mesures correctives',accepted:'Acceptées',completed:'Terminées',blocked:'Mesures bloquées',
  release:'Prêt pour un examen humain avant diffusion',
  noAuto:'Aucune diffusion ni libération automatique de source n’est effectuée.',
  unknown:'L’accès inconnu demeure UNKNOWN.'},
};
export function createImpactReport(catalogInput,ledgerInput,planInput,candidateInput,{reportId,createdOn,lang='en'}={}){
 const catalog=validateImpactCatalog(catalogInput),ledger=validateImpactLedger(ledgerInput,{catalog});
 const plan=validateRemediationPlan(planInput,{catalog,ledger});const candidate=validateImpactCatalog(candidateInput);
 id(reportId);date(createdOn);fail(['en','fr'].includes(lang),'LANGUAGE','Report language invalid.');
 const reconciliation=reconcileSourceImpact(catalog,candidate,ledger,plan);
 const progress=remediationProgress(plan,ledger),release=readyForRelease(plan,ledger);
 const words=WORDS[lang];
 const result={schema:REPORT_SCHEMA,reportId,createdOn,lang,catalogDigest:catalog.digest,
  ledgerDigest:ledger.digest,planDigest:plan.digest,candidateCatalogDigest:candidate.digest,
  sourceCount:plan.sourceIds.length,affected:{records:plan.findings.reduce((n,row)=>n+row.affected.records,0),
   assets:plan.findings.reduce((n,row)=>n+row.affected.assets,0),
   packages:plan.findings.reduce((n,row)=>n+row.affected.packages,0)},
  progress:{total:progress.total,accepted:progress.accepted,completed:progress.completed,
   pending:progress.pending,rejected:progress.rejected,deferred:progress.deferred},
  reconciliation:{valid:reconciliation.summary.valid,issues:reconciliation.issues.length},
  releaseReviewReady:release.ready,automaticPublication:false,labels:copy(words),digest:''};
 result.digest=bodyDigest(result);noIdentity(result);return result;
}
export function validateImpactReport(input){
 exact(input,['schema','reportId','createdOn','lang','catalogDigest','ledgerDigest','planDigest',
  'candidateCatalogDigest','sourceCount','affected','progress','reconciliation',
  'releaseReviewReady','automaticPublication','labels','digest']);
 fail(input.schema===REPORT_SCHEMA,'SCHEMA','Unsupported impact report.');
 id(input.reportId);date(input.createdOn);fail(['en','fr'].includes(input.lang),'LANGUAGE','Report language invalid.');
 for(const field of ['catalogDigest','ledgerDigest','planDigest','candidateCatalogDigest'])hash(input[field]);
 hash(input.digest);fail(input.digest===bodyDigest(input),'HASH','Impact report digest invalid.');
 fail(input.automaticPublication===false,'AUTOMATION','Report cannot publish automatically.');
 noIdentity(input);return copy(input);
}
export function renderImpactReport(input){
 const report=validateImpactReport(input),w=report.labels;
 const lines=[w.title,`${w.asOf}: ${report.createdOn}`,`${w.catalog}: ${report.catalogDigest}`,
  `${w.sources}: ${report.sourceCount}`,`${w.records}: ${report.affected.records}`,
  `${w.assets}: ${report.affected.assets}`,`${w.packages}: ${report.affected.packages}`,
  `${w.actions}: ${report.progress.total}`,`${w.accepted}: ${report.progress.accepted}`,
  `${w.completed}: ${report.progress.completed}`,`${w.blocked}: ${report.reconciliation.issues}`,
  `${w.release}: ${report.releaseReviewReady?'Yes':'No'}`,w.noAuto,w.unknown,
  `SHA-256: ${report.digest}`];
 return lines.join('\n')+'\n';
}
export function reportSummary(input){
 const row=validateImpactReport(input);
 return {reportId:row.reportId,sourceCount:row.sourceCount,actions:row.progress.total,
  completed:row.progress.completed,releaseReviewReady:row.releaseReviewReady,digest:row.digest};
}
