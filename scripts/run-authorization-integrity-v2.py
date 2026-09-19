from pathlib import Path

patch_path = Path('scripts/patch-authorization-integrity-v2.py')
source = patch_path.read_text()
# Current airline helper omits the default parameter. Adjust the patch anchor at runtime.
source = source.replace(
    "export function resolveAirlineName(carrierCode, providedName = '') {\\n  const code = String(carrierCode || '').trim().toUpperCase();\\n  if (!genericAirlineName(providedName)) return String(providedName).trim();",
    "export function resolveAirlineName(carrierCode, providedName) {\\n  const code = String(carrierCode || '').trim().toUpperCase();\\n  if (!genericAirlineName(providedName)) return String(providedName).trim();"
)
exec(compile(source, str(patch_path), 'exec'))
