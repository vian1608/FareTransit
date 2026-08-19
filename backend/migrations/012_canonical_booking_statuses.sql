-- Migration 012: Canonical Booking Statuses & Audit Table
-- Ensures all 9 canonical booking status values are accepted by Supabase check constraint and column length

-- 1. Alter status column type from VARCHAR(20) to VARCHAR(50) so longer statuses like AWAITING_AUTHORIZATION (22 chars) and REAUTHORIZATION_REQUIRED (24 chars) are stored cleanly
ALTER TABLE public.bookings
ALTER COLUMN status TYPE VARCHAR(50);

-- 2. Drop existing status check constraint if exists
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_status_check;

-- 3. Add updated check constraint for all 9 canonical status strings
ALTER TABLE public.bookings
ADD CONSTRAINT bookings_status_check
CHECK (
  status IN (
    'PENDING',
    'AWAITING_AUTHORIZATION',
    'AUTHORIZED',
    'REAUTHORIZATION_REQUIRED',
    'READY_FOR_TICKETING',
    'TICKETED',
    'DONE',
    'FAILED',
    'CANCELLED'
  )
);

-- 4. Create booking_status_audits table for tracking status transition history
CREATE TABLE IF NOT EXISTS public.booking_status_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  admin_id TEXT DEFAULT 'admin',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
