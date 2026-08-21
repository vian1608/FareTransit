from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'frontend/src/features/bookings/pages/BookingPage.js'
text = path.read_text()
replacements = {
    "payment_provider: 'VGS',": "payment_provider: 'manual',",
    '<span className="secure-badge"><i className="fas fa-shield-alt"></i> Card Fields Secured by VGS</span>': '<span className="secure-badge"><i className="fas fa-shield-alt"></i> Masked Manual Payment Record</span>',
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'Missing expected fragment: {old}')
    text = text.replace(old, new)
path.write_text(text)

remaining = []
for base in [root / 'frontend/src', root / 'backend/src', root / 'api']:
    if not base.exists():
        continue
    for file in base.rglob('*'):
        if not file.is_file() or file.suffix.lower() not in {'.js', '.jsx', '.mjs', '.css', '.json'}:
            continue
        for lineno, line in enumerate(file.read_text(errors='ignore').splitlines(), 1):
            low = line.lower()
            if 'vgs' in low or 'verygoodvault' in low:
                remaining.append(f'{file.relative_to(root)}:{lineno}: {line.strip()}')
for row in remaining:
    print(row)
if remaining:
    raise SystemExit(f'ACTIVE_VGS_REFERENCES={len(remaining)}')
print('ACTIVE_VGS_REFERENCES=0')
