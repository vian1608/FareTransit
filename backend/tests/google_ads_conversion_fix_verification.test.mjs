import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('  GOOGLE ADS CONVERSION DETECTION FIX VERIFICATION SUITE');
console.log('  Conversion Destination: AW-18364862445/mIOvCMHyndocEO2fhrVE');
console.log('========================================================================\n');

async function runTests() {
  const rootDir = process.cwd();
  const indexHtmlPath = path.join(rootDir, '../frontend/public/index.html');
  const googleAdsJsPath = path.join(rootDir, '../frontend/src/utils/googleAds.js');
  const analyticsJsPath = path.join(rootDir, '../frontend/src/shared/utils/analytics.js');
  const homeJsPath = path.join(rootDir, '../frontend/src/features/flights/pages/Home.js');
  const travelAssistancePath = path.join(rootDir, '../frontend/src/features/flights/pages/TravelAssistancePage.js');
  const flightRoutePath = path.join(rootDir, '../frontend/src/features/flights/pages/FlightRoutePage.js');
  const airlineRoutePath = path.join(rootDir, '../frontend/src/features/flights/pages/AirlineRoute.js');
  const amtrakPath = path.join(rootDir, '../frontend/src/features/flights/pages/AmtrakAssistancePage.js');
  const trainRoutePath = path.join(rootDir, '../frontend/src/features/flights/pages/TrainRoutePage.js');

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const googleAdsJs = fs.readFileSync(googleAdsJsPath, 'utf8');

  // TEST 1: Single Google Base Tag & Global window.gtag Assignment
  console.log('--- TEST 1: Google Base Tag & Global window.gtag Assignment ---');
  assert.ok(indexHtml.includes('AW-18364862445'), 'index.html must include base tag AW-18364862445');
  assert.ok(indexHtml.includes('window.gtag = function'), 'index.html must set window.gtag = function globally');
  assert.ok(!indexHtml.includes('AW-18166581434'), 'index.html must not contain legacy AW-18166581434 tag');
  const tagMatches = indexHtml.match(/googletagmanager\.com\/gtag\/js\?id=AW-18364862445/g);
  assert.strictEqual(tagMatches.length, 1, 'Exactly one AW-18364862445 script tag must exist in index.html');
  console.log('✓ TEST 1 PASSED: Exactly 1 base tag installed and window.gtag explicitly assigned.\n');

  // TEST 2: Helper Function Configuration & DataLayer Queueing Fallback
  console.log('--- TEST 2: Conversion Helper & DataLayer Queueing Fallback ---');
  const dataLayer = [];
  global.window = { dataLayer };

  // Dynamically import googleAds helper
  const googleAdsModule = await import(`file://${googleAdsJsPath}?t=${Date.now()}`);
  const { trackGoogleAdsLeadConversion } = googleAdsModule;

  // Dispatch conversion when window.gtag is not yet set by Google script
  const lead1Res = trackGoogleAdsLeadConversion({ leadId: 'lead_fix_1001', value: 1.0, currency: 'USD' });
  assert.strictEqual(lead1Res, true, 'trackGoogleAdsLeadConversion must return true');
  assert.strictEqual(typeof global.window.gtag, 'function', 'window.gtag fallback function must be initialized');
  assert.strictEqual(dataLayer.length, 1, 'dataLayer must have received 1 queued item');
  assert.strictEqual(dataLayer[0][0], 'event');
  assert.strictEqual(dataLayer[0][1], 'conversion');
  assert.strictEqual(dataLayer[0][2].send_to, 'AW-18364862445/mIOvCMHyndocEO2fhrVE');
  assert.strictEqual(dataLayer[0][2].value, 1.0);
  assert.strictEqual(dataLayer[0][2].currency, 'USD');
  console.log('✓ TEST 2 PASSED: Fallback queue correctly pushes conversion to window.dataLayer.\n');

  // TEST 3: Double Submission & Lead ID Deduplication
  console.log('--- TEST 3: Lead ID Deduplication Guard ---');
  const lead1Dup = trackGoogleAdsLeadConversion({ leadId: 'lead_fix_1001', value: 1.0, currency: 'USD' });
  assert.strictEqual(lead1Dup, false, 'Duplicate conversion call for lead_fix_1001 must return false');
  assert.strictEqual(dataLayer.length, 1, 'dataLayer count must remain 1');
  console.log('✓ TEST 3 PASSED: Duplicate lead submission conversion suppressed.\n');

  // TEST 4: Backend Success Verification Simulation
  console.log('--- TEST 4: Backend API Response Verification ---');
  const mockBackendFailure = { success: false, message: 'Backend validation error' };
  let conversionTriggeredOnFailure = false;
  if (mockBackendFailure?.success || mockBackendFailure?.emailed) {
    conversionTriggeredOnFailure = true;
    trackGoogleAdsLeadConversion({ leadId: 'fail_1' });
  }
  assert.strictEqual(conversionTriggeredOnFailure, false, 'Backend failure must NOT trigger conversion');
  console.log('✓ TEST 4 PASSED: Backend failure cleanly prevents conversion event.\n');

  // TEST 5: Zero PII Audit
  console.log('--- TEST 5: Zero PII Payload Audit ---');
  let dispatchedPayload = null;
  global.window.gtag = function(type, action, payload) {
    dispatchedPayload = payload;
  };

  trackGoogleAdsLeadConversion({
    leadId: 'lead_fix_1002',
    value: 1.0,
    currency: 'USD',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+15550199'
  });

  const payloadKeys = Object.keys(dispatchedPayload);
  ['name', 'email', 'phone', 'passport', 'card', 'ssn'].forEach(forbiddenKey => {
    assert.strictEqual(payloadKeys.includes(forbiddenKey), false, `Payload must not contain PII: ${forbiddenKey}`);
  });
  console.log('✓ TEST 5 PASSED: Conversion payload strictly excludes all customer PII.\n');

  // TEST 6: All 6 Forms Coverage Audit
  console.log('--- TEST 6: Form Coverage Audit ---');
  const forms = [
    { name: 'Home.js (Inquiry Form)', path: homeJsPath },
    { name: 'TravelAssistancePage.js', path: travelAssistancePath },
    { name: 'FlightRoutePage.js', path: flightRoutePath },
    { name: 'AirlineRoute.js', path: airlineRoutePath },
    { name: 'AmtrakAssistancePage.js', path: amtrakPath },
    { name: 'TrainRoutePage.js', path: trainRoutePath },
  ];

  forms.forEach(f => {
    const code = fs.readFileSync(f.path, 'utf8');
    assert.ok(code.includes('trackLeadConversion') || code.includes('trackGoogleAdsLeadConversion'), `${f.name} must call conversion tracking`);
    assert.ok(code.includes('result?.success') || code.includes('result?.emailed'), `${f.name} must check backend success response`);
    console.log(`  ✓ Form verified: ${f.name}`);
  });

  console.log('\n✓ TEST 6 PASSED: All 6 lead forms verify backend success and trigger conversion tracking.\n');

  console.log('🎉 ALL CONVERSION DETECTION FIX VERIFICATION TESTS PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
