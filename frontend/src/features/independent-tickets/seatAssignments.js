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

// Clear only assignments whose flight no longer exists. Identical re-import/reorder retains assignments.
export function reconcileSeats(d){
 const keys=d.segments.map(seatFlightKey);
 return {...d,passengers:d.passengers.map(p=>p.seats?{...p,seats:p.seats.filter(a=>keys.filter(k=>k===a.flightKey).length===1)}:p)};
}
export function setPassengerSeat(d,index,flightKey,seat){
 return {...d,passengers:d.passengers.map((p,i)=>i===index?{...p,seats:[...(p.seats||[]).filter(a=>a.flightKey!==flightKey),...(seat.trim()?[{flightKey,seat:seat.toUpperCase()}]:[])]}:p)};
}
