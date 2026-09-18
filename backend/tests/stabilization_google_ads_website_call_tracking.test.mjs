import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'frontend', 'public', 'index.html'), 'utf8');
const supportContact = fs.readFileSync(path.join(repoRoot, 'frontend', 'src', 'shared', 'constants', 'supportContact.js'), 'utf8');

const destination = 'AW-18445776391/npW0CKTQwfwcEIfs0NtE';
const phoneNumber = '+1 (888) 780-8855';

const destinationMatches = indexHtml.match(new RegExp(destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || [];
assert.equal(destinationMatches.length, 1, 'Google Ads website-call destination must be configured exactly once.');
assert.ok(indexHtml.includes(`'phone_conversion_number': '${phoneNumber}'`), 'Google Ads website-call tracking must use the exact number displayed on FareTransit, including country code and formatting.');
assert.ok(indexHtml.includes("'phone_conversion_callback': window.fareTransitPhoneConversionCallback"), 'Google Ads website-call tracking must install the forwarding-number callback.');
assert.ok(indexHtml.includes('window.fareTransitApplyGoogleForwardingNumber'), 'Forwarding-number DOM replacement must remain installed.');
assert.ok(indexHtml.includes("link.setAttribute('href', 'tel:' + mobileHref)"), 'Forwarding-number replacement must update clickable tel links, not only visible text.');
assert.ok(indexHtml.includes('https://www.googletagmanager.com/gtag/js?id=AW-18445776391'), 'The Google tag loader for the conversion account must remain installed.');
assert.ok(supportContact.includes("SUPPORT_PHONE_DISPLAY = '+1 (888) 780-8855'"), 'The tracked phone number must stay aligned with the canonical visible support number.');
assert.ok(supportContact.includes("SUPPORT_PHONE_TEL = '+18887808855'"), 'The tracked phone number must stay aligned with the canonical tel link.');

console.log(`Google Ads website call tracking contract passed for ${destination} → ${phoneNumber} with forwarding-number callback.`);
