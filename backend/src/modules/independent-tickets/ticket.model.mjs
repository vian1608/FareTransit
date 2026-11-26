import { resolveAirlineName } from '../../shared/utils/airline-lookup.mjs';

const str=(v,n=160)=>String(v??'').trim().slice(0,n);
const upper=(v,n)=>str(v,n).toUpperCase();
const rows=(v,n=30)=>Array.isArray(v)?v.slice(0,n):[];
const digits=(v)=>/^\d{4}$/.test(str(v))?str(v):'';
const date=(v)=>str(v,10);
const time=(v)=>str(v,5);
export function cents(v) {
  const s=String(v??'').trim();
  if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(s)) return null;
  const [a,b='']=s.split('.');
  return Number(a)*100+Number(b.padEnd(2,'0'));
}
export function normalizeTicket(raw={}) {
  return {
    customer:{name:str(raw.customer?.name),email:str(raw.customer?.email,254),phone:str(raw.customer?.phone,40)},
    passengers:rows(raw.passengers).map(p=>({name:str(p.name),ticketNumber:str(p.ticketNumber,40)})),
    references:rows(raw.references).map(r=>({carrier:upper(r.carrier,3),pnr:upper(r.pnr,12)})).filter(r=>r.carrier||r.pnr),
    segments:rows(raw.segments,60).map(s=>({direction:s.direction==='inbound'?'inbound':'outbound',carrier:upper(s.carrier,3),flight:upper(s.flight,8),from:upper(s.from,3),to:upper(s.to,3),departureDate:date(s.departureDate),arrivalDate:date(s.arrivalDate),departureTime:time(s.departureTime),arrivalTime:time(s.arrivalTime),cabin:str(s.cabin,60),operatingCarrier:upper(s.operatingCarrier,3),baggage:str(s.baggage,100)})),
    gds:{outbound:str(raw.gds?.outbound,10000),inbound:str(raw.gds?.inbound,10000)},
    payment:{show:raw.payment?.show===true,merchants:rows(raw.payment?.merchants).map(m=>({merchant:str(m.merchant),amount:str(m.amount,16),currency:upper(m.currency,3)||'USD',cardBrand:str(m.cardBrand,40),cardLast4:digits(m.cardLast4),status:['charged','authorized','pending'].includes(m.status)?m.status:'pending'}))},
    notes:str(raw.notes,4000),
    verified:raw.verified===true,
    documentType:raw.documentType==='ticket'?'ticket':'itinerary'
  };
}
function calendar(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
const clock=s=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
export function validateTicket(d,{sending=false}={}){
  const errors=[];
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.customer.email)) errors.push('Valid recipient email required.');
  if(!d.passengers.length||d.passengers.some(p=>!p.name)) errors.push('Enter every passenger name.');
  if(!d.segments.length) errors.push('At least one flight segment is required.');
  d.segments.forEach((s,i)=>{
    const invalid=[];
    if(!/^[A-Z0-9]{2,3}$/.test(s.carrier))invalid.push('carrier code');
    if(!/^\d{1,4}[A-Z]?$/.test(s.flight))invalid.push('flight number');
    if(!/^[A-Z]{3}$/.test(s.from))invalid.push('origin airport');
    if(!/^[A-Z]{3}$/.test(s.to))invalid.push('destination airport');
    if(s.from&&s.from===s.to)invalid.push('different origin and destination airports');
    if(!calendar(s.departureDate))invalid.push('departure date');
    if(!calendar(s.arrivalDate))invalid.push('arrival date');
    if(!clock(s.departureTime))invalid.push('departure local time');
    if(!clock(s.arrivalTime))invalid.push('arrival local time');
    if(invalid.length)errors.push('Segment '+(i+1)+' ('+s.direction+'): check '+invalid.join(', ')+'.');
  });
  for(const direction of ['outbound','inbound']){
    const journey=d.segments.filter(s=>s.direction===direction);
    journey.forEach((s,i)=>{if(i&&journey[i-1].to!==s.from) errors.push('Disconnected '+direction+' itinerary at segment '+(i+1)+'.');});
  }
  if(d.references.some(r=>!/^[A-Z0-9]{6}$/.test(r.pnr)||!/^[A-Z0-9]{2,3}$/.test(r.carrier)))errors.push('Complete valid airline reference rows or remove empty rows.');
  if(d.documentType==='ticket'){
    if(!d.references.length)errors.push('An actual airline PNR is required.');

  }
  d.passengers.forEach((p,i)=>{
    const number=p.ticketNumber.replace(/[- ]/g,'');
    if(d.documentType==='ticket'&&!number)errors.push('Passenger '+(i+1)+': enter the issued 13-digit ticket number, or select Flight itinerary for ticketless travel.');
    else if(number&&!/^\d{13}$/.test(number))errors.push('Passenger '+(i+1)+': ticket number has '+number.replace(/\D/g,'').length+' digits; expected exactly 13 digits. Check the original airline receipt.');
  });
  if(d.payment.show){
    if(!d.payment.merchants.length)errors.push('Add merchant charges or hide the payment section.');
    d.payment.merchants.forEach((m,i)=>{
      if(!m.merchant||cents(m.amount)===null||m.currency!=='USD'||(m.status==='charged'&&!m.cardLast4))errors.push('Valid USD amount, merchant and last four digits for charged merchant '+(i+1)+' are required.');
    });
  }
  if(sending&&!d.verified)errors.push('Verify the reservation, recipient and payment information against the actual supplier records.');
  return errors;
}
export const carrierName=code=>resolveAirlineName(code)||code;
export function mapBooking(b){
  const pp=rows(b.travellers||b.passengers);
  const seg=rows(b.itinerary_segments||b.flights,60);
  const pm=b.payment_method||b.paymentMethod||{};
  const sourcePnr=b.airline_confirmation_number||b.airline_pnr||b.pnr;
  const first=seg[0]||{};
  return normalizeTicket({
    customer:{name:b.passenger_name,email:b.email||b.contacts?.[0]?.email,phone:b.phone},
    passengers:pp.length?pp.map((p,i)=>({name:[p.first_name||p.firstName,p.middle_name||p.middleName,p.last_name||p.lastName].filter(Boolean).join(' '),ticketNumber:p.ticket_number||(pp.length===1?b.ticket_number:'')})):[{name:b.passenger_name,ticketNumber:b.ticket_number}],
    references:sourcePnr?[{carrier:first.carrier_code||first.marketing_carrier_code||b.airline_code,pnr:sourcePnr}]:[],
    segments:seg.map(s=>({direction:['return','inbound'].includes(String(s.journey_direction||s.leg||s.direction).toLowerCase())?'inbound':'outbound',carrier:s.carrier_code||s.marketing_carrier_code||s.carrierCode,flight:s.flight_number||s.flightNumber,from:s.origin_airport||s.departure_airport||s.originCode,to:s.destination_airport||s.arrival_airport||s.destinationCode,departureDate:s.departure_date||s.departureDate,arrivalDate:s.arrival_date||s.arrivalDate,departureTime:s.departure_time||s.departure_time_str||s.departureTime,arrivalTime:s.arrival_time||s.arrival_time_str||s.arrivalTime,cabin:s.cabin||s.cabin_class,operatingCarrier:s.operating_carrier_code})),
    payment:{show:Boolean(b.payment_splits?.length),merchants:rows(b.payment_splits).map(s=>({merchant:s.merchant_name||s.merchantName,amount:s.amount,currency:s.currency||b.currency,cardBrand:pm.card_brand,cardLast4:pm.card_last4,status:'pending'}))},
    documentType:'itinerary'
  });
}
export function paymentTotal(d,status){return d.payment.merchants.filter(m=>m.status===status).reduce((a,m)=>a+(cents(m.amount)||0),0);}
export const money=n=>'$'+(n/100).toFixed(2);
