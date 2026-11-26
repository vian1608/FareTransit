import {carrierName} from './ticket.model.mjs';
// Prefer the actual airline confirmation, not the internal FareTransit reference.
export function ticketSubject(d={}){
 const refs=Array.isArray(d.references)?d.references:[];
 const segments=Array.isArray(d.segments)?d.segments:[];
 const code=v=>typeof v==='string'&&/^[A-Z0-9]{2,3}$/.test(v)?v:'';
 const pnr=v=>typeof v==='string'&&/^[A-Z0-9]{6}$/.test(v)?v:'';
 const first=refs.find(r=>code(r?.carrier)&&pnr(r?.pnr));
 const carriers=[...new Set([first?.carrier,...segments.map(s=>s?.carrier),...refs.map(r=>r?.carrier)].map(code).filter(Boolean))];
 const lead=carriers[0];
 const name=lead?String(carrierName(lead)).replace(/[\r\n\x00-\x1f\x7f]/g,' ').trim().slice(0,80):'';
 const label=name||lead||(d.documentType==='ticket'?'E-ticket receipt':'Flight itinerary');
 return 'FareTransit — '+label+(carriers.length>1?' +'+(carriers.length-1):'')+(first?' · '+first.pnr:'');
}
export function deliverySubject(payload){
 // New forwards use the archived snapshot's airline/PNR, not the current draft.
 // Retain the original subject of ordinary queued/retried jobs for idempotency.
 return payload.source_delivery_id&&payload.snapshot?ticketSubject(payload.snapshot):payload.subject;
}
