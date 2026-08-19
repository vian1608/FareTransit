-- Migration 031: Remove default '4242' fallback from passenger_authorizations schema
-- Priority: CRITICAL CARD METADATA INTEGRITY

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'passenger_authorizations' AND column_name = 'card_last4'
  ) THEN
    ALTER TABLE public.passenger_authorizations ALTER COLUMN card_last4 DROP DEFAULT;
  END IF;
END $$;
