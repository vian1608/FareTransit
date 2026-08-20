-- Migration 109: Cover foreign keys used by CRM, finance, secure payments, hotels/cars and vouchers.

CREATE INDEX IF NOT EXISTS idx_booking_payment_splits_payment_id ON public.booking_payment_splits(payment_id);
CREATE INDEX IF NOT EXISTS idx_car_bookings_customer_contact_id ON public.car_bookings(customer_contact_id);
CREATE INDEX IF NOT EXISTS idx_car_bookings_supplier_id ON public.car_bookings(supplier_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_contact_id ON public.crm_leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_author_user_id ON public.crm_notes(author_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_booking_id ON public.crm_notes(booking_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_booking_id ON public.crm_tasks(booking_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_created_by ON public.crm_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_customer_contact_id ON public.crm_tasks(customer_contact_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_lead_id ON public.finance_entries(lead_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_trip_id ON public.finance_entries(trip_id);
CREATE INDEX IF NOT EXISTS idx_hotel_bookings_supplier_id ON public.hotel_bookings(supplier_id);
CREATE INDEX IF NOT EXISTS idx_hotel_bookings_customer_contact_id ON public.hotel_bookings(customer_contact_id);
CREATE INDEX IF NOT EXISTS idx_payment_access_events_access_session_id ON public.payment_access_events(access_session_id);
CREATE INDEX IF NOT EXISTS idx_payment_authorization_splits_authorization_id ON public.payment_authorization_splits(authorization_id);
CREATE INDEX IF NOT EXISTS idx_payment_contexts_created_by ON public.payment_contexts(created_by);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_booking_id ON public.payment_disputes(booking_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_approved_by ON public.refund_requests(approved_by);
CREATE INDEX IF NOT EXISTS idx_refund_requests_processed_by ON public.refund_requests(processed_by);
CREATE INDEX IF NOT EXISTS idx_refund_requests_requested_by ON public.refund_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON public.role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_supplier_charge_attempts_attempted_by ON public.supplier_charge_attempts(attempted_by);
CREATE INDEX IF NOT EXISTS idx_supplier_charge_attempts_payment_method_id ON public.supplier_charge_attempts(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_supplier_charge_attempts_supplier_id ON public.supplier_charge_attempts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_trip_id ON public.supplier_payments(trip_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_booking_id ON public.voucher_redemptions(booking_id);
