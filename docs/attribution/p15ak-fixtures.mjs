import {custody,policies,plan,DAY,NEXT,FOURTH,FIFTH,SIXTH,AT,NEXT_AT,FOURTH_AT,FIFTH_AT} from './p15aj-fixtures.mjs';
import {createExceptionRegister,requestRetentionException,reviewRetentionException} from './p15ak-exceptions.mjs';
export {custody,policies,plan,DAY,NEXT,FOURTH,FIFTH,SIXTH,AT,NEXT_AT,FOURTH_AT,FIFTH_AT};
export const requestOptions={
 exceptionId:'exception-one',itemId:'evidence-one',exceptionType:'retention-extension',
 requestedOn:FOURTH,requestedUntil:SIXTH,requestedBy:'actor-requester',
 reason:'A human review needs additional time.',rationale:'Retain the evidence temporarily while a review is completed.',
 at:FOURTH_AT
};
export function exceptionRegister(){
 return createExceptionRegister({registerId:'exception-register-one',createdOn:DAY,
  createdAt:AT,createdBy:'actor-register-owner'});
}
export function requestedException({options={}}={}){
 return requestRetentionException(exceptionRegister(),custody(),policies(),plan(),{...requestOptions,...options});
}
export function approvedException({options={}}={}){
 let row=requestedException();
 row=reviewRetentionException(row,{exceptionId:'exception-one',approvalId:'approval-one',
  reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,decision:'approve',
  reason:'First independent review.',at:FOURTH_AT});
 return reviewRetentionException(row,{exceptionId:'exception-one',approvalId:'approval-two',
  reviewerToken:'actor-reviewer-two',reviewedOn:FIFTH,decision:'approve',
  reason:'Second independent review.',at:FIFTH_AT,...options});
}
export function rejectedException(){
 return reviewRetentionException(requestedException(),{exceptionId:'exception-one',
  approvalId:'approval-reject',reviewerToken:'actor-reviewer-one',reviewedOn:FOURTH,
  decision:'reject',reason:'The request does not meet the stated review criteria.',at:FOURTH_AT});
}
