import assert from 'assert';
import fs from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import { fileURLToPath } from 'url';
import app from '../src/app.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========================================================================');
console.log('  CACHE CONTROL & PRIVATE DATA SECURITY AUTOMATED TEST SUITE');
console.log('========================================================================\n');

async function runTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // TEST 1: Private Route Protection
    console.log('--- TEST 1: Private API Endpoints Must Have Strict No-Store Headers ---');
    const privateEndpoints = [
      '/api/admin/bookings',
      '/api/admin/stats',
      '/api/bookings/TFS-2026-EK1VM8',
      '/api/payments',
      '/api/authorizations/sample-token',
      '/api/auth/me',
      '/api/customers'
    ];

    for (const endpoint of privateEndpoints) {
      const res = await fetch(`${baseUrl}${endpoint}`);
      const cacheControl = res.headers.get('cache-control') || '';
      const pragma = res.headers.get('pragma') || '';
      const expires = res.headers.get('expires') || '';

      console.log(`[GET ${endpoint}] Cache-Control: "${cacheControl}"`);

      assert.ok(cacheControl.includes('no-store'), `Endpoint ${endpoint} must include 'no-store' in Cache-Control`);
      assert.ok(cacheControl.includes('private'), `Endpoint ${endpoint} must include 'private' in Cache-Control`);
      assert.ok(cacheControl.includes('no-cache'), `Endpoint ${endpoint} must include 'no-cache' in Cache-Control`);
      assert.ok(cacheControl.includes('must-revalidate'), `Endpoint ${endpoint} must include 'must-revalidate' in Cache-Control`);

      assert.strictEqual(cacheControl.includes('public'), false, `Endpoint ${endpoint} MUST NOT contain 'public'`);
      assert.strictEqual(cacheControl.includes('s-maxage'), false, `Endpoint ${endpoint} MUST NOT contain 's-maxage'`);
      assert.strictEqual(cacheControl.includes('stale-while-revalidate'), false, `Endpoint ${endpoint} MUST NOT contain 'stale-while-revalidate'`);

      assert.strictEqual(pragma, 'no-cache', `Endpoint ${endpoint} must have Pragma: no-cache`);
      assert.strictEqual(expires, '0', `Endpoint ${endpoint} must have Expires: 0`);
    }
    console.log('✓ TEST 1 PASSED: All private endpoints strictly reject caching.\n');

    // TEST 2: Non-GET Write Operations Protection
    console.log('--- TEST 2: All Non-GET Write Operations Must Be Forced No-Store ---');
    const writeRequests = [
      { method: 'POST', endpoint: '/api/bookings/import-itinerary' },
      { method: 'POST', endpoint: '/api/payments/whop' },
      { method: 'PUT', endpoint: '/api/admin/bookings/123/pricing' },
      { method: 'PATCH', endpoint: '/api/admin/bookings/123/status' },
      { method: 'DELETE', endpoint: '/api/admin/bookings/123' }
    ];

    for (const reqInfo of writeRequests) {
      const res = await fetch(`${baseUrl}${reqInfo.endpoint}`, { method: reqInfo.method });
      const cacheControl = res.headers.get('cache-control') || '';

      console.log(`[${reqInfo.method} ${reqInfo.endpoint}] Cache-Control: "${cacheControl}"`);

      assert.ok(cacheControl.includes('no-store'), `${reqInfo.method} request to ${reqInfo.endpoint} must include 'no-store'`);
      assert.ok(cacheControl.includes('private'), `${reqInfo.method} request to ${reqInfo.endpoint} must include 'private'`);
    }
    console.log('✓ TEST 2 PASSED: All write operations are guaranteed no-store.\n');

    // TEST 3: Public Lookup Endpoints Caching
    console.log('--- TEST 3: Safe Public Lookup APIs Have CDN Cache Headers ---');
    const publicEndpoints = [
      '/api/airports?q=Houston',
      '/api/address-autocomplete?q=123+Main'
    ];

    for (const endpoint of publicEndpoints) {
      const res = await fetch(`${baseUrl}${endpoint}`);
      const cacheControl = res.headers.get('cache-control') || '';
      const vercelCdn = res.headers.get('vercel-cdn-cache-control') || '';

      console.log(`[GET ${endpoint}] Cache-Control: "${cacheControl}" | Vercel-CDN: "${vercelCdn}"`);

      assert.ok(cacheControl.includes('public'), `Public lookup ${endpoint} must include 'public' Cache-Control`);
      assert.ok(cacheControl.includes('max-age=300'), `Public lookup ${endpoint} must include 'max-age=300'`);
      assert.ok(vercelCdn.includes('s-maxage=86400'), `Vercel CDN header must include 's-maxage=86400'`);
      assert.ok(vercelCdn.includes('stale-while-revalidate=3600'), `Vercel CDN header must include 'stale-while-revalidate=3600'`);
    }
    console.log('✓ TEST 3 PASSED: Public lookup endpoints have CDN caching enabled.\n');

    // TEST 4: vercel.json Syntax & Rule Validation
    console.log('--- TEST 4: vercel.json Header Configuration Validation ---');
    const vercelConfigPath = path.resolve(__dirname, '../../vercel.json');
    assert.ok(fs.existsSync(vercelConfigPath), 'vercel.json must exist');

    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    assert.ok(Array.isArray(config.headers), 'vercel.json must contain a headers array');

    const staticRule = config.headers.find(h => h.source.includes('static'));
    assert.ok(staticRule, 'Must have static assets caching rule');
    const staticCc = staticRule.headers.find(h => h.key === 'Cache-Control');
    assert.strictEqual(staticCc.value, 'public, max-age=31536000, immutable', 'Static assets must use immutable 1-year cache');

    const htmlRule = config.headers.find(h => h.source.includes('index.html'));
    assert.ok(htmlRule, 'Must have index.html revalidation rule');
    const htmlCc = htmlRule.headers.find(h => h.key === 'Cache-Control');
    assert.strictEqual(htmlCc.value, 'public, max-age=0, must-revalidate', 'index.html must force must-revalidate');

    console.log('✓ TEST 4 PASSED: vercel.json header configuration rules verified.\n');

    console.log('🎉 ALL CACHE CONTROL & SECURITY TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
