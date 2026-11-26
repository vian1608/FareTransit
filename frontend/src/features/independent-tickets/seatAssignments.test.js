import {seatFlightKey,reconcileSeats,setPassengerSeat} from './seatAssignments';
test('seats follow stable flight identity and are removed if a flight changes',()=>{
 const a={direction:'outbound',carrier:'UA',flight:'123',from:'EWR',to:'SFO',departureDate:'2027-01-01',departureTime:'10:00'};
 const b={...a,flight:'456'};
 let d=setPassengerSeat({passengers:[{name:'A'},{name:'B'}],segments:[a,b]},0,seatFlightKey(a),'12a');
 expect(reconcileSeats({...d,segments:[b,a]}).passengers[0].seats[0].seat).toBe('12A');
 expect(reconcileSeats({...d,segments:[b]}).passengers[0].seats).toEqual([]);
 expect(d.passengers[1].seats).toBeUndefined();
});
