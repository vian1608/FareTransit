import express from 'express';
import { randomUUID,createHash } from 'node:crypto';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import adminService from '../admin/admin.service.mjs';
import validator from '../bookings/booking-validator.service.mjs';
import {normalizeTicket,mapBooking,validateTicket} from './ticket.model.mjs';
import {renderTicket,ticketText} from './ticket.renderer.mjs';
import {recipientEntries} from './ticket.recipients.mjs';
import {ticketSubject} from './ticket.subject.mjs';
const router=express.Router();
const table='independent_tickets';
const bucket='independent-ticket-pdfs';
const fail=(res,status,message)=>res.status(status).json({success:false,error:{code:'INDEPENDENT_TICKET_ERROR',message}});
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
const check=({data,error})=>{if(error)throw new Error('Independent ticket storage operation failed.');return data;};
const one=async id=>check(await supabase.from(table).select('*').eq('id',id).maybeSingle());
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
router.use((req,res,next)=>{
 if(process.env.INDEPENDENT_TICKETS_ENABLED!=='true')return fail(res,503,'Independent tickets are disabled.');
 if(req.user?.role!=='admin')return fail(res,403,'Owner access required during initial rollout.');
 const reviewOnly=(req.method==='GET'&&/^\/bookings\/[^/]+$/.test(req.path))||(req.method==='POST'&&req.path==='/preview');
 if(process.env.INDEPENDENT_TICKET_PERSISTENCE_ENABLED!=='true'&&!reviewOnly)return fail(res,503,'Ticket persistence is disabled during review.');
 next();
});
router.get('/bookings/:id',wrap(async(req,res)=>{
 const b=await adminService.getBookingDetails(req.params.id);
 if(!b?.id)return fail(res,404,'Booking not found.');
 res.json({success:true,data:mapBooking(b),sourceBookingId:b.id,reference:b.confirmation_code});
}));
router.get('/tickets',wrap(async(req,res)=>{
 const offset=Math.max(0,Math.min(10000,Math.floor(Number(req.query.offset)||0)));
 const search=String(req.query.search||'').trim().slice(0,200),airline=String(req.query.airline||'').trim().toUpperCase().slice(0,3);
 const allowed=['all','draft','queued','processing','sent','delivered','opened','no_open','delivery_delayed','bounced','failed','suppressed','complained','uncertain'];
 const status=allowed.includes(req.query.status)?req.query.status:'all';
 const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v?v:null;
 const from=date(req.query.from),to=date(req.query.to);
 if((req.query.from&&!from)||(req.query.to&&!to)||(from&&to&&from>to))return fail(res,400,'Invalid date range.');
 const result=check(await supabase.rpc('ft_independent_ticket_history',{p_search:search,p_status:status,p_airline:airline,p_from:from,p_to:to,p_offset:offset}));
 res.set('Cache-Control','no-store');
 res.json({success:true,...result,providerWebhookConfigured:Boolean(process.env.RESEND_INDEPENDENT_TICKET_WEBHOOK_SECRET)});
}));
router.get('/tickets/:id',wrap(async(req,res)=>{
 const ticket=await one(req.params.id);
 if(!ticket)return fail(res,404,'Ticket not found.');
 const deliveries=check(await supabase.from('independent_ticket_activity').select('*').eq('ticket_id',ticket.id).order('created_at',{ascending:false}).limit(50));
 res.json({success:true,data:ticket,deliveries});
}));
const summary=d=>({passenger:d.passengers[0]?.name||'',email:d.customer.email,route:d.segments.map(s=>s.from+'–'+s.to).join(', ')});
router.post('/tickets',wrap(async(req,res)=>{
 const source=req.body.sourceBookingId||null;
 if(source&&!(await adminService.getBookingDetails(source))?.id)return fail(res,404,'Booking not found.');
 const d=normalizeTicket(req.body.data);
 const id=randomUUID();
 const data=check(await supabase.from(table).insert({id,source_booking_id:source,reference:'FT-ET-'+id.slice(0,12).toUpperCase(),draft:d,summary:summary(d),created_by:req.user.email||'owner'}).select('*').single());
 res.status(201).json({success:true,data});
}));
router.patch('/tickets/:id',wrap(async(req,res)=>{
 const revision=Number(req.body.revision);
 if(!Number.isInteger(revision)||revision<1)return fail(res,400,'Draft revision required.');
 const d=normalizeTicket(req.body.data);
 const data=check(await supabase.from(table).update({draft:d,summary:summary(d),revision:revision+1,updated_at:new Date().toISOString()}).eq('id',req.params.id).eq('revision',revision).select('*').maybeSingle());
 if(!data)return fail(res,409,'Draft changed or no longer exists. Reload before editing.');
 res.json({success:true,data});
}));
router.post('/preview',wrap(async(req,res)=>{
 const d=normalizeTicket(req.body.data);
 res.json({success:true,html:renderTicket(d,{draft:true}),errors:validateTicket(d)});
}));
router.post('/tickets/:id/send',wrap(async(req,res)=>{
 if(process.env.INDEPENDENT_TICKET_EMAIL_ENABLED!=='true'||process.env.INDEPENDENT_TICKET_WORKER_ENABLED!=='true'||!process.env.RESEND_API_KEY)return fail(res,503,'Independent email delivery is disabled or unconfigured.');
 const t=await one(req.params.id);
 if(!t)return fail(res,404,'Ticket not found.');
 if(t.revision!==Number(req.body.revision))return fail(res,409,'Save and reload the latest revision before sending.');
 const d=normalizeTicket(t.draft);
 const errors=validateTicket(d,{sending:true});
 if(errors.length)return fail(res,422,errors.join(' '));
 if(t.source_booking_id){
  const v=await validator.validateBookingIntegrity(t.source_booking_id,{requireItinerary:true,requirePassengers:true,requirePnr:true,requireTicket:d.documentType==='ticket',requireAuthorization:true});
  if(!v.valid)return fail(res,422,'Existing booking integrity or authorization checks failed.');
  const current=mapBooking(await adminService.getBookingDetails(t.source_booking_id));
  // Keep registered booking flight facts, recipient and passenger identities tied to the authorized source.
  const passengerFacts=rows=>rows.map(({name,ticketNumber})=>({name,ticketNumber}));
  for(const k of ['customer','passengers','references','segments'])if(hash(k==='passengers'?passengerFacts(current[k]):current[k])!==hash(k==='passengers'?passengerFacts(d[k]):d[k]))return fail(res,409,'Registered booking facts changed or were edited. Correct the original booking and import again before sending.');
  if(d.payment.show&&d.payment.merchants.some(m=>m.status==='charged'))return fail(res,422,'Booking allocations alone do not prove captured merchant charges. Use pending/authorized or omit payment details until verified.');
 }
 const key=hash({ticket:t.id,document:{...d,verified:undefined}});
 const requested=req.body.additionalRecipients??[];
 if(requested.length&&req.body.recipientsVerified!==true)return fail(res,422,'Confirm the passenger authorized all additional recipients.');
 let entries;
 try{entries=recipientEntries(d.customer.email,requested,key,{includePrimary:true});}catch(e){return fail(res,422,e.message);}
 const payload={recipient:d.customer.email,group_key:key,subject:ticketSubject(d),html:renderTicket(d),text:ticketText(d),snapshot:d,reference:t.reference};
 const result=check(await supabase.rpc('ft_enqueue_independent_recipient_batch',{p_ticket:t.id,p_revision:t.revision,p_source:null,p_payload:payload,p_entries:entries,p_actor:req.user.email||'owner'}));
 if(!result)return fail(res,409,'Draft changed before send; reload and retry.');
 // Preserve the original response shape for older CRM tabs on single-recipient sends.
 res.status(202).json({success:true,data:result[0].id,deliveries:result});
}));
router.post('/deliveries/:id/add-recipients',wrap(async(req,res)=>{
 if(process.env.INDEPENDENT_TICKET_EMAIL_ENABLED!=='true'||process.env.INDEPENDENT_TICKET_WORKER_ENABLED!=='true'||!process.env.RESEND_API_KEY)return fail(res,503,'Independent email delivery is disabled or unconfigured.');
 if(req.body.recipientsVerified!==true)return fail(res,422,'Confirm passenger authorization and that the archived itinerary is still appropriate to share.');
 const original=check(await supabase.from('independent_ticket_deliveries').select('id,ticket_id,revision,status,payload,pdf_path,idempotency_key').eq('id',req.params.id).maybeSingle());
 if(!original)return fail(res,404,'Delivery not found.');
 if(original.status!=='sent'||!original.pdf_path)return fail(res,409,'Only a successfully sent ticket with an archived PDF may be forwarded.');
 let entries;
 try{entries=recipientEntries(original.payload.snapshot?.customer?.email||original.payload.recipient,req.body.recipients,original.payload.group_key||original.idempotency_key);}catch(e){return fail(res,422,e.message);}
 const result=check(await supabase.rpc('ft_enqueue_independent_recipient_batch',{p_ticket:original.ticket_id,p_revision:original.revision,p_source:original.id,p_payload:null,p_entries:entries,p_actor:req.user.email||'owner'}));
 if(!result)return fail(res,409,'Archived delivery is no longer available.');
 res.status(202).json({success:true,deliveries:result});
}));
router.post('/deliveries/:id/retry',wrap(async(req,res)=>{
 if(process.env.INDEPENDENT_TICKET_EMAIL_ENABLED!=='true')return fail(res,503,'Independent email delivery is disabled.');
 // Only definitively rejected deliveries are eligible; uncertain provider outcomes require reconciliation.
 const data=check(await supabase.from('independent_ticket_deliveries').update({status:'queued',next_attempt_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq('id',req.params.id).eq('status','failed').eq('retry_safe',true).lt('attempts',4).select('id,status').maybeSingle());
 if(!data)return fail(res,409,'Delivery is not eligible for safe retry.');
 res.status(202).json({success:true,data});
}));
router.post('/deliveries/:id/process',wrap(async(req,res)=>{
 if(process.env.INDEPENDENT_TICKET_EMAIL_ENABLED!=='true'||process.env.INDEPENDENT_TICKET_WORKER_ENABLED!=='true')return fail(res,503,'Independent email delivery is disabled.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id))return fail(res,400,'Invalid delivery ID.');
 const readStatus=()=>supabase.from('independent_ticket_deliveries').select('id,status,attempts,provider_id,last_error').eq('id',req.params.id).maybeSingle();
 const existing=check(await readStatus());
 if(!existing)return fail(res,404,'Delivery not found.');
 const {dispatchIndependentTicket,independentDeliveryConfigured}=await import('./ticket.dispatch.mjs');
 if(!independentDeliveryConfigured())return fail(res,503,'Independent email provider or worker is not configured.');
 await dispatchIndependentTicket(req.params.id);
 const status=check(await readStatus());
 res.set('Cache-Control','no-store');
 res.json({success:true,data:status});
}));
router.get('/deliveries/:id',wrap(async(req,res)=>{
 const d=check(await supabase.from('independent_ticket_deliveries').select('id,ticket_id,revision,status,payload,pdf_path').eq('id',req.params.id).maybeSingle());
 if(!d)return fail(res,404,'Delivery not found.');
 res.json({success:true,data:{id:d.id,ticket_id:d.ticket_id,revision:d.revision,status:d.status,snapshot:d.payload.snapshot,pdf_path:d.pdf_path}});
}));
router.get('/deliveries/:id/pdf',wrap(async(req,res)=>{
 const d=check(await supabase.from('independent_ticket_deliveries').select('id,pdf_path').eq('id',req.params.id).maybeSingle());
 if(!d?.pdf_path)return fail(res,404,'Archived PDF not available.');
 const result=await supabase.storage.from(bucket).download(d.pdf_path);
 if(result.error)return fail(res,503,'Archived PDF could not be retrieved.');
 res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="FareTransit-ticket.pdf"','Cache-Control':'no-store'});
 res.send(Buffer.from(await result.data.arrayBuffer()));
}));
export default router;
