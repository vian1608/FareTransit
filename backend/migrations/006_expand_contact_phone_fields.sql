-- ═══════════════════════════════════════════════════════════════
-- 006_expand_contact_phone_fields.sql
-- Expand contacts.phone_number and contacts.country_code to prevent truncation errors
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE contacts ALTER COLUMN phone_number TYPE TEXT;
ALTER TABLE contacts ALTER COLUMN country_code TYPE VARCHAR(16);
