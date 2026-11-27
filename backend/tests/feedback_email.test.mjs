import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackHtml,feedbackText,feedbackSubject,normalizeFeedbackEmail,feedbackKey,sendFeedbackEmail} from '../src/modules/admin/admin.feedback-email.mjs';
const res=()=>({statusCode:200,body:null,set(){return this;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
test('general feedback template is neutral, branded, and has an accessible review URL',()=>{
 for(const value of [feedbackHtml,feedbackText]){assert.match(value,/https:\/\/www\.trustpilot\.com\/review\/faretransit\.com/);assert.match(value,/Alex/);assert.match(value,/optional/i);assert.match(value,/positive or negative/);}
 assert.match(feedbackSubject,/Fare Transit/);assert.doesNotMatch(feedbackHtml,/TRUST20|discount|5.star/i);
});
test('single email validation and day-scoped idempotency',()=>{
 assert.equal(normalizeFeedbackEmail(' guest@example.com '),'guest@example.com');
 for(const value of [null,[],{},'a@b','guest@example.com,other@example.com','guest@example.com\nBcc:other@example.com'])assert.equal(normalizeFeedbackEmail(value),null);
 assert.equal(feedbackKey('Guest@example.com','2026-11-27'),feedbackKey('guest@example.com','2026-11-27'));
 assert.notEqual(feedbackKey('guest@example.com','2026-11-27'),feedbackKey('guest@example.com','2026-11-28'));
});
test('provider acceptance is required and no real email is sent in tests',async t=>{
 const original=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY='test-placeholder';
 t.after(()=>{if(original===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=original;});
 const mock=t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'https://api.resend.com/emails');
  const body=JSON.parse(options.body);assert.deepEqual(body.to,['guest@example.com']);assert.equal(body.subject,feedbackSubject);assert.equal(body.attachments,undefined);assert.match(options.headers['Idempotency-Key'],/^ft-feedback-/);
  return {ok:true,json:async()=>({id:'mock-message'})};
 });
 const invalid=res();await sendFeedbackEmail({body:{email:'bad'}},invalid);assert.equal(invalid.statusCode,400);assert.equal(mock.mock.callCount(),0);
 const result=res();await sendFeedbackEmail({body:{email:'guest@example.com'}},result);assert.equal(result.body.success,true);assert.equal(mock.mock.callCount(),1);
 mock.mock.mockImplementation(async()=>({ok:true,json:async()=>({})}));
 const uncertain=res();await sendFeedbackEmail({body:{email:'guest@example.com'}},uncertain);assert.equal(uncertain.statusCode,502);assert.equal(uncertain.body.success,false);
});
