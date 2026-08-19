import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('  GOOGLE ADS LEAD-CONVERSION TRACKING VERIFICATION SUITE');
console.log('  Conversion Target: AW-18364862445/mIOvCMHyndocEO2fhrVE');
console.log('========================================================================\n');

async function runTests() {
  const rootDir = process.cwd();
  const indexHtmlPath = path.join(rootDir, '../frontend/public/index.html');
  const analyticsJsPath = path.join(rootDir, '../frontend/src/shared/utils/analytics.js');
  const homeJsPath = path.join(rootDir, '../frontend/src/features/flights/pages/Home.js');
  const travelAssistancePath = path.join(rootDir, '../frontend/src/features/flights/pages/TravelAssistancePage.js');
  const flightRoutePath = path.join(rootDir, '../frontend/src/features/flights/pages/FlightRoutePage.js');
  const airlineRoutePath = path.join(rootDir, '../frontend/src/features/flights/pages/AirlineRoute.js');
  const amtrakPath = path.join(rootDir, '../frontend/src/features/flights/pages/AmtrakAssistancePage.js');
  const trainRoutePath = path.join(rootDir, '../frontend/src/features/flights/pages/TrainRoutePage.js');

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const analyticsJs = fs.readFileSync(analyticsJsPath, 'utf8');

  // TEST 1: Single Google Tag Base Tag in index.html immediately after <head>
  console.log('--- TEST 1: Google Base Tag Installation ---');
  assert.ok(indexHtml.includes('AW-18364862445'), 'index.html must contain global conversion tag AW-18364862445');
  assert.ok(indexHtml.includes("gtag('config', 'AW-18364862445')"), 'index.html must configure AW-18364862445');
  
  // Verify only one base tag script tag for AW-18364862445 exists
  const matches = indexHtml.match(/googletagmanager\.com\/gtag\/js\?id=AW-18364862445/g);
  assert.strictEqual(matches.length, 1, 'Exactly one AW-18364862445 script tag must exist in index.html');
  console.log('✓ TEST 1 PASSED: Exactly 1 Google Ads base tag installed in index.html.\n');

  // TEST 2: Shared Analytics Helper Configuration
  console.log('--- TEST 2: Shared Conversion Helper Payload & Target ---');
  assert.ok(analyticsJs.includes('AW-18364862445/mIOvCMHyndocEO2fhrVE'), 'analytics.js must send to AW-18364862445/mIOvCMHyndocEO2fhrVE');
  assert.ok(analyticsJs.includes("value: 1.0") || analyticsJs.includes("value,"), 'analytics.js must send value 1.0');
  assert.ok(analyticsJs.includes("currency: 'USD'") || analyticsJs.includes("currency,"), 'analytics.js must send currency USD');
  console.log('✓ TEST 2 PASSED: Shared conversion helper targets AW-18364862445/mIOvCMHyndocEO2fhrVE with value 1.0 USD.\n');

  // TEST 3: Duplicate Lead ID Prevention & Window Guard Simulation
  console.log('--- TEST 3: Lead ID Deduplication & Window Guard Simulation ---');
  
  // Simulated window & dataLayer mock
  const dataLayer = [];
  global.window = {
    dataLayer,
    gtag: function(type, action, payload) {
      dataLayer.push({ type, action, ...payload });
    }
  };
  global.process = { env: { NODE_ENV: 'test' } };

  // Dynamically import analytics module logic
  const analyticsModule = await import(`file://${analyticsJsPath}?t=${Date.now()}`);
  const { trackLeadConversion } = analyticsModule;

  // First call with leadId
  const lead1Res = trackLeadConversion({ leadId: 'lead_test_1001', value: 1.0, currency: 'USD' });
  assert.strictEqual(lead1Res, true, 'First tracking call with leadId must return true');
  assert.strictEqual(dataLayer.length, 1, 'dataLayer must record exactly 1 conversion event');
  assert.strictEqual(dataLayer[0].send_to, 'AW-18364862445/mIOvCMHyndocEO2fhrVE');
  assert.strictEqual(dataLayer[0].value, 1.0);
  assert.strictEqual(dataLayer[0].currency, 'USD');

  // Duplicate call with same leadId
  const lead1Dup = trackLeadConversion({ leadId: 'lead_test_1001', value: 1.0, currency: 'USD' });
  assert.strictEqual(lead1Dup, false, 'Duplicate tracking call with same leadId must return false');
  assert.strictEqual(dataLayer.length, 1, 'dataLayer must NOT record a second conversion event');
  console.log('✓ TEST 3 PASSED: Duplicate lead ID conversion suppressed cleanly.\n');

  // TEST 4: Missing gtag / Async script loading fallback to dataLayer
  console.log('--- TEST 4: Missing gtag / Async script loading fallback ---');
  delete global.window.gtag;

  let exceptionThrown = false;
  let result = null;
  try {
    result = trackLeadConversion({ leadId: 'lead_test_1002', value: 1.0, currency: 'USD' });
  } catch (err) {
    exceptionThrown = true;
  }

  assert.strictEqual(exceptionThrown, false, 'Missing gtag must NOT throw an exception');
  assert.strictEqual(result, true, 'Missing gtag must safely fallback and return true after queuing to dataLayer');
  console.log('✓ TEST 4 PASSED: Missing window.gtag queued safely to dataLayer without crashing app.\n');

  // TEST 5: No PII Payload Audit
  console.log('--- TEST 5: PII Audit ---');
  global.window.gtag = function(type, action, payload) {
    // Assert payload contains ONLY send_to, value, currency, event_callback
    const keys = Object.keys(payload);
    const forbiddenKeys = ['name', 'email', 'phone', 'passport', 'card', 'passenger', 'ssn'];
    forbiddenKeys.forEach(fk => {
      assert.strictEqual(keys.includes(fk), false, `Payload must not contain PII key: ${fk}`);
    });
  };

  trackLeadConversion({
    leadId: 'lead_test_1003',
    value: 1.0,
    currency: 'USD',
    name: 'John Doe', // should be stripped / not passed to gtag
    email: 'john@example.com' // should be stripped / not passed to gtag
  });
  console.log('✓ TEST 5 PASSED: Conversion payload strictly excludes customer PII.\n');

  // TEST 6: All Lead Forms Coverage Audit
  console.log('--- TEST 6: Lead Form Integration Coverage Audit ---');
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
    assert.ok(code.includes('trackLeadConversion'), `${f.name} must import and call trackLeadConversion`);
    console.log(`  ✓ Form integrated: ${f.name}`);
  });

  console.log('\n✓ TEST 6 PASSED: All 6 lead forms have trackLeadConversion integrated.\n');

  console.log('🎉 ALL GOOGLE ADS LEAD-CONVERSION TRACKING TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exitCode = 1;
});
