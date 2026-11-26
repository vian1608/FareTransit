import express from 'express';
import { randomUUID,createHash } from 'node:crypto';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import adminService from '../admin/admin.service.mjs';
import validator from '../bookings/booking-validator.service.mjs';
import {normalizeTicket,mapBooking,validateTicket} from './ticket.model.mjs';
import {renderTicket,ticketText} from './ticket.renderer.mjs';
const router=express.Router();
const table='independent_tickets';
const fail=(res,status,message)=>res.status(status).json({success:false,error:{code:'INDEPENDENT_TICKET_ERROR',message}});
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
const check=({data,error})=>{if(error)throw new Error('Independent ticket storage operation failed.');return data;};
const one=async id=>check(await supabase.from(table).select('*').eq('id',id).maybeSingle());
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
router.use((req,res,next)=>{
 if(process.env.INDEPENDENT_TICKETS_ENABLED!=='true')return fail(res,503,'Independent tickets are disabled.');
 if(req.user?.role!=='admin')return fail(res,403,'Owner access required during initial rollout.');
 next();
});
router.get('/bookings/:id',wrap(async(req,res)=>{
 const b=await adminService.getBookingDetails(req.params.id);
 if(!b?.id)return fail(res,404,'Booking not found.');
 res.json({success:true,data:mapBooking(b),sourceBookingId:b.id,reference:b.confirmation_code});
}));
router.get('/tickets',wrap(async(req,res)=>{
 const offset=Math.max(0,Math.min(10000,Number(req.query.offset)||0));
 const data=check(await supabase.from(table).select('id,source_booking_id,reference,revision,created_at,updated_at,summary').order('updated_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+24));
 res.json({success:true,data});
}));
router.get('/tickets/:id',wrap(async(req,res)=>{
 const ticket=await one(req.params.id);
 if(!ticket)return fail(res,404,'Ticket not found.');
 const deliveries=check(await supabase.from('independent_ticket_deliveries').select('id,revision,status,created_at,updated_at,attempts,provider_id,last_error').eq('ticket_id',ticket.id).order('created_at',{ascending:false}).limit(50));
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
 if(process.env.INDEPENDENT_TICKET_EMAIL_ENABLED!=='true')return fail(res,503,'Independent email delivery is disabled.');
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
  for(const k of ['customer','passengers','references','segments'])if(hash(current[k])!==hash(d[k]))return fail(res,409,'Registered booking facts changed or were edited. Correct the original booking and import again before sending.');
  if(d.payment.show&&d.payment.merchants.some(m=>m.status==='charged'))return fail(res,422,'Booking allocations alone do not prove captured merchant charges. Use pending/authorized or omit payment details until verified.');
 }
 const key=hash({ticket:t.id,revision:t.revision,recipient:d.customer.email});
 const payload={recipient:d.customer.email,subject:'FareTransit — '+(d.documentType==='ticket'?'E-ticket receipt':'Flight itinerary')+' · '+t.reference,html:renderTicket(d),text:ticketText(d),snapshot:d};
 const result=check(await supabase.rpc('ft_enqueue_independent_ticket',{p_ticket:t.id,p_revision:t.revision,p_key:key,p_payload:payload,p_actor:req.user.email||'owner'}));
 if(!result)return fail(res,409,'Draft changed before send; reload and retry.');
 res.status(202).json({success:true,data:result});
}));
router.post('/deliveries/:id/retry',wrap(async(req,res)=>{
 if(process.env.INDEPENDENT_TICKET_EMAIL_ENABLED!=='true')return fail(res,503,'Independent email delivery is disabled.');
 // Only definitively rejected deliveries are eligible; uncertain provider outcomes require reconciliation.
 const data=check(await supabase.from('independent_ticket_deliveries').update({status:'queued',next_attempt_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq('id',req.params.id).eq('status','failed').eq('retry_safe',true).lt('attempts',4).select('id,status').maybeSingle());
 if(!data)return fail(res,409,'Delivery is not eligible for safe retry.');
 res.status(202).json({success:true,data});
}));
export default router;
