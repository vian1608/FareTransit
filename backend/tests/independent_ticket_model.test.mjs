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

test('passenger and airline confirmation cards preserve original identifiers and omit absent ticket numbers',()=>{
 const html=renderTicket(normalizeTicket({passengers:[{name:'Sample & Traveler',ticketNumber:'0160000000000'},{name:'Second Traveler'}],references:[{carrier:'UA',pnr:'ABC123'}]}));
 assert.match(html,/PASSENGER 01/);assert.match(html,/PASSENGER 02/);
 assert.match(html,/Sample &amp; Traveler/);assert.match(html,/0160000000000/);
 assert.equal((html.match(/E-TICKET NUMBER/g)||[]).length,1);
 assert.match(html,/CONFIRMATION CODE \(PNR\)/);assert.match(html,/ABC123/);
 assert.match(html,/\/assets\/airlines\/ua\.png/);
});

test('payment presentation retains separate merchant transactions and status-specific totals',()=>{
 const d=normalizeTicket({payment:{show:true,merchants:[{merchant:'FareTransit',amount:'902.00',cardBrand:'AMEX',cardLast4:'1111',status:'charged'},{merchant:'FareTransit',amount:'335.61',cardBrand:'AMEX',cardLast4:'2222',status:'charged'},{merchant:'Airline',amount:'25.00',status:'authorized'}]},notes:'Seat selection offered.'});
 const html=renderTicket(d);
 assert.match(html,/\$1,237\.61/);assert.match(html,/\$902\.00/);assert.match(html,/\$335\.61/);
 assert.match(html,/AMEX ending in 1111/);assert.match(html,/AMEX ending in 2222/);
 assert.match(html,/Total charged/);assert.match(html,/Total authorized/);
 assert.match(html,/Seat selection offered\./);assert.match(html,/mailto:support@faretransit\.com/);
 assert.doesNotMatch(renderTicket(normalizeTicket({})),/Payment & merchant charges/);
 assert.match(renderTicket(normalizeTicket({payment:{show:true,merchants:[{merchant:'Sample',amount:'',status:'pending'}]}})),/Amount to be confirmed/);
});

test('independent ticket generates a real PDF without sending email',async()=>{
 const {generateTicketPdf}=await import('../src/modules/independent-tickets/ticket.pdf.mjs');
 const d=normalizeTicket({customer:{email:'sample@example.test'},passengers:[{name:'Sample Traveler',ticketNumber:'0160000000000'}],references:[{carrier:'UA',pnr:'ABC123'}],segments:[{carrier:'UA',flight:'123',from:'EWR',to:'SFO',departureDate:'2027-01-01',arrivalDate:'2027-01-01',departureTime:'10:00',arrivalTime:'13:00',baggage:'1 carry-on · 2 checked bags'}],payment:{show:true,merchants:[{merchant:'Sample Merchant',amount:'123.45',status:'charged',cardLast4:'1111'}]},notes:'Sample only.',documentType:'ticket'});
 const pdf=await generateTicketPdf(d,{reference:'FT-ET-TEST',createdAt:'2026-11-26T00:00:00Z',draft:true});
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>1000&&pdf.length<5*1024*1024);
});
