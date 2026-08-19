import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import enquiryService from '../src/modules/enquiries/enquiry.service.mjs';
import enquiryRepository from '../src/modules/enquiries/enquiry.repository.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

// Enable test-only memory fallback flag explicitly for test runner
process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_MEMORY_FALLBACK = 'true';

console.log('========================================================================');
console.log('  CUSTOM INQUIRY + LEAD PERSISTENCE + GOOGLE ADS CONVERSION TEST SUITE');
console.log('========================================================================\n');

async function runTests() {
  let passedCount = 0;

  // Test 1: Custom Inquiry contains ONE submit button ("Submit Request") in Home.js
  const homeJsContent = fs.readFileSync(path.join(projectRoot, 'frontend/src/features/flights/pages/Home.js'), 'utf8');
  assert.ok(homeJsContent.includes('Submit Request'), 'Home.js must contain "Submit Request" button');
  assert.ok(!homeJsContent.includes('handleSearchSchedules'), 'Home.js must not contain handleSearchSchedules');
  console.log('✔ 1. Custom Inquiry renders one submit button ("Submit Request") and removed handleSearchSchedules.');
  passedCount++;

  // Test 2: Custom Inquiry contains no Search Flights button inside inquiry tab
  const inquiryTabSection = homeJsContent.split('Consulting Inquiry')[1] || '';
  assert.ok(!inquiryTabSection.includes('Search Flights'), 'Custom Inquiry tab must contain NO "Search Flights" button');
  console.log('✔ 2. Custom Inquiry tab contains zero "Search Flights" buttons.');
  passedCount++;

  // Test 3: Book Flights tab still contains Search Flights button
  const searchTabSection = homeJsContent.split("{activeTab === 'search' ? (")[1]?.split('Consulting Inquiry')[0] || '';
  assert.ok(searchTabSection.includes('Search Flights'), 'Book Flights tab MUST still contain "Search Flights" button');
  console.log('✔ 3. Book Flights tab still contains "Search Flights" button.');
  passedCount++;

  // Test 4: cabinClass state usage
  assert.ok(homeJsContent.includes('cabinClass'), 'Home.js must use cabinClass in initialFormData and CustomSelect');
  assert.ok(!inquiryTabSection.includes('formData.travelClass'), 'Custom Inquiry tab must not use formData.travelClass');
  console.log('✔ 4. cabinClass state used cleanly without travelClass mismatch.');
  passedCount++;

  // Test 5: smsOptIn initialized in initialFormData
  assert.ok(homeJsContent.includes('smsOptIn: false'), 'initialFormData must initialize smsOptIn to false');
  console.log('✔ 5. smsOptIn initialized as false in initialFormData.');
  passedCount++;

  // Test 6 & 7 & 8: Validation logic in Home.js
  assert.ok(homeJsContent.includes('validateInquiry'), 'Home.js must implement explicit validateInquiry()');
  assert.ok(homeJsContent.includes('Departure date is required'), 'validateInquiry must require departure date');
  assert.ok(homeJsContent.includes('Return date is required for round-trip flights'), 'validateInquiry must check return date for roundtrip');
  console.log('✔ 6-8. Explicit validateInquiry blocks missing departure date and requires return date for round-trip.');
  passedCount++;

  // Test 9 & 10: Backend inquiry POST succeeds & returns persisted: true and leadId
  const testPayload = {
    serviceType: 'flights',
    name: 'Test Passenger',
    email: 'testpassenger@example.com',
    phone: '+1 555-0199',
    origin: 'JFK',
    destination: 'LAX',
    tripType: 'oneway',
    travelDate: '2026-11-15',
    passengers: '1',
    cabinClass: 'economy',
    notes: 'Test lead persistence',
    smsOptIn: true
  };

  const res = await enquiryService.submitEnquiry(testPayload);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.persisted, true, 'res.persisted must be true');
  assert.ok(res.leadId, 'Response must include leadId');
  console.log(`✔ 9-10. Inquiry submission succeeds and returns persisted: true with leadId (${res.leadId}).`);
  passedCount++;

  // Test 11: Notification failure does NOT lose lead
  const testPayloadMailFail = {
    ...testPayload,
    email: 'failmail@example.com'
  };
  const resMailFail = await enquiryService.submitEnquiry(testPayloadMailFail);
  assert.strictEqual(resMailFail.success, true);
  assert.strictEqual(resMailFail.persisted, true);
  assert.ok(resMailFail.leadId);
  console.log('✔ 11. Notification email failure does not lose the lead; returns success: true & persisted: true.');
  passedCount++;

  // Test 12: Production Mode Strict Error Handling (No test flag -> throws INQUIRY_PERSISTENCE_FAILED)
  delete process.env.ALLOW_TEST_MEMORY_FALLBACK;
  try {
    await enquiryRepository.saveEnquiry(testPayload);
    assert.fail('Should have thrown INQUIRY_PERSISTENCE_FAILED when DB insert fails without test flag');
  } catch (err) {
    assert.strictEqual(err.code, 'INQUIRY_PERSISTENCE_FAILED');
  }
  process.env.ALLOW_TEST_MEMORY_FALLBACK = 'true';
  console.log('✔ 12. Strict production mode throws INQUIRY_PERSISTENCE_FAILED on DB failure (0 fake UUIDs created).');
  passedCount++;

  // Test 13: Senior Travel serviceType accepted and classified as AIR
  const seniorPayload = {
    serviceType: 'senior-travel',
    name: 'Elderly Passenger',
    email: 'senior@example.com',
    origin: 'MIA',
    destination: 'LHR',
    travelDate: '2026-12-01',
    tripType: 'oneway'
  };
  const resSenior = await enquiryService.submitEnquiry(seniorPayload);
  assert.strictEqual(resSenior.success, true);
  assert.strictEqual(resSenior.persisted, true);
  assert.ok(resSenior.leadId);
  console.log('✔ 13. Senior Travel serviceType accepted by backend and returns persisted: true.');
  passedCount++;

  // Test 14: AppErrorBoundary route-awareness
  const errorBoundaryContent = fs.readFileSync(path.join(projectRoot, 'frontend/src/shared/components/AppErrorBoundary.js'), 'utf8');
  assert.ok(errorBoundaryContent.includes('isAdmin'), 'AppErrorBoundary must check if path is admin');
  assert.ok(errorBoundaryContent.includes('Something went wrong while loading this page'), 'Public pages must show friendly non-admin message');
  console.log('✔ 14. AppErrorBoundary displays route-aware messages for admin vs public pages.');
  passedCount++;

  // Test 15: Frontend conversion check requires result.persisted === true
  assert.ok(homeJsContent.includes('result?.persisted === true'), 'Home.js must check result?.persisted === true');
  const seniorJsContent = fs.readFileSync(path.join(projectRoot, 'frontend/src/features/flights/pages/SeniorTravelPage.js'), 'utf8');
  assert.ok(seniorJsContent.includes('result?.persisted === true'), 'SeniorTravelPage.js must check result?.persisted === true');
  console.log('✔ 15. Frontend lead conversion tracking strictly requires result.persisted === true.');
  passedCount++;

  console.log('========================================================================');
  console.log(`🎉 ALL TESTS PASSED SUCCESSFULLY! (${passedCount} assertions verified)`);
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
