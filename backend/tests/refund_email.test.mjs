import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRefundEmail,refundTemplate,refundKey,sendRefundEmail,previewRefundEmail} from '../src/modules/admin/admin.refund-email.mjs';
const input={email:'passenger@example.com',passengerName:'Sample Passenger',cardholderName:'Sample Holder',cardBrand:'visa',last4:'0123',amount:'250.05',refundProcessed:true};
const response=()=>({statusCode:200,body:null,set(){return this;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
test('refund email validates four digits and positive exact USD cents',()=>{
 const d=normalizeRefundEmail(input);assert.equal(d.last4,'0123');assert.equal(d.cents,25005);
 for(const patch of [{last4:'1234567890123456'},{last4:'abc4'},{cardBrand:'fake'},{cardBrand:''},{cardBrand:'constructor'},{amount:'0'},{amount:'1.234'},{amount:'1e2'},{amount:'-5'},{email:'bad'},{passengerName:''},{cardholderName:'A\nB'}])assert.throws(()=>normalizeRefundEmail({...input,...patch}));
 assert.equal(refundKey(d,'2026-11-27'),refundKey(normalizeRefundEmail({...input,amount:'250.05'}),'2026-11-27'));
 assert.notEqual(refundKey(d,'2026-11-27'),refundKey(d,'2026-11-28'));
});
test('template escapes names and describes processed refund with estimated posting window',()=>{
 const t=refundTemplate(normalizeRefundEmail({...input,passengerName:'<script>alert(1)</script>'}));
 assert.doesNotMatch(t.html,/<script>/);assert.match(t.html,/&lt;script&gt;/);
 for(const v of [t.html,t.text]){assert.match(v,/0123/);assert.match(v,/\$250\.05/);assert.match(v,/7–14 business days/);assert.match(v,/processed your refund/);assert.doesNotMatch(v,/Request review|What happens next|does not confirm/);}
});
test('network graphics, contact number and masked data are included for each selected brand',()=>{
 for(const [cardBrand,name] of [['visa','Visa'],['mastercard','Mastercard'],['amex','American Express'],['discover','Discover'],['other','Other card']]){
  const d=normalizeRefundEmail({...input,cardBrand});const t=refundTemplate(d);
  assert.ok(t.text.includes(name+' •••• 0123'));
  assert.ok(t.html.includes(name));assert.ok(t.html.includes('tel:+18887808855'));
  assert.ok(t.text.includes('+1 (888) 780-8855'));
  if(cardBrand!=='other')assert.ok(t.html.includes('/assets/refund-cards/'+cardBrand+'.png'));
  else assert.doesNotMatch(t.html,/\/assets\/refund-cards\//);
 }
 assert.notEqual(refundKey(normalizeRefundEmail(input),'2026-11-27'),refundKey(normalizeRefundEmail({...input,cardBrand:'amex'}),'2026-11-27'));
});
test('preview shares the exact sent template and travel invitation is optional',()=>{
 const d=normalizeRefundEmail(input);
 const standard=refundTemplate(d),promotional=refundTemplate(d,{marketing:true});
 for(const result of [standard,promotional]){assert.match(result.html,/Refund summary/);assert.match(result.html,/REFUND PROCESSED/);assert.match(result.html,/7–14 business days/);assert.match(result.text,/look forward to serving you again/);}
 assert.doesNotMatch(standard.html,/Explore your next trip/);
 assert.match(promotional.html,/Explore your next trip/);
 assert.match(promotional.text,/Explore your next trip/);
 assert.notEqual(refundKey(d,'2026-11-27',true),refundKey(d,'2026-11-27',false));
 const preview=response();previewRefundEmail({body:{...input,marketing:true}},preview);
 assert.equal(preview.body.html,promotional.html);
 assert.equal(preview.body.text,promotional.text);
});
test('provider is mocked and acceptance is required',async t=>{
 const old=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY='test-placeholder';
 t.after(()=>{if(old===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=old;});
 const mock=t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(options.body);assert.deepEqual(body.to,[input.email]);assert.equal(body.attachments,undefined);assert.match(options.headers['Idempotency-Key'],/^ft-refund-email-/);return {ok:true,json:async()=>({id:'mock-id'})};});
 const unverified=response();await sendRefundEmail({body:{...input,refundProcessed:false}},unverified);assert.equal(unverified.statusCode,400);assert.equal(mock.mock.callCount(),0);
 const invalid=response();await sendRefundEmail({body:{...input,last4:'12345'}},invalid);assert.equal(invalid.statusCode,400);assert.equal(mock.mock.callCount(),0);
 const sent=response();await sendRefundEmail({body:input},sent);assert.equal(sent.body.success,true);assert.equal(mock.mock.callCount(),1);
 mock.mock.mockImplementation(async()=>({ok:true,json:async()=>({})}));const failed=response();await sendRefundEmail({body:input},failed);assert.equal(failed.statusCode,502);
});
