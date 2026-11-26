// Stable flight identity, not array position. Reordering does not reassign seats.
export function seatFlightKey(s){
 const upper=(v,n)=>String(v??'').trim().slice(0,n).toUpperCase();
 const text=(v,n)=>String(v??'').trim().slice(0,n);
 return JSON.stringify([s.direction==='inbound'?'inbound':'outbound',upper(s.carrier,3),upper(s.flight,8),upper(s.from,3),upper(s.to,3),text(s.departureDate,10),text(s.departureTime,5),upper(s.operatingCarrier,3)]);
}
export function seatFlightReady(s){
 return /^[A-Z0-9]{2,3}$/.test(String(s.carrier||'').trim().toUpperCase())&&/^\d{1,4}[A-Z]?$/.test(String(s.flight||'').trim().toUpperCase())&&/^[A-Z]{3}$/.test(String(s.from||'').trim().toUpperCase())&&/^[A-Z]{3}$/.test(String(s.to||'').trim().toUpperCase())&&/^\d{4}-\d{2}-\d{2}$/.test(s.departureDate||'')&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.departureTime||'');
}
export const validSeat=s=>/^[1-9]\d{0,2}[A-Z]$/.test(String(s||'').trim().toUpperCase());

export function normalizePassengerSeats(p,enabled){
 if(!enabled||!Array.isArray(p.seats))return [];
 return p.seats.slice(0,60).filter(s=>s&&typeof s.seat==='string'&&s.seat.trim()).map(s=>({flightKey:String(s.flightKey??'').slice(0,180),seat:s.seat.trim().toUpperCase().slice(0,20)})).sort((a,b)=>a.flightKey.localeCompare(b.flightKey)||a.seat.localeCompare(b.seat));
}
export function passengerSeatGroups(d,p){
 if(d.seatAssignmentsEnabled!==true||!Array.isArray(p.seats)||!p.seats.length)return [];
 return ['outbound','inbound'].map(direction=>({direction,legs:d.segments.filter(s=>s.direction===direction).flatMap(s=>{
  const key=seatFlightKey(s);const matches=p.seats.filter(a=>a.flightKey===key);
  if(!seatFlightReady(s)||d.segments.filter(x=>seatFlightKey(x)===key).length!==1||matches.length!==1||!validSeat(matches[0].seat))return [];
  return [{flight:s.carrier+' '+s.flight,route:s.from+' - '+s.to,date:s.departureDate,seat:matches[0].seat}];
 })})).filter(g=>g.legs.length);
}
export function seatErrors(d){
 if(d.seatAssignmentsEnabled!==true)return [];
 const errors=[],used=new Map();
 for(const [i,p] of d.passengers.entries()){
  const assigned=new Set();
  for(const a of p.seats||[]){
   const segments=d.segments.filter(s=>seatFlightKey(s)===a.flightKey);
   if(segments.length!==1||!seatFlightReady(segments[0])){errors.push('Passenger '+(i+1)+': seat is linked to a missing or ambiguous flight; verify the assignment.');continue;}
   if(!validSeat(a.seat)){errors.push('Passenger '+(i+1)+': use an assigned seat such as 12A.');continue;}
   if(assigned.has(a.flightKey))errors.push('Passenger '+(i+1)+': multiple seats entered for the same flight.');
   assigned.add(a.flightKey);
   const key=a.flightKey+'|'+a.seat;
   if(used.has(key)&&used.get(key)!==i)errors.push('Duplicate seat '+a.seat+' on '+segments[0].carrier+' '+segments[0].flight+' for passengers '+(used.get(key)+1)+' and '+(i+1)+'.');
   used.set(key,i);
  }
 }
 return errors;
}
