-- ═══════════════════════════════════════════════════════════════
-- 004_discount_pricing_fields.sql
-- Add 10% discount breakdown fields to bookings table
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS supplier_price NUMERIC(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 10.00;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_price NUMERIC(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_checked_at TIMESTAMPTZ DEFAULT NOW();
