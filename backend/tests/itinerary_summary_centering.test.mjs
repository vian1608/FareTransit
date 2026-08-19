import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const css = fs.readFileSync(
  path.join(root, 'frontend/src/features/bookings/components/ItineraryCard.css'),
  'utf8'
);

assert.match(css, /\.itin-summary-row\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\);/);
assert.match(css, /\.itin-col-route\s*\{[\s\S]*grid-column:\s*2;[\s\S]*justify-self:\s*center;/);
assert.match(css, /\.itin-col-meta\s*\{[\s\S]*grid-column:\s*3;[\s\S]*justify-self:\s*end;/);
assert.match(css, /\.itin-chevron\s*\{[\s\S]*position:\s*absolute;[\s\S]*right:\s*1rem;/);

console.log('itinerary summary route centering contract: PASS');
