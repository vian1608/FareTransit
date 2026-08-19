import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const autocomplete = read('frontend/src/features/flights/components/AirportAutocomplete.js');
const identity = read('frontend/src/features/flights/utils/airportIdentity.js');

assert.match(autocomplete, /groupAirportSuggestionsByCity/);
assert.match(autocomplete, /Search by city, airport name, or 3-letter code/);
assert.match(autocomplete, /city: 'Rome'/);
assert.match(autocomplete, /code: 'FCO'/);
assert.match(autocomplete, /code: 'CIA'/);
assert.match(autocomplete, /isResolvedAirport/);
assert.match(autocomplete, /airport-suggestion-city/);
assert.doesNotMatch(autocomplete, /substring\(0,\s*3\)/);
assert.match(identity, /\^\[A-Z\]\{3\}\$/);
assert.doesNotMatch(identity, /\{3,4\}/);

console.log('airport city + airport search contract: PASS');
