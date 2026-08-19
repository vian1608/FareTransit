import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { validateHtmlOutput } from '../src/integrations/resend/resend.service.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, '../src/integrations/resend/templates/booking-confirmation.html');

async function runTests() {
  console.log('\n=== RUNNING EMAIL TEMPLATE HANDLEBARS TESTS ===\n');

  const templateSource = await fs.readFile(templatePath, 'utf8');
  const template = Handlebars.compile(templateSource);

  const baseData = {
    emailHeaderSubtitle: 'FLIGHT RESERVATION CONFIRMATION',
    confirmationCode: 'TFS-CONF-1234',
    passengerFirstName: 'Sophia',
    passengerName: 'Sophia Martinez',
    currencySymbol: '$',
    amountPaid: '549.99',
    currency: 'USD',
    paymentMethod: 'Credit Card',
    paymentDate: 'Aug 3, 2026',
    passengerCount: '1',
    customerEmail: 'sophia@example.com',
    outboundAirline: 'Frontier Airlines',
    outboundFlightNumber: 'F9 1496',
    outboundOriginCity: 'Houston',
    outboundOriginCode: 'IAH',
    outboundDestinationCity: 'Fort Lauderdale',
    outboundDestinationCode: 'FLL',
    outboundDepartureDate: 'Sep 10, 2026',
    outboundDepartureTime: '08:25 AM',
    outboundArrivalDate: 'Sep 10, 2026',
    outboundArrivalTime: '12:12 PM',
    outboundCabin: 'Economy',
    outboundStops: 'Nonstop'
  };

  // TEST 1 — Round trip
  console.log('Test 1: Verifying round trip email generation (hasReturnFlight = true)...');
  const roundTripData = {
    ...baseData,
    hasReturnFlight: true,
    returnAirline: 'United Airlines',
    returnFlightNumber: 'UA 470',
    returnOriginCity: 'Miami',
    returnOriginCode: 'MIA',
    returnDestinationCity: 'Houston',
    returnDestinationCode: 'IAH',
    returnDepartureDate: 'Sep 17, 2026',
    returnDepartureTime: '02:00 PM',
    returnArrivalDate: 'Sep 17, 2026',
    returnArrivalTime: '04:15 PM',
    returnCabin: 'Economy',
    returnStops: 'Nonstop'
  };

  const roundTripHtml = template(roundTripData);
  assert.ok(roundTripHtml.includes('Frontier Airlines F9 1496'), 'Outbound details must exist');
  assert.ok(roundTripHtml.includes('United Airlines UA 470'), 'Return details must exist');
  assert.ok(!roundTripHtml.includes('{{#if'), 'Should not contain raw handlebars tag {{#if');
  assert.ok(!roundTripHtml.includes('{{/if'), 'Should not contain raw handlebars tag {{/if');
  
  // Guard validation check on valid output
  validateHtmlOutput(roundTripHtml, 'booking-confirmation', 'TFS-CONF-1234');
  console.log('  ✔ Round trip email compiled cleanly with no raw tokens.\n');

  // TEST 2 — One way
  console.log('Test 2: Verifying one way email generation (hasReturnFlight = false)...');
  const oneWayData = {
    ...baseData,
    hasReturnFlight: false
  };

  const oneWayHtml = template(oneWayData);
  assert.ok(oneWayHtml.includes('Frontier Airlines F9 1496'), 'Outbound details must exist');
  assert.ok(!oneWayHtml.includes('returnAirline'), 'Return details placeholder returnAirline should be compiled away');
  assert.ok(!oneWayHtml.includes('United Airlines'), 'Return details should be absent');
  assert.ok(!oneWayHtml.includes('{{#if'), 'Should not contain raw handlebars tag {{#if');
  assert.ok(!oneWayHtml.includes('{{/if'), 'Should not contain raw handlebars tag {{/if');
  
  validateHtmlOutput(oneWayHtml, 'booking-confirmation', 'TFS-CONF-1234');
  console.log('  ✔ One way email compiled cleanly, omitting return section.\n');

  // TEST 3 — Missing Boolean
  console.log('Test 3: Verifying missing boolean handles gracefully (hasReturnFlight = undefined)...');
  const missingBoolData = {
    ...baseData,
    hasReturnFlight: undefined
  };

  const missingBoolHtml = template(missingBoolData);
  assert.ok(!missingBoolHtml.includes('returnAirline'), 'Return details placeholder should be compiled away');
  assert.ok(!missingBoolHtml.includes('{{#if'), 'Should not contain raw handlebars tag {{#if');
  
  validateHtmlOutput(missingBoolHtml, 'booking-confirmation', 'TFS-CONF-1234');
  console.log('  ✔ Missing boolean defaults return block to absent.\n');

  // TEST 4 — Unresolved token guard
  console.log('Test 4: Verifying unresolved token guard throws exception...');
  const brokenHtml = roundTripHtml.replace('Sophia Martinez', '{{unresolvedPassengerToken}}');
  
  assert.throws(() => {
    validateHtmlOutput(brokenHtml, 'booking-confirmation', 'TFS-CONF-1234');
  }, /EMAIL_TEMPLATE_RENDER_FAILED/, 'Guard must throw EMAIL_TEMPLATE_RENDER_FAILED error on unresolved tokens');
  console.log('  ✔ Unresolved token guard correctly blocks template output with error.\n');

  console.log('🎉 ALL EMAIL TEMPLATE HANDLEBARS TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
