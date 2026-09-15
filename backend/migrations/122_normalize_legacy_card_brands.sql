-- Repair legacy card-brand aliases in environments where migration 121 ran
-- before the normalization expression was corrected.
UPDATE public.reservation_billing_details
SET card_brand = 'Mastercard', updated_at = NOW()
WHERE regexp_replace(lower(coalesce(card_brand, '')), '[^a-z0-9]', '', 'g') IN ('master', 'mastercard', 'mc');
