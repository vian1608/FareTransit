-- Migration 107: Generic secure payment authorization/vault foundation.
-- Additive only. Raw PAN/CVV are intentionally NOT stored in FareTransit database.
-- VGS aliases/tokens are the only vault references persisted here.

CREATE TABLE IF NOT EXISTS payment_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_code TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('FLIGHT','HOTEL','CAR','CRUISE','TOUR','ACTIVITY','PACKAGE','INSURANCE','TRIP','OTHER')),
  entity_id UUID,
  entity_code TEXT,
  trip_id UUID NULL REFERENCES trips(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES crm_leads(id) ON DELETE SET NULL,
  assigned_agent_id UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_by UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_contexts_entity ON payment_contexts(entity_type, entity_code);
CREATE INDEX IF NOT EXISTS idx_payment_contexts_agent ON payment_contexts(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_payment_contexts_team ON payment_contexts(team_id);
CREATE INDEX IF NOT EXISTS idx_payment_contexts_trip ON payment_contexts(trip_id);
CREATE INDEX IF NOT EXISTS idx_payment_contexts_lead ON payment_contexts(lead_id);

CREATE TABLE IF NOT EXISTS payment_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_code TEXT NOT NULL UNIQUE,
  payment_context_id UUID NOT NULL REFERENCES payment_contexts(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  authorized_amount NUMERIC(12,2) NOT NULL CHECK (authorized_amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','OPENED','CARD_SUBMITTED','AUTHORIZED','CARD_READY','PARTIALLY_USED','COMPLETED','EXPIRED','REVOKED','CANCELLED','RECOLLECTION_REQUIRED')),
  public_token_hash TEXT UNIQUE,
  public_token_expires_at TIMESTAMPTZ,
  terms_version TEXT NOT NULL DEFAULT 'secure-payment-v1',
  terms_snapshot_hash TEXT,
  signature_name TEXT,
  customer_ip TEXT,
  customer_user_agent TEXT,
  authorized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_authorizations_context ON payment_authorizations(payment_context_id);
CREATE INDEX IF NOT EXISTS idx_payment_authorizations_status ON payment_authorizations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_authorizations_customer_email ON payment_authorizations(LOWER(customer_email));

CREATE TABLE IF NOT EXISTS vaulted_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id UUID NOT NULL UNIQUE REFERENCES payment_authorizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'VGS',
  pan_alias TEXT,
  expiration_alias TEXT,
  cvv_alias TEXT,
  card_brand TEXT,
  last4 TEXT,
  cardholder_name TEXT,
  billing_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  pan_status TEXT NOT NULL DEFAULT 'NOT_COLLECTED' CHECK (pan_status IN ('NOT_COLLECTED','AVAILABLE','DELETED')),
  cvv_status TEXT NOT NULL DEFAULT 'NOT_COLLECTED' CHECK (cvv_status IN ('NOT_COLLECTED','AVAILABLE','EXPIRING_SOON','EXPIRED','CONSUMED','DELETION_PENDING','DELETED','RECOLLECTION_REQUIRED')),
  cvv_collected_at TIMESTAMPTZ,
  cvv_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vaulted_payment_methods_cvv_expiry ON vaulted_payment_methods(cvv_status, cvv_expires_at);

CREATE TABLE IF NOT EXISTS payment_access_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id UUID NOT NULL REFERENCES payment_authorizations(id) ON DELETE CASCADE,
  staff_user_id UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  staff_email TEXT NOT NULL,
  reason TEXT NOT NULL,
  otp_hash TEXT,
  otp_expires_at TIMESTAMPTZ,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  otp_verified_at TIMESTAMPTZ,
  secure_session_hash TEXT,
  secure_session_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OTP_SENT' CHECK (status IN ('OTP_SENT','VERIFIED','ACTIVE','ENDED','EXPIRED','DENIED')),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_access_sessions_auth ON payment_access_sessions(authorization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_access_sessions_staff ON payment_access_sessions(staff_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id UUID NOT NULL REFERENCES payment_authorizations(id) ON DELETE CASCADE,
  staff_user_id UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  staff_email TEXT,
  access_session_id UUID NULL REFERENCES payment_access_sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_access_events_auth ON payment_access_events(authorization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_access_events_staff ON payment_access_events(staff_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_charge_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_context_id UUID NOT NULL REFERENCES payment_contexts(id) ON DELETE CASCADE,
  authorization_id UUID NOT NULL REFERENCES payment_authorizations(id) ON DELETE CASCADE,
  payment_method_id UUID NULL REFERENCES vaulted_payment_methods(id) ON DELETE SET NULL,
  supplier_id UUID NULL REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  charge_type TEXT NOT NULL DEFAULT 'PURCHASE',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','AUTHORIZED','DECLINED','FAILED','VOIDED','REFUNDED')),
  provider_reference TEXT,
  attempted_by UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  attempted_by_email TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  authorized_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_charge_auth ON supplier_charge_attempts(authorization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_charge_context ON supplier_charge_attempts(payment_context_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_authorization_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id UUID NOT NULL REFERENCES payment_authorizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_authorization_events_auth ON payment_authorization_events(authorization_id, created_at DESC);

INSERT INTO permissions(key, description) VALUES
('payments.authorization.manage','Create and manage secure payment authorizations'),
('payments.card.view_masked','View masked vaulted payment method metadata'),
('payments.secure_card_access','Request MFA-protected secure card reveal'),
('payments.supplier_charge','Record supplier charge attempts and completion')
ON CONFLICT (key) DO NOTHING;

-- Owner gets all secure-payment permissions. Secure card reveal is intentionally owner-only by default.
INSERT INTO role_permissions(role_id, permission_id, data_scope)
SELECT r.id, p.id, 'ALL' FROM staff_roles r CROSS JOIN permissions p
WHERE r.key='owner' AND p.key = ANY(ARRAY['payments.authorization.manage','payments.card.view_masked','payments.secure_card_access','payments.supplier_charge'])
ON CONFLICT (role_id, permission_id) DO UPDATE SET data_scope=EXCLUDED.data_scope;

INSERT INTO role_permissions(role_id, permission_id, data_scope)
SELECT r.id, p.id, 'TEAM' FROM staff_roles r CROSS JOIN permissions p
WHERE r.key='sales_manager' AND p.key = ANY(ARRAY['payments.authorization.manage','payments.card.view_masked','payments.supplier_charge'])
ON CONFLICT (role_id, permission_id) DO UPDATE SET data_scope=EXCLUDED.data_scope;

INSERT INTO role_permissions(role_id, permission_id, data_scope)
SELECT r.id, p.id, 'OWN' FROM staff_roles r CROSS JOIN permissions p
WHERE r.key='sales_agent' AND p.key = ANY(ARRAY['payments.authorization.manage','payments.card.view_masked'])
ON CONFLICT (role_id, permission_id) DO UPDATE SET data_scope=EXCLUDED.data_scope;

INSERT INTO role_permissions(role_id, permission_id, data_scope)
SELECT r.id, p.id, 'ALL' FROM staff_roles r CROSS JOIN permissions p
WHERE r.key='operations_agent' AND p.key = ANY(ARRAY['payments.card.view_masked','payments.supplier_charge'])
ON CONFLICT (role_id, permission_id) DO UPDATE SET data_scope=EXCLUDED.data_scope;

INSERT INTO role_permissions(role_id, permission_id, data_scope)
SELECT r.id, p.id, 'ALL' FROM staff_roles r CROSS JOIN permissions p
WHERE r.key='finance_agent' AND p.key = 'payments.card.view_masked'
ON CONFLICT (role_id, permission_id) DO UPDATE SET data_scope=EXCLUDED.data_scope;

INSERT INTO backoffice_settings(key,value,description) VALUES
('secure_payment_target_cvv_ttl_hours','24'::jsonb,'Requested VGS volatile CVV retention window; activate only after VGS confirms the vault setting'),
('secure_payment_access_session_minutes','5'::jsonb,'MFA secure reveal session lifetime'),
('secure_payment_otp_minutes','5'::jsonb,'Secure payment OTP lifetime')
ON CONFLICT(key) DO NOTHING;
