-- 034_tokenized_journey_sessions.sql
-- Durable, copyable, refresh-safe public journey URLs.
-- Public URLs expose only opaque q_/c_/r_/p_ tokens; real state stays server-side.

CREATE TABLE IF NOT EXISTS public.journey_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(96) UNIQUE NOT NULL,
  session_type VARCHAR(32) NOT NULL CHECK (session_type IN (
    'QUOTE',
    'CHECKOUT',
    'RESERVATION_READ',
    'PAYMENT'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (
    'ACTIVE',
    'COMPLETED',
    'REVOKED'
  )),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_journey_sessions_token
  ON public.journey_sessions(token);

CREATE INDEX IF NOT EXISTS idx_journey_sessions_type_status_expiry
  ON public.journey_sessions(session_type, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_journey_sessions_booking
  ON public.journey_sessions(booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journey_sessions_expiry
  ON public.journey_sessions(expires_at);

DROP TRIGGER IF EXISTS trg_journey_sessions_updated_at ON public.journey_sessions;
CREATE TRIGGER trg_journey_sessions_updated_at
  BEFORE UPDATE ON public.journey_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.journey_sessions ENABLE ROW LEVEL SECURITY;

-- Service-role backend owns all journey-session access. No anonymous direct-table
-- policies are added: public users access sessions only through the rate-limited API.

NOTIFY pgrst, 'reload schema';
