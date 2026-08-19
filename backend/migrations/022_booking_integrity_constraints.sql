-- Migration 022: Booking Integrity Constraints, Foreign Keys & Authorization Snapshots

-- 1. Foreign Key & Cascade Constraints on flights and booking_itinerary_segments
DO $$
BEGIN
    -- Foreign key on flights.booking_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_flights_booking_id' AND table_name = 'flights'
    ) THEN
        ALTER TABLE flights
        ADD CONSTRAINT fk_flights_booking_id
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
    END IF;

    -- Foreign key on booking_itinerary_segments.booking_id
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_itinerary_segments') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_booking_itinerary_segments_booking_id' AND table_name = 'booking_itinerary_segments'
        ) THEN
            ALTER TABLE booking_itinerary_segments
            ADD CONSTRAINT fk_booking_itinerary_segments_booking_id
            FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- 2. Performance & Relationship Integrity Indexes
CREATE INDEX IF NOT EXISTS idx_flights_booking_id ON flights (booking_id);
CREATE INDEX IF NOT EXISTS idx_travellers_booking_id ON travellers (booking_id);
CREATE INDEX IF NOT EXISTS idx_contacts_booking_id ON contacts (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_itinerary_segments') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_booking_itinerary_segments_booking_id ON booking_itinerary_segments (booking_id)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_payment_splits') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_booking_payment_splits_booking_id ON booking_payment_splits (booking_id)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'passenger_authorizations') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_passenger_authorizations_booking_id ON passenger_authorizations (booking_id)';
    END IF;
END $$;

-- 3. Authorization Snapshot Support
ALTER TABLE passenger_authorizations
    ADD COLUMN IF NOT EXISTS authorization_snapshot JSONB DEFAULT NULL;

-- 4. Audit Table Enhancements
ALTER TABLE booking_status_audits
    ADD COLUMN IF NOT EXISTS old_values JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS new_values JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS changed_fields TEXT[] DEFAULT NULL;

COMMENT ON COLUMN passenger_authorizations.authorization_snapshot IS
  'Immutable legal snapshot of itinerary, passenger details, splits, amounts, consent text, and hashes captured at authorization completion.';
