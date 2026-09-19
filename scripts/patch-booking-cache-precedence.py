from pathlib import Path

path = Path('backend/src/modules/bookings/booking.repository.mjs')
s = path.read_text()
old = "const base = { ...(data || {}), ...(memOverridden || {}) };"
new = """// The database is authoritative whenever a row was fetched. Memory is only a
    // fallback/cache and must never overwrite a newer booking_revision, token
    // lifecycle status, price, itinerary metadata, or other persisted state.
    const base = data
      ? { ...(memOverridden || {}), ...data }
      : { ...(memOverridden || {}) };"""
if old not in s:
    raise RuntimeError('booking cache precedence anchor not found')
s = s.replace(old, new, 1)
path.write_text(s)
print('Booking cache precedence patch applied.')
