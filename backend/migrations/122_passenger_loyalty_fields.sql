-- Passenger profile fields used by the four-step FareTransit checkout.
-- Additive only: existing traveller rows remain valid.

ALTER TABLE public.travellers
  ADD COLUMN IF NOT EXISTS suffix varchar(20),
  ADD COLUMN IF NOT EXISTS loyalty_program varchar(100),
  ADD COLUMN IF NOT EXISTS frequent_flyer_number varchar(100),
  ADD COLUMN IF NOT EXISTS known_traveler_number varchar(100),
  ADD COLUMN IF NOT EXISTS redress_number varchar(100);
