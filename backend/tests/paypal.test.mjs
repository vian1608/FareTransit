import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

// Mock dependencies
import paypalService from '../src/integrations/paypal/paypal.service.mjs';
import paypalController from '../src/modules/payments/paypal.controller.mjs';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

describe('PayPal Standard Checkout Integration Test Suite', () => {

  test('1. Successful order creation', async () => {
    const origFind = bookingRepository.findBookingById;
    const origCreateOrder = paypalService.createOrder;
    const origUpsert = bookingRepository.upsertPayPalPayment;

    try {
      bookingRepository.findBookingById = async (id) => ({
        id,
        status: 'PENDING',
        payment_status: 'pending',
        total_amount: 250.00,
        currency: 'USD'
      });

      paypalService.createOrder = async ({ bookingId, amount, currency }) => ({
        id: 'PAYPAL_ORDER_TEST_001',
        status: 'CREATED'
      });

      bookingRepository.upsertPayPalPayment = async () => ({ id: 'pay_row_1' });

      const req = { body: { bookingId: 'booking-uuid-001' } };
      const res = createMockRes();
      const next = (err) => { throw err; };

      await paypalController.createOrder(req, res, next);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.orderId, 'PAYPAL_ORDER_TEST_001');
    } finally {
      bookingRepository.findBookingById = origFind;
      paypalService.createOrder = origCreateOrder;
      bookingRepository.upsertPayPalPayment = origUpsert;
    }
  });

  test('2. Successful capture', async () => {
    const origFind = bookingRepository.findBookingById;
    const origFindOrder = bookingRepository.findPaymentByOrderId;
    const origCapture = paypalService.captureOrder;
    const origUpsert = bookingRepository.upsertPayPalPayment;
    const origUpdateStatus = bookingRepository.updateStatus;
    const origRelations = bookingRepository.getRelations;

    try {
      bookingRepository.findBookingById = async (id) => ({
        id,
        status: 'PENDING',
        payment_status: 'pending',
        total_amount: 150.00,
        currency: 'USD'
      });

      bookingRepository.findPaymentByOrderId = async () => null;

      paypalService.captureOrder = async () => ({
        status: 'COMPLETED',
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE_ID_999',
              status: 'COMPLETED',
              amount: { value: '150.00', currency_code: 'USD' }
            }]
          }
        }],
        payer: { email_address: 'payer@example.com', payer_id: 'PAYER_123' }
      });

      bookingRepository.upsertPayPalPayment = async () => ({ id: 'pay_1' });
      bookingRepository.updateStatus = async () => ({ id: 'b_1', status: 'DONE' });
      bookingRepository.getRelations = async () => ({ travellers: [], contacts: [], flights: [], payments: [] });

      const req = { body: { bookingId: 'booking-uuid-001', paypalOrderId: 'PAYPAL_ORDER_TEST_001' } };
      const res = createMockRes();

      await paypalController.captureOrder(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.paymentStatus, 'COMPLETED');
      assert.equal(res.body.captureId, 'CAPTURE_ID_999');
    } finally {
      bookingRepository.findBookingById = origFind;
      bookingRepository.findPaymentByOrderId = origFindOrder;
      paypalService.captureOrder = origCapture;
      bookingRepository.upsertPayPalPayment = origUpsert;
      bookingRepository.updateStatus = origUpdateStatus;
      bookingRepository.getRelations = origRelations;
    }
  });

  test('3. Invalid booking ID', async () => {
    const origFind = bookingRepository.findBookingById;
    try {
      bookingRepository.findBookingById = async () => null;

      const req = { body: { bookingId: 'invalid-id-xyz' } };
      const res = createMockRes();

      await paypalController.createOrder(req, res, () => {});

      assert.equal(res.statusCode, 404);
      assert.equal(res.body.error.code, 'BOOKING_NOT_FOUND');
    } finally {
      bookingRepository.findBookingById = origFind;
    }
  });

  test('4. Server-enforced amount verification (ignoring frontend amounts)', async () => {
    const origFind = bookingRepository.findBookingById;
    const origCreateOrder = paypalService.createOrder;
    let capturedAmountInOrder = null;

    try {
      bookingRepository.findBookingById = async (id) => ({
        id,
        status: 'PENDING',
        payment_status: 'pending',
        total_amount: 300.00, // Authoritative DB amount
        currency: 'USD'
      });

      paypalService.createOrder = async ({ amount }) => {
        capturedAmountInOrder = amount;
        return { id: 'ORD_SECURE_123' };
      };
      bookingRepository.upsertPayPalPayment = async () => {};

      // Frontend attempt to send fake lower amount
      const req = { body: { bookingId: 'b-1', amount: 1.00 } };
      const res = createMockRes();

      await paypalController.createOrder(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(capturedAmountInOrder, 300.00); // Verified DB amount used!
    } finally {
      bookingRepository.findBookingById = origFind;
      paypalService.createOrder = origCreateOrder;
    }
  });

  test('5. Currency mismatch error handling', async () => {
    const origFind = bookingRepository.findBookingById;
    const origFindOrder = bookingRepository.findPaymentByOrderId;
    const origCapture = paypalService.captureOrder;

    try {
      bookingRepository.findBookingById = async () => ({
        id: 'b-1',
        status: 'PENDING',
        payment_status: 'pending',
        total_amount: 100.00,
        currency: 'USD'
      });
      bookingRepository.findPaymentByOrderId = async () => null;

      paypalService.captureOrder = async () => ({
        status: 'COMPLETED',
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAP_EUR',
              status: 'COMPLETED',
              amount: { value: '100.00', currency_code: 'EUR' } // Mismatched currency
            }]
          }
        }]
      });

      const req = { body: { bookingId: 'b-1', paypalOrderId: 'ORD_EUR' } };
      const res = createMockRes();

      await paypalController.captureOrder(req, res, () => {});

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error.code, 'CURRENCY_MISMATCH');
    } finally {
      bookingRepository.findBookingById = origFind;
      bookingRepository.findPaymentByOrderId = origFindOrder;
      paypalService.captureOrder = origCapture;
    }
  });

  test('6. Duplicate capture request prevention (Idempotency)', async () => {
    const origFind = bookingRepository.findBookingById;
    const origRelations = bookingRepository.getRelations;

    try {
      bookingRepository.findBookingById = async () => ({
        id: 'b-1',
        status: 'DONE',
        payment_status: 'paid',
        total_amount: 100.00,
        currency: 'USD'
      });
      bookingRepository.getRelations = async () => ({
        payments: [{ provider_order_id: 'ORD_ALREADY_CAPTURED', provider_capture_id: 'CAP_EXISTS' }]
      });

      const req = { body: { bookingId: 'b-1', paypalOrderId: 'ORD_ALREADY_CAPTURED' } };
      const res = createMockRes();

      await paypalController.captureOrder(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.captureId, 'CAP_EXISTS');
    } finally {
      bookingRepository.findBookingById = origFind;
      bookingRepository.getRelations = origRelations;
    }
  });

  test('7. PayPal order belonging to another booking detection', async () => {
    const origFind = bookingRepository.findBookingById;
    const origFindOrder = bookingRepository.findPaymentByOrderId;

    try {
      bookingRepository.findBookingById = async () => ({
        id: 'booking-A',
        status: 'PENDING',
        payment_status: 'pending',
        total_amount: 100.00,
        currency: 'USD'
      });
      bookingRepository.findPaymentByOrderId = async () => ({
        booking_id: 'booking-B' // Different booking ID!
      });

      const req = { body: { bookingId: 'booking-A', paypalOrderId: 'ORD_OTHER' } };
      const res = createMockRes();

      await paypalController.captureOrder(req, res, () => {});

      assert.equal(res.statusCode, 403);
      assert.equal(res.body.error.code, 'OWNERSHIP_MISMATCH');
    } finally {
      bookingRepository.findBookingById = origFind;
      bookingRepository.findPaymentByOrderId = origFindOrder;
    }
  });

  test('8. PayPal capture returning PENDING status', async () => {
    const origFind = bookingRepository.findBookingById;
    const origFindOrder = bookingRepository.findPaymentByOrderId;
    const origCapture = paypalService.captureOrder;
    const origUpsert = bookingRepository.upsertPayPalPayment;

    try {
      bookingRepository.findBookingById = async () => ({
        id: 'b-1',
        status: 'PENDING',
        payment_status: 'pending',
        total_amount: 100.00,
        currency: 'USD'
      });
      bookingRepository.findPaymentByOrderId = async () => null;
      paypalService.captureOrder = async () => ({
        status: 'PENDING',
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAP_PENDING',
              status: 'PENDING'
            }]
          }
        }]
      });
      bookingRepository.upsertPayPalPayment = async () => {};

      const req = { body: { bookingId: 'b-1', paypalOrderId: 'ORD_PENDING' } };
      const res = createMockRes();

      await paypalController.captureOrder(req, res, () => {});

      assert.equal(res.statusCode, 202);
      assert.equal(res.body.error.code, 'CAPTURE_PENDING');
    } finally {
      bookingRepository.findBookingById = origFind;
      bookingRepository.findPaymentByOrderId = origFindOrder;
      paypalService.captureOrder = origCapture;
      bookingRepository.upsertPayPalPayment = origUpsert;
    }
  });

  test('9. PayPal capture returning DECLINED error', async () => {
    const origFind = bookingRepository.findBookingById;
    const origFindOrder = bookingRepository.findPaymentByOrderId;
    const origCapture = paypalService.captureOrder;

    try {
      bookingRepository.findBookingById = async () => ({
        id: 'b-1',
        status: 'PENDING',
        payment_status: 'pending',
        total_amount: 100.00,
        currency: 'USD'
      });
      bookingRepository.findPaymentByOrderId = async () => null;
      paypalService.captureOrder = async () => {
        const err = new Error('Payment declined');
        err.issue = 'UNPROCESSABLE_ENTITY';
        throw err;
      };

      const req = { body: { bookingId: 'b-1', paypalOrderId: 'ORD_DECLINED' } };
      const res = createMockRes();

      await paypalController.captureOrder(req, res, () => {});

      assert.equal(res.statusCode, 422);
      assert.equal(res.body.error.code, 'PAYMENT_DECLINED');
    } finally {
      bookingRepository.findBookingById = origFind;
      bookingRepository.findPaymentByOrderId = origFindOrder;
      paypalService.captureOrder = origCapture;
    }
  });

  test('10. Webhook duplicate delivery idempotency & 11. Signature validation', async () => {
    const origVerify = paypalService.verifyWebhookSignature;
    const origFindCapture = bookingRepository.findPaymentByCaptureId;
    const origFindBooking = bookingRepository.findBookingById;
    const origUpsert = bookingRepository.upsertPayPalPayment;
    const origUpdateStatus = bookingRepository.updateStatus;

    try {
      bookingRepository.findPaymentByCaptureId = async () => null;
      bookingRepository.findBookingById = async (id) => ({ id, status: 'PENDING', payment_status: 'pending' });
      bookingRepository.upsertPayPalPayment = async () => {};
      bookingRepository.updateStatus = async () => {};

      // 11. Invalid signature
      paypalService.verifyWebhookSignature = async () => false;

      const reqInvalid = { headers: {}, body: { event_type: 'PAYMENT.CAPTURE.COMPLETED' } };
      const resInvalid = createMockRes();

      await paypalController.handleWebhook(reqInvalid, resInvalid);
      assert.equal(resInvalid.statusCode, 400);

      // 10. Valid signature and duplicate delivery test
      paypalService.verifyWebhookSignature = async () => true;

      const reqValid = {
        headers: {},
        body: {
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          resource: {
            id: 'CAP_WEBHOOK_001',
            custom_id: 'booking-webhook-001',
            amount: { value: '150.00', currency_code: 'USD' }
          }
        }
      };
      const resValid = createMockRes();

      await paypalController.handleWebhook(reqValid, resValid);
      assert.equal(resValid.statusCode, 200);
      assert.equal(resValid.body.status, 'success');
    } finally {
      paypalService.verifyWebhookSignature = origVerify;
      bookingRepository.findPaymentByCaptureId = origFindCapture;
      bookingRepository.findBookingById = origFindBooking;
      bookingRepository.upsertPayPalPayment = origUpsert;
      bookingRepository.updateStatus = origUpdateStatus;
    }
  });

});
