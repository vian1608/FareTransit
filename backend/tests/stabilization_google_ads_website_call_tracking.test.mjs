import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'frontend', 'public', 'index.html'), 'utf8');

const destination = 'AW-18445776391/npW0CKTQwfwcEIfs0NtE';
const phoneNumber = '8887808855';

const destinationMatches = indexHtml.match(new RegExp(destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || [];
assert.equal(destinationMatches.length, 1, 'Google Ads website-call destination must be configured exactly once.');
assert.match(indexHtml, /['"]phone_conversion_number['"]\s*:\s*['"]8887808855['"]/, 'Google Ads website-call tracking must use the approved FareTransit number.');
assert.ok(indexHtml.includes('https://www.googletagmanager.com/gtag/js?id=AW-18445776391'), 'The Google tag loader for the conversion account must remain installed.');

console.log(`Google Ads website call tracking contract passed for ${destination} → ${phoneNumber}.`);
