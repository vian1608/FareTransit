import env from '../../config/env.mjs';
export const serviceOpenNotice='We use email open detection for customer-service follow-up. Images may be blocked by your email settings.';
const table='customer_service_emails',activity='customer_service_email_activity',events='customer_service_email_events';
const columns='id,kind,recipient,actor,subject,details,provider_id,last_error,created_at,updated_at,accepted_at,status,sent_at,delivered_at,first_open_at,last_open_at,open_count,click_count';
const database=async()=> (await import('../../integrations/supabase/supabase.client.mjs')).default;
const withOpenPixel=(html,token)=>uuid.test(token||'')?html.replace('</body>','<img src="https://www.faretransit.com/api/customer-service-email-open/'+token+'.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px"/></body>'):html;
const statuses=new Set(['processing','accepted','sent','delivered','engaged','delivery_delayed','failed','uncertain','bounced','complained','suppressed','opened','clicked']);
const kinds=new Set(['feedback','refund']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(res,status,message)=>res.status(status).json({success:false,error:{code:'CUSTOMER_SERVICE_EMAIL',message}});
const actorOf=req=>String(req.user?.email||req.user?.id||'admin').slice(0,254);
export function createServiceEmailDelivery({getDb=database,fetcher=(...args)=>fetch(...args),apiKey=()=>env.resendApiKey}={}){
 return async function deliver(req,res,{kind,key,recipient,template,details,tag}){
  res.set('Cache-Control','no-store');
  let db,row;
  try{
   db=await getDb();
   const result=await db.from(table).upsert({kind,idempotency_key:key,recipient,actor:actorOf(req),subject:template.subject,html:template.html,plain_text:template.text,details},{onConflict:'idempotency_key',ignoreDuplicates:true}).select('id,status,provider_id,tracking_token').maybeSingle();
   if(result.error)throw Error('history unavailable');
   row=result.data;
   if(!row){
    const existing=await db.from(table).select('id,status,provider_id').eq('idempotency_key',key).single();
    if(existing.error||!existing.data)throw Error('history unavailable');
    const prior=existing.data;
    if(prior.status==='accepted')return res.json({success:true,data:{id:prior.id,provider_id:prior.provider_id},message:'This email was already accepted by the provider. No duplicate email was sent.'});
    return fail(res,409,'An identical email attempt is already recorded. Check its history before sending again.');
   }
  }catch{return fail(res,503,'Email history is unavailable. Nothing was sent.');}
  const finish=async patch=>{const r=await db.from(table).update({...patch,updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','processing').select('id,status,provider_id').maybeSingle();if(r.error)throw Error('history update failed');if(r.data)return r.data;const current=await db.from(table).select('id,status,provider_id').eq('id',row.id).single();if(current.error)throw Error('history update failed');return current.data;};
  try{
   if(!apiKey()){await finish({status:'failed',last_error:'Email provider not configured'});return fail(res,503,'Email delivery is not configured. Attempt recorded.');}
   const response=await fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+apiKey(),'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:env.resendFrom||'FareTransit <support@faretransit.com>',to:[recipient],...template,html:withOpenPixel(template.html,row.tracking_token),reply_to:'support@faretransit.com',tags:[{name:'category',value:tag},{name:'ft_delivery',value:row.id}]})});
   if(!response.ok){
    const rejected=[400,401,403,404,422,429].includes(response.status);
    const result=await finish({status:rejected?'failed':'uncertain',last_error:'Provider returned HTTP '+response.status});
    if(result.status==='accepted')return res.json({success:true,data:result,message:'Email accepted by the provider.'});
    return fail(res,response.status===429?429:502,rejected?'Email provider rejected the request. See history.':'Email acceptance is uncertain. Check history before retrying.');
   }
   const data=await response.json();
   if(!data.id){await finish({status:'uncertain',last_error:'Provider returned no message ID'});return fail(res,502,'Email acceptance could not be verified. Check history.');}
   const result=await finish({status:'accepted',provider_id:data.id,accepted_at:new Date().toISOString(),last_error:null});
   return res.json({success:true,data:result,message:'Email accepted by the provider. See history for delivery updates.'});
  }catch{
   try{const current=await finish({status:'uncertain',last_error:'Provider acceptance or history update could not be verified'});if(current.status==='accepted')return res.json({success:true,data:current,message:'Email accepted by the provider.'});}catch{}
   return fail(res,502,'Email acceptance could not be verified. Check history before retrying.');
  }
 };
}
export const deliverServiceEmail=createServiceEmailDelivery();
export async function listServiceEmails(req,res){
 res.set('Cache-Control','no-store');
 const kind=req.params.kind;
 if(!kinds.has(kind))return fail(res,400,'Unknown email type.');
 const search=String(req.query.search||'').trim().slice(0,200),status=String(req.query.status||'all');
 const offset=Math.max(0,Math.min(100000,Math.floor(Number(req.query.offset)||0)));
 const limit=[10,25,50,100].includes(Number(req.query.limit))?Number(req.query.limit):25;
 const email=String(req.query.email||'').trim().slice(0,254);
 const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const from=req.query.from,to=req.query.to;
 if((from&&!day(from))||(to&&!day(to))||(from&&to&&from>to)||(status!=='all'&&!statuses.has(status)))return fail(res,400,'Invalid history filters.');
 try{
  const db=await database();let q=db.from(activity).select(columns,{count:'exact'}).eq('kind',kind);
  if(search)q=q.ilike('search_text','%'+search.replace(/[\\%_]/g,'\\$&')+'%');
  if(email)q=q.ilike('recipient','%'+email.replace(/[\\%_]/g,ch=>'\\'+ch)+'%');
  if(status==='opened')q=q.gt('open_count',0);else if(status==='clicked')q=q.gt('click_count',0);else if(status!=='all')q=q.eq('status',status);
  if(from)q=q.gte('created_at',from+'T00:00:00Z');
  if(to)q=q.lt('created_at',new Date(Date.parse(to)+86400000).toISOString());
  const {data,error,count}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+limit-1);
  if(error)throw Error('history unavailable');
  return res.json({success:true,data,total:count||0,webhookConfigured:Boolean(process.env.RESEND_INDEPENDENT_TICKET_WEBHOOK_SECRET)});
 }catch{return fail(res,503,'Email history is unavailable.');}
}
export async function serviceEmailDetail(req,res){
 res.set('Cache-Control','no-store');
 if(!kinds.has(req.params.kind)||!uuid.test(req.params.id))return fail(res,400,'Invalid email reference.');
 try{
  const db=await database(),id=req.params.id;
  const [record,snapshot,timeline]=await Promise.all([db.from(activity).select(columns).eq('kind',req.params.kind).eq('id',id).maybeSingle(),db.from(table).select('html,plain_text,status').eq('kind',req.params.kind).eq('id',id).maybeSingle(),db.from(events).select('kind,occurred_at,source').eq('email_id',id).order('occurred_at',{ascending:false}).limit(100)]);
  if(record.error||snapshot.error||timeline.error)throw Error('history unavailable');
  if(!record.data||!snapshot.data)return fail(res,404,'Email not found.');
  return res.json({success:true,data:{...record.data,html:snapshot.data.html,text:snapshot.data.plain_text,submission_status:snapshot.data.status,events:timeline.data||[]}});
 }catch{return fail(res,503,'Email details are unavailable.');}
}
export async function refreshServiceEmail(req,res){
 res.set('Cache-Control','no-store');
 if(!kinds.has(req.params.kind)||!uuid.test(req.params.id))return fail(res,400,'Invalid email reference.');
 try{
  const db=await database();const r=await db.from(table).select('id,provider_id').eq('kind',req.params.kind).eq('id',req.params.id).maybeSingle();
  if(r.error)throw Error('history unavailable');
  if(!r.data)return fail(res,404,'Email not found.');
  if(!r.data.provider_id)return fail(res,409,'No provider reference is available. Reconcile in Resend before retrying.');
  const p=await fetch('https://api.resend.com/emails/'+encodeURIComponent(r.data.provider_id),{headers:{Authorization:'Bearer '+env.resendApiKey},signal:AbortSignal.timeout(10000)});
  if(!p.ok)return fail(res,502,'Provider status unavailable. The email API key may not have read access.');
  const data=await p.json(),kind=String(data.last_event||'').replace(/^email\./,'');
  if(!['sent','delivered','delivery_delayed','bounced','failed','complained','suppressed','opened','clicked'].includes(kind))return fail(res,502,'Provider did not return a recognized status.');
  const at=new Date().toISOString();
  const saved=await db.from(events).upsert({event_id:'status:'+r.data.id+':'+kind,email_id:r.data.id,kind,occurred_at:at,source:'provider_status'},{onConflict:'event_id',ignoreDuplicates:true});
  if(saved.error)throw Error('history unavailable');
  return res.json({success:true,message:'Provider status refreshed. Time is the observation time, not the original event time.'});
 }catch{return fail(res,503,'Could not refresh email status.');}
}
