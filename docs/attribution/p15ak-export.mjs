import {fail,date,noIdentity,frenchTypography} from './p15-custody-contract.mjs';
import {validateExceptionRegister,exceptionSummary} from './p15ak-exceptions.mjs';
import {validateAppealRegister,appealSummary} from './p15ak-appeals.mjs';

export function renderExceptionRegisterReport(input,{asOf,lang='en'}={}){
 const register=validateExceptionRegister(input);date(asOf);
 fail(lang==='en'||lang==='fr','LANGUAGE','Language must be en or fr.');
 const fr=lang==='fr';
 const label=fr?{title:'Registre des exceptions de conservation',date:'Date du rapport',
  total:'Total',requested:'Demandées',approved:'Approuvées',rejected:'Refusées',
  withdrawn:'Retirées',active:'Actives',expired:'Expirées',
  note:'Une exception approuvée ne supprime pas les preuves et ne remplace pas un examen humain.'}:
  {title:'Retention exception register',date:'Report date',total:'Total',requested:'Requested',
   approved:'Approved',rejected:'Rejected',withdrawn:'Withdrawn',active:'Active',expired:'Expired',
   note:'An approved exception does not delete evidence or replace human review.'};
 const summary=exceptionSummary(register,{asOf});
 const colon=fr?'\u00a0: ':': ';
 const lines=[label.title,`${label.date}${colon}${asOf}`,
  `${label.total}${colon}${summary.total}`,`${label.requested}${colon}${summary.requested}`,
  `${label.approved}${colon}${summary.approved}`,`${label.rejected}${colon}${summary.rejected}`,
  `${label.withdrawn}${colon}${summary.withdrawn}`,`${label.active}${colon}${summary.active}`,
  `${label.expired}${colon}${summary.expired}`,label.note,`SHA-256${fr?'\u00a0: ':': '}${register.digest}`];
 const result=lines.join('\n')+'\n';
 if(fr)frenchTypography(result);noIdentity(result);return result;
}
export function renderAppealRegisterReport(input,exceptionInput,{lang='en'}={}){
 const register=validateAppealRegister(input,exceptionInput);
 fail(lang==='en'||lang==='fr','LANGUAGE','Language must be en or fr.');
 const fr=lang==='fr';
 const label=fr?{title:'Registre des appels de conservation',total:'Total',
  filed:'Déposés',accepted:'Acceptés pour réexamen',rejected:'Refusés',
  withdrawn:'Retirés',note:'Un appel accepté exige une nouvelle demande d’exception.'}:
  {title:'Retention exception appeal register',total:'Total',filed:'Filed',
   accepted:'Accepted for reconsideration',rejected:'Rejected',withdrawn:'Withdrawn',
   note:'An accepted appeal requires a new exception request.'};
 const summary=appealSummary(register,exceptionInput),colon=fr?'\u00a0: ':': ';
 const lines=[label.title,`${label.total}${colon}${summary.total}`,
  `${label.filed}${colon}${summary.filed}`,`${label.accepted}${colon}${summary.accepted}`,
  `${label.rejected}${colon}${summary.rejected}`,`${label.withdrawn}${colon}${summary.withdrawn}`,
  label.note,`SHA-256${fr?'\u00a0: ':': '}${register.digest}`];
 const result=lines.join('\n')+'\n';
 if(fr)frenchTypography(result);noIdentity(result);return result;
}
