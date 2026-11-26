import {createHash} from 'node:crypto';
export const MAX_RECIPIENTS=5;
const identity=email=>email.toLowerCase();
export const validRecipient=email=>typeof email==='string'&&email.length<=254&&/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)&&!(/[\x00-\x1f\x7f]/.test(email));
export function recipientEntries(primary,requested,group,{includePrimary=false}={}){
 if(!validRecipient(primary)||!(/^[a-f0-9]{64}$/.test(group)))throw Error('Invalid original ticket recipient or delivery group.');
 if(!Array.isArray(requested)||requested.length>MAX_RECIPIENTS-(includePrimary?1:0))throw Error('Maximum '+MAX_RECIPIENTS+' recipients per send.');
 const addresses=includePrimary?[primary,...requested]:requested;
 if(!addresses.length)throw Error('Enter at least one recipient.');
 const seen=new Set(),entries=[];
 for(const raw of addresses){
  if(typeof raw!=='string'||!validRecipient(raw.trim()))throw Error('Enter a valid email address in every recipient field.');
  const recipient=raw.trim(),normalized=identity(recipient);
  if(seen.has(normalized))continue;
  seen.add(normalized);
  // Preserve the original single-recipient idempotency key for existing delivery records.
  const key=normalized===identity(primary)?group:createHash('sha256').update(JSON.stringify({group,recipient:normalized})).digest('hex');
  entries.push({recipient,key});
 }
 return entries;
}
export function archivePathForJob(job){
 const original=job.payload.archive_path;
 if(original){
  if(!/^(?:[a-f0-9]{64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.pdf$/i.test(original))throw Error('Invalid original archive path');
  return {path:original,existingOnly:true};
 }
 const group=job.payload.group_key;
 return {path:job.pdf_path||(/^[a-f0-9]{64}$/.test(group||'')?group+'.pdf':job.id+'.pdf'),existingOnly:false};
}
