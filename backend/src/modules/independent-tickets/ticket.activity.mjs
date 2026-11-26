import {createHmac,timingSafeEqual} from 'node:crypto';
export const openNotice='We use email open detection for ticket delivery follow-up. Image loading may be blocked in your email settings.';
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const eventKinds=new Set(['sent','delivered','delivery_delayed','bounced','failed','complained','suppressed','opened']);
export const trackable=job=>uuidPattern.test(job.tracking_token||'')&&typeof job.payload?.html==='string'&&job.payload.html.includes('data-ft-open-notice');
export function trackingHtml(job){
 if(!trackable(job))return job.payload.html;
 return job.payload.html.replace('</body>','<img src="https://www.faretransit.com/api/independent-ticket-open/'+job.tracking_token+'.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px" /></body>');
}
export function verifyResendEvent(raw,headers,secret,now=Date.now()){
 if(!Buffer.isBuffer(raw)||typeof secret!=='string'||!secret.startsWith('whsec_'))throw Error('Invalid webhook');
 const id=headers['svix-id'],stamp=headers['svix-timestamp'],sig=headers['svix-signature'];
 if(typeof id!=='string'||!id||id.length>150||typeof stamp!=='string'||!/^\d{1,12}$/.test(stamp)||typeof sig!=='string'||sig.length>2048||Math.abs(now/1000-Number(stamp))>300)throw Error('Invalid webhook');
 const key=Buffer.from(secret.slice(6),'base64');if(key.length<16)throw Error('Invalid webhook');
 const expected=createHmac('sha256',key).update(id+'.'+stamp+'.').update(raw).digest();
 if(!sig.split(/\s+/).some(s=>{if(!s.startsWith('v1,'))return false;const actual=Buffer.from(s.slice(3),'base64');return actual.length===expected.length&&timingSafeEqual(actual,expected);}))throw Error('Invalid webhook');
 const body=JSON.parse(raw.toString('utf8'));
 const kind=typeof body.type==='string'&&body.type.startsWith('email.')?body.type.slice(6):'';
 if(!eventKinds.has(kind))return null;
 const provider=body.data?.email_id,recipient=body.data?.to?.[0],tag=body.data?.tags?.ft_delivery,time=body.created_at;
 if(!uuidPattern.test(provider||'')||!Array.isArray(body.data?.to)||body.data.to.length!==1||typeof recipient!=='string'||recipient.length>254||typeof time!=='string'||!Number.isFinite(Date.parse(time)))throw Error('Invalid event');
 return {p_event_id:'resend:'+id,p_provider_id:provider,p_delivery:uuidPattern.test(tag||'')?tag:null,p_recipient:recipient,p_kind:kind,p_time:new Date(time).toISOString()};
}
