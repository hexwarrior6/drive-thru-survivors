import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatSystem } from '../src/combat/CombatSystem';
import { WeaponSystem } from '../src/combat/WeaponSystem';
import { WEAPONS, weaponStats } from '../src/combat/weaponCatalog';
import { identityFor } from '../src/combat/foodIdentity';
import { SAUCE } from '../src/combat/sauces';
import { DriftPhysics } from '../src/systems/DriftPhysics';
import { ShopSystem, SLOT_REAR } from '../src/systems/ShopSystem';
import { demoSnapshot } from '../src/data/snapshot';
import { FIXED_DT } from '../src/config';
import type { EquippedWeapon } from '../src/systems/ShopSystem';

const silent = { explode() {} };

function slot(weaponId: string, level = 1, branch?: 'a' | 'b'): EquippedWeapon {
  return { weaponId, name: weaponId, level, cooldown: 0, invested: 0, art: '', branch };
}
/** Rig with explicit front/rear/module mounts; combat + weapons share the slots array. */
function rig(front: EquippedWeapon | null, rear: EquippedWeapon | null, mods: (EquippedWeapon | null)[] = []) {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  const slots: (EquippedWeapon | null)[] = [front, rear, mods[0] ?? null, mods[1] ?? null, mods[2] ?? null];
  return { c, p, w: new WeaponSystem(slots, c), slots };
}
function settle(steps: number, c: CombatSystem, w: WeaponSystem, p: DriftPhysics): void {
  for (let i = 0; i < steps; i++) { c.step(p, FIXED_DT); w.step(p, FIXED_DT); }
}
/** Static road cone ahead of the car; hp overrides keep decay assertions exact. */
function dummy(c: CombatSystem, x: number, z: number, hp = 500) {
  const e = c.spawn(0, x, z)!;
  e.hp = hp;
  return e;
}
/** Pursuer parked behind the car (scatter's bread and butter). */
function parkedRider(c: CombatSystem, x: number, z: number) {
  const e = c.spawn(2, x, z)!;
  e.vx = e.vz = 0;
  return e;
}
function firstBullet(c: CombatSystem, kind: number) {
  return c.bullets.items.find(b => b.active && b.kind === kind);
}

// ---- 目录与身份映射：稳定 ID 与显式降级 ----

test('catalog keeps 32 promised slots plus service entries; prototypes are ready', () => {
  const catalog = WEAPONS.filter(w => /^W\d+$/.test(w.id));
  assert.equal(catalog.length, 32);
  const ready = catalog.filter(w => w.ready);
  assert.deepEqual(ready.map(w => w.id).sort(), ['W01', 'W07', 'W12']);
  for (const w of ready) {
    assert.ok(w.blurb.includes('；'), `${w.id} needs a behaviour+weakness blurb`);
    assert.ok(w.branches && w.branches.length === 2, `${w.id} needs two Lv.3 branches`);
    assert.ok(w.damage.length === 5 && w.interval.length === 5, `${w.id} needs per-level tables`);
  }
});

test('food identity keeps recipe words and demotes unimplemented weapons explicitly', () => {
  assert.equal(identityFor('巨无霸', 'main').weaponId, 'W01');
  assert.equal(identityFor('扭扭薯条', 'side').weaponId, 'W12');
  assert.equal(identityFor('板烧鸡腿堡', 'main').weaponId, 'W07');
  // 大小份/别名归入同一身份：中薯与大薯不制造两件武器。
  assert.equal(identityFor('中薯条', 'side').id, identityFor('大薯条', 'side').id);
  // 目标武器未实装 → 显式落到对应挂载的通用改装，绝不冒领专属身份。
  assert.equal(identityFor('麦香鱼', 'main').weaponId, 'W04');
  const shop = new ShopSystem(demoSnapshot(), () => .5);
  assert.equal(shop.weaponFor({ ...demoSnapshot().stores[0].products[0]!, name: '麦香鱼' }), 'generic-front');
  assert.equal(shop.weaponFor({ ...demoSnapshot().stores[0].products[0]!, name: '麦乐鸡' }), 'generic-rear');
  assert.equal(shop.weaponFor({ ...demoSnapshot().stores[0].products[0]!, name: '柠檬红茶' }), 'generic-rear');
});

// ---- W01 巨堡贯穿炮：直线贯穿 + 伤害衰减 + 互斥分支 ----

test('pierce cannon punches a line with decaying damage and no homing', () => {
  const { c, p, w } = rig(slot('W01'), null);
  const a = dummy(c, 0, 240), b = dummy(c, 0, 360), far = dummy(c, 0, 480);
  settle(3, c, w, p);
  const bullet = firstBullet(c, 1)!;
  assert.ok(bullet, 'W01 fires a heavy shot');
  assert.equal(bullet.pierce, 2);
  settle(40, c, w, p);
  assert.equal(a.hp, 500 - 55);
  assert.ok(Math.abs(b.hp - (500 - 55 * 0.7)) < 1e-6, `second hit decays: ${b.hp}`);
  assert.equal(far.hp, 500, 'pierce budget ends after two enemies at Lv1');
});

test('Lv.3 branches: 压路 pierces wider with retention; 破甲 strips armor on repeated hits', () => {
  const road = rig(slot('W01', 3, 'a'), null);
  const a = dummy(road.c, 0, 240), b = dummy(road.c, 0, 360), cc = dummy(road.c, 0, 480), d = dummy(road.c, 0, 600), e = dummy(road.c, 0, 720);
  settle(3, road.c, road.w, road.p);
  assert.equal(firstBullet(road.c, 1)!.pierce, 5);
  // 压路的射击间隔 ×1.25（1.3s 基础），首帧开火后立即结算。
  assert.ok(Math.abs(road.slots[0]!.cooldown - (1.3 * 1.25 - 2 * FIXED_DT)) < 1e-6,
    `road branch cadence: ${road.slots[0]!.cooldown}`);
  settle(60, road.c, road.w, road.p);
  assert.equal(a.hp, 500 - 100);
  assert.ok(Math.abs(b.hp - (500 - 100 * 0.85)) < 1e-6);
  assert.ok(cc.hp < 500 && d.hp < 500 && e.hp < 500, '压路 keeps punching through the column');

  const cheese = rig(slot('W01', 3, 'b'), null);
  const target = dummy(cheese.c, 0, 240, 5000);
  settle(3, cheese.c, cheese.w, cheese.p);
  assert.equal(firstBullet(cheese.c, 1)!.pierce, 1);
  settle(30, cheese.c, cheese.w, cheese.p);
  assert.equal(target.armorBreak, 0, 'one hit is not enough to strip armor');
  settle(120, cheese.c, cheese.w, cheese.p); // second volley inside the chain window
  assert.ok(target.armorBreak > 0, 'two consecutive hits apply armor break');
  const before = target.hp;
  cheese.c.hit(target, 10);
  assert.ok(Math.abs(target.hp - (before - 10 * 1.3)) < 1e-6, 'armor break boosts every weapon by 30%');
});

// ---- W12 扭扭薯回旋刃：去回双程记账 + 接回收益 ----

test('boomerang blades hit each leg once and return to the car', () => {
  const { c, p, w } = rig(slot('W12'), null);
  const target = dummy(c, 0, 280, 5000);
  settle(2, c, w, p);
  const blade = firstBullet(c, 2)!;
  assert.ok(blade, 'W12 fires a blade');
  assert.equal(blade.leg, 0);
  settle(30, c, w, p); // outbound reaches and hits
  const afterOut = target.hp;
  assert.ok(afterOut < 5000, 'outbound leg hit the target');
  // 回程清账：去程命中过的目标，在刃自然折返（leg 0→1 清空账本）后重新可被命中。
  // 回程按设计走斜切（偏离出手车道约一个身位），把目标挪到回程路径上模拟换线接敌。
  target.x = 48; target.z = 285;
  const b = c.bullets.acquire()!;
  b.x = b.px = 0; b.z = b.pz = 480;
  b.vx = 0; b.vz = 850; b.life = 2.4; b.damage = 20; b.kind = 2; b.level = 1;
  b.pierce = 9; b.targetSlot = -1; b.hitMask.fill(0);
  b.hitMask[target.slot] = 1; // 去程已命中过
  b.tex = ''; b.traits = 0; b.meta = 0; b.leg = 0; b.hits = 0; b.age = 0.44;
  for (let i = 0; i < 60 && target.hp >= afterOut; i++) c.step(p, FIXED_DT);
  assert.ok(target.hp < afterOut, 'leg-1 blade re-hits the target marked in leg 0');
  // 接回：强锁定回航把射出的薯刃收回车身。
  let caught = false;
  for (let i = 0; i < 110 && !caught; i++) {
    c.step(p, FIXED_DT);
    if (c.boomerangCatch > 0) caught = true;
    w.step(p, FIXED_DT);
  }
  assert.ok(caught, 'blade was caught near the car');
});

test('回手连斩 out-paces the baseline cadence when blades keep coming home', () => {
  // 同窗口内，连斩分支借助稳定接回缩短冷却，打出比无分支基线更多的轮次；
  // 收益只来自接回（discount 公式在 streak=0 时恒为 1）。
  const chained = rig(slot('W12', 3, 'b'), null);
  const baseline = rig(slot('W12', 3), null);
  for (let i = 0; i < 60 * 6; i++) {
    chained.c.step(chained.p, FIXED_DT); chained.w.step(chained.p, FIXED_DT);
    baseline.c.step(baseline.p, FIXED_DT); baseline.w.step(baseline.p, FIXED_DT);
  }
  assert.ok(chained.c.shots > baseline.c.shots,
    `chained rig volleyed ${chained.c.shots}× vs baseline ${baseline.c.shots}×`);
});

// ---- W07 板烧炙烤尾焰：尾喷 + 火带 + 最强灼烧 ----

test('exhaust spray burns pursuers behind and lays a trail on road coordinates', () => {
  const { c, p, w } = rig(null, slot('W07', 2));
  const rider = parkedRider(c, 0, -50);
  w.configure(p);
  settle(30, c, w, p);
  assert.ok(rider.hp < 80, `direct spray chips the pursuer (hp ${rider.hp})`);
  assert.ok(rider.burn > 0, 'spray attaches burn from level two');
  assert.ok(w.trails.activeCount > 0, 'trail segments dropped along the rear path');
  const seg = w.trails.items.find(s => s.active)!;
  assert.ok(Math.abs(seg.z - (p.progress - 18)) < 1, 'trail stays on road coordinates');
});

test('burn takes the strongest source instead of stacking two dots', () => {
  const { c } = rig(null, null);
  const e = dummy(c, 0, 100);
  c.applyBurn(e, 1.6, 12);
  const dps = e.burnDamage;
  c.applyBurn(e, 3, 5);
  assert.equal(e.burnDamage, dps, 'weaker source must not overwrite the stronger dot');
  assert.ok(e.burn > 1.6, 'weaker source still refreshes the clock');
  c.applyBurn(e, 1, 20);
  assert.ok(e.burnDamage > dps, 'stronger source takes over');
});

// ---- 内置散弹：可替换的初始后槽 ----

test('scatter is the replaceable rear occupant, not a permanent second gun', () => {
  const shop = new ShopSystem(demoSnapshot(), () => .5);
  shop.open(1);
  assert.equal(shop.slots[SLOT_REAR]?.weaponId, 'scatter', 'run starts with the scatter in the rear slot');
  const { c, p, w } = rig(null, shop.slots[SLOT_REAR]!);
  const rider = parkedRider(c, 0, -120);
  settle(30, c, w, p);
  assert.ok(rider.hp < 80, 'scatter fires at pursuers while mounted');
  // 换装：后槽替换后散弹彻底消失，不再叠加输出。
  const replaced = rig(null, slot('W07', 2), []);
  const rider2 = parkedRider(replaced.c, 0, -50);
  settle(30, replaced.c, replaced.w, replaced.p);
  assert.ok(rider2.hp < 80, 'W07 takes over pursuer duty');
  for (const b of replaced.c.bullets.items) if (b.active) assert.notEqual(b.kind, 0, 'no scatter pellets after the rear swap');
});

// ---- 车辆模块：驾驶事件驱动的构筑层 ----

test('drift supercharger stores effective drifts and empowers the next volley', () => {
  const plain = rig(slot('W01'), null);
  plain.p.released = 2;
  plain.w.step(plain.p, FIXED_DT);
  assert.equal(plain.w.driftCharge, 0, 'without the module a drift stores nothing');

  const charged = rig(slot('W01'), null, [slot('M-drift')]);
  const target = dummy(charged.c, 0, 240);
  charged.p.released = 1;
  charged.w.step(charged.p, FIXED_DT);
  // 释放当帧恰好有齐射就立刻消耗（漂移释放即下一次攻击）。
  assert.equal(charged.w.driftCharge, 0);
  assert.ok(Math.abs(firstBullet(charged.c, 1)!.damage - 55 * 1.5) < 1e-6, 'drift volley lands at ×1.5');
  charged.p.released = 0; // 真实物理里 released 是单帧事件，由 p.step 清零
  settle(96, charged.c, charged.w, charged.p);
  assert.ok(Math.abs(firstBullet(charged.c, 1)!.damage - 55) < 1e-6, 'next volley is back to baseline');
  // 没有齐射的漂移把蓄能存起来，跨帧等待下一次攻击。
  charged.p.released = 2;
  charged.w.step(charged.p, FIXED_DT);
  charged.p.released = 0;
  assert.equal(charged.w.driftCharge, 1, 'a drift between volleys stores its stack');
  settle(96, charged.c, charged.w, charged.p);
  // 三轮齐射：82.5（漂移加成）+ 55（基线）+ 82.5（存储蓄能加成）。
  assert.ok(Math.abs(target.hp - (500 - 82.5 - 55 - 82.5)) < 1e-6, `stored stack empowers the next volley (hp ${target.hp})`);
});

test('bumper accrues shields from safe driving and grants a short escape window', () => {
  const { c, p, w } = rig(null, null, [slot('M-bumper')]);
  w.configure(p);
  settle(60 * 12 + 5, c, w, p);
  assert.equal(c.shields, 1, '12s of safe driving banks a shield layer');
  // 碎盾：受伤只消耗护盾并留下 1.5s 减伤脱身窗口。
  dummy(c, 0, 0);
  c.step(p, FIXED_DT);
  assert.equal(c.shields, 0);
  assert.ok(c.escapeTime > 1, 'broken shield opens the escape window');
  // 向前驶离第一次碰撞（路障留在身后），等无敌帧消退、脱身窗口仍在。
  for (let i = 0; i < 31; i++) {
    p.previousProgress = p.progress; p.progress += 340 * FIXED_DT; p.speed = 340; p.vy = -340;
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
  }
  assert.ok(c.escapeTime > 0 && c.escapeTime < 1.5);
  const hpBefore = c.health;
  dummy(c, 10, p.progress + 4);
  c.step(p, FIXED_DT);
  assert.ok(Math.abs(c.health - (hpBefore - 5 * 0.5)) < 1.01,
    `escape window halves contact damage (${hpBefore} → ${c.health})`);
  assert.equal(c.shields, 0, 'no shield left to absorb the second hit');
});

test('repair pump trickles health only after sustained collision-free driving', () => {
  const { c, p, w } = rig(null, null, [slot('M-pump')]);
  c.health = 50;
  settle(60 * 11, c, w, p);
  const afterGate = c.health;
  assert.ok(afterGate >= 52 && afterGate < 56, `pump trickles after the 6s gate (${afterGate})`);
  // 一次真实碰撞打断安全驾驶（impact 是单帧事件，由碰撞置位）。
  dummy(c, 0, 0);
  settle(1, c, w, p);
  const afterHit = c.health;
  assert.ok(afterHit < afterGate, 'the collision itself costs health');
  // 驶离碰撞点：进度回退而非清零——3s 干净驾驶最多补回一 tick，
  // 明显慢于不受罚的持续驾驶（那会回 2-3 tick）。
  for (let i = 0; i < 60 * 3; i++) {
    p.previousProgress = p.progress; p.progress += 340 * FIXED_DT; p.speed = 340; p.vy = -340;
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
  }
  assert.ok(c.health - afterHit <= 1, `post-impact healing stays throttled (gained ${c.health - afterHit})`);
});

// ---- 奶油咖啡酱：漂移触发的射速窗口（有冷却，不是全局攻速） ----

test('crema opens a temporary rate window on effective drifts, then cools down', () => {
  const { c, p, w } = rig(null, slot('scatter'));
  c.equipSauce('crema');
  p.released = 1;
  w.step(p, FIXED_DT);
  assert.ok(c.rateWindow > 0, 'drift opens the window');
  assert.ok(Math.abs(c.rateMult - SAUCE.driftRate) < 1e-9);
  parkedRider(c, 0, -120);
  w.step(p, FIXED_DT);
  assert.ok(Math.abs(w.slots[1]!.cooldown - 0.38 * SAUCE.driftRate) < 0.1,
    `window shortens the cadence (${w.slots[1]!.cooldown})`);
  // 冷却期内再次漂移不刷新窗口（rateWindow 只在 combat.step 衰减）。
  settle(60, c, w, p);
  p.released = 2;
  const windowBefore = c.rateWindow;
  w.step(p, FIXED_DT);
  assert.equal(c.rateWindow, windowBefore, 'window does not refresh while cooling down');
});

// ---- 目录一致性：卡片数值行可渲染 ----

test('weapon stats read the same tables the guns fire from', () => {
  for (const id of ['scatter', 'W01', 'W12', 'W07', 'generic-front', 'generic-rear', 'service-front']) {
    for (let level = 1; level <= 5; level++) {
      assert.ok(weaponStats(id, level).length > 0, `${id} Lv${level} renders stat lines`);
    }
  }
});
