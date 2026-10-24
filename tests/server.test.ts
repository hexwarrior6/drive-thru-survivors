import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app';
import { allowedTools, buildSnapshot, type McpCall } from '../server/mcp';

test('gateway exposes demo without credentials, validation and no arbitrary MCP passthrough', async () => {
  const app = createApp();
  try {
    assert.equal((await app.inject('/api/health')).json().ok, true);
    assert.equal((await app.inject('/api/status')).json().configured, false);
    assert.equal((await app.inject('/api/snapshot')).json().mode, 'demo');
    assert.equal((await app.inject('/api/snapshot?city=')).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/mcp' })).statusCode, 404);
    for (let i = 0; i < 30; i++) await app.inject('/api/health');
    assert.equal((await app.inject('/api/health')).statusCode, 429);
  } finally { await app.close(); }
});
const seen: string[] = [];
const call: McpCall = async (name, args) => {
  assert.ok(allowedTools.includes(name)); seen.push(name);
  switch (name) {
    case 'query-nearby-stores': return [1,2,3,4].map(id => ({ storeCode: `${id}`, beCode: '5', storeName: `门店 ${id}`, businessStatus: false, reservation: true, reservationTimeOptions: [{ date: '2026-10-25', reservationOptionText: '午餐（11:00至14:00）' }] }));
    case 'query-meals': assert.equal(args.reservationDate, '2026-10-25 12:00'); return { meals: { a: { name: '巨无霸', currentPrice: 1 }, b: { name: '中薯条', currentPrice: 1 }, c: { name: '可口可乐', currentPrice: 1 }, d: { name: '双层吉士汉堡', currentPrice: 2 }, e: { name: '双人套餐', currentPrice: 1 } } };
    case 'query-meal-detail': return args.code === 'd' ? { rounds: [{}] } : {};
    case 'calculate-price': return { price: 2300, couponId: 'SECRET', couponCode: 'SECRET' };
    case 'campaign-calendar': return {};
    case 'query-store-coupons': return [{ title: '优惠参考', couponId: 'SECRET', couponCode: 'SECRET' }];
  }
};
test('reused MCP pipeline filters combos, quotes integer cents, labels closed menus and strips secrets', async () => {
  seen.length = 0;
  const snapshot = await buildSnapshot(call, '上海', '人民广场');
  assert.equal(snapshot.mode, 'live'); assert.equal(snapshot.stores.length, 4);
  assert.equal(snapshot.stores[0].referenceTime, '2026-10-25 12:00');
  assert.equal(snapshot.stores[0].products.length, 3);
  assert.ok(snapshot.stores.every(s => s.products.every(p => p.price === 2300)));
  assert.ok(!JSON.stringify(snapshot).includes('SECRET'));
  assert.deepEqual(new Set(seen), new Set(allowedTools));
});
test('snapshot requests coalesce/cache, upstream errors remain explicit and endpoint rate limits', async () => {
  let nearby = 0;
  const app = createApp('', async (name,args) => { if (name === 'query-nearby-stores') nearby++; return call(name,args); });
  try {
    const results = await Promise.all([app.inject('/api/snapshot'), app.inject('/api/snapshot')]);
    assert.ok(results.every(r => r.statusCode === 200)); assert.equal(nearby, 1);
    await app.inject('/api/snapshot'); assert.equal(nearby, 1);
    for (let i = 0; i < 4; i++) await app.inject('/api/snapshot');
    assert.equal((await app.inject('/api/snapshot')).statusCode, 429);
  } finally { await app.close(); }
  const broken = createApp('', async () => { throw new Error('Token SECRET'); });
  try { const r = await broken.inject('/api/snapshot'); assert.equal(r.statusCode, 502); assert.ok(!r.body.includes('SECRET')); } finally { await broken.close(); }
});
