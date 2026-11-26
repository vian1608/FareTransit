/** @jest-environment node */
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PassengerSeatFields from './PassengerSeatFields';
import {seatFlightKey,reconcileSeats,setPassengerSeat} from './seatAssignments';
test('seats follow stable flight identity and are removed if a flight changes',()=>{
 const a={direction:'outbound',carrier:'UA',flight:'123',from:'EWR',to:'SFO',departureDate:'2027-01-01',departureTime:'10:00'};
 const b={...a,flight:'456'};
 let d=setPassengerSeat({passengers:[{name:'A'},{name:'B'}],segments:[a,b]},0,seatFlightKey(a),'12a');
 expect(reconcileSeats({...d,segments:[b,a]}).passengers[0].seats[0].seat).toBe('12A');
 expect(reconcileSeats({...d,segments:[b]}).passengers[0].seats).toEqual([]);
 expect(d.passengers[1].seats).toBeUndefined();
});

test('seat fields are visible for a blank passenger seat record without enabling a toggle',()=>{
 const segments=[{direction:'outbound',carrier:'UA',flight:'4477',from:'XNA',to:'IAH',departureDate:'2027-01-01',departureTime:'06:30'},{direction:'inbound',carrier:'UA',flight:'1048',from:'DEN',to:'XNA',departureDate:'2027-01-04',departureTime:'20:40'}];
 const html=renderToStaticMarkup(<PassengerSeatFields passenger={{name:'Sample Traveler'}} index={0} segments={segments} onSeat={()=>{}}/>);
 expect(html).toContain('Assigned seats (optional)');
 expect(html).toContain('Seat for passenger 1, segment 1');
 expect(html).toContain('Seat for passenger 1, segment 2');
 expect(html).not.toContain('disabled=""');
 expect(html.match(/placeholder="e.g. 12A"/g)).toHaveLength(2);
});
test('entering a seat enables document display automatically, clearing the last seat hides it',()=>{
 const leg={direction:'outbound',carrier:'UA',flight:'123',from:'EWR',to:'SFO',departureDate:'2027-01-01',departureTime:'10:00'};
 const draft={passengers:[{name:'A'},{name:'B'}],segments:[leg]};
 const initial=reconcileSeats(draft);expect(initial.seatAssignmentsEnabled).toBe(false);
 const assigned=setPassengerSeat(initial,0,seatFlightKey(leg),'12a');
 expect(assigned.seatAssignmentsEnabled).toBe(true);
 expect(assigned.passengers[0].seats[0].seat).toBe('12A');
 expect(setPassengerSeat(assigned,0,seatFlightKey(leg),'').seatAssignmentsEnabled).toBe(false);
 expect(reconcileSeats({...assigned,segments:[]}).seatAssignmentsEnabled).toBe(false);
});
