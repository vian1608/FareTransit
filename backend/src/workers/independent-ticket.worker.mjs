import supabase from '../integrations/supabase/supabase.client.mjs';
import env from '../config/env.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
async function finish(job,patch){
 const {error}=await supabase.from('independent_ticket_deliveries').update({...patch,lease_token:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing').eq('lease_token',job.lease_token);
 if(error)throw new Error('Delivery status persistence failed');
}
async function processJob(job){
 const p=job.payload;
 try{
  const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.resendApiKey,'Content-Type':'application/json','Idempotency-Key':'ft-independent-'+job.idempotency_key},body:JSON.stringify({from:env.resendFrom||'FareTransit <support@faretransit.com>',to:[p.recipient],subject:p.subject,html:p.html,text:p.text,reply_to:'support@faretransit.com'})});
  if(r.ok){
   const data=await r.json();
   await finish(job,data.id?{status:'sent',provider_id:data.id,last_error:null}:{status:'uncertain',last_error:'Provider returned no message ID'});
  }else if(r.status===429&&job.attempts<4){
   const retry=Math.min(900,Math.max(60,Number(r.headers.get('retry-after'))||60*Math.pow(2,job.attempts-1)));
   await finish(job,{status:'queued',next_attempt_at:new Date(Date.now()+1000*(retry+Math.random()*10)).toISOString(),last_error:'Provider rate limited the request'});
  }else if(r.status===429||[400,401,403,422].includes(r.status)){
   await finish(job,{status:'failed',retry_safe:r.status===429,last_error:'Provider rejected request (HTTP '+r.status+')'});
   if([401,403].includes(r.status))stopping=true;
  }else{
   await finish(job,{status:'uncertain',last_error:'Provider response requires reconciliation (HTTP '+r.status+')'});
  }
 }catch{
  // Timeout/network/DB failure may occur after acceptance: retain evidence and do not duplicate.
  try{await finish(job,{status:'uncertain',last_error:'Delivery outcome could not be established; reconcile before retry'});}catch{console.error('Independent ticket status update failed; lease recovery will preserve job',job.id);}
 }
}
if(process.env.INDEPENDENT_TICKETS_ENABLED!=='true'||process.env.INDEPENDENT_TICKET_EMAIL_ENABLED!=='true'||process.env.INDEPENDENT_TICKET_WORKER_ENABLED!=='true'||!env.resendApiKey){console.error('Independent ticket worker disabled or unconfigured');process.exitCode=1;}else{
 const once=process.argv.includes('--once');
 do{
  try{
   const {data,error}=await supabase.rpc('ft_claim_independent_ticket');
   if(error)throw new Error('Queue unavailable');
   if(data?.[0])await processJob(data[0]);
   else if(!once)await pause(5000);
  }catch{console.error('Independent ticket worker queue unavailable');if(!once)await pause(15000);}
 }while(!once&&!stopping);
}
