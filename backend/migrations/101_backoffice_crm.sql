-- Migration 101: CRM leads, tasks and notes. Additive only.
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_code TEXT NOT NULL UNIQUE,
  contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'Manual',
  product_interest TEXT NOT NULL DEFAULT 'Flight',
  destination TEXT,
  origin TEXT,
  travel_start_date DATE,
  travel_end_date DATE,
  estimated_value NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','QUALIFIED','QUOTE_SENT','FOLLOW_UP','CUSTOMER_APPROVED','PAYMENT_PENDING','PAID','BOOKING_IN_PROGRESS','CONFIRMED','TRAVEL_COMPLETED','LOST','NO_RESPONSE','CANCELLED','REFUNDED')),
  assigned_agent_id UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  next_follow_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_leads_agent ON crm_leads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_team ON crm_leads(team_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_followup ON crm_leads(next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_crm_leads_created ON crm_leads(created_at DESC);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  customer_contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
  booking_id UUID NULL REFERENCES bookings(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  created_by UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assignee ON crm_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_team ON crm_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due ON crm_tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead ON crm_tasks(lead_id);

CREATE TABLE IF NOT EXISTS crm_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  booking_id UUID NULL REFERENCES bookings(id) ON DELETE CASCADE,
  author_user_id UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_notes_lead ON crm_notes(lead_id, created_at DESC);
