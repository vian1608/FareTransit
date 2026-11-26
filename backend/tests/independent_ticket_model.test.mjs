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

test('ticket header omits travel agency subtitle while retaining agency attribution',()=>{
 const html=renderTicket(normalizeTicket({}));
 assert.doesNotMatch(html,/<small>Travel agency<\/small>/i);
 assert.match(html,/Prepared by FareTransit LLC/);
});

test('flight presentation formats local dates and calculates known-zone durations and connections',async()=>{
 const {flightDisplay,connectionDisplay}=await import('../src/modules/independent-tickets/ticket.flight-display.mjs');
 const first={from:'XNA',to:'IAH',departureDate:'2026-11-26',arrivalDate:'2026-11-26',departureTime:'06:30',arrivalTime:'08:28'};
 const second={from:'IAH',to:'LIR',departureDate:'2026-11-26',arrivalDate:'2026-11-26',departureTime:'09:35',arrivalTime:'13:10'};
 assert.equal(flightDisplay(first).departureTime,'6:30 AM');
 assert.equal(flightDisplay(first).duration,'1h 58m');
 assert.equal(connectionDisplay(first,second).duration,'1h 7m');
 assert.equal(flightDisplay(second).duration,'3h 35m');
 assert.equal(flightDisplay({...first,from:'ZZZ'}).duration,'');
 assert.equal(flightDisplay({...first,arrivalDate:''}).duration,'');
 assert.equal(flightDisplay({...first,arrivalDate:'2026-11-27'}).dayShift,'+1 day');
 const html=renderTicket(normalizeTicket({segments:[{...first,carrier:'UA',flight:'4477'},{...second,carrier:'UA',flight:'1512'}]}));
 assert.match(html,/6:30 AM/);assert.match(html,/1h 7m layover/);assert.match(html,/Guanacaste Airport/);
});
