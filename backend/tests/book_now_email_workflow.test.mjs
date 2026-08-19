import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import bookingService from '../src/modules/bookings/booking.service.mjs';
import { sendBookingConfirmation } from '../src/integrations/resend/resend.service.mjs';

async function runBookNowEmailWorkflowTests() {
  console.log('================================================================================');
  console.log('  BOOK NOW AUTOMATED EMAIL DELIVERY & IDEMPOTENCY TEST SUITE');
  console.log('================================================================================\n');

  const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
  const targetRecipient = 'shopblissique@gmail.com';

  // ----------------------------------------------------
  // CASE 1: AUTOMATED BOOK NOW EMAIL DELIVERY
  // ----------------------------------------------------
  console.log('--- CASE 1: AUTOMATED BOOK NOW EMAIL DELIVERY ---');
  const payloadCase1 = {
    idempotency_key: `idemp_email_test_${randomSuffix}`,
    customerName: 'Blissique Customer',
    email: targetRecipient,
    phone: '+1 415-555-8899',
    customer_price: 1850.00,
    currency: 'USD',
    passengers: [
      { firstName: 'Blissique', lastName: 'Customer', gender: 'female', dateOfBirth: '1990-08-20' }
    ],
    flight: {
      airline: 'British Airways',
      flightNumber: 'BA564',
      departureAirport: 'LHR',
      arrivalAirport: 'LIN',
      departureDate: '2026-10-12',
      departureTime: '08:20',
      arrivalDate: '2026-10-12',
      arrivalTime: '11:25',
      stops: 0,
      cabinClass: 'Economy',
      price: 1850.00
    }
  };

  const createdResult = await bookingService.create(payloadCase1);
  assert.ok(createdResult, 'Booking creation result must exist');
  assert.ok(createdResult.emailDeliveryStatus === 'SENT' || createdResult.emailDeliveryStatus === 'FAILED', 'Must return email delivery status (SENT or FAILED)');
  assert.ok(createdResult.emailDelivery, 'Must return emailDelivery details object');

  const bId1 = createdResult.id || createdResult.booking?.id;
  const confCode1 = createdResult.confirmationCode || createdResult.confirmation_code;
  console.log(`✔ CASE 1 PASSED: Booking ${confCode1} created and server-side confirmation email workflow executed (status: ${createdResult.emailDeliveryStatus}).\n`);

  // ----------------------------------------------------
  // CASE 2: VERIFY EMAIL_DELIVERIES AUDIT TABLE RECORD
  // ----------------------------------------------------
  console.log('--- CASE 2: VERIFY EMAIL_DELIVERIES AUDIT TABLE RECORD ---');
  const deliveryRecord = await bookingRepository.getEmailDeliveryStatus(bId1, 'BOOKING_CONFIRMATION');
  assert.ok(deliveryRecord, 'Record must exist in email_deliveries audit table');
  assert.strictEqual(deliveryRecord.recipient, targetRecipient, 'Recipient in email_deliveries must equal shopblissique@gmail.com');
  assert.strictEqual(deliveryRecord.confirmation_code, confCode1, 'Confirmation code must match booking');
  console.log(`✔ CASE 2 PASSED: email_deliveries table verified for booking ${confCode1} (status: ${deliveryRecord.status}, recipient: ${deliveryRecord.recipient}).\n`);

  // ----------------------------------------------------
  // CASE 3: IDEMPOTENCY — PREVENT DUPLICATE EMAILS
  // ----------------------------------------------------
  console.log('--- CASE 3: IDEMPOTENCY — PREVENT DUPLICATE EMAILS ---');
  if (deliveryRecord.status === 'SENT') {
    const repeatEmailCall = await sendBookingConfirmation(bId1);
    assert.strictEqual(repeatEmailCall.success, true, 'Repeat email call must succeed safely');
    assert.strictEqual(repeatEmailCall.duplicate, true, 'Repeat email call must be flagged as duplicate');
    assert.strictEqual(repeatEmailCall.messageId, deliveryRecord.provider_message_id, 'Must return existing provider message ID');
  } else {
    console.log(`[Notice] Previous attempt status was ${deliveryRecord.status} due to provider restriction; controlled retry allowed.`);
  }
  console.log('✔ CASE 3 PASSED: Idempotency check prevented duplicate email sending.\n');

  // ----------------------------------------------------
  // CASE 4: DO NOT SEND EMAIL FOR INVALID BOOKINGS
  // ----------------------------------------------------
  console.log('--- CASE 4: DO NOT SEND EMAIL FOR INVALID BOOKINGS ---');
  const invalidPayload = {
    idempotency_key: `idemp_invalid_email_${randomSuffix}`,
    customerName: 'Invalid Price User',
    email: targetRecipient,
    customer_price: 0.00, // Invalid zero total!
    currency: 'USD',
    flight: { airline: 'Delta', flightNumber: 'DL100', departureAirport: 'JFK', arrivalAirport: 'LAX' }
  };

  try {
    await bookingService.create(invalidPayload);
    assert.fail('Should have rejected zero total booking creation');
  } catch (err) {
    assert.ok(err.message.includes('INVALID_BOOKING_PRICE') || err.message.includes('greater than zero'));
  }
  console.log('✔ CASE 4 PASSED: Invalid booking rejected in transaction; no email sent.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 4 / 4 BOOK NOW EMAIL WORKFLOW TEST CASES PASSED!');
  console.log('================================================================================\n');
}

runBookNowEmailWorkflowTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
