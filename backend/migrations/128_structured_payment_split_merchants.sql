-- Structured merchant identity for airline-aware payment splits.
ALTER TABLE public.booking_payment_splits ADD COLUMN IF NOT EXISTS merchant_type varchar(20), ADD COLUMN IF NOT EXISTS merchant_code varchar(10);
ALTER TABLE public.payment_authorization_splits ADD COLUMN IF NOT EXISTS merchant_type varchar(20), ADD COLUMN IF NOT EXISTS merchant_code varchar(10);
UPDATE public.booking_payment_splits SET merchant_type = 'FARETRANSIT' WHERE merchant_type IS NULL AND lower(trim(merchant_name)) = 'faretransit llc';
UPDATE public.payment_authorization_splits SET merchant_type = 'FARETRANSIT' WHERE merchant_type IS NULL AND lower(trim(merchant_name)) = 'faretransit llc';
UPDATE public.booking_payment_splits ps SET merchant_type = 'AIRLINE', merchant_code = upper(s.carrier_code) FROM public.booking_itinerary_segments s WHERE ps.booking_id = s.booking_id AND ps.merchant_type IS NULL AND nullif(trim(s.carrier_code), '') IS NOT NULL AND lower(trim(ps.merchant_name)) = lower(trim(coalesce(s.carrier_name, '')));
UPDATE public.payment_authorization_splits ps SET merchant_type = 'AIRLINE', merchant_code = upper(s.carrier_code) FROM public.booking_itinerary_segments s WHERE ps.booking_id = s.booking_id AND ps.merchant_type IS NULL AND nullif(trim(s.carrier_code), '') IS NOT NULL AND lower(trim(ps.merchant_name)) = lower(trim(coalesce(s.carrier_name, '')));
UPDATE public.booking_payment_splits SET merchant_type = 'OTHER' WHERE merchant_type IS NULL;
UPDATE public.payment_authorization_splits SET merchant_type = 'OTHER' WHERE merchant_type IS NULL;
CREATE INDEX IF NOT EXISTS idx_booking_payment_splits_merchant ON public.booking_payment_splits(booking_id, merchant_type, merchant_code);
CREATE INDEX IF NOT EXISTS idx_payment_authorization_splits_merchant ON public.payment_authorization_splits(booking_id, merchant_type, merchant_code);
NOTIFY pgrst, 'reload schema';
