import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTicket,validateTicket,cents,paymentTotal} from '../src/modules/independent-tickets/ticket.model.mjs';
import {renderTicket} from '../src/modules/independent-tickets/ticket.renderer.mjs';
test('merchant cents are exact and card secrets are not retained',()=>{
 const d=normalizeTicket({payment:{show:true,merchants:[{merchant:'FareTransit',amount:'79.99',cardLast4:'1234',cardNumber:'1234567890123456',cvv:'123',status:'charged'},{merchant:'Airline',amount:'450.00',status:'charged'}]}});
 assert.equal(paymentTotal(d,'charged'),52999); assert.equal(cents('1.001'),null); assert.ok(!JSON.stringify(d).includes('1234567890123456')); assert.ok(!JSON.stringify(d).includes('cvv'));
});
test('notes are conditional and HTML escaped',()=>{
 assert.doesNotMatch(renderTicket(normalizeTicket({})),/Special notes/);
 assert.match(renderTicket(normalizeTicket({notes:'<script>alert(1)</script>'})),/&lt;script&gt;/);
});
test('incomplete ticket cannot be sent',()=>assert.ok(validateTicket(normalizeTicket({documentType:'ticket'}),{sending:true}).length>0));

test('validation identifies missing arrival date and incorrect ticket length',()=>{
 const d=normalizeTicket({customer:{email:'sample@example.test'},documentType:'ticket',passengers:[{name:'Sample Passenger',ticketNumber:'00000000000000'}],references:[{carrier:'UA',pnr:'ABC123'}],segments:[{carrier:'UA',flight:'123',from:'EWR',to:'SFO',departureDate:'2027-01-01',departureTime:'10:00',arrivalTime:'13:00'}]});
 const errors=validateTicket(d);
 assert.ok(errors.some(e=>e.includes('Segment 1')&&e.includes('arrival date')));
 assert.ok(errors.some(e=>e.includes('14 digits')&&e.includes('13 digits')));
 d.segments[0].arrivalDate='2027-01-01';d.passengers[0].ticketNumber='000-0000000000';
 assert.deepEqual(validateTicket(d),[]);
});
