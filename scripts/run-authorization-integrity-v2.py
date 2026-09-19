from pathlib import Path

patch_path = Path('scripts/patch-authorization-integrity-v2.py')
source = patch_path.read_text()
# Current airline helper omits the optional default parameter. Make both the
# expected anchor and replacement implementation match the checked-in helper.
source = source.replace(
    "resolveAirlineName(carrierCode, providedName = '')",
    "resolveAirlineName(carrierCode, providedName)"
)
exec(compile(source, str(patch_path), 'exec'))
