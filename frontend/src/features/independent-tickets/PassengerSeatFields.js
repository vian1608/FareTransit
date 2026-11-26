import React from 'react';
import {seatFlightKey,seatFlightReady,validSeat} from './seatAssignments';
export default function PassengerSeatFields({passenger,index,segments,onSeat}){
 return <div className="it-passenger-seats">
  <strong>Assigned seats (optional)</strong>
  {!segments.length?<p className="it-seat-hint">Add or import flight segments below, then return here to enter this passenger's seats.</p>:<>
   {['outbound','inbound'].map(direction=>{
    const legs=segments.map((s,j)=>({s,j})).filter(({s})=>s.direction===direction);
    if(!legs.length)return null;
    return <div className="it-seat-journey" key={direction}><small>{direction==='outbound'?'OUTBOUND':'INBOUND'}</small><div className="it-seat-fields">{legs.map(({s,j})=>{
     const key=seatFlightKey(s),v=passenger.seats?.find(a=>a.flightKey===key)?.seat||'',ready=seatFlightReady(s)&&segments.filter(x=>seatFlightKey(x)===key).length===1;
     return <label className="it-seat-leg" key={j}><span>{[s.carrier,s.flight].filter(Boolean).join(' ')||'Leg '+(j+1)} <span className="it-seat-route">{s.from||'—'} → {s.to||'—'}</span></span><small>{s.departureDate||'Complete flight details below'}</small><input type="text" aria-label={'Seat for passenger '+(index+1)+', segment '+(j+1)} value={v} maxLength={5} placeholder="e.g. 12A" disabled={!ready||!passenger.name.trim()} aria-invalid={Boolean(v&&!validSeat(v))} onChange={e=>onSeat(index,key,e.target.value.toUpperCase())}/>{!ready&&<small>Complete or distinguish this flight to enter a seat.</small>}</label>;
    })}</div></div>;
   })}
  </>}
  <small className="it-seat-hint">Leave unassigned seats blank. If no seats are entered, nothing about seats appears in the customer's ticket.</small>
 </div>;
}
