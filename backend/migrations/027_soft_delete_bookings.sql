-- Migration 027: Soft Delete Support & Recovery Index for Bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255) DEFAULT NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS delete_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at ON public.bookings(deleted_at);
