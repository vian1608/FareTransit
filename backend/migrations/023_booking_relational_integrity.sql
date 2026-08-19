-- Migration 023: Booking Relational Integrity & Foreign Key Safeguards

DO $$
BEGIN
    -- 1. Foreign Key: flights.booking_id -> bookings.id
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'flights') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_flights_booking_id' AND table_name = 'flights'
        ) THEN
            ALTER TABLE flights
            ADD CONSTRAINT fk_flights_booking_id
            FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
        END IF;
    END IF;

    -- 2. Foreign Key: travellers.booking_id -> bookings.id
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'travellers') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_travellers_booking_id' AND table_name = 'travellers'
        ) THEN
            ALTER TABLE travellers
            ADD CONSTRAINT fk_travellers_booking_id
            FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
        END IF;
    END IF;

    -- 3. Foreign Key: payments.booking_id -> bookings.id
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_payments_booking_id' AND table_name = 'payments'
        ) THEN
            ALTER TABLE payments
            ADD CONSTRAINT fk_payments_booking_id
            FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
        END IF;
    END IF;

    -- 4. Foreign Key: passenger_authorizations.booking_id -> bookings.id
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'passenger_authorizations') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_passenger_authorizations_booking_id' AND table_name = 'passenger_authorizations'
        ) THEN
            ALTER TABLE passenger_authorizations
            ADD CONSTRAINT fk_passenger_authorizations_booking_id
            FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
        END IF;
    END IF;

    -- 5. Foreign Key: airline_ticket_details.booking_id -> bookings.id
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'airline_ticket_details') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_airline_ticket_details_booking_id' AND table_name = 'airline_ticket_details'
        ) THEN
            ALTER TABLE airline_ticket_details
            ADD CONSTRAINT fk_airline_ticket_details_booking_id
            FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
        END IF;
    END IF;

    -- 6. Foreign Key: contacts.booking_id -> bookings.id
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_contacts_booking_id' AND table_name = 'contacts'
        ) THEN
            ALTER TABLE contacts
            ADD CONSTRAINT fk_contacts_booking_id
            FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- Performance and Relational Integrity Lookup Indexes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'flights') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_flights_booking_id ON flights (booking_id)';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'travellers') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_travellers_booking_id ON travellers (booking_id)';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id)';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'passenger_authorizations') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_passenger_authorizations_booking_id ON passenger_authorizations (booking_id)';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'airline_ticket_details') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_airline_ticket_details_booking_id ON airline_ticket_details (booking_id)';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_contacts_booking_id ON contacts (booking_id)';
    END IF;
END $$;
