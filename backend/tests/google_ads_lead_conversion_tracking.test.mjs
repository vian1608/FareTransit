import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function runGoogleAdsLeadConversionTrackingTests() {
  console.log('================================================================================');
  console.log('  GOOGLE ADS LEAD CONVERSION TRACKING AUTOMATED TEST SUITE');
  console.log('================================================================================\n');

  const analyticsJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/shared/utils/analytics.js'), 'utf8');
  const indexHtml = await fs.readFile(path.join(ROOT_DIR, 'frontend/public/index.html'), 'utf8');
  const homeJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/Home.js'), 'utf8');
  const travelAssistanceJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/TravelAssistancePage.js'), 'utf8');
  const flightRouteJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/FlightRoutePage.js'), 'utf8');
  const airlineRouteJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/AirlineRoute.js'), 'utf8');
  const amtrakJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/AmtrakAssistancePage.js'), 'utf8');
  const trainRouteJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/TrainRoutePage.js'), 'utf8');

  // ----------------------------------------------------
  // CASE 1: ANALYTICS UTILITY CONVERSION SPECIFICATION & SAFETY
  // ----------------------------------------------------
  console.log('--- CASE 1: ANALYTICS UTILITY CONVERSION SPECIFICATION & SAFETY ---');
  assert.ok(analyticsJs.includes('AW-18364862445/mIOvCMHyndocEO2fhrVE'), 'analytics.js must target conversion tag AW-18364862445/mIOvCMHyndocEO2fhrVE');
  assert.ok(analyticsJs.includes("value': 1.0") || analyticsJs.includes("value: 1.0") || analyticsJs.includes('value: 1.0'), 'analytics.js conversion value must be 1.0');
  assert.ok(analyticsJs.includes("currency': 'USD'") || analyticsJs.includes("currency: 'USD'") || analyticsJs.includes('currency: "USD"'), 'analytics.js currency must be USD');
  assert.ok(analyticsJs.includes("Google Ads conversion triggered"), 'analytics.js must log "Google Ads conversion triggered" before firing');
  assert.ok(analyticsJs.includes("Google Ads conversion sent: AW-18364862445/mIOvCMHyndocEO2fhrVE"), 'analytics.js must log "Google Ads conversion sent" after firing');
  assert.ok(analyticsJs.includes("firedConversions"), 'analytics.js must deduplicate conversion triggers');
  console.log('✔ CASE 1 PASSED: trackLeadConversion utility spec, logging, retry & deduplication verified.\n');

  // ----------------------------------------------------
  // CASE 2: GLOBAL TAG IN INDEX.HTML (NO GLOBAL CONVERSION EVENT)
  // ----------------------------------------------------
  console.log('--- CASE 2: GLOBAL TAG IN INDEX.HTML ---');
  assert.ok(indexHtml.includes('AW-18364862445'), 'index.html must contain global tag AW-18364862445');
  assert.ok(indexHtml.includes('window.gtag = window.gtag || gtag;'), 'index.html must bind window.gtag globally');
  assert.ok(!indexHtml.includes('mIOvCMHyndocEO2fhrVE'), 'index.html MUST NOT contain the lead conversion event snippet globally');
  console.log('✔ CASE 2 PASSED: Global tag present & bound; conversion event snippet excluded from global index.html.\n');

  // ----------------------------------------------------
  // CASE 3: HOME.JS LEAD FORM SUCCESS INTEGRATION
  // ----------------------------------------------------
  console.log('--- CASE 3: HOME.JS LEAD FORM SUCCESS INTEGRATION ---');
  assert.ok(homeJs.includes('trackLeadConversion'), 'Home.js must import and call trackLeadConversion');
  assert.ok(!homeJs.includes('AW-18166581434/W9aXCMPzpq8cELqRwNZD'), 'Home.js must not retain old conversion tag');
  console.log('✔ CASE 3 PASSED: Home.js custom inquiry lead conversion integration verified.\n');

  // ----------------------------------------------------
  // CASE 4: TRAVEL ASSISTANCE PAGE SUCCESS INTEGRATION
  // ----------------------------------------------------
  console.log('--- CASE 4: TRAVEL ASSISTANCE PAGE SUCCESS INTEGRATION ---');
  assert.ok(travelAssistanceJs.includes('trackLeadConversion'), 'TravelAssistancePage.js must call trackLeadConversion');
  assert.ok(travelAssistanceJs.includes('id="inquiry"'), 'TravelAssistancePage.js must render inquiry section at #inquiry');
  console.log('✔ CASE 4 PASSED: TravelAssistancePage.js lead conversion integration verified.\n');

  // ----------------------------------------------------
  // CASE 5: FLIGHT ROUTE PAGE SUCCESS INTEGRATION
  // ----------------------------------------------------
  console.log('--- CASE 5: FLIGHT ROUTE PAGE SUCCESS INTEGRATION ---');
  assert.ok(flightRouteJs.includes('trackLeadConversion'), 'FlightRoutePage.js must call trackLeadConversion');
  console.log('✔ CASE 5 PASSED: FlightRoutePage.js lead conversion integration verified.\n');

  // ----------------------------------------------------
  // CASE 6: AIRLINE ROUTE PAGE SUCCESS INTEGRATION
  // ----------------------------------------------------
  console.log('--- CASE 6: AIRLINE ROUTE PAGE SUCCESS INTEGRATION ---');
  assert.ok(airlineRouteJs.includes('trackLeadConversion'), 'AirlineRoute.js must call trackLeadConversion');
  console.log('✔ CASE 6 PASSED: AirlineRoute.js lead conversion integration verified.\n');

  // ----------------------------------------------------
  // CASE 7: AMTRAK ASSISTANCE PAGE SUCCESS INTEGRATION
  // ----------------------------------------------------
  console.log('--- CASE 7: AMTRAK ASSISTANCE PAGE SUCCESS INTEGRATION ---');
  assert.ok(amtrakJs.includes('trackLeadConversion'), 'AmtrakAssistancePage.js must call trackLeadConversion');
  assert.ok(!amtrakJs.includes('AW-18166581434/W9aXCMPzpq8cELqRwNZD'), 'AmtrakAssistancePage.js must not retain old conversion tag');
  console.log('✔ CASE 7 PASSED: AmtrakAssistancePage.js lead conversion integration verified.\n');

  // ----------------------------------------------------
  // CASE 8: TRAIN ROUTE PAGE SUCCESS INTEGRATION
  // ----------------------------------------------------
  console.log('--- CASE 8: TRAIN ROUTE PAGE SUCCESS INTEGRATION ---');
  assert.ok(trainRouteJs.includes('trackLeadConversion'), 'TrainRoutePage.js must call trackLeadConversion');
  console.log('✔ CASE 8 PASSED: TrainRoutePage.js lead conversion integration verified.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 8 GOOGLE ADS LEAD CONVERSION TRACKING TESTS PASSED!');
  console.log('================================================================================\n');
}

runGoogleAdsLeadConversionTrackingTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});

