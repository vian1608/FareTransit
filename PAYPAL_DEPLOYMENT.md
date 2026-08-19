# PayPal Standard Checkout Integration & Deployment Guide

This guide details the deployment instructions, environment variable configuration, database migration steps, sandbox testing procedures, and live production checklist for PayPal Standard Checkout in **FareTransit**.

---

## 1. Summary of Files Changed & Created

### Backend Changes:
- **`backend/src/integrations/paypal/paypal.service.mjs`** *(NEW)*: Reusable PayPal API integration service. Implements `generatePayPalAccessToken`, `createOrder`, `captureOrder`, and `verifyWebhookSignature`.
- **`backend/src/modules/payments/paypal.controller.mjs`** *(NEW)*: Controller handling `/api/paypal/create-order`, `/api/paypal/capture-order`, and `/api/webhooks/paypal`.
- **`backend/src/modules/payments/payment.routes.mjs`** *(MODIFIED)*: Added `/paypal/create-order` and `/paypal/capture-order` endpoints.
- **`backend/src/routes/index.mjs`** *(MODIFIED)*: Mounted central `/api/paypal` routes and `/api/webhooks/paypal` webhook route.
- **`backend/src/modules/bookings/booking.repository.mjs`** *(MODIFIED)*: Added PayPal repository methods (`findPaymentByOrderId`, `findPaymentByCaptureId`, `updatePaymentByOrderId`, `upsertPayPalPayment`).
- **`backend/src/config/env.mjs`** *(MODIFIED)*: Loaded PayPal environment configuration.
- **`backend/migrations/003_paypal_payment_fields.sql`** *(NEW)*: Database migration script adding PayPal columns to `payments`.
- **`backend/supabase-migration.sql`** *(MODIFIED)*: Updated master schema definitions with PayPal fields.
- **`backend/run-paypal-migration.mjs`** *(NEW)*: Helper script for running database schema migrations.
- **`backend/tests/paypal.test.mjs`** *(NEW)*: Automated test suite with 10 unit/integration tests.
- **`backend/package.json`** *(MODIFIED)*: Added `"test": "node tests/paypal.test.mjs"` script.
- **`backend/.env.example`** *(NEW)*: Added sanitized environment variable template.

### Frontend Changes:
- **`frontend/package.json`** *(MODIFIED)*: Installed `@paypal/react-paypal-js`.
- **`frontend/src/shared/api/api.js`** *(MODIFIED)*: Added `createPayPalOrder` and `capturePayPalOrder` API helpers.
- **`frontend/src/features/bookings/pages/BookingPage.js`** *(MODIFIED)*: Integrated `PayPalScriptProvider` and `PayPalButtons` with dual payment method tab selector (Card / PayPal).
- **`frontend/src/features/bookings/pages/BookingPage.css`** *(MODIFIED)*: Added styling for `.payment-method-selector`, `.payment-method-tab`, `.paypal-container`, and status overlays.
- **`frontend/src/features/bookings/pages/PaymentSuccessPage.js`** *(MODIFIED)*: Updated confirmation redirect handler to support `booking_id` and `code` query parameters.
- **`frontend/.env.example`** *(NEW)*: Added frontend public PayPal client ID template.

---

## 2. Database Migrations Added

Execute `backend/migrations/003_paypal_payment_fields.sql` against your Supabase database:

```sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_order_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_capture_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_email VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_id VARCHAR(100);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_provider_order_id_key') THEN
        ALTER TABLE payments ADD CONSTRAINT payments_provider_order_id_key UNIQUE (provider_order_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_provider_capture_id_key') THEN
        ALTER TABLE payments ADD CONSTRAINT payments_provider_capture_id_key UNIQUE (provider_capture_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_provider_order ON payments(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_capture ON payments(provider_capture_id);
```

---

## 3. Environment Variables Required

### Frontend (Build Environment / Vercel):
| Variable | Scope | Description |
| :--- | :--- | :--- |
| `VITE_PAYPAL_CLIENT_ID` | Browser Public | PayPal Developer REST App Client ID |
| `REACT_APP_PAYPAL_CLIENT_ID` | Browser Public | Alternative alias for CRA build environments |

### Backend (Server Environment / Vercel Serverless):
| Variable | Scope | Description |
| :--- | :--- | :--- |
| `PAYPAL_CLIENT_ID` | Server Private | PayPal Developer REST App Client ID |
| `PAYPAL_CLIENT_SECRET` | Server Private | PayPal Developer REST App Secret *(Never expose to browser!)* |
| `PAYPAL_ENV` | Server Private | `sandbox` or `live` |
| `PAYPAL_WEBHOOK_ID` | Server Private | PayPal Webhook ID configured in developer dashboard |

---

## 4. Sandbox Testing Instructions

1. **Obtain Sandbox Credentials**:
   - Log into [PayPal Developer Dashboard](https://developer.paypal.com/).
   - Navigate to **Apps & Credentials** → **Sandbox** → Create or select an App.
   - Copy Client ID and Secret.

2. **Configure Local Environment**:
   - Update `backend/.env`:
     ```env
     PAYPAL_CLIENT_ID=your_sandbox_client_id
     PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
     PAYPAL_ENV=sandbox
     ```
   - Update `frontend/.env`:
     ```env
     REACT_APP_PAYPAL_CLIENT_ID=your_sandbox_client_id
     VITE_PAYPAL_CLIENT_ID=your_sandbox_client_id
     ```

3. **Run Unit & Integration Tests**:
   ```bash
   cd backend
   npm test
   ```

4. **Perform End-to-End Test Checkout**:
   - Start backend (`npm run dev` in `backend`) and frontend (`npm start` in `frontend`).
   - Navigate to `/booking`, select a flight, enter passenger details.
   - In Section 4 (Payment Information), select **PayPal / Pay Later**.
   - Click the yellow **PayPal** button.
   - Log in using a PayPal Sandbox Personal Buyer account.
   - Confirm payment.
   - Verify automatic redirect to `/confirmation/success?type=booking&booking_id=...&code=...`.
   - Check database records in Supabase to confirm `bookings.status = 'DONE'` and `payments.payment_status = 'paid'`.

---

## 5. Live Deployment Checklist

- [ ] **Run DB Migration**: Execute `003_paypal_payment_fields.sql` in Supabase SQL Editor.
- [ ] **Configure Vercel Environment Variables**:
  - Add `PAYPAL_CLIENT_ID` (Server)
  - Add `PAYPAL_CLIENT_SECRET` (Server)
  - Add `PAYPAL_ENV=live` (Server)
  - Add `PAYPAL_WEBHOOK_ID` (Server)
  - Add `VITE_PAYPAL_CLIENT_ID` (Frontend / Build)
  - Add `REACT_APP_PAYPAL_CLIENT_ID` (Frontend / Build)
- [ ] **Setup Webhook Endpoint in PayPal Live Dashboard**:
  - Log into PayPal Live Developer Dashboard.
  - Add Webhook URL: `https://your-domain.com/api/webhooks/paypal`
  - Select events:
    - `PAYMENT.CAPTURE.COMPLETED`
    - `PAYMENT.CAPTURE.PENDING`
    - `PAYMENT.CAPTURE.DENIED`
    - `PAYMENT.CAPTURE.REFUNDED`
    - `CHECKOUT.ORDER.APPROVED`
    - `CHECKOUT.PAYMENT-APPROVAL.REVERSED`
  - Save generated Webhook ID into `PAYPAL_WEBHOOK_ID`.
- [ ] **Verify Secret Shielding**: Confirm `PAYPAL_CLIENT_SECRET` is not referenced in any frontend file.
- [ ] **Trigger Build & Deploy**: Deploy to Vercel/production server.
- [ ] **Smoke Test**: Conduct a small live transaction to verify full cycle reconciliation.

---

## 6. Unresolved Issues

*None. All backend APIs, database mapping, security checks, unit tests, and frontend UI components are fully implemented and verified.*
