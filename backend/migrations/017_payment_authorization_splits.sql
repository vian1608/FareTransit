-- Migration 017: Create payment_authorization_splits table for split authorization merchant tracking

CREATE TABLE IF NOT EXISTS public.payment_authorization_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  merchant_name VARCHAR(255) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_auth_splits_booking_id ON public.payment_authorization_splits(booking_id);
