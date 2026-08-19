-- ═══════════════════════════════════════════════════════════════
-- 032_vouchers_and_redemptions.sql
-- Admin-managed fixed vouchers with booking-floor protection
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(40) UNIQUE NOT NULL,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  minimum_booking_amount NUMERIC(10,2) NOT NULL DEFAULT 150.00 CHECK (minimum_booking_amount >= 150.00),
  minimum_payable_percent NUMERIC(5,2) NOT NULL DEFAULT 60.00 CHECK (minimum_payable_percent >= 60.00 AND minimum_payable_percent <= 100.00),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  max_redemptions INTEGER NOT NULL DEFAULT 1 CHECK (max_redemptions >= 1),
  max_redemptions_per_customer INTEGER NOT NULL DEFAULT 1 CHECK (max_redemptions_per_customer >= 1),
  assigned_email VARCHAR(255),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vouchers_valid_window CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
CREATE INDEX IF NOT EXISTS idx_vouchers_active ON vouchers(active);
CREATE INDEX IF NOT EXISTS idx_vouchers_valid_until ON vouchers(valid_until);

CREATE TABLE IF NOT EXISTS voucher_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE RESTRICT,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  confirmation_code VARCHAR(40),
  customer_email VARCHAR(255),
  supplier_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_before_voucher NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  minimum_payable_floor NUMERIC(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'REDEEMED' CHECK (status IN ('RESERVED','REDEEMED','RELEASED','VOIDED')),
  reserved_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(voucher_id, booking_id)
);

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher ON voucher_redemptions(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_booking ON voucher_redemptions(booking_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_email ON voucher_redemptions(customer_email);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(40);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voucher_discount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_before_voucher NUMERIC(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS minimum_payable_floor NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS idx_bookings_voucher_id ON bookings(voucher_id);
CREATE INDEX IF NOT EXISTS idx_bookings_voucher_code ON bookings(voucher_code);

DROP TRIGGER IF EXISTS trg_vouchers_updated_at ON vouchers;
CREATE TRIGGER trg_vouchers_updated_at
  BEFORE UPDATE ON vouchers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_redemptions ENABLE ROW LEVEL SECURITY;
