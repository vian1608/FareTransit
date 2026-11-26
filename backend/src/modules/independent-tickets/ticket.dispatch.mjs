import supabase from '../../integrations/supabase/supabase.client.mjs';
import env from '../../config/env.mjs';
import {generateTicketPdf} from './ticket.pdf.mjs';
import {archivePathForJob} from './ticket.recipients.mjs';
import {deliverySubject} from './ticket.subject.mjs';
const bucket='independent-ticket-pdfs';
async function archivedPdf(job){
 const store=supabase.storage.from(bucket);
 const {path,existingOnly}=archivePathForJob(job);
 // Always reuse the original archived bytes; no upsert or replacement.
 let old=await store.download(path);
 let bytes;
 if(!old.error){bytes=Buffer.from(await old.data.arrayBuffer());}
 else{
  if(existingOnly)throw Error('Original archived PDF is unavailable; do not regenerate a historical ticket');
  bytes=await generateTicketPdf(job.payload.snapshot,{reference:job.payload.reference,createdAt:job.created_at});
  const upload=await store.upload(path,bytes,{contentType:'application/pdf',upsert:false});
  if(upload.error){old=await store.download(path);if(old.error)throw Error('PDF archive unavailable');bytes=Buffer.from(await old.data.arrayBuffer());}
 }
 const {data,error}=await supabase.from('independent_ticket_deliveries').update({pdf_path:path}).eq('id',job.id).eq('status','processing').eq('lease_token',job.lease_token).gt('lease_until',new Date().toISOString()).select('id').maybeSingle();
 if(error||!data)throw Error('Worker lease lost before sending');
 return bytes;
}
async function finish(job,patch){
 const {data,error}=await supabase.from('independent_ticket_deliveries').update({...patch,lease_token:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing').eq('lease_token',job.lease_token).select('id').maybeSingle();
 if(error||!data)throw new Error('Delivery status persistence failed');
}
async function processJob(job){
 const p=job.payload;
 let pdf;
 try{pdf=await archivedPdf(job);}catch{
  await finish(job,{status:'failed',retry_safe:true,last_error:'PDF could not be generated or archived; no email was attempted'});
  return;
 }
 try{
  const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.resendApiKey,'Content-Type':'application/json','Idempotency-Key':'ft-independent-'+job.idempotency_key},body:JSON.stringify({from:env.resendFrom||'FareTransit <support@faretransit.com>',to:[p.recipient],subject:deliverySubject(p),html:p.html,text:p.text,reply_to:'support@faretransit.com',attachments:[{filename:'FareTransit-ticket.pdf',content:pdf.toString('base64')}]})});
  if(r.ok){
   const data=await r.json();
   await finish(job,data.id?{status:'sent',provider_id:data.id,last_error:null}:{status:'uncertain',last_error:'Provider returned no message ID'});
  }else if(r.status===429&&job.attempts<4){
   const retry=Math.min(900,Math.max(60,Number(r.headers.get('retry-after'))||60*Math.pow(2,job.attempts-1)));
   await finish(job,{status:'queued',next_attempt_at:new Date(Date.now()+1000*(retry+Math.random()*10)).toISOString(),last_error:'Provider rate limited the request'});
  }else if(r.status===429||[400,401,403,422].includes(r.status)){
   await finish(job,{status:'failed',retry_safe:[401,403,429].includes(r.status),last_error:'Provider rejected request (HTTP '+r.status+')'});

  }else{
   await finish(job,{status:'uncertain',last_error:'Provider response requires reconciliation (HTTP '+r.status+')'});
  }
 }catch{
  // Timeout/network/DB failure may occur after acceptance: retain evidence and do not duplicate.
  try{await finish(job,{status:'uncertain',last_error:'Delivery outcome could not be established; reconcile before retry'});}catch{console.error('Independent ticket status update failed; lease recovery will preserve job',job.id);}
 }
}

export function independentDeliveryConfigured(){
 return process.env.INDEPENDENT_TICKETS_ENABLED==='true'&&process.env.INDEPENDENT_TICKET_PERSISTENCE_ENABLED==='true'&&process.env.INDEPENDENT_TICKET_EMAIL_ENABLED==='true'&&process.env.INDEPENDENT_TICKET_WORKER_ENABLED==='true'&&Boolean(env.resendApiKey);
}
// One durable, globally bounded job per invocation. Safe to call from an owner request
// or an independently supervised worker; no in-process timers or fire-and-forget tasks.
export async function dispatchIndependentTicket(deliveryId=null){
 if(!independentDeliveryConfigured())throw Error('Independent ticket delivery is disabled or unconfigured');
 const {data,error}=await supabase.rpc('ft_claim_independent_ticket',{p_delivery:deliveryId});
 if(error)throw Error('Independent ticket queue unavailable');
 if(!data?.[0])return {claimed:false};
 await processJob(data[0]);
 return {claimed:true,id:data[0].id};
}
