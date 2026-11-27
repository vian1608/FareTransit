import express from 'express';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import {uuidPattern,verifyResendEvent,eventKinds} from './ticket.activity.mjs';
const pixel=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
function image(res){res.set({'Content-Type':'image/gif','Cache-Control':'no-store, no-cache, private, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff'});return res.status(200).send(pixel);}
export function mountTicketActivity(app){
 for(const prefix of ['/api','']){
  const path=prefix+'/independent-ticket-open/:token.gif';
  app.head(path,(_req,res)=>image(res));
  app.get(path,async(req,res)=>{
   if(process.env.INDEPENDENT_TICKETS_ENABLED==='true'&&process.env.INDEPENDENT_TICKET_PERSISTENCE_ENABLED==='true'&&uuidPattern.test(req.params.token)){
    try{await supabase.rpc('ft_record_ticket_pixel',{p_token:req.params.token});}catch{/* Never expose tracking or customer details to image callers. */}
   }
   return image(res);
  });
  const servicePath=prefix+'/customer-service-email-open/:token.gif';
  app.head(servicePath,(_req,res)=>image(res));
  app.get(servicePath,async(req,res)=>{if(uuidPattern.test(req.params.token)){try{await supabase.rpc('ft_record_service_email_open',{p_token:req.params.token});}catch{}}return image(res);});
  app.post(prefix+'/webhooks/resend-independent-tickets',express.raw({type:'application/json',limit:'64kb'}),async(req,res)=>{
   const secret=process.env.RESEND_INDEPENDENT_TICKET_WEBHOOK_SECRET;
   if(!secret||process.env.INDEPENDENT_TICKETS_ENABLED!=='true'||process.env.INDEPENDENT_TICKET_PERSISTENCE_ENABLED!=='true')return res.status(503).json({success:false});
   let event;try{event=verifyResendEvent(req.body,req.headers,secret,Date.now(),new Set([...eventKinds,'clicked']));}catch{return res.status(400).json({success:false});}
   if(!event)return res.json({success:true});
   try{if(event.p_kind!=='clicked'){const ticket=await supabase.rpc('ft_record_ticket_provider_event',event);if(ticket.error)throw Error('storage');if(ticket.data)return res.json({success:true});}const service=await supabase.rpc('ft_record_service_email_event',event);if(service.error)throw Error('storage');return res.json({success:true});}catch{return res.status(503).json({success:false});}
  });
 }
}
