from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'backend/src/modules/bookings/booking.repository.egress-hardening.mjs'
text = p.read_text()
old = "'booking_revision','authorization_token','authorization_status','authorized_amount','authorized_at'"
new = "'booking_revision','authorization_token','authorization_status','authorized_amount'"
if old not in text:
    raise SystemExit('Expected BASE_COLUMNS authorized_at target not found')
text = text.replace(old, new, 1)
old_core = "booking_revision,authorization_token,authorization_status,authorized_amount,authorization_expires_at,authorized_at,voucher_id"
new_core = "booking_revision,authorization_token,authorization_status,authorized_amount,authorization_expires_at,voucher_id"
if old_core not in text:
    raise SystemExit('Expected CORE_COLUMNS authorized_at target not found')
text = text.replace(old_core, new_core, 1)
p.write_text(text)
print('Removed non-existent bookings.authorized_at from bounded projections.')
