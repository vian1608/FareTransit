-- Migration 102: Additive CRM/staff linkage for the existing flight booking table.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS lead_id UUID NULL REFERENCES crm_leads(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_agent_id UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS trip_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_lead_id ON bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_bookings_assigned_agent_id ON bookings(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_bookings_team_id ON bookings(team_id);
CREATE INDEX IF NOT EXISTS idx_bookings_trip_id ON bookings(trip_id);
