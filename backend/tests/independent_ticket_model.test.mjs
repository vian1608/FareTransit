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
