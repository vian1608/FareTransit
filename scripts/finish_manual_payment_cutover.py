from pathlib import Path

root = Path(__file__).resolve().parents[1]
booking_path = root / 'frontend/src/features/bookings/pages/BookingPage.js'
booking = booking_path.read_text()
replacements = {
    "import VgsCheckoutCardFields from '../../secure-payments/VgsCheckoutCardFields';": "import ManualPaymentCardFields from '../../secure-payments/ManualPaymentCardFields';",
    "// Only non-sensitive payment metadata lives in React state. PAN / expiry / CVV stay inside VGS Collect fields.": "// Only masked manual payment metadata lives in React state. Full card number and security code are never collected here.",
    "Secure card fields are still loading. Please wait a moment and try again.": "Manual payment fields are still loading. Please wait a moment and try again.",
    "Please enter a valid card number, expiration date, and security code.": "Please enter the card brand, last four digits, and a valid expiration date.",
    "// 1. Create the reservation using only safe card metadata. Raw card values never enter this payload.": "// 1. Create the reservation using only masked manual payment metadata.",
    "// 2. Tokenize the same card fields already entered on this checkout and attach them to this booking.\n      //    PAN/expiry are persistent VGS aliases; CVV is a volatile VGS alias.": "// 2. Attach the masked manual payment record to this booking. No full card number or security code is transmitted.",
    '<VgsCheckoutCardFields ref={secureCardRef} onFocus={handlePaymentFocus} />': '<ManualPaymentCardFields ref={secureCardRef} onFocus={handlePaymentFocus} />',
    'Card number, expiration date, and security code are entered directly into protected VGS fields. FareTransit receives vault references and masked metadata, not the raw values.': 'FareTransit stores only card brand, last four digits, expiration and billing metadata for manual recordkeeping. Full card number and security code are not collected by this form.',
}
for old, new in replacements.items():
    if old not in booking:
        raise SystemExit(f'Missing expected BookingPage fragment: {old[:100]}')
    booking = booking.replace(old, new)
booking_path.write_text(booking)

css_path = root / 'frontend/src/features/secure-payments/SecurePaymentPage.css'
if css_path.exists():
    css = css_path.read_text().replace('secure-vgs-field', 'secure-manual-field').replace('VGS', 'manual payment')
    css_path.write_text(css)

for relative in [
    'frontend/src/features/secure-payments/VgsCheckoutCardFields.js',
    'backend/src/modules/secure-payments/vgs-vault.service.mjs',
    'backend/src/modules/secure-payments/vgs-mfa.service.mjs',
    'backend/tests/secure_payment_vault_contract.test.mjs',
]:
    target = root / relative
    if target.exists():
        target.unlink()

print('Manual payment cutover edits applied.')
print('Remaining active-source VGS references:')
remaining = []
for base in [root / 'frontend/src', root / 'backend/src']:
    for path in base.rglob('*'):
        if not path.is_file() or path.suffix.lower() not in {'.js', '.jsx', '.mjs', '.css', '.json'}:
            continue
        for lineno, line in enumerate(path.read_text(errors='ignore').splitlines(), 1):
            if 'vgs' in line.lower() or 'verygoodvault' in line.lower():
                remaining.append(f'{path.relative_to(root)}:{lineno}: {line.strip()}')
for row in remaining:
    print(row)
print(f'REMAINING_VGS_REFERENCES={len(remaining)}')
