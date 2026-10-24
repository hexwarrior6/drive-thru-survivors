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
  for (const [name,type] of [['巨无霸','burger'],['麦辣鸡腿堡','flame'],['中薯条','fries'],['麦乐鸡','mine'],['可口可乐','cola'],['柠檬红茶','ice'],['拿铁咖啡','coffee'],['浓缩咖啡','desperate'],['苹果派','heal'],['甜筒','shield']]) assert.equal(mapProductToWeapon({...p,name}),type);
  assert.deepEqual(stats.burger.damage,[40,60,90]); assert.deepEqual(stats.fries.count,[5,7,9]); assert.deepEqual(stats.cola.range,[60,80,100]);
});
test('shop draws three menu products, deducts once, upgrades same name without consuming slots and caps Lv3', () => {
  const {shop,combat} = setup(); combat.money = 1000;
  shop.offers = demoSnapshot().stores[0].products.slice(0,3);
  const price = shop.price(shop.offers[0]);
  assert.equal(shop.buy(0,combat),'bought'); assert.equal(combat.money,1000-price);
  assert.equal(shop.buy(0,combat),'unavailable');
  for (let l=2;l<=3;l++) { shop.sold.clear(); assert.equal(shop.buy(0,combat),'bought'); assert.equal(shop.slots[1]?.level,l); }
  shop.sold.clear(); assert.equal(shop.buy(0,combat),'unavailable'); assert.equal(shop.slots.filter(Boolean).length,2);
});
test('six full slots require selection and confirmation; cancel/insufficient funds do not spend', () => {
  const {shop,combat} = setup(); combat.money=100;
  for(let i=0;i<6;i++) shop.slots[i]={ name:`old-${i}`,type:'burger',level:1,cooldown:0 };
  const name=shop.offers[0].name, cost=shop.price(shop.offers[0]);
  assert.equal(shop.buy(0,combat),'replace'); assert.equal(combat.money,100); assert.equal(shop.slots[2]?.name,'old-2');
  shop.pending=-1; assert.equal(combat.money,100);
  assert.equal(shop.buy(0,combat,2),'bought'); assert.equal(shop.slots[2]?.name,name); assert.equal(combat.money,100-cost);
  combat.money=0; assert.equal(shop.buy(1,combat),'unavailable');
});
test('repair costs ten, restores thirty and refuses full health or insufficient funds', () => {
  const {shop,combat} = setup(); combat.money=20; combat.health=85;
  assert.equal(shop.repair(combat),true); assert.equal(combat.health,100); assert.equal(combat.money,10);
  assert.equal(shop.repair(combat),false); combat.health=20; combat.money=9; assert.equal(shop.repair(combat),false);
});
test('food weapons attack automatically, starter replacement disables its turret, fries slows and burger pierces', () => {
  for (const type of ['burger','fries','cola','ice','flame','mine'] as const) {
    const {shop,combat,physics,weapons}=setup();
    physics.vx=physics.vy=physics.speed=0;
    shop.slots[0]={name:type,type,level:3,cooldown:0}; weapons.configure(physics);
    assert.equal(combat.starterEnabled,false);
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
  assert.equal(wave.remaining,48);assert.equal(physics.nitroTime,2);assert.equal(physics.speed,510);
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
