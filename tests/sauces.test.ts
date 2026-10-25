import test from 'node:test';
import assert from 'node:assert/strict';
import { SAUCES, SAUCE_BITS, SAUCE, hasSauce, sauceOffersFor, sauceByKey } from '../src/combat/sauces';
import { CombatSystem } from '../src/combat/CombatSystem';
import { WeaponSystem } from '../src/combat/WeaponSystem';
import { DriftPhysics } from '../src/systems/DriftPhysics';
import { saveRun, loadRun, clearRun } from '../src/systems/SaveSystem';
import { demoSnapshot } from '../src/data/snapshot';
import { FIXED_DT } from '../src/config';

const silent = { explode() {} };
/** Static road cone ahead of the car keeps distance-sensitive assertions exact. */
function dummy(c: CombatSystem, x: number, z: number, hp = 500) {
  const e = c.spawn(0, x, z)!;
  e.hp = hp;
  return e;
}
function parkedRider(c: CombatSystem, x: number, z: number) {
  const e = c.spawn(2, x, z)!;
  e.vx = e.vz = 0;
  return e;
}
function mk(weaponId: string, level = 1, branch?: 'a' | 'b') {
  return { weaponId, name: weaponId, level, cooldown: 0, invested: 0, art: '', branch };
}

test('sauce registry: four bounded rule packs with complete copy', () => {
  assert.deepEqual(SAUCES.map(s => s.key), ['sweetSour', 'ketchup', 'chili', 'crema']);
  assert.equal(new Set(SAUCES.map(s => SAUCE_BITS[s.key])).size, 4);
  for (const s of SAUCES) {
    assert.ok(s.label && s.effect && s.tint, `${s.key} needs label/effect/tint`);
    assert.ok(s.bound.length >= 6, `${s.key} must state its boundary`);
    assert.ok(s.targets.length >= 4, `${s.key} must list affected equipment`);
    assert.equal(sauceByKey(s.key)?.key, s.key);
  }
});

test('sauce constants stay locked to the design spec', () => {
  assert.equal(SAUCE.wallLife, 1.5); assert.equal(SAUCE.wallBound, 150);
  assert.equal(SAUCE.splashRadius, 80); assert.equal(SAUCE.splashShare, 0.45);
  assert.equal(SAUCE.burnSeconds, 3); assert.equal(SAUCE.burnRate, 0.22);
  assert.equal(SAUCE.nativeBurnBoost, 1.25);
  assert.equal(SAUCE.driftWindow, 3); assert.equal(SAUCE.driftRate, 0.8); assert.equal(SAUCE.driftCooldown, 8);
  assert.equal(SAUCE.skipGold, 15);
});

test('seeded offers are deterministic, exclude owned and respect the wall boundary', () => {
  const first = sauceOffersFor(1234, 2, 0, true);
  assert.equal(first.length, 3);
  assert.equal(new Set(first).size, 3);
  assert.deepEqual(sauceOffersFor(1234, 2, 0, true), first, 'same seed + wave + owned = same candidates');
  assert.notDeepEqual(sauceOffersFor(4321, 2, 0, true), first, 'a different runSeed reshuffles');
  const owned = first.reduce((bits, k) => bits | SAUCE_BITS[k], 0);
  for (const key of sauceOffersFor(1234, 5, owned, true)) assert.ok(!hasSauce(owned, key), 'offers must exclude owned packets');
  const all = SAUCES.reduce((bits, s) => bits | SAUCE_BITS[s.key], 0);
  assert.deepEqual(sauceOffersFor(1234, 10, all, true), []);
  // 构筑没有弹墙兼容弹道时，甜酸酱让位给对当前装备有效的候选（等待未来换装）。
  const offers = sauceOffersFor(7, 2, 0, false);
  assert.ok(!offers.includes('sweetSour'), 'invalid candidate yields its slot to valid ones');
  assert.ok(offers.length === 3, 'three valid packets still fill the offer');
  // 空兼容池回退：只剩甜酸酱时仍然给出（不空手）。
  const rest = SAUCES.filter(s => s.key !== 'sweetSour').reduce((bits, s) => bits | SAUCE_BITS[s.key], 0);
  assert.deepEqual(sauceOffersFor(7, 2, rest, false), ['sweetSour']);
});

test('ketchup splashes neighbours once per direct hit without reaching outliers', () => {
  let explosions = 0;
  const c = new CombatSystem({ explode: () => { explosions++; } }), p = new DriftPhysics();
  c.equipSauce('ketchup');
  const w = new WeaponSystem([null, mk('scatter'), null, null, null], c);
  const rider = parkedRider(c, 0, -100);
  const neighbour = parkedRider(c, 60, -100);
  const outlier = parkedRider(c, 200, -100);
  for (let i = 0; i < 30; i++) { c.step(p, FIXED_DT); w.step(p, FIXED_DT); }
  assert.ok(rider.hp < 80, 'direct pellets land');
  const direct = rider.hp;
  assert.ok(neighbour.hp < 80, `splash reached the neighbour (hp ${neighbour.hp})`);
  assert.equal(outlier.hp, 80, 'splash never reaches outliers');
  assert.ok(explosions >= 1, 'splash shows its burst');
  void direct;
});

test('chili attaches burn on direct hits and tick does not feed itself', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  c.equipSauce('chili');
  const w = new WeaponSystem([mk('W01'), null, null, null, null], c);
  const target = dummy(c, 0, 240);
  for (let i = 0; i < 20; i++) { c.step(p, FIXED_DT); w.step(p, FIXED_DT); }
  assert.ok(target.burn > 0 && target.burn <= SAUCE.burnSeconds);
  assert.ok(Math.abs(target.burnDamage - 55 * SAUCE.burnRate) < 1e-9, `burn rate follows the hit (${target.burnDamage})`);
});

test('sweet-and-sour only steers wall-capable ballistics off the road edges', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  c.equipSauce('sweetSour');
  const capable = c.bullets.acquire()!;
  capable.x = capable.px = 100; capable.z = capable.pz = 300; capable.vx = 500; capable.vz = 200;
  capable.life = 3; capable.damage = 10; capable.kind = 3; capable.level = 1; capable.pierce = 1;
  capable.targetSlot = -1; capable.hitMask.fill(0); capable.tex = ''; capable.traits = c.sauceBits;
  capable.meta = 8; capable.leg = 0; capable.hits = 0; capable.age = 0;
  for (let i = 0; i < 20 && capable.vx > 0; i++) c.step(p, FIXED_DT);
  assert.ok(capable.vx < 0, 'wall-compatible bullet bounced at the road edge');
  const heavy = c.bullets.acquire()!;
  heavy.x = heavy.px = 100; heavy.z = heavy.pz = 300; heavy.vx = 500; heavy.vz = 200;
  heavy.life = 3; heavy.damage = 55; heavy.kind = 1; heavy.level = 1; heavy.pierce = 2;
  heavy.targetSlot = -1; heavy.hitMask.fill(0); heavy.tex = ''; heavy.traits = c.sauceBits;
  heavy.meta = 0; heavy.leg = 0; heavy.hits = 0; heavy.age = 0;
  for (let i = 0; i < 10; i++) c.step(p, FIXED_DT);
  assert.ok(heavy.vx > 0 || !heavy.active, 'pierce cannon ballistics never bounce (meta bit unset)');
});

test('native trail burn and chili keep the strongest dot instead of stacking', () => {
  const c = new CombatSystem(silent);
  c.equipSauce('chili');
  const e = dummy(c, 0, 100);
  // 尾焰火带的原生灼烧在辣椒酱下获得有限的持续时间强化。
  c.applyBurn(e, 1.6 * SAUCE.nativeBurnBoost, 12);
  assert.ok(Math.abs(e.burn - 1.6 * SAUCE.nativeBurnBoost) < 1e-9);
  const dps = e.burnDamage;
  c.applyBurn(e, SAUCE.burnSeconds, 5);
  assert.equal(e.burnDamage, dps, 'weaker chili attach must not overwrite the native dot');
});

test('run saves round-trip sauces, claimed rewards and the run seed', () => {
  clearRun();
  saveRun({
    v: 6, runSeed: 424242, car: 'flash', city: '上海', wave: 6, duration: 42, atPit: true,
    health: 80, money: 20, kills: 5, maxCombo: 10, distance: 100, nitro: 50,
    slots: [null, { weaponId: 'scatter', name: '初始散弹炮', level: 1, invested: 0 }, null, null, null],
    sauces: ['ketchup', 'chili'], sauceWaves: [2, 5],
    route: [], bagIds: [], snapshot: demoSnapshot(), savedAt: new Date().toISOString(),
  });
  const run = loadRun()!;
  assert.equal(run.v, 6);
  assert.equal(run.runSeed, 424242);
  assert.deepEqual(run.sauces, ['ketchup', 'chili']);
  assert.deepEqual(run.sauceWaves, [2, 5]);
  clearRun();
});
