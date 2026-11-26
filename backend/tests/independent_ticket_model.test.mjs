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

test('multiple ticket recipients deduplicate while preserving legacy primary key',async()=>{
 const {recipientEntries,archivePathForJob}=await import('../src/modules/independent-tickets/ticket.recipients.mjs');
 const group='a'.repeat(64),primary='traveler@example.test';
 const entries=recipientEntries(primary,['TRAVELER@example.test','other@example.test',' OTHER@example.test '],group,{includePrimary:true});
 assert.equal(entries.length,2);assert.equal(entries[0].key,group);assert.notEqual(entries[1].key,group);
 assert.deepEqual(recipientEntries(primary,['other@example.test'],group),[entries[1]]);
 assert.throws(()=>recipientEntries(primary,['invalid'],group));
 assert.throws(()=>recipientEntries(primary,Array(5).fill(primary),group,{includePrimary:true}));
 assert.deepEqual(archivePathForJob({id:'old',payload:{group_key:group}}),{path:group+'.pdf',existingOnly:false});
 const original='00000000-0000-0000-0000-000000000001.pdf';
 assert.deepEqual(archivePathForJob({id:'new',payload:{archive_path:original,group_key:group}}),{path:original,existingOnly:true});
 assert.throws(()=>archivePathForJob({id:'new',payload:{archive_path:'../private.pdf'}}));
});

test('optional seats belong to a passenger and stable flight, never display empty placeholders',async()=>{
 const {seatFlightKey}=await import('../src/modules/independent-tickets/ticket.seats.mjs');
 const {ticketText}=await import('../src/modules/independent-tickets/ticket.renderer.mjs');
 const first={direction:'outbound',carrier:'UA',flight:'123',from:'EWR',to:'SFO',departureDate:'2027-01-01',arrivalDate:'2027-01-01',departureTime:'10:00',arrivalTime:'13:00'};
 const second={...first,direction:'inbound',flight:'124',from:'SFO',to:'EWR',departureDate:'2027-01-03',arrivalDate:'2027-01-03'};
 const input={customer:{email:'sample@example.test'},passengers:[{name:'Sample A',seats:[{flightKey:seatFlightKey(first),seat:'12a'}]},{name:'Sample B'}],segments:[first,second]};
 const off=normalizeTicket(input);assert.doesNotMatch(renderTicket(off),/Assigned seats/);assert.doesNotMatch(ticketText(off),/Assigned seat/);
 const empty=normalizeTicket({...input,seatAssignmentsEnabled:true,passengers:[{name:'Sample B'}]});assert.doesNotMatch(renderTicket(empty),/Assigned seats/);
 const on=normalizeTicket({...input,seatAssignmentsEnabled:true});assert.deepEqual(validateTicket(on),[]);
 const html=renderTicket(on);assert.equal((html.match(/Assigned seats/g)||[]).length,1);assert.match(html,/12A/);assert.doesNotMatch(html,/Not assigned/);
 assert.match(ticketText(on),/Assigned seat \(outbound\): UA 123.*12A/);
 const reordered=normalizeTicket({...input,seatAssignmentsEnabled:true,segments:[second,first]});assert.match(ticketText(reordered),/Assigned seat \(outbound\): UA 123.*12A/);
 const duplicate=normalizeTicket({...input,seatAssignmentsEnabled:true,passengers:[input.passengers[0],{name:'Sample B',seats:input.passengers[0].seats}]});
 assert.ok(validateTicket(duplicate).some(e=>e.includes('Duplicate seat 12A')));
 const changed=normalizeTicket({...input,seatAssignmentsEnabled:true,segments:[{...first,flight:'999'},second]});assert.ok(validateTicket(changed).some(e=>e.includes('missing or ambiguous flight')));
 const {generateTicketPdf}=await import('../src/modules/independent-tickets/ticket.pdf.mjs');const pdf=await generateTicketPdf(on,{draft:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
});
test('field-specific validation identifies arrival and ticket number errors',()=>{
 const d=normalizeTicket({customer:{email:'sample@example.test'},documentType:'ticket',passengers:[{name:'Sample Passenger',ticketNumber:'00000000000000'}],references:[{carrier:'UA',pnr:'ABC123'}],segments:[{carrier:'UA',flight:'123',from:'EWR',to:'SFO',departureDate:'2027-01-01',departureTime:'10:00',arrivalTime:'13:00'}]});
 const errors=validateTicket(d);assert.ok(errors.some(e=>e.includes('Segment 1')&&e.includes('arrival date')));assert.ok(errors.some(e=>e.includes('14 digits')&&e.includes('13 digits')));
 d.segments[0].arrivalDate='2027-01-01';d.passengers[0].ticketNumber='000-0000000000';assert.deepEqual(validateTicket(d),[]);
});

test('PDF footer never creates blank overflow pages; single leg fits one page',async()=>{
 const {generateTicketPdf}=await import('../src/modules/independent-tickets/ticket.pdf.mjs');
 const d=normalizeTicket({customer:{email:'sample@example.test'},passengers:[{name:'Sample Traveler'}],segments:[{carrier:'UA',flight:'123',from:'EWR',to:'SFO',departureDate:'2027-01-01',arrivalDate:'2027-01-01',departureTime:'10:00',arrivalTime:'13:00'}]});
 const pdf=await generateTicketPdf(d);
 const pages=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
 assert.equal(pages,1);
});
test('four-leg round trip with seats, payment and notes fits at most three pages',async()=>{
 const {generateTicketPdf}=await import('../src/modules/independent-tickets/ticket.pdf.mjs');
 const {seatFlightKey}=await import('../src/modules/independent-tickets/ticket.seats.mjs');
 const leg=(direction,flight,from,to,date,departureTime,arrivalTime)=>({direction,carrier:'UA',flight,from,to,departureDate:date,arrivalDate:date,departureTime,arrivalTime,baggage:'1 carry-on'});
 const segments=[leg('outbound','4477','XNA','IAH','2027-01-01','06:30','08:28'),leg('outbound','1512','IAH','LIR','2027-01-01','09:35','13:10'),leg('inbound','1918','LIR','DEN','2027-01-04','13:00','17:31'),leg('inbound','1048','DEN','XNA','2027-01-04','20:40','23:29')];
 const d=normalizeTicket({customer:{email:'sample@example.test'},documentType:'ticket',seatAssignmentsEnabled:true,passengers:[{name:'Sample Traveler',ticketNumber:'0160000000000',seats:segments.map((s,i)=>({flightKey:seatFlightKey(s),seat:['12A','14C','18F','10B'][i]}))}],references:[{carrier:'UA',pnr:'ABC123'}],segments,payment:{show:true,merchants:[{merchant:'FareTransit',amount:'902.00',cardBrand:'AMEX',cardLast4:'1111',status:'charged'},{merchant:'FareTransit',amount:'335.61',cardBrand:'AMEX',cardLast4:'2222',status:'charged'}]},notes:'Seat selection has been offered.'});
 const pdf=await generateTicketPdf(d,{reference:'FT-ET-SAMPLE'});
 const pages=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
 assert.ok(pages>=2&&pages<=3,'Expected 2–3 content pages, got '+pages);
});

test('email subject uses airline and PNR, not internal FareTransit reference',async()=>{
 const {ticketSubject,deliverySubject}=await import('../src/modules/independent-tickets/ticket.subject.mjs');
 const snapshot=normalizeTicket({references:[{carrier:'UA',pnr:'ABC123'}],segments:[{carrier:'UA'}]});
 assert.equal(ticketSubject(snapshot),'E-Ticket — United Airlines · ABC123');
 assert.equal(ticketSubject(normalizeTicket({segments:[{carrier:'UA'}]})),'E-Ticket — United Airlines');
 assert.equal(ticketSubject(normalizeTicket({segments:[{carrier:'UA'},{carrier:'AA'}],references:[{carrier:'UA',pnr:'ABC123'}]})),'E-Ticket — United Airlines +1 · ABC123');
 assert.equal(ticketSubject(normalizeTicket({})),'E-Ticket');
 const old={subject:'FareTransit — Flight itinerary · FT-ET-OLD',snapshot};
 assert.equal(deliverySubject(old),old.subject);
 assert.equal(deliverySubject({...old,source_delivery_id:'original'}),ticketSubject(snapshot));
});

test('PDF header shows airline PNR without displaying the internal document reference',async()=>{
 const {pdfConfirmationLine}=await import('../src/modules/independent-tickets/ticket.pdf.mjs');
 assert.equal(pdfConfirmationLine(normalizeTicket({references:[{carrier:'UA',pnr:'ABC123'}]})),'Airline confirmation: ABC123');
 assert.equal(pdfConfirmationLine(normalizeTicket({references:[{carrier:'UA',pnr:'ABC123'},{carrier:'AA',pnr:'DEF456'}]})),'Airline confirmations: see confirmation details below');
 assert.equal(pdfConfirmationLine(normalizeTicket({})),'');
});

test('email and PDF share the compact title and airline confirmation; header logos have no visible airline name',async()=>{
 const {ticketTitle,ticketConfirmationLine}=await import('../src/modules/independent-tickets/ticket.header.mjs');
 const {ticketText}=await import('../src/modules/independent-tickets/ticket.renderer.mjs');
 const d=normalizeTicket({documentType:'ticket',references:[{carrier:'UA',pnr:'ABC123'}],segments:[{carrier:'UA'}]});
 const html=renderTicket(d),header=html.slice(0,html.indexOf('Passenger details'));
 assert.equal(ticketTitle(d),'E-Ticket & Itinerary');
 assert.match(header,/E-Ticket &amp; Itinerary/);
 assert.match(header,/Airline confirmation: ABC123/);
 assert.match(header,/border-radius:10px/);
 assert.match(header,/\/assets\/airlines\/ua\.png/);
 assert.doesNotMatch(header,/>United Airlines</);
 assert.doesNotMatch(header,/E-ticket receipt|FareTransit document reference/);
 assert.match(ticketText(d),/FareTransit — E-Ticket & Itinerary/);
 assert.equal(ticketTitle(normalizeTicket({})),'Flight Itinerary');
 assert.equal(ticketConfirmationLine(normalizeTicket({})),'');
 assert.doesNotMatch(renderTicket(normalizeTicket({})),/Airline confirmation:/);
});

test('customer support number appears in HTML, plain text and PDF footer',async()=>{
 const {ticketText}=await import('../src/modules/independent-tickets/ticket.renderer.mjs');
 const {generateTicketPdf}=await import('../src/modules/independent-tickets/ticket.pdf.mjs');
 const d=normalizeTicket({customer:{email:'sample@example.test'},passengers:[{name:'Sample Traveler'}],segments:[{carrier:'UA',flight:'123',from:'EWR',to:'SFO',departureDate:'2027-01-01',arrivalDate:'2027-01-01',departureTime:'10:00',arrivalTime:'13:00'}]});
 const html=renderTicket(d),footer=html.slice(html.indexOf('Prepared by FareTransit LLC'));
 assert.match(footer,/href="tel:\+18887808855">\+1 \(888\) 780-8855<\/a>/);
 assert.match(ticketText(d),/\+1 \(888\) 780-8855/);
 const pdf=await generateTicketPdf(d);const raw=pdf.toString('latin1');
 assert.match(raw,/tel:\+18887808855/);
 assert.equal((raw.match(/\/Type\s*\/Page\b/g)||[]).length,1);
});
