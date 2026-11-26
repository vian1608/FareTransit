import { carrierName,cents,money,paymentTotal } from './ticket.model.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const logo=code=>'<img width="40" height="40" style="object-fit:contain;vertical-align:middle" alt="'+esc(carrierName(code))+'" src="https://www.faretransit.com/assets/airlines/'+esc(code.toLowerCase())+'.png">';
const line=(a,b)=>'<tr><td style="padding:8px;border-bottom:1px solid #e4e8ee">'+a+'</td><td style="padding:8px;border-bottom:1px solid #e4e8ee;text-align:right">'+b+'</td></tr>';
const table=content=>'<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px">'+content+'</table>';
const heading=t=>'<h2 style="font-size:16px;color:#8b1236;margin-top:24px">'+esc(t)+'</h2>';
export function renderTicket(d,{draft=false}={}){
 const codes=[...new Set(d.segments.map(s=>s.carrier).filter(c=>/^[A-Z0-9]{2,3}$/.test(c)))];
 const title=d.documentType==='ticket'?'E-ticket receipt & flight itinerary':'Flight itinerary';
 let body='<div style="max-width:720px;margin:auto;background:white;color:#23334b;font-family:Arial,sans-serif;padding:20px"><table role="presentation" width="100%"><tr><td><strong style="font-size:25px;color:#8b1236">FareTransit</strong><br><small>Travel agency</small></td><td style="text-align:right">'+codes.map(c=>logo(c)+' <span style="font-size:12px">'+esc(carrierName(c))+'</span>').join(' &nbsp; ')+'</td></tr></table><h1 style="background:#8b1236;color:white;padding:16px;font-size:20px">'+title+'</h1>';
 if(draft)body+='<p style="color:#8b1236"><strong>DRAFT — NOT VALID FOR TRAVEL</strong></p>';
 body+=heading('Passengers')+table(d.passengers.map(p=>line(esc(p.name),p.ticketNumber?'Ticket: '+esc(p.ticketNumber):'')).join(''));
 if(d.references.length)body+=heading('Airline references')+table(d.references.map(r=>line(esc(carrierName(r.carrier)),esc(r.pnr))).join(''));
 for(const direction of ['outbound','inbound']){
  const seg=d.segments.filter(s=>s.direction===direction);
  if(!seg.length)continue;
  body+=heading(direction==='outbound'?'Outbound journey':'Inbound journey')+seg.map(s=>'<div style="border:1px solid #ddd;padding:12px;margin:8px 0">'+logo(s.carrier)+' <strong>'+esc(carrierName(s.carrier))+' '+esc(s.carrier+' '+s.flight)+'</strong><br>'+esc(s.cabin)+(s.operatingCarrier?' · Operated by '+esc(carrierName(s.operatingCarrier)):'')+table(line(esc(s.from+' · '+s.departureDate+' '+s.departureTime),esc(s.to+' · '+s.arrivalDate+' '+s.arrivalTime)))+(s.baggage?'<p>'+esc(s.baggage)+'</p>':'')+'<small>Local airport times</small></div>').join('');
 }
 if(d.payment.show&&d.payment.merchants.length){
  body+=heading('Payment & merchant charges')+table(d.payment.merchants.map(m=>line(esc(m.merchant)+'<br><small>'+esc(m.status)+(m.cardLast4?' · '+esc(m.cardBrand)+' ending in '+esc(m.cardLast4):'')+'</small>',money(cents(m.amount)||0)+' USD')).join('')+['charged','authorized','pending'].filter(s=>d.payment.merchants.some(m=>m.status===s)).map(s=>line('<strong>Total '+s+'</strong>','<strong>'+money(paymentTotal(d,s))+' USD</strong>')).join(''));
  body+='<p style="font-size:12px">Separate merchant transactions may appear on your card statement.</p>';
 }
 if(d.notes)body+=heading('Special notes')+'<p style="white-space:pre-wrap">'+esc(d.notes).replace(/\n/g,'<br>')+'</p>';
 body+='<p style="border-top:1px solid #ddd;padding-top:12px;font-size:12px">Prepared by FareTransit LLC · support@faretransit.com · Airline reservation details should be verified with the airline.</p></div>';
 return '<!doctype html><html><head><meta charset="utf-8"></head><body>'+body+'</body></html>';
}
export function ticketText(d){
 return ['FareTransit — '+(d.documentType==='ticket'?'E-ticket receipt':'Flight itinerary'),...d.passengers.map(p=>p.name+(p.ticketNumber?' — '+p.ticketNumber:'')),...d.references.map(r=>r.carrier+' PNR: '+r.pnr),...d.segments.map(s=>[s.direction,s.carrier+' '+s.flight,s.from,s.departureDate,s.departureTime,'→',s.to,s.arrivalDate,s.arrivalTime].join(' ')),...(d.payment.show?d.payment.merchants.map(m=>m.merchant+' '+money(cents(m.amount)||0)+' USD — '+m.status+(m.cardLast4?' · card ending in '+m.cardLast4:'')):[]),...(d.notes?['Special notes: '+d.notes]:[]),'Prepared by FareTransit LLC · support@faretransit.com'].join('\n');
}
