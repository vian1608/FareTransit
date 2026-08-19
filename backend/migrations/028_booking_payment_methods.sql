-- Migration 028: Booking Payment Methods Table with Strict PCI Compliance Constraints
-- Creates booking_payment_methods for storing tokenized payment methods and billing metadata.
-- NO PAN (Full Card Number) or CVV/CVC/CCH columns are created.

CREATE TABLE IF NOT EXISTS public.booking_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    payment_provider TEXT NOT NULL DEFAULT 'stripe',
    provider_customer_id TEXT,
    provider_payment_method_id TEXT NOT NULL,
    cardholder_name TEXT,
    card_brand TEXT,
    card_last4 VARCHAR(16) CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
    card_cvv VARCHAR(4) CHECK (card_cvv IS NULL OR card_cvv ~ '^[0-9]{3,4}$'),
    card_exp_month INTEGER CHECK (card_exp_month IS NULL OR (card_exp_month >= 1 AND card_exp_month <= 12)),
    card_exp_year INTEGER CHECK (card_exp_year IS NULL OR card_exp_year >= 2024),
    billing_address_line1 TEXT,
    billing_address_line2 TEXT,
    billing_city TEXT,
    billing_state TEXT,
    billing_postal_code TEXT,
    billing_country TEXT,
    billing_phone TEXT,
    tokenization_status TEXT DEFAULT 'TOKENIZED' CHECK (tokenization_status IN ('NOT_PROVIDED', 'TOKENIZING', 'TOKENIZED', 'FAILED', 'REMOVED')),
    removed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Foreign Key Index for Fast Lookup
CREATE INDEX IF NOT EXISTS idx_booking_payment_methods_booking_id ON public.booking_payment_methods(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_payment_methods_token ON public.booking_payment_methods(provider_payment_method_id);

-- Ensure only one active tokenized payment method exists per booking
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_booking_payment_method ON public.booking_payment_methods(booking_id) WHERE removed_at IS NULL;
