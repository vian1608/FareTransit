import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const fareUX = read('frontend/src/shared/pricing/installFareBreakdownUX.js');
const fareStyles = read('frontend/src/shared/styles/FareBreakdownUX.css');

// The collapsed fare bar should communicate value in the intended order:
// regular fare -> exact member savings -> discounted fare.
assert.match(fareUX, /Regular trip fare/);
assert.match(fareUX, /Your \$\{discountPercent\}% member savings/);
assert.match(fareUX, /Today's discounted fare/);
assert.match(fareUX, /tfs-fare-original-total/);
assert.match(fareUX, /tfs-fare-savings-amount/);
assert.match(fareUX, /tfs-fare-total/);

// Per-traveler framing should retain both the crossed-out regular fare and the
// discounted fare, multiplied by the actual traveler count.
assert.match(fareUX, /Per traveler/);
assert.match(fareUX, /formatMoney\(perTravelerOriginal\)/);
assert.match(fareUX, /formatMoney\(perTravelerFinal\)/);
assert.match(fareUX, /travelerCount/);

// The detailed dropdown must disclose the regular total, savings, and final
// total so the presentation remains transparent rather than hiding the basis.
assert.match(fareUX, /Regular trip total/);
assert.match(fareUX, /member fare/);
assert.match(fareUX, /Today's trip total/);

// Visual hierarchy: regular prices are struck through, savings are highlighted,
// and the final discounted total remains prominent.
assert.match(fareStyles, /\.tfs-fare-original-total[\s\S]*text-decoration-color:\s*#dc2626/);
assert.match(fareStyles, /\.tfs-fare-savings-block[\s\S]*background:\s*#ecfdf5/);
assert.match(fareStyles, /\.tfs-fare-savings-amount[\s\S]*font-weight:\s*900/);
assert.match(fareStyles, /\.tfs-fare-total[\s\S]*font-size:\s*1\.35rem/);

console.log('fare breakdown member savings framing contract: PASS');
