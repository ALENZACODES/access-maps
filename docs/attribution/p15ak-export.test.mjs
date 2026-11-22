import test from 'node:test';
import assert from 'node:assert/strict';
import {CustodyError} from './p15-custody-contract.mjs';
import {requestedException,approvedException,rejectedException,exceptionRegister,FOURTH,FIFTH} from './p15ak-fixtures.mjs';
import {filedAppeal,acceptedAppeal,appealRegister} from './p15ak-appeal-fixtures.mjs';
import {renderExceptionRegisterReport,renderAppealRegisterReport} from './p15ak-export.mjs';
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof CustodyError&&error.code===code);
test('exception report renders English title',()=>{
 assert.match(renderExceptionRegisterReport(requestedException(),{asOf:FOURTH}),/Retention exception register/u);
});
test('exception report renders French title',()=>{
 assert.match(renderExceptionRegisterReport(requestedException(),{asOf:FOURTH,lang:'fr'}),/Registre des exceptions/u);
});
test('exception report includes report date',()=>{
 assert.ok(renderExceptionRegisterReport(requestedException(),{asOf:FOURTH}).includes(FOURTH));
});
test('exception report includes total count',()=>{
 assert.match(renderExceptionRegisterReport(requestedException(),{asOf:FOURTH}),/Total: 1/u);
});
test('exception report counts requested rows',()=>{
 assert.match(renderExceptionRegisterReport(requestedException(),{asOf:FOURTH}),/Requested: 1/u);
});
test('exception report counts approved rows',()=>{
 assert.match(renderExceptionRegisterReport(approvedException(),{asOf:FIFTH}),/Approved: 1/u);
});
test('exception report counts rejected rows',()=>{
 assert.match(renderExceptionRegisterReport(rejectedException(),{asOf:FOURTH}),/Rejected: 1/u);
});
test('exception report preserves unknown and explicit state without changing source',()=>{
 const row=requestedException();renderExceptionRegisterReport(row,{asOf:FOURTH});
 assert.equal(row.exceptions[0].state,'requested');
});
test('exception report includes integrity digest',()=>{
 assert.match(renderExceptionRegisterReport(requestedException(),{asOf:FOURTH}),/SHA-256:/u);
});
test('exception report ends with newline',()=>{
 assert.ok(renderExceptionRegisterReport(requestedException(),{asOf:FOURTH}).endsWith('\n'));
});
test('exception report rejects invalid date',()=>{
 fails(()=>renderExceptionRegisterReport(requestedException(),{asOf:'bad'}),'DATE');
});
test('exception report rejects unsupported language',()=>{
 fails(()=>renderExceptionRegisterReport(requestedException(),{asOf:FOURTH,lang:'es'}),'LANGUAGE');
});
test('exception report French colon spacing uses NBSP',()=>{
 assert.ok(renderExceptionRegisterReport(requestedException(),{asOf:FOURTH,lang:'fr'}).includes('Date du rapport\u00a0:'));
});
test('exception report English colon uses ordinary spacing',()=>{
 assert.ok(renderExceptionRegisterReport(requestedException(),{asOf:FOURTH}).includes('Report date:'));
});
test('exception report does not expose requester token',()=>{
 assert.ok(!renderExceptionRegisterReport(requestedException(),{asOf:FOURTH}).includes('actor-requester'));
});
test('exception report does not expose reviewer tokens',()=>{
 assert.ok(!renderExceptionRegisterReport(approvedException(),{asOf:FIFTH}).includes('actor-reviewer-one'));
});
test('exception report does not expose rationale',()=>{
 assert.ok(!renderExceptionRegisterReport(requestedException(),{asOf:FOURTH}).includes('Additional source'));
});
test('exception report does not expose personal contact details',()=>{
 const report=renderExceptionRegisterReport(requestedException(),{asOf:FOURTH});
 assert.ok(!report.includes('@'));
});
test('exception report is deterministic',()=>{
 assert.equal(renderExceptionRegisterReport(requestedException(),{asOf:FOURTH}),
  renderExceptionRegisterReport(requestedException(),{asOf:FOURTH}));
});
test('exception report is based on validated register',()=>{
 const row=requestedException(),changed={...row,digest:'0'.repeat(64)};
 fails(()=>renderExceptionRegisterReport(changed,{asOf:FOURTH}),'HASH');
});
test('exception report makes no deletion promise',()=>{
 assert.match(renderExceptionRegisterReport(approvedException(),{asOf:FIFTH}),/does not delete evidence/u);
});
test('exception report handles empty register',()=>{
 assert.match(renderExceptionRegisterReport(exceptionRegister(),{asOf:FOURTH}),/Total: 0/u);
});
test('exception report counts expired approvals without deleting them',()=>{
 const row=approvedException();
 assert.match(renderExceptionRegisterReport(row,{asOf:'2026-11-27'}),/Expired: 1/u);
 assert.equal(row.exceptions.length,1);
});
test('appeal report renders English title',()=>{
 assert.match(renderAppealRegisterReport(filedAppeal(),rejectedException()),/appeal register/u);
});
test('appeal report renders French title',()=>{
 assert.match(renderAppealRegisterReport(filedAppeal(),rejectedException(),{lang:'fr'}),/Registre des appels/u);
});
test('appeal report counts filed records',()=>{
 assert.match(renderAppealRegisterReport(filedAppeal(),rejectedException()),/Filed: 1/u);
});
test('appeal report counts accepted records',()=>{
 assert.match(renderAppealRegisterReport(acceptedAppeal(),rejectedException()),/Accepted for reconsideration: 1/u);
});
test('appeal report includes total',()=>{
 assert.match(renderAppealRegisterReport(filedAppeal(),rejectedException()),/Total: 1/u);
});
test('appeal report includes integrity digest',()=>{
 assert.match(renderAppealRegisterReport(filedAppeal(),rejectedException()),/SHA-256:/u);
});
test('appeal report ends with newline',()=>{
 assert.ok(renderAppealRegisterReport(filedAppeal(),rejectedException()).endsWith('\n'));
});
test('appeal report rejects unsupported locale',()=>{
 fails(()=>renderAppealRegisterReport(filedAppeal(),rejectedException(),{lang:'de'}),'LANGUAGE');
});
test('appeal report French colon spacing uses NBSP',()=>{
 assert.ok(renderAppealRegisterReport(filedAppeal(),rejectedException(),{lang:'fr'}).includes('Total\u00a0:'));
});
test('appeal report does not expose appellant token',()=>{
 assert.ok(!renderAppealRegisterReport(filedAppeal(),rejectedException()).includes('actor-appellant'));
});
test('appeal report does not expose reviewer tokens',()=>{
 assert.ok(!renderAppealRegisterReport(acceptedAppeal(),rejectedException()).includes('actor-appeal-reviewer-one'));
});
test('appeal report states a new request is required',()=>{
 assert.match(renderAppealRegisterReport(acceptedAppeal(),rejectedException()),/requires a new exception request/u);
});
test('appeal report rejects invalid exception reference',()=>{
 fails(()=>renderAppealRegisterReport(filedAppeal(),exceptionRegister()),'EXCEPTION_REF');
});
test('appeal report is deterministic',()=>{
 assert.equal(renderAppealRegisterReport(filedAppeal(),rejectedException()),
  renderAppealRegisterReport(filedAppeal(),rejectedException()));
});
test('appeal report does not change appeal state',()=>{
 const row=acceptedAppeal();renderAppealRegisterReport(row,rejectedException());
 assert.equal(row.appeals[0].state,'accepted-for-reconsideration');
});
test('appeal report handles empty appeal register',()=>{
 assert.match(renderAppealRegisterReport(appealRegister(),rejectedException()),/Total: 0/u);
});
test('appeal report preserves the rejected exception decision',()=>{
 const exception=rejectedException();renderAppealRegisterReport(filedAppeal(),exception);
 assert.equal(exception.exceptions[0].state,'rejected');
});
test('appeal report does not expose appeal rationale',()=>{
 assert.ok(!renderAppealRegisterReport(filedAppeal(),rejectedException()).includes('Additional source context'));
});
test('appeal report has no raw exception item identifiers',()=>{
 assert.ok(!renderAppealRegisterReport(filedAppeal(),rejectedException()).includes('evidence-one'));
});
test('appeal report has no raw appeal IDs',()=>{
 assert.ok(!renderAppealRegisterReport(filedAppeal(),rejectedException()).includes('appeal-one'));
});
