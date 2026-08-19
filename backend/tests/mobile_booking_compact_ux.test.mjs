import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const entry = read('frontend/src/index.js');
const mobileCss = read('frontend/src/shared/styles/MobileBookingUX.css');
const choiceCss = read('frontend/src/shared/styles/BookingChoiceUX.css');
const mobileUx = read('frontend/src/shared/mobile/installMobileBookingUX.js');
const accordion = read('frontend/src/shared/components/AccordionSection.js');

assert.match(entry, /MobileBookingUX\.css/);
assert.match(entry, /BookingChoiceUX\.css/);
assert.match(entry, /installMobileBookingUX/);

// Back is part of normal mobile document flow and therefore cannot cover the
// "YOUR SELECTED ITINERARY" heading again.
assert.match(mobileCss, /\.tfs-customer-back-wrap--booking\s*\{[\s\S]*position:\s*static\s*!important/);
assert.match(mobileCss, /\.booking-itinerary-top-panel__title\s*\{[\s\S]*position:\s*static\s*!important/);

// The desktop horizontal flight route is explicitly converted to a vertical
// journey on phones. Segment connectors become vertical dashed lines.
assert.match(mobileCss, /\.itinerary-timeline-container > div:nth-child\(2\)\s*\{[\s\S]*flex-direction:\s*column\s*!important/);
assert.match(mobileCss, /div:nth-child\(even\) > div:last-child\s*\{[\s\S]*border-left:\s*2px dashed #94a3b8\s*!important/);

// The duplicate lower route summary stays hidden on mobile, leaving airline on
// the left and duration/stops on the right without vertical word wrapping.
assert.match(mobileCss, /\.itin-col-route\s*\{[\s\S]*display:\s*none\s*!important/);
assert.match(mobileCss, /\.itin-airline-name,[\s\S]*white-space:\s*nowrap\s*!important[\s\S]*word-break:\s*normal\s*!important/);
assert.match(mobileCss, /\.itin-summary-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto 18px\s*!important/);

// Only one major checkout accordion may be open at a time on phones.
assert.match(accordion, /MOBILE_ACCORDION_EVENT\s*=\s*'tfs:mobile-accordion-open'/);
assert.match(accordion, /window\.dispatchEvent\(new CustomEvent\(MOBILE_ACCORDION_EVENT/);
assert.match(accordion, /otherId !== id && isOpen/);

// Multi-passenger checkout remains one-card-at-a-time and validation reopens
// the affected passenger automatically.
assert.match(mobileUx, /tfs-pax-collapsed/);
assert.match(mobileUx, /openOnly/);
assert.match(mobileUx, /passengerComplete/);
assert.match(mobileCss, /\.passenger-card-block\.tfs-pax-collapsed > :not\(\.passenger-card-title\)[\s\S]*display:\s*none\s*!important/);
assert.match(mobileUx, /tfs-passenger-card-error/);
assert.match(mobileUx, /if \(errorCard && isMobile\(\)\) openOnly\(errorCard\)/);

// Critical cascade guard: the open passenger grid uses display:grid !important.
// The collapsed state therefore needs a more-specific rule that appears AFTER
// the open-grid rule, otherwise the arrow rotates while fields remain visible.
const openGridRule = mobileCss.indexOf('.passenger-card-block > .booking-form-grid,');
const collapsedGridRule = mobileCss.indexOf('.passenger-card-block.tfs-pax-collapsed > .booking-form-grid,');
assert.ok(openGridRule >= 0, 'mobile open passenger grid rule must exist');
assert.ok(collapsedGridRule > openGridRule, 'collapsed passenger grid rule must appear after open grid rule');
assert.match(mobileCss, /\.passenger-card-block\.tfs-pax-collapsed > \.booking-form-grid,[\s\S]*display:\s*none\s*!important/);

// The currently open passenger is compacted into sensible two-column rows on
// phones, while <=360px safely falls back to one column.
assert.match(mobileCss, /nth-of-type\(1\)[\s\S]*grid-template-columns:\s*minmax\(88px,\s*0\.7fr\) minmax\(0,\s*1\.3fr\)\s*!important/);
assert.match(mobileCss, /nth-of-type\(2\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(0,\s*1fr\)\s*!important/);
assert.match(mobileCss, /nth-of-type\(3\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(0,\s*1fr\)\s*!important/);
assert.match(mobileCss, /@media \(max-width:\s*360px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/);

// Contact shortcut stays useful but compact on mobile; helper copy is hidden.
assert.match(choiceCss, /@media \(max-width:\s*640px\)[\s\S]*\.booking-page \.contact-checkbox-row\s*\{[\s\S]*min-height:\s*54px\s*!important/);
assert.match(choiceCss, /\.booking-page \.contact-checkbox-row label::after\s*\{[\s\S]*display:\s*none\s*!important/);

// Wheelchair remains a normal checkbox and advisory notes retain proper inset.
assert.match(choiceCss, /#wheelchair-check\s*\{[\s\S]*-webkit-appearance:\s*checkbox\s*!important/);
assert.match(choiceCss, /#accordion-body-requests textarea\s*\{[\s\S]*padding:\s*0\.72rem 0\.85rem\s*!important/);

// Payment security, billing prompt, terms, and CTA are intentionally compact.
assert.match(mobileCss, /\.card-payment-header\s*\{[\s\S]*padding:\s*0\.68rem\s*!important/);
assert.match(mobileCss, /\.security-badge-group\s*\{[\s\S]*flex-direction:\s*row\s*!important/);
assert.match(mobileCss, /\.billing-address-compact-notice\s*\{[\s\S]*padding:\s*0\.65rem\s*!important/);
assert.match(mobileCss, /\.card-input-wrapper:has\(input:placeholder-shown\) \.card-brand-icon\s*\{[\s\S]*display:\s*none\s*!important/);

// Footer should no longer consume most of the final mobile screen.
assert.match(mobileCss, /\.footer-section__toggle\s*\{[\s\S]*min-height:\s*36px\s*!important/);

console.log('rebuilt compact mobile booking UX contract: PASS');
