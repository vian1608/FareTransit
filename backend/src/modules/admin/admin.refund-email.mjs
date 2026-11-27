import {createHash} from 'node:crypto';
import env from '../../config/env.mjs';
import {normalizeFeedbackEmail} from './admin.feedback-email.mjs';

const safeName=value=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=120&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():null;
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const refundSubject='Fare Transit | Refund Request Acknowledgement';
export function normalizeRefundEmail(input){
 const email=normalizeFeedbackEmail(input?.email),passengerName=safeName(input?.passengerName),cardholderName=safeName(input?.cardholderName);
 const last4=typeof input?.last4==='string'&&/^\d{4}$/.test(input.last4)?input.last4:null;
 const amount=typeof input?.amount==='string'?input.amount.trim():'';
 const parts=/^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(amount);
 const cents=parts?Number(parts[1])*100+Number((parts[2]||'').padEnd(2,'0')):0;
 if(!email||!passengerName||!cardholderName||!last4||!Number.isSafeInteger(cents)||cents<=0)throw Error('Enter a valid passenger email, both names, exactly four card digits and a positive USD amount with up to two decimal places.');
 return {email,passengerName,cardholderName,last4,cents};
}
const usd=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const message='We have received your refund request. The details below summarize the amount requested and the card associated with your request.';
const caveat='This email acknowledges your request only. It does not confirm that a refund has been approved, issued or credited. We will contact you with updates once the request has been reviewed.';
export function refundTemplate(d){
 const rows=[['Passenger name',d.passengerName],['Cardholder name',d.cardholderName],['Card ending in','•••• '+d.last4],['Refund amount requested (USD)',usd(d.cents)]];
 const text=['Dear '+d.passengerName+',','Thank you for choosing Fare Transit.',message,...rows.map(([k,v])=>k+': '+v),caveat,'If you have questions, please reply to this email or contact support@faretransit.com.','Warm regards,\nAlex\nFare Transit Customer Support Team'].join('\n\n');
 const html=`<!doctype html><html lang="en"><body style="margin:0;background:#f4f6fa;color:#23334b;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #dce3ec;border-radius:14px"><tr><td style="padding:24px 28px"><img src="https://www.faretransit.com/favicon.png" alt="" width="38" height="38" style="vertical-align:middle"> <strong style="font-size:25px;color:#8b1236;vertical-align:middle">FareTransit</strong></td></tr><tr><td bgcolor="#8b1236" style="background:#8b1236;color:#fff;padding:25px 28px"><div style="font-size:11px;letter-spacing:2px;font-weight:bold">CUSTOMER SERVICE</div><h1 style="font-size:26px;line-height:1.3;margin:10px 0 0;color:#fff">Refund request received</h1><p style="margin:8px 0 0;color:#fff">Acknowledgement of your request</p></td></tr><tr><td style="padding:27px 28px;font-size:15px;line-height:1.7"><p><strong>Dear ${escapeHtml(d.passengerName)},</strong></p><p>Thank you for choosing Fare Transit.</p><p>${message}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f8fa;border:1px solid #dce3ec;border-radius:10px">${rows.map(([k,v])=>'<tr><td style="padding:12px;border-bottom:1px solid #dce3ec;color:#475569;font-size:13px">'+escapeHtml(k)+'</td><td align="right" style="padding:12px;border-bottom:1px solid #dce3ec;font-weight:bold;color:#172b46;overflow-wrap:anywhere">'+escapeHtml(v)+'</td></tr>').join('')}</table><p style="background:#fff6e8;border-radius:8px;padding:14px;font-size:13px;color:#754714"><strong>Refund status:</strong> ${caveat}</p><p>If you have questions, please reply to this email or contact <a href="mailto:support@faretransit.com" style="color:#8b1236">support@faretransit.com</a>.</p><p>Warm regards,<br><strong>Alex</strong><br>Fare Transit Customer Support Team</p></td></tr><tr><td align="center" style="background:#f4f6fa;padding:20px;font-size:12px;color:#475569"><strong>Fare Transit</strong><br><a href="https://www.faretransit.com" style="color:#8b1236">www.faretransit.com</a></td></tr></table></td></tr></table></body></html>`;
 return {subject:refundSubject,html,text};
}
export const refundKey=(d,day=new Date().toISOString().slice(0,10))=>'ft-refund-email-'+createHash('sha256').update(JSON.stringify([day,d.email.toLowerCase(),d.passengerName,d.cardholderName,d.last4,d.cents])).digest('hex');
export async function sendRefundEmail(req,res){
 const fail=(status,message)=>res.status(status).json({success:false,error:{code:'REFUND_EMAIL_ERROR',message}});
 res.set('Cache-Control','no-store');
 let d;try{d=normalizeRefundEmail(req.body);}catch(e){return fail(400,e.message);}
 if(!env.resendApiKey)return fail(503,'Refund email delivery is not configured.');
 try{
  const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.resendApiKey,'Content-Type':'application/json','Idempotency-Key':refundKey(d)},body:JSON.stringify({from:env.resendFrom||'FareTransit <support@faretransit.com>',to:[d.email],...refundTemplate(d),reply_to:'support@faretransit.com',tags:[{name:'category',value:'refund-request-acknowledgement'}]})});
  if(!r.ok){if(r.status===429)return fail(429,'Email provider is rate limited. Try again later.');if(r.status===409)return fail(409,'An identical refund email is already being processed or was submitted today.');return fail(502,'Email provider could not accept the request. Check the provider before retrying.');}
  const result=await r.json();if(!result.id)return fail(502,'Email acceptance could not be verified. Check the provider before retrying.');
  return res.json({success:true,message:'Refund acknowledgement accepted by the email provider. No refund or payment transaction was performed.'});
 }catch{return fail(502,'Email acceptance could not be verified. Check the provider before retrying.');}
}
