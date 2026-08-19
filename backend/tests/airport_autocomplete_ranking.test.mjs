import assert from 'node:assert';
import { searchAndRankLocalAirports, scoreAirportMatch, rankAirportSuggestions, GLOBAL_AIRPORTS } from '../src/modules/flights/airport-ranker.mjs';
import serpapiService from '../src/integrations/serpapi/serpapi.service.mjs';

async function runAirportRankingTests() {
  console.log('\n=== RUNNING AIRPORT AUTOCOMPLETE RANKING TESTS ===\n');

  // Test 1: LHR Query Priority
  console.log('Test 1: Query "LHR" -> Top result must be London Heathrow Airport (LHR)');
  const lhrResults = searchAndRankLocalAirports('LHR');
  assert.ok(lhrResults.length > 0, 'LHR search returned results');
  assert.strictEqual(lhrResults[0].code, 'LHR', 'First result for "LHR" is London Heathrow');
  console.log(`  ✔ Top result for "LHR": ${lhrResults[0].name} (${lhrResults[0].code}), ${lhrResults[0].city}\n`);

  // Test 2: GEG Query Priority
  console.log('Test 2: Query "GEG" -> Top result must be Spokane International Airport (GEG)');
  const gegResults = searchAndRankLocalAirports('GEG');
  assert.ok(gegResults.length > 0, 'GEG search returned results');
  assert.strictEqual(gegResults[0].code, 'GEG', 'First result for "GEG" is Spokane International Airport');
  assert.strictEqual(gegResults[0].city, 'Spokane');
  console.log(`  ✔ Top result for "GEG": ${gegResults[0].name} (${gegResults[0].code}), ${gegResults[0].city}\n`);

  // Test 3: JFK Query Priority
  console.log('Test 3: Query "JFK" -> Top result must be John F. Kennedy International Airport (JFK)');
  const jfkResults = searchAndRankLocalAirports('JFK');
  assert.ok(jfkResults.length > 0, 'JFK search returned results');
  assert.strictEqual(jfkResults[0].code, 'JFK', 'First result for "JFK" is John F. Kennedy International');
  console.log(`  ✔ Top result for "JFK": ${jfkResults[0].name} (${jfkResults[0].code}), ${jfkResults[0].city}\n`);

  // Test 4: City Query "London"
  console.log('Test 4: Query "London" -> All major London airports returned ranked by relevance');
  const londonResults = searchAndRankLocalAirports('London');
  assert.ok(londonResults.length >= 3, 'Returns at least 3 London airports');
  const londonCodes = londonResults.map(a => a.code);
  assert.ok(londonCodes.includes('LHR'), 'Includes LHR');
  assert.ok(londonCodes.includes('LGW'), 'Includes LGW');
  assert.ok(londonCodes.includes('LCY'), 'Includes LCY');
  console.log(`  ✔ London query returned: ${londonCodes.join(', ')}\n`);

  // Test 5: City Query "Spokane"
  console.log('Test 5: Query "Spokane" -> Spokane International Airport (GEG)');
  const spokaneResults = searchAndRankLocalAirports('Spokane');
  assert.ok(spokaneResults.length > 0, 'Spokane search returned results');
  assert.strictEqual(spokaneResults[0].code, 'GEG');
  console.log(`  ✔ Top result for "Spokane": ${spokaneResults[0].name} (${spokaneResults[0].code})\n`);

  // Test 6: City Query "New York"
  console.log('Test 6: Query "New York" -> JFK, LGA, EWR');
  const nyResults = searchAndRankLocalAirports('New York');
  const nyCodes = nyResults.map(a => a.code);
  assert.ok(nyCodes.includes('JFK'), 'Includes JFK');
  assert.ok(nyCodes.includes('LGA'), 'Includes LGA');
  assert.ok(nyCodes.includes('EWR'), 'Includes EWR');
  console.log(`  ✔ New York query returned: ${nyCodes.join(', ')}\n`);

  // Test 7: Integration check via serpapiService.autocompleteAirports
  console.log('Test 7: Integration via serpapiService.autocompleteAirports...');
  const apiLhr = await serpapiService.autocompleteAirports('LHR');
  assert.strictEqual(apiLhr[0].code, 'LHR');

  const apiGeg = await serpapiService.autocompleteAirports('GEG');
  assert.strictEqual(apiGeg[0].code, 'GEG');
  console.log('  ✔ SerpAPI integration ranking verified\n');

  console.log('🎉 ALL AIRPORT AUTOCOMPLETE RANKING TESTS PASSED SUCCESSFULLY!\n');
}

runAirportRankingTests().catch(err => {
  console.error('❌ Airport Ranking Test Failed:', err);
  process.exit(1);
});
