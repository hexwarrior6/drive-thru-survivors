import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerless } from '../server/serverless.js';
import { allowedTools, type McpCall } from '../server/mcp.js';

const field = (body: unknown) => body as Record<string, unknown>;
const call: McpCall = async name => {
  assert.ok(allowedTools.includes(name));
  switch (name) {
    case 'query-nearby-stores': return [1, 2, 3, 4].map(id => ({ storeCode: `${id}`, beCode: '5', storeName: `门店 ${id}` }));
    case 'query-meals': return { meals: { a: { name: '巨无霸', currentPrice: 1 }, b: { name: '中薯条', currentPrice: 1 }, c: { name: '可口可乐', currentPrice: 1 } } };
    case 'query-meal-detail': return {};
    case 'calculate-price': return { price: 2300 };
    case 'campaign-calendar': return {};
    case 'query-store-coupons': return [];
  }
};

test('serverless core mirrors the gateway: demo, validation, limits and no passthrough', async () => {
  const handle = createServerless();
  const params = new URLSearchParams();
  assert.equal(field((await handle('/api/health', params)).body).ok, true);
  assert.equal(field((await handle('/api/status', params)).body).configured, false);
  assert.equal(field((await handle('/api/snapshot', params)).body).mode, 'demo');
  assert.equal((await handle('/api/snapshot', new URLSearchParams('city='))).status, 400);
  assert.equal((await handle('/api/mcp', params)).status, 404);
  for (let i = 0; i < 30; i++) await handle('/api/health', params);
  assert.equal((await handle('/api/health', params)).status, 429);
});

test('serverless core coalesces, caches and rate limits snapshot requests', async () => {
  let nearby = 0;
  const handle = createServerless('', async (name, args) => { if (name === 'query-nearby-stores') nearby++; return call(name, args); });
  const params = new URLSearchParams('city=上海');
  const results = await Promise.all([handle('/api/snapshot', params), handle('/api/snapshot', params)]);
  assert.ok(results.every(r => r.status === 200)); assert.equal(nearby, 1);
  await handle('/api/snapshot', params); assert.equal(nearby, 1);
  for (let i = 0; i < 4; i++) await handle('/api/snapshot', params);
  assert.equal((await handle('/api/snapshot', params)).status, 429);
});

test('serverless core maps upstream failures without leaking secrets', async () => {
  const handle = createServerless('', async () => { throw new Error('Token SECRET'); });
  const r = await handle('/api/snapshot', new URLSearchParams('city=上海'));
  assert.equal(r.status, 502); assert.ok(!JSON.stringify(r.body).includes('SECRET'));
});
