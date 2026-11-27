import { createHash } from 'node:crypto';
import env from '../../config/env.mjs';
import { reviewUrl } from '../independent-tickets/ticket.customer-footer.mjs';

export const feedbackSubject='How was your experience with Fare Transit?';
const greeting='Dear Valued Passenger,';
const paragraphs=[
 'Thank you for choosing Fare Transit! We truly appreciate the trust you place in us.',
 'Our team works hard to make your travel arrangements smooth, comfortable and hassle-free. We would love to hear about your experience, whether positive or negative.',
 'If you have two minutes to spare, please share your honest feedback on Trustpilot. Your review helps us understand what we do well and where we can improve.',
 'Thank you again for choosing Fare Transit. We look forward to assisting you with your future travel plans!'
];
const signature='Warm regards,\nAlex\nFare Transit Customer Support Team';
export const feedbackText=[greeting,...paragraphs.slice(0,3),'Share your experience: '+reviewUrl,paragraphs[3],signature,'Leaving a review is entirely optional.'].join('\n\n');
export const feedbackHtml=`<!doctype html><html lang="en"><body style="margin:0;background:#f4f6fa;font-family:Arial,sans-serif;color:#23334b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fa"><tr><td align="center" style="padding:24px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:white;border:1px solid #dce3ec;border-radius:14px"><tr><td style="padding:24px 28px"><img src="https://www.faretransit.com/favicon.png" alt="" width="38" height="38" style="vertical-align:middle"> <strong style="font-size:25px;color:#8b1236;vertical-align:middle">FareTransit</strong></td></tr><tr><td bgcolor="#8b1236" style="padding:25px 28px;color:white;background:#8b1236"><div style="font-size:11px;letter-spacing:2px;font-weight:bold">CUSTOMER EXPERIENCE</div><h1 style="font-size:26px;line-height:1.3;margin:10px 0 0;color:white">Your journey. Your voice.</h1><p style="font-size:15px;line-height:1.5;margin:8px 0 0;color:white">We'd love to hear from you.</p></td></tr><tr><td style="padding:27px 28px;font-size:15px;line-height:1.7"><p style="margin:0 0 15px"><strong>${greeting}</strong></p>${paragraphs.slice(0,3).map(p=>'<p style="margin:0 0 15px">'+p+'</p>').join('')}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f8fa;border:1px solid #dce3ec;border-radius:10px"><tr><td align="center" style="padding:24px 12px"><p style="margin:0 0 15px;font-size:19px;font-weight:bold;color:#172b46">Share your experience</p><a href="${reviewUrl}" style="display:inline-block;background:#007c58;color:white;text-decoration:none;border-radius:6px;padding:13px 24px;font-weight:bold">Write a review on Trustpilot</a><p style="margin:14px 0 0;font-size:12px;color:#64748b">All honest feedback is welcome. Leaving a review is optional.</p></td></tr></table><p style="margin:20px 0 15px">${paragraphs[3]}</p><p style="margin:0">Warm regards,<br><strong>Alex</strong><br>Fare Transit Customer Support Team</p></td></tr><tr><td align="center" style="background:#f4f6fa;border-top:1px solid #dce3ec;padding:20px;font-size:12px;line-height:1.6;color:#475569"><strong>Fare Transit</strong><br><a style="color:#8b1236" href="https://www.faretransit.com">www.faretransit.com</a> &nbsp;·&nbsp; <a style="color:#8b1236" href="mailto:support@faretransit.com">Customer support</a></td></tr></table></td></tr></table></body></html>`;
export const normalizeFeedbackEmail=value=>typeof value==='string'&&value.trim().length<=254&&/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value.trim())?value.trim():null;
export const feedbackKey=(email,day=new Date().toISOString().slice(0,10))=>'ft-feedback-'+createHash('sha256').update(day+'|'+email.toLowerCase()).digest('hex');
export async function sendFeedbackEmail(req,res){
 const fail=(status,message)=>res.status(status).json({success:false,error:{code:'FEEDBACK_EMAIL_ERROR',message}});
 const email=normalizeFeedbackEmail(req.body?.email);
 if(!email)return fail(400,'Enter one valid passenger email address.');
 if(!env.resendApiKey)return fail(503,'Feedback email delivery is not configured.');
 res.set('Cache-Control','no-store');
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.resendApiKey,'Content-Type':'application/json','Idempotency-Key':feedbackKey(email)},body:JSON.stringify({from:env.resendFrom||'FareTransit <support@faretransit.com>',to:[email],subject:feedbackSubject,html:feedbackHtml,text:feedbackText,reply_to:'support@faretransit.com',tags:[{name:'category',value:'reservation-feedback'}]})});
  if(!response.ok){if(response.status===429)return fail(429,'Email provider is rate limited. Try again later.');if(response.status===409)return fail(409,'A feedback request for this address is already being processed or was submitted today.');return fail(502,'The email provider could not accept the request. Check the provider before retrying.');}
  const result=await response.json();
  if(!result.id)return fail(502,'Email acceptance could not be verified. Check the provider before retrying.');
  return res.json({success:true,message:'Feedback email accepted by the email provider. Repeat requests to the same address today reuse the original send.'});
 }catch{return fail(502,'Email acceptance could not be verified. Check the provider before retrying.');}
}
