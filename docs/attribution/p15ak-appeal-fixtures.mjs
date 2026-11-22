import {createAppealRegister,fileExceptionAppeal,reviewExceptionAppeal} from './p15ak-appeals.mjs';
import {rejectedException,DAY,NEXT,AT,FOURTH,FIFTH,SIXTH,FOURTH_AT,FIFTH_AT,NEXT_AT} from './p15ak-fixtures.mjs';
export {rejectedException,DAY,NEXT,AT,FOURTH,FIFTH,SIXTH,FOURTH_AT,FIFTH_AT,NEXT_AT};
export function appealRegister(){return createAppealRegister({registerId:'appeal-register-one',
 createdOn:DAY,createdAt:AT,createdBy:'actor-appeal-coordinator'});}
export function filedAppeal(){
 return fileExceptionAppeal(appealRegister(),rejectedException(),{
  appealId:'appeal-one',exceptionId:'exception-one',filedOn:FIFTH,
  filedBy:'actor-appellant',reason:'Request a second review of the recorded decision.',
  rationale:'Additional source context was identified for a human reviewer.',
  at:FIFTH_AT});
}
export function acceptedAppeal(){
 let row=reviewExceptionAppeal(filedAppeal(),rejectedException(),{
  appealId:'appeal-one',reviewId:'appeal-review-one',reviewerToken:'actor-appeal-reviewer-one',
  reviewedOn:FIFTH,decision:'accept',reason:'First independent appeal review.',
  at:FIFTH_AT});
 return reviewExceptionAppeal(row,rejectedException(),{
  appealId:'appeal-one',reviewId:'appeal-review-two',reviewerToken:'actor-appeal-reviewer-two',
  reviewedOn:SIXTH,decision:'accept',reason:'Second independent appeal review.',
  at:'2026-11-26T10:00:00.000Z'});
}
