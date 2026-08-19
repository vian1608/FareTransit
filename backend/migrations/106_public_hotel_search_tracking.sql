-- Migration 106: Public hotel search/request tracking.
-- Additive only. No existing hotel booking rows are rewritten.
ALTER TABLE hotel_bookings ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT 'backoffice';
ALTER TABLE hotel_bookings ADD COLUMN IF NOT EXISTS search_provider TEXT NULL;
ALTER TABLE hotel_bookings ADD COLUMN IF NOT EXISTS external_property_token TEXT NULL;
ALTER TABLE hotel_bookings ADD COLUMN IF NOT EXISTS search_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE hotel_bookings ADD COLUMN IF NOT EXISTS client_request_id TEXT NULL;
ALTER TABLE hotel_bookings ADD COLUMN IF NOT EXISTS requested_by_customer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_bookings_client_request_id
  ON hotel_bookings(client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hotel_bookings_external_property_token
  ON hotel_bookings(external_property_token)
  WHERE external_property_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hotel_bookings_booking_source ON hotel_bookings(booking_source);

-- Public website hotel requests must always have a CRM lead.
-- Existing/manual back-office rows remain compatible, while new website rows are protected.
DO $$ BEGIN
  ALTER TABLE hotel_bookings ADD CONSTRAINT ck_public_hotel_request_has_crm_lead
  CHECK (booking_source <> 'website_serpapi_google_hotels' OR lead_id IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
