import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryScore, normalizeProductName, productHighlight } from '../src/data/menuDiscovery';
import { demoSnapshot, snapshotSchema } from '../src/data/snapshot';
import { ShopSystem, SLOT_REAR } from '../src/systems/ShopSystem';
import { buildSnapshot, classify, type McpCall } from '../server/mcp';
import { loadSnapshot } from '../src/data/loadSnapshot';

test('random route stays stable, visits each store before repeats and avoids consecutive duplicates', () => {
  const snapshot = demoSnapshot(), shop = new ShopSystem(snapshot, () => .5);
  const first = shop.destination(1);
  assert.equal(shop.destination(1),first);
  const route = Array.from({length:20},(_,i)=>shop.destination(i+1));
  for (let i=0;i<20;i+=4) assert.equal(new Set(route.slice(i,i+4)).size,4);
  for (let i=1;i<20;i++) assert.notEqual(route[i].id,route[i-1].id);
  shop.open(1); assert.equal(shop.store,first);
  assert.ok(shop.offers.every(p=>first.products.includes(p)));
  const one = new ShopSystem({...snapshot,stores:[snapshot.stores[0]]});
  assert.equal(one.destination(1),one.destination(5));
  const a=new ShopSystem(snapshot,()=>0),b=new ShopSystem(snapshot,()=>.999);
  assert.notEqual(a.destination(1).id,b.destination(1).id);
});
test('implemented weapons top the cards and discovery ranks the featured three', () => {
  const snapshot = demoSnapshot();
  snapshot.stores = [snapshot.stores[0]];
  snapshot.stores[0].products[4].menuPresence = {stores:1,compared:4};
  const shop = new ShopSystem(snapshot,()=>.5);shop.open(1);
  // §9.2：已实装专属武器的餐品进前三张推荐卡；发现度最高的可口可乐（W21）领衔。
  assert.equal(shop.weaponFor(shop.offers[0]), 'W21');
  assert.equal(shop.offers[0].name,'可口可乐');
  // 餐品发现度继续决定其余卡片的顺序：1/4 门店有售的可口可乐排在其组首位。
  const colaAt = shop.offers.findIndex(p => p.name === '可口可乐');
  assert.ok(colaAt >= 0);
  assert.equal(shop.offers.length, 3);
  assert.ok(shop.canReroll(), 'the rest of the priced menu is reachable through reroll');
  // 可口可乐 → 可乐高压脉冲炮（W21 已实装），后槽被初始散弹占据 → 显式替换。
  const wallet={money:1000,health:100};
  assert.equal(shop.buy(colaAt,wallet),'replace');
  assert.equal(shop.buy(colaAt,wallet,SLOT_REAR),'bought');
  assert.ok(shop.slots.some(w=>w?.name==='可口可乐'));
  assert.match(productHighlight(shop.offers[0]),/1\/4/);
  assert.ok(!productHighlight(shop.offers[0]).includes('独家'));
});
test('comparison normalizes names and single-store menus never claim uniqueness', () => {
  assert.equal(normalizeProductName(' 麦咖啡（大杯） '),normalizeProductName('麦咖啡(大杯)'));
  const p={...demoSnapshot().stores[0].products[0],menuPresence:{stores:1,compared:1}};
  assert.equal(productHighlight(p),'');assert.equal(discoveryScore(p),0);
  assert.equal(snapshotSchema.safeParse({...demoSnapshot(),stores:[demoSnapshot().stores[0]]}).success,true);
  assert.match(productHighlight({...p,name:'春日限定汉堡'}),/名称含/);
  for(const name of ['灰焰圆筒','蓝莓爆爆珠麦旋风','月下相思扭扭薯','马苏里拉拉丝芝士条','卡布奇诺','麦香鱼'])assert.ok(classify(name),name);
  for(const name of ['龙焰鸡腿堡三件套','限定丝巾','麦当劳联名徽章'])assert.equal(classify(name),undefined);
});
test('differences compare complete candidate menus before bounded quote selection; one real store is supported', async () => {
  const call: McpCall = async(name,args)=>{
    if(name==='query-nearby-stores')return [1,2].map(id=>({storeCode:String(id),beCode:'5',storeName:`真实门店${id}`}));
    if(name==='query-meals')return {meals:Object.fromEntries(Array.from({length:24},(_,i)=>[String(i),{name:i===23 && args.storeCode==='1'?'特色风味鸡腿堡':`普通${i}汉堡` }]))};
    if(name==='query-meal-detail')return {};
    if(name==='calculate-price')return {price:1900};
    return {};
  };
  const result=await buildSnapshot(call,'上海','测试');
  assert.equal(result.stores.length,2);assert.ok(result.stores.every(s=>s.products.length<=18));
  const p=result.stores.find(s=>s.id==='1')!.products.find(p=>p.name==='特色风味鸡腿堡')!;
  assert.deepEqual(p.menuPresence,{stores:1,compared:2});
  assert.ok(result.stores.find(s=>s.id==='1')!.products.filter(p=>p.name.startsWith('普通')).every(p=>p.menuPresence?.stores===2));
  const one=await buildSnapshot(async(name,args)=>name==='query-nearby-stores'?[{storeCode:'1',beCode:'5',storeName:'仅一家店'}]:call(name,args),'上海','单店');
  assert.equal(one.stores.length,1);assert.ok(one.stores[0].products.every(p=>p.menuPresence?.compared===1));
});
test('city-only startup and optional API area encode correctly and reports server failures as explicit demo data', async () => {
  const original=globalThis.fetch;let url='';
  try {
    globalThis.fetch=async input=>{url=String(input);return new Response(JSON.stringify(demoSnapshot()),{status:200});};
    await loadSnapshot('北京');
    assert.equal(new URL(url,'http://localhost').searchParams.has('area'),false);
    await loadSnapshot('北京','店名 & 区域');
    const parsed=new URL(url,'http://localhost');assert.equal(parsed.searchParams.get('city'),'北京');assert.equal(parsed.searchParams.get('area'),'店名 & 区域');
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'该区域未找到门店'}),{status:422});
    const result=await loadSnapshot('北京','测试');assert.equal(result.snapshot.mode,'demo');assert.equal(result.error,'该区域未找到门店');assert.match(result.reason,/非实时菜单/);
  }finally{globalThis.fetch=original;}
});
test('city suggestions cover more than the original four and dice avoids the current city', async () => {
  const {STARTING_CITIES,randomStartingCity}=await import('../src/data/cities');
  assert.equal(new Set(STARTING_CITIES).size,STARTING_CITIES.length);assert.ok(STARTING_CITIES.length>=30);
  for(const r of [0,.5,.999])assert.notEqual(randomStartingCity('上海',()=>r),'上海');
  assert.ok(STARTING_CITIES.includes(randomStartingCity('自选城市',()=>.5) as typeof STARTING_CITIES[number]));
});
