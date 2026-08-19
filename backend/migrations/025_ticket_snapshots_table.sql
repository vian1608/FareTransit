-- Migration 025: Immutable Append-Only Ticket Snapshots Table

CREATE TABLE IF NOT EXISTS ticket_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    airline TEXT,
    airline_code TEXT,
    pnr TEXT NOT NULL,
    ticket_number TEXT,
    final_itinerary JSONB NOT NULL,
    final_price NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    issue_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance and Audit Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_ticket_snapshots_booking_id ON ticket_snapshots (booking_id);
CREATE INDEX IF NOT EXISTS idx_ticket_snapshots_pnr ON ticket_snapshots (pnr);

COMMENT ON TABLE ticket_snapshots IS 'Append-only historical log of issued airline tickets and PNR snapshots for auditing and dispute defense.';
