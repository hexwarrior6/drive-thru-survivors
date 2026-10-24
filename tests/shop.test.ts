import test from 'node:test';
import assert from 'node:assert/strict';
import { demoSnapshot } from '../src/data/snapshot';
import { loadSnapshot } from '../src/data/loadSnapshot';
import { mapProductToWeapon, stats } from '../src/combat/weaponMapper';
import { ShopSystem } from '../src/systems/ShopSystem';
import { WeaponSystem } from '../src/combat/WeaponSystem';
import { CombatSystem } from '../src/combat/CombatSystem';
import { DriftPhysics } from '../src/systems/DriftPhysics';
import { WaveSystem } from '../src/systems/WaveSystem';
import { FIXED_DT } from '../src/config';
function setup() { const shop = new ShopSystem(demoSnapshot(), () => .5); shop.open(1); const combat = new CombatSystem({ explode() {} }); const physics = new DriftPhysics(); return {shop, combat, physics, weapons: new WeaponSystem(shop.slots, combat)}; }
test('catalog maps all menu variants and uses exact catalog damage/levels', () => {
  const p = demoSnapshot().stores[0].products[0];
  for (const [name,type] of [['巨无霸','burger'],['麦辣鸡腿堡','missile'],['中薯条','fries'],['麦乐鸡','mine'],['可口可乐','cola'],['柠檬红茶','ice'],['拿铁咖啡','coffee'],['浓缩咖啡','desperate'],['苹果派','heal'],['甜筒','shield'],['开心乐园餐','wingman']]) assert.equal(mapProductToWeapon({...p,name}),type);
  assert.deepEqual(stats.burger.damage,[40,60,90,125,170]); assert.deepEqual(stats.fries.count,[5,7,9,11,13]); assert.deepEqual(stats.cola.range,[60,80,100,120,140]);
});
test('shop draws three menu products, deducts once, upgrades same name without consuming slots and caps Lv5', () => {
  const {shop,combat} = setup(); combat.money = 1000;
  shop.offers = demoSnapshot().stores[0].products.slice(0,3);
  const price = shop.price(shop.offers[0]);
  assert.equal(shop.buy(0,combat),'bought'); assert.equal(combat.money,1000-price);
  const mountedAt = shop.slots.findIndex(w => w?.name === shop.offers[0]!.name);
  assert.ok(mountedAt >= 0);
  assert.equal(shop.buy(0,combat),'unavailable');
  for (let l=2;l<=5;l++) { shop.sold.clear(); assert.equal(shop.buy(0,combat),'bought'); assert.equal(shop.slots[mountedAt]?.level,l); }
  shop.sold.clear(); assert.equal(shop.buy(0,combat),'unavailable');
  assert.equal(shop.slots.filter(Boolean).length, shop.slots.some(w => w?.type === 'starter') ? 2 : 1);
});
test('upgrades cost a per-level premium while coupons keep discounting them', () => {
  const {shop,combat} = setup(); combat.money = 10000;
  const offer = demoSnapshot().stores[0].products.find(p => p.name === '巨无霸')!;
  shop.offers = [offer];
  const base = shop.basePrice(offer);
  shop.discount = 1;
  const spent: number[] = [];
  for (let level = 0; level < 5; level++) {
    assert.equal(shop.price(offer, level), Math.max(1, Math.ceil(base * [1, 1.8, 2.8, 4.2, 6][level])));
    shop.buy(0, combat); spent.push(combat.money);
    shop.sold.clear();
  }
  for (let i = 1; i < spent.length; i++) assert.ok(spent[i] < spent[i - 1]);
  shop.discount = 0.9;
  assert.equal(shop.price(offer, 2), Math.max(1, Math.ceil(Math.ceil(base * 2.8) * 0.9)));
});
test('round one benches boss-killer guns; round two puts them up front', () => {
  const template = demoSnapshot().stores[0].products[0]!;
  const snapshot = demoSnapshot();
  snapshot.stores = [{ ...snapshot.stores[0]!, products: [
    { ...template, id: 'a', name: '巨无霸' },
    { ...template, id: 'b', name: '开心乐园餐' },
    { ...template, id: 'c', name: '麦辣鸡腿堡' },
  ] }];
  const shop = new ShopSystem(snapshot, () => .5);
  shop.open(1);
  assert.equal(mapProductToWeapon(shop.offers[0]), 'burger');
  assert.ok(shop.offers.slice(1).every(p => ['missile', 'wingman'].includes(mapProductToWeapon(p))));
  shop.open(6);
  assert.ok(['missile', 'wingman'].includes(mapProductToWeapon(shop.offers[0])));
  assert.equal(mapProductToWeapon(shop.offers[2]), 'burger');
});
test('purchases route to their mounts: front gun, rear gun, aux fills in order; the scatter gun is built in', () => {
  const {shop,combat} = setup(); combat.money = 1000; shop.open(1);
  // Store 1 offers: 中薯条 front · 苹果派 aux · 麦乐鸡 rear
  assert.equal(mapProductToWeapon(shop.offers[0]!),'fries'); assert.equal(mapProductToWeapon(shop.offers[1]!),'heal'); assert.equal(mapProductToWeapon(shop.offers[2]!),'mine');
  assert.equal(shop.buy(0,combat),'bought'); assert.equal(shop.slots[0]?.type,'fries');
  assert.equal(shop.buy(1,combat),'bought'); assert.equal(shop.slots[2]?.type,'heal');
  assert.equal(shop.buy(2,combat),'bought'); assert.equal(shop.slots[1]?.type,'mine');
  assert.ok(shop.slots.every(w => w?.type !== 'starter'));
});
test('replacement picks only mounts the offer fits: a front gun cannot displace aux or rear slots', () => {
  const {shop,combat} = setup(); combat.money=100;
  shop.offers = [demoSnapshot().stores[0].products.find(p => p.name === '巨无霸')!];
  for(let i=0;i<5;i++) shop.slots[i]={ name:`old-${i}`,type:'burger',level:1,cooldown:0 };
  const name=shop.offers[0].name, cost=shop.price(shop.offers[0]);
  assert.equal(shop.buy(0,combat),'replace'); assert.equal(combat.money,100);
  shop.pending=-1;
  assert.equal(shop.buy(0,combat,2),'replace'); assert.equal(combat.money,100); assert.equal(shop.slots[2]?.name,'old-2');
  shop.pending=-1;
  assert.equal(shop.buy(0,combat,0),'bought'); assert.equal(shop.slots[0]?.name,name); assert.equal(combat.money,100-cost);
  combat.money=0; assert.equal(shop.buy(0,combat),'unavailable');
});
test('repair costs ten, restores thirty and refuses full health or insufficient funds', () => {
  const {shop,combat} = setup(); combat.money=20; combat.health=85;
  assert.equal(shop.repair(combat),true); assert.equal(combat.health,100); assert.equal(combat.money,10);
  assert.equal(shop.repair(combat),false); combat.health=20; combat.money=9; assert.equal(shop.repair(combat),false);
});
test('food weapons attack automatically, the built-in scatter gun stays on with rear mounts, fries slows and burger pierces', () => {
  for (const type of ['burger','fries','cola','ice','flame','mine'] as const) {
    const {shop,combat,physics,weapons}=setup();
    physics.vx=physics.vy=physics.speed=0;
    const mounts = shop.mountsFor(type);
    shop.slots[mounts[0]!] = {name:type,type,level:3,cooldown:0}; weapons.configure(physics);
    assert.equal(combat.starterEnabled,true);
    const enemy=combat.spawn(0,0,physics.progress + (type==='flame'||type==='mine'?-60: type==='cola'?75:110))!;
    enemy.hp=1000;
    for(let i=0;i<40;i++){combat.step(physics,FIXED_DT);weapons.step(physics,FIXED_DT);}
    assert.ok(enemy.hp<1000,`${type} must damage its target`);
    if(type==='ice') assert.equal(enemy.slow,0);
  }
  const {shop,combat,physics,weapons}=setup(); shop.slots[0]={name:'堡',type:'burger',level:3,cooldown:0};
  for(let i=0;i<3;i++) combat.spawn(0,0,physics.progress+100+i*50);
  weapons.step(physics,FIXED_DT);
  for(let i=0;i<30;i++) combat.step(physics,FIXED_DT);
  assert.equal(combat.kills,3);
});
test('coffee caps passive speed, heals and shields apply and cease when removed', () => {
  const {shop,combat,physics,weapons}=setup();
  shop.slots[0]={name:'咖啡',type:'coffee',level:3,cooldown:0};shop.slots[1]={name:'浓缩',type:'desperate',level:3,cooldown:0};
  combat.health=20; weapons.configure(physics);assert.equal(physics.speedBonus,.25);assert.equal(physics.chargeBonus,.3);assert.equal(physics.nitroRegen,1);
  shop.slots[1]={name:'派',type:'heal',level:3,cooldown:0};shop.slots[2]={name:'甜筒',type:'shield',level:3,cooldown:0};
  for(let i=0;i<601;i++)weapons.step(physics,FIXED_DT);
  assert.equal(combat.shields,1);assert.equal(combat.health,25);
  shop.slots.fill(null);weapons.configure(physics);weapons.step(physics,FIXED_DT);assert.equal(physics.speedBonus,0);assert.equal(combat.shields,0);
});
test('exit pauses wave countdown then grants a full two second turbo with collision immunity', () => {
  const {combat,physics}=setup(), wave=new WaveSystem();wave.state='pit';wave.pitProgress=physics.progress;
  wave.next(combat,physics);
  while(String(wave.state)==='exiting')wave.step(physics,combat,FIXED_DT);
  assert.equal(wave.remaining,44);assert.equal(physics.nitroTime,2);assert.equal(physics.speed,510);
  const hp=combat.health;combat.spawn(1,physics.x-225,physics.progress);combat.step(physics,FIXED_DT);assert.equal(combat.health,hp);
});
test('startup makes one request and returns an explicitly demo snapshot on offline/bad payload', async () => {
  const original=globalThis.fetch;let count=0;
  try { globalThis.fetch=async()=>{count++;throw new Error('offline');}; const data=await loadSnapshot();assert.equal(count,1);assert.equal(data.snapshot.mode,'demo');assert.match(data.reason,/离线示例/); }
  finally{globalThis.fetch=original;}
});
test('an enemy killed by overlapping aura effects yields its reward only once', () => {
  const {combat}=setup();const enemy=combat.spawn(2,0,0)!;
  combat.hit(enemy,100);combat.hit(enemy,100);
  assert.equal(combat.kills,1);assert.equal(combat.coins.activeCount,1);
});
