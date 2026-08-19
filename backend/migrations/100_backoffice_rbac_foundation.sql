-- Migration 100: Back Office RBAC foundation (additive)
-- Safe expansion: no production booking/payment tables are dropped or renamed.

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES staff_roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    data_scope TEXT NOT NULL DEFAULT 'ALL' CHECK (data_scope IN ('OWN','TEAM','ALL')),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS staff_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role_id UUID NOT NULL REFERENCES staff_roles(id),
    team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_users_email ON staff_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_staff_users_role_id ON staff_users (role_id);
CREATE INDEX IF NOT EXISTS idx_staff_users_team_id ON staff_users (team_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions (role_id);

INSERT INTO staff_roles (key, name, description) VALUES
('owner', 'Owner / Super Admin', 'Full back-office access'),
('sales_manager', 'Sales Manager', 'Team sales and CRM management'),
('sales_agent', 'Sales Agent', 'Own sales pipeline and assigned bookings'),
('operations_agent', 'Operations Agent', 'Travel fulfilment operations'),
('finance_agent', 'Finance Agent', 'Payments, refunds and finance')
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (key, description) VALUES
('dashboard.view','View role-scoped dashboard'),
('crm.leads.view','View leads'),('crm.leads.create','Create leads'),('crm.leads.edit','Edit leads'),
('crm.leads.assign','Assign leads'),('crm.leads.delete','Delete leads'),
('crm.customers.view','View customers'),('crm.customers.create','Create customers'),('crm.customers.edit','Edit customers'),
('crm.tasks.view','View tasks'),('crm.tasks.create','Create tasks'),('crm.tasks.edit','Edit tasks'),('crm.notes.create','Create notes'),
('trips.view','View trips'),('trips.create','Create trips'),('trips.edit','Edit trips'),
('bookings.flights.view','View flight bookings'),('bookings.flights.create','Create flight bookings'),
('bookings.flights.edit','Edit flight bookings'),('bookings.flights.cancel','Cancel flight bookings'),
('bookings.hotels.view','View hotel bookings'),('bookings.hotels.create','Create hotel bookings'),('bookings.hotels.edit','Edit hotel bookings'),
('bookings.cars.view','View car bookings'),('bookings.cars.create','Create car bookings'),('bookings.cars.edit','Edit car bookings'),
('authorization.view','View authorization records'),('authorization.send','Send authorization'),('authorization.resend','Resend authorization'),
('ticketing.view','View ticketing data'),('ticketing.update','Update ticketing data'),('ticketing.send','Send ticket confirmation'),
('payments.view','View masked customer payment status'),('payments.request','Request customer payment'),
('payments.refund','Process permitted refunds'),('payments.refund_large','Process unrestricted/large refunds'),
('finance.view','View finance'),('finance.export','Export finance'),('finance.commissions','View/manage commissions'),
('suppliers.view','View suppliers'),('suppliers.manage','Manage suppliers'),
('reports.view','View reports'),('reports.export','Export reports'),
('team.view','View team'),('team.manage','Manage users/roles/teams'),
('admin.settings','Manage system settings'),('admin.integrations','Manage integrations'),('admin.audit_logs','View audit logs')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, data_scope)
SELECT r.id, p.id, 'ALL' FROM staff_roles r CROSS JOIN permissions p WHERE r.key = 'owner'
ON CONFLICT (role_id, permission_id) DO UPDATE SET data_scope = EXCLUDED.data_scope;

INSERT INTO role_permissions (role_id, permission_id, data_scope)
SELECT r.id, p.id, CASE WHEN p.key IN ('crm.leads.view','crm.customers.view','crm.tasks.view','trips.view','bookings.flights.view','bookings.hotels.view','bookings.cars.view') THEN 'TEAM' ELSE 'ALL' END
FROM staff_roles r JOIN permissions p ON p.key = ANY(ARRAY['dashboard.view','crm.leads.view','crm.leads.create','crm.leads.edit','crm.leads.assign','crm.customers.view','crm.customers.create','crm.customers.edit','crm.tasks.view','crm.tasks.create','crm.tasks.edit','crm.notes.create','trips.view','trips.create','trips.edit','bookings.flights.view','bookings.flights.create','bookings.flights.edit','bookings.hotels.view','bookings.hotels.create','bookings.hotels.edit','bookings.cars.view','bookings.cars.create','bookings.cars.edit','authorization.view','authorization.send','authorization.resend','ticketing.view','ticketing.update','ticketing.send','payments.view','payments.request','payments.refund','reports.view','team.view'])
WHERE r.key='sales_manager'
ON CONFLICT (role_id, permission_id) DO UPDATE SET data_scope=EXCLUDED.data_scope;

INSERT INTO role_permissions (role_id, permission_id, data_scope)
SELECT r.id, p.id, CASE WHEN p.key IN ('crm.leads.view','crm.customers.view','crm.tasks.view','trips.view','bookings.flights.view','bookings.hotels.view','bookings.cars.view') THEN 'OWN' ELSE 'ALL' END
FROM staff_roles r JOIN permissions p ON p.key = ANY(ARRAY['dashboard.view','crm.leads.view','crm.leads.create','crm.leads.edit','crm.customers.view','crm.customers.create','crm.customers.edit','crm.tasks.view','crm.tasks.create','crm.tasks.edit','crm.notes.create','trips.view','trips.create','trips.edit','bookings.flights.view','bookings.flights.create','bookings.flights.edit','bookings.hotels.view','bookings.hotels.create','bookings.hotels.edit','bookings.cars.view','bookings.cars.create','bookings.cars.edit','authorization.view','authorization.send','authorization.resend','ticketing.view','ticketing.update','ticketing.send','payments.view','payments.request'])
WHERE r.key='sales_agent'
ON CONFLICT (role_id, permission_id) DO UPDATE SET data_scope=EXCLUDED.data_scope;

INSERT INTO role_permissions (role_id, permission_id, data_scope)
SELECT r.id, p.id, 'ALL' FROM staff_roles r JOIN permissions p ON p.key = ANY(ARRAY['dashboard.view','trips.view','trips.edit','bookings.flights.view','bookings.flights.edit','bookings.flights.cancel','bookings.hotels.view','bookings.hotels.edit','bookings.cars.view','bookings.cars.edit','authorization.view','ticketing.view','ticketing.update','ticketing.send','payments.view','crm.tasks.view','crm.tasks.create','crm.tasks.edit'])
WHERE r.key='operations_agent'
ON CONFLICT (role_id, permission_id) DO UPDATE SET data_scope=EXCLUDED.data_scope;

INSERT INTO role_permissions (role_id, permission_id, data_scope)
SELECT r.id, p.id, 'ALL' FROM staff_roles r JOIN permissions p ON p.key = ANY(ARRAY['dashboard.view','payments.view','payments.request','payments.refund','payments.refund_large','finance.view','finance.export','finance.commissions','suppliers.view','reports.view','reports.export'])
WHERE r.key='finance_agent'
ON CONFLICT (role_id, permission_id) DO UPDATE SET data_scope=EXCLUDED.data_scope;

ALTER TABLE audit_logs ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_user_id UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id TEXT NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
