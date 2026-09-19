#!/usr/bin/env bash
set -euo pipefail

mkdir -p frontend/public/assets/airlines
codes="AA DL UA WN AS B6 NK F9 HA AC WS BA VS LH LX OS SN AF KL IB AY SK TP EI FI LO AZ A3 FR U2 W6 VY EK QR EY TK SV RJ GF WY KU FZ G9 AT ET MS KQ SA SQ CX NH JL KE OZ BR CI AI 6E MH AK TG VN PR GA TR 5J UL PK BG CA MU CZ HU MF ZH 3U SC HO 9C QF NZ VA JQ LA AV CM AM G3 AD AR Y4 VB LY ME SU JU RO BT DY UX PC XQ D7 FD QZ UO HX"
stored=0

for code in $codes; do
  lower=$(printf '%s' "$code" | tr '[:upper:]' '[:lower:]')
  out="frontend/public/assets/airlines/${lower}.png"
  if curl -fsSL --retry 2 --connect-timeout 8 "https://assets.duffel.com/img/airlines/for-floor/sq/${code}.png" -o "$out" && file --mime-type "$out" | grep -q 'image/'; then
    stored=$((stored+1))
  elif curl -fsSL --retry 2 --connect-timeout 8 "https://images.kiwi.com/airlines/64/${code}.png" -o "$out" && file --mime-type "$out" | grep -q 'image/'; then
    stored=$((stored+1))
  else
    rm -f "$out"
    echo "Logo unavailable for $code; runtime CDN fallback will be used."
  fi
done

echo "Stored $stored airline logos locally."
test "$stored" -ge 60
