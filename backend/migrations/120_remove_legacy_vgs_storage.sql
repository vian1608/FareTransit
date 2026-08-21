-- Run only after the manual-payment application release is live.
-- The production table was verified empty before the cutover.
DROP TABLE IF EXISTS public.vaulted_payment_methods;
DROP TABLE IF EXISTS public.payment_access_sessions;
DROP TABLE IF EXISTS public.payment_access_events;

DELETE FROM public.role_permissions
WHERE permission_id IN (
  SELECT id FROM public.permissions WHERE permission_key = 'payments.secure_card_access'
);
DELETE FROM public.permissions WHERE permission_key = 'payments.secure_card_access';
