import {fail,exact,id,date,hash,copy,bodyHash,noIdentity} from './p15ad-contract.mjs';
import {validateCalibration} from './p15ad-calibration.mjs';
export const REPORT_SCHEMA='access-maps-review-quality-report/1';
const LABELS={
 en:{
  title:'Offline review quality report',asOf:'As of',reviewers:'Reviewers',
  sample:'Scored responses',accuracy:'Accuracy',coverage:'Coverage',
  flagged:'Requires human review',insufficient:'Insufficient sample',
  unknown:'Unknown-state recall',abstention:'Abstention rate',
  within:'Within policy',manual:'Manual review recommended',
  coverageWatch:'Coverage requires review',unknownWatch:'Unknown handling requires review',
  abstentionWatch:'Abstention rate requires review',small:'Insufficient sample; no conclusion',
  caution:'Metrics describe this reference sample and do not establish reviewer intent or competence.',
  noAutomatic:'No automatic reviewer restriction or publication decision is made.',
 },
 fr:{
  title:'Rapport hors ligne sur la qualité des évaluations',
  asOf:'En date du',reviewers:'Évaluateurs',
  sample:'Réponses évaluées',accuracy:'Exactitude',coverage:'Couverture',
  flagged:'Exige un contrôle humain',insufficient:'Échantillon insuffisant',
  unknown:'Rappel des états inconnus',abstention:'Taux d’abstention',
  within:'Conforme à la politique',manual:'Contrôle manuel recommandé',
  coverageWatch:'La couverture exige un contrôle',
  unknownWatch:'Le traitement des états inconnus exige un contrôle',
  abstentionWatch:'Le taux d’abstention exige un contrôle',
  small:'Échantillon insuffisant\u202f; aucune conclusion',
  caution:'Les mesures décrivent cet échantillon de référence et ne démontrent ni l’intention ni la compétence d’un évaluateur.',
  noAutomatic:'Aucune restriction automatique ni décision de publication n’est prise.',
 },
};
function formatPercent(value){
 return value===null?'—':`${Math.round(value*1000)/10}%`;
}
function dispositionLabel(value,words){
 return ({
  'within-policy':words.within,
  'manual-review':words.manual,
  'coverage-watch':words.coverageWatch,
  'unknown-handling-watch':words.unknownWatch,
  'abstention-watch':words.abstentionWatch,
  'insufficient-sample':words.small,
 })[value]??words.small;
}
export function createQualityReport(calibrationInput,{reference,responseSet,policy,reportId,lang='en'}={}){
 id(reportId,'reportId');
 fail(['en','fr'].includes(lang),'LANGUAGE','Report language invalid.');
 const calibration=validateCalibration(calibrationInput,{reference,responseSet,policy});
 const words=LABELS[lang];
 const reviewers=calibration.reviewers.map(row=>({
  reviewerToken:row.reviewerToken,scored:row.scored,correct:row.correct,
  accuracy:row.accuracy,coverage:row.coverage,unknownRecall:row.unknownRecall,
  abstentionRate:row.abstentionRate,disposition:row.disposition,
  label:dispositionLabel(row.disposition,words),
 }));
 const report={schema:REPORT_SCHEMA,reportId,lang,asOf:calibration.asOf,
  calibrationDigest:calibration.digest,policyDigest:calibration.policyDigest,
  cohort:copy(calibration.cohort),reviewers,
  labels:copy(words),cautions:{sampleBounded:true,noAutomaticAction:true},
  digest:''};
 report.digest=bodyHash(report);noIdentity(report);return report;
}
export function validateQualityReport(input){
 exact(input,['schema','reportId','lang','asOf','calibrationDigest','policyDigest',
  'cohort','reviewers','labels','cautions','digest']);
 fail(input.schema===REPORT_SCHEMA,'SCHEMA','Unsupported quality report.');
 id(input.reportId,'reportId');fail(['en','fr'].includes(input.lang),'LANGUAGE','Report language invalid.');
 date(input.asOf,'asOf');hash(input.calibrationDigest);hash(input.policyDigest);
 fail(input.cautions?.sampleBounded===true&&input.cautions?.noAutomaticAction===true,
  'CAUTION','Quality report must retain safety caveats.');
 hash(input.digest);fail(input.digest===bodyHash(input),'HASH','Quality report digest invalid.');
 noIdentity(input);return copy(input);
}
export function renderQualityReport(input){
 const report=validateQualityReport(input),w=report.labels;
 const lines=[
  w.title,
  `${w.asOf}: ${report.asOf}`,
  `${w.reviewers}: ${report.cohort.reviewers}`,
  `${w.sample}: ${report.cohort.scored}`,
  `${w.accuracy}: ${formatPercent(report.cohort.accuracy)}`,
  `${w.flagged}: ${report.cohort.flagged}`,
  `${w.insufficient}: ${report.cohort.insufficient}`,
  '',
 ];
 for(const row of report.reviewers){
  lines.push(`${row.reviewerToken} — ${row.label}`);
  lines.push(`  ${w.sample}: ${row.scored}`);
  lines.push(`  ${w.accuracy}: ${formatPercent(row.accuracy)}`);
  lines.push(`  ${w.coverage}: ${formatPercent(row.coverage)}`);
  lines.push(`  ${w.unknown}: ${formatPercent(row.unknownRecall)}`);
  lines.push(`  ${w.abstention}: ${formatPercent(row.abstentionRate)}`);
 }
 lines.push('',w.caution,w.noAutomatic,`SHA-256: ${report.digest}`);
 return lines.join('\n')+'\n';
}
export function reportSummary(input){
 const report=validateQualityReport(input);
 return {reportId:report.reportId,asOf:report.asOf,reviewers:report.cohort.reviewers,
  scored:report.cohort.scored,flagged:report.cohort.flagged,digest:report.digest};
}
