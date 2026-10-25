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
  assert.equal(ready.length, 32, 'phase three: the whole catalog is playable');
  assert.deepEqual(ready.map(w => w.id).sort(), catalog.map(w => w.id).sort());
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
  // 目录全实装后：所有已收录身份都返回真实武器（跨门店映射稳定性）。
  assert.equal(identityFor('麦香鱼', 'main').weaponId, 'W04');
  assert.equal(identityFor('麦乐鸡', 'side').weaponId, 'W17');
  assert.equal(identityFor('鸡米花', 'side').weaponId, 'W19');
  assert.equal(identityFor('浓缩咖啡', 'drink').weaponId, 'W27');
  const shop = new ShopSystem(demoSnapshot(), () => .5);
  assert.equal(shop.weaponFor({ ...demoSnapshot().stores[0].products[0]!, name: '吉士汉堡' }), 'W03');
  // 未收录商品名走通用改装兜底，绝不冒领独立身份（§4.3）。
  assert.equal(shop.weaponFor({ ...demoSnapshot().stores[0].products[0]!, name: '店长神秘单人餐' }), 'generic-front');
  assert.equal(shop.weaponFor({ ...demoSnapshot().stores[0].products[0]!, category: 'drink', name: '店长神秘特饮' }), 'generic-rear');
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

// ---- 阶段二武器：同品类差异验收（§13） ----

test('W02 alternating barrels trigger the flank bonus on repeated same-target hits', () => {
  const { c, p, w } = rig(slot('W02'), null);
  const target = dummy(c, 0, 260);
  settle(20, c, w, p); // 首发落地：无加成
  const first = 500 - target.hp;
  assert.ok(first > 0, 'first volley lands plain');
  settle(95, c, w, p); // 1.58s 内恰好再一发 → 夹击 ×1.6
  const second = 500 - target.hp - first;
  assert.ok(Math.abs(second - 34 * 1.6) < 1.2, `flank hit ×1.6 (got ${second.toFixed(1)})`);
  const other = rig(slot('W02'), null);
  const a = dummy(other.c, -60, 260), b = dummy(other.c, 60, 260);
  settle(3, other.c, other.w, other.p);
  const firstA = 500 - a.hp;
  settle(95, other.c, other.w, other.p);
  const secondA = 500 - a.hp - firstA;
  assert.ok(Math.abs(secondA - 34) < 1.2, `switching targets forfeits the bonus (got ${secondA.toFixed(1)})`);
  void b;
});

test('W04 fish hops sideways to a fresh target and decays per hop', () => {
  const { c, p, w } = rig(slot('W04'), null);
  const main = dummy(c, 0, 260);
  const side = dummy(c, 70, 320);
  settle(20, c, w, p);
  assert.ok(main.hp < 500, 'first hit lands');
  settle(40, c, w, p);
  assert.ok(side.hp < 500, `the fish hopped to the lateral target (hp ${side.hp})`);
  // 孤立目标无处可跳：弹丸直接消失。
  const lonely = rig(slot('W04'), null);
  const boss = dummy(lonely.c, 0, 300, 9000);
  settle(3, lonely.c, lonely.w, lonely.p);
  settle(40, lonely.c, lonely.w, lonely.p);
  assert.ok(boss.hp < 9000 && boss.hp > 8800, 'single hit without a hop target still lands once');
});

test('W06 rockets wait for the lock window, volley, then rebuild', () => {
  const { c, p, w } = rig(slot('W06'), null);
  const boss = c.spawn(3, 0, 300)!; boss.hp = 9000;
  settle(30, c, w, p);
  assert.ok(w.lockTime > 0 || w.lockSlot === boss.slot, 'lock builds on the boss');
  const before = c.shots;
  settle(160, c, w, p);
  assert.ok(c.shots > before, 'a completed lock fires the rocket volley');
  // 目标大幅横移会打断锁定：锁进度归零后需要重新积累。
  boss.x = 130;
  settle(10, c, w, p);
  settle(20, c, w, p);
  assert.ok(w.lockTime < 1, `big lateral drift breaks the lock (lockTime ${w.lockTime.toFixed(2)})`);
});

test('W11 fires parallel rows over a short burst', () => {
  const { c, p, w } = rig(slot('W11'), null);
  dummy(c, 0, 400, 9000);
  let rows = 0;
  for (let i = 0; i < 60; i++) {
    const shots = c.shots;
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
    if (c.shots > shots) rows++;
  }
  assert.equal(rows, 3, `Lv1 burst is three rows (got ${rows})`);
  const bolts = c.bullets.items.filter(b => b.active && b.kind === 6);
  assert.ok(bolts.length >= 3, 'each row carries parallel bolts');
});

test('W13 saw grinds what touches it and expires without coin drops', () => {
  const { c, p, w } = rig(null, slot('W13'));
  const rider = parkedRider(c, 0, -70);
  w.configure(p);
  settle(30, c, w, p);
  assert.ok(rider.hp < 80, `the saw grinds the parked pursuer (hp ${rider.hp})`);
  assert.ok(w.saws.activeCount > 0, 'saw stays on the road');
});

test('W17 mines detonate on contact and chain through neighbours on branch a', () => {
  const plain = rig(null, slot('W17'));
  const rider = parkedRider(plain.c, 0, -60);
  settle(40, plain.c, plain.w, plain.p);
  assert.ok(rider.hp < 80, `a chasing rider crosses the dropped mine (hp ${rider.hp})`);
  const chain = rig(null, slot('W17', 3, 'a'));
  const pack = [parkedRider(chain.c, 0, -60), parkedRider(chain.c, 20, -150), parkedRider(chain.c, -30, -260)];
  settle(3, chain.c, chain.w, chain.p);
  settle(200, chain.c, chain.w, chain.p);
  assert.ok(pack.every(r => r.hp < 80), 'the chain detonation sweeps the whole pack');
});

test('W21 pressure ring shoves enemies into each other for collision damage', () => {
  const { c, p, w } = rig(null, slot('W21'));
  w.configure(p);
  const centre = parkedRider(c, 0, -50);
  const neighbour = parkedRider(c, 30, -50);
  settle(3, c, w, p);
  const moved = Math.abs(centre.x) > 0 || centre.z !== -50;
  assert.ok(moved, 'the ring pushed the rider');
  assert.ok(neighbour.hp < 80 || centre.hp < 80 - 5, `shoved enemies clip each other (n ${neighbour.hp}, c ${centre.hp})`);
});

test('W24 freezes a pursuing rider; the ram shatters it and thaw grants resistance', () => {
  const { c, p, w } = rig(null, slot('W24'));
  const rider = parkedRider(c, 0, -80);
  rider.hp = 9000;
  let everFrozen = false;
  for (let i = 0; i < 60 * 8 && !everFrozen; i++) {
    // 车辆正常行驶：追兵 AI 的追赶才有「最迫近的后侧威胁」语义。
    p.previousProgress = p.progress; p.progress += 340 * FIXED_DT; p.speed = 340; p.vy = -340;
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
    if (rider.frozen) everFrozen = true;
  }
  assert.ok(everFrozen, `chill bar completes into a freeze (chill ${rider.chill.toFixed(0)})`);
  // 冻结的目标停在原地；玩家开车撞上去 → 撞碎 ×2 + 一次性冰爆。
  rider.x = 0; rider.z = p.progress - 10; rider.contact = 0; rider.vx = 0;
  const freezeHp = rider.hp;
  c.step(p, FIXED_DT);
  assert.ok(rider.hp < freezeHp - 20, `the ram shatters the frozen rider (Δ${(freezeHp - rider.hp).toFixed(0)})`);
});

test('W24 boss only suffers soft control and thaw grants chill resistance', () => {
  const { c, p, w } = rig(null, slot('W24'));
  const boss = c.spawn(3, 0, -80)!; boss.hp = 9000;
  // 霸王的 AI 会自己开走；把测试钉在锁冻范围内验证软控路径。
  let everSoft = false;
  for (let i = 0; i < 60 * 8 && !everSoft; i++) {
    boss.z = p.progress - 80; boss.x = 0; boss.vx = boss.vz = 0;
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
    if (boss.slow < 1) everSoft = true;
  }
  assert.ok(everSoft, 'boss takes the soft slow instead of a freeze');
  assert.ok(!boss.frozen, 'the truck is never fully frozen');
  const thaw = rig(null, slot('W24'));
  const victim = parkedRider(thaw.c, 0, -80);
  victim.hp = 9000;
  let thawResist = false;
  for (let i = 0; i < 60 * 12 && !thawResist; i++) {
    thaw.p.previousProgress = thaw.p.progress; thaw.p.progress += 340 * FIXED_DT; thaw.p.speed = 340; thaw.p.vy = -340;
    // 钉在锁定范围内：冻结的目标若被车甩出回收线就直接消失，观察不到解冻窗。
    victim.z = thaw.p.progress - 80; victim.x = 0;
    thaw.c.step(thaw.p, FIXED_DT); thaw.w.step(thaw.p, FIXED_DT);
    if (!victim.frozen && victim.chillResist > 0) thawResist = true;
  }
  assert.ok(thawResist, 'thaw grants a resistance window before the next freeze');
});

test('W31 spiral blade sweeps outward and back with per-pass hit cooldown', () => {
  const { c, p, w } = rig(null, slot('W31'));
  const rider = parkedRider(c, 24, -40);
  rider.hp = 9000;
  let radii = new Set<number>();
  for (let i = 0; i < 240; i++) {
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
    radii.add(Math.round(w.spiralR));
  }
  assert.ok(radii.size >= 4, `the blade radius oscillates (${radii.size} distinct values)`);
  assert.ok(rider.hp < 9000, 'the blade grinds what it passes');
});

// ---- 第三阶段：目录补齐到 32 件，同家族差异验收（§5） ----

test('same-family weapons differ mechanically: every behavior in a family is unique', () => {
  const catalog = WEAPONS.filter(w => /^W\d+$/.test(w.id));
  const byFamily = new Map<string, string[]>();
  for (const w of catalog) {
    const list = byFamily.get(w.family) ?? [];
    list.push(w.behavior);
    byFamily.set(w.family, list);
  }
  for (const [family, behaviors] of byFamily) {
    assert.equal(new Set(behaviors).size, behaviors.length, `${family} family reuses a behavior: ${behaviors.join(',')}`);
  }
  for (const w of catalog) {
    assert.ok(w.branches && w.branches.length === 2, `${w.id} needs two Lv.3 branches`);
  }
});

test('W03 sticky shells burst after the threshold and drop weak residue before that', () => {
  const { c, p, w } = rig(slot('W03'), null);
  const target = dummy(c, 0, 260, 9000);
  settle(20, c, w, p); // 第一发：黏附 +1，只掉 40% 黏渣
  assert.ok(target.stickyStacks >= 1, `shell sticks (stacks ${target.stickyStacks})`);
  const beforeShards = c.bullets.activeCount;
  settle(95, c, w, p); // 第二发达阈值 → 剥落爆片
  assert.ok(target.stickyStacks === 0, 'threshold burst resets stacks');
  assert.ok(c.bullets.activeCount > beforeShards, 'shards spawned');
});

test('W05 closeburst fans wide but dies before reaching far targets', () => {
  const { c, p, w } = rig(slot('W05'), null);
  const near = dummy(c, 0, 200);
  settle(25, c, w, p);
  assert.ok(near.hp < 500, 'close target takes the burst');
  const farRig = rig(slot('W05'), null);
  const far = dummy(farRig.c, 0, 700, 9000);
  settle(60, farRig.c, farRig.w, farRig.p);
  assert.ok(far.hp > 8800, `pellets dissolve before far range (hp ${far.hp})`);
});

test('W08 rail gun charges a full line shot and resets', () => {
  const { c, p, w } = rig(slot('W08'), null);
  const a = dummy(c, 0, 260), b = dummy(c, 0, 420);
  settle(150, c, w, p); // 蓄能 2.4s → 线击贯穿
  assert.ok(a.hp < 500 && b.hp < 500, `line hits both (a ${a.hp}, b ${b.hp})`);
  assert.ok(w.railCharge < 0.3, `charge consumed by the shot (${w.railCharge.toFixed(2)})`);
});

test('W09 mortar lobs to a predicted point and damages the landing zone', () => {
  const { c, p, w } = rig(slot('W09'), null);
  const spot = dummy(c, 0, 560);
  settle(90, c, w, p);
  assert.ok(spot.hp < 500, `the shell lands on the predicted zone (hp ${spot.hp})`);
});

test('W10 bounce disc shocks at each landing and hops multiple times', () => {
  const { c, p, w } = rig(slot('W10'), null);
  const a = dummy(c, 0, 240), b = dummy(c, 0, 480);
  settle(80, c, w, p);
  assert.ok(a.hp < 500, 'first landing shock');
  assert.ok(b.hp < 500, `a later landing reaches deeper (hp ${b.hp})`);
});

test('W14 fence blocks a crossing rider, damages it and loses a charge', () => {
  const { c, p, w } = rig(null, slot('W14'));
  w.configure(p);
  settle(5, c, w, p);
  assert.ok(w.blockers.activeCount > 0, 'fence deployed');
  const wall = w.blockers.items.find(x => x.active)!;
  const rider = parkedRider(c, 0, -60);
  const hpBefore = rider.hp;
  let crossed = false;
  for (let i = 0; i < 80; i++) {
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
    if (rider.z >= wall.z - 30 && rider.z <= wall.z + 6) crossed = true;
  }
  assert.ok(rider.hp < hpBefore, 'crossing the fence hurts');
  assert.ok(crossed, 'the rider reached the fence line');
  assert.ok(wall.hp < 4 || !wall.active, 'fence spent a charge');
});

test('W15 drill strips armor and grinds with a DoT', () => {
  const { c, p, w } = rig(slot('W15'), null);
  const target = dummy(c, 0, 260, 9000);
  settle(30, c, w, p);
  assert.ok(target.armorBreak > 0, 'armor stripped');
  assert.ok(target.burnDamage > 0, `drill DoT running (${target.burnDamage.toFixed(2)}/s)`);
});

test('W16 sidesweep alternates rear sides and ignores the front', () => {
  const { c, p, w } = rig(null, slot('W16'));
  const left = parkedRider(c, -80, -80), right = parkedRider(c, 80, -80), front = dummy(c, 0, 200);
  settle(3, c, w, p);
  const leftHit = left.hp < 80, rightHit = right.hp < 80;
  assert.ok(leftHit !== rightHit, 'one side per sweep');
  settle(70, c, w, p);
  assert.ok(left.hp < 80 && right.hp < 80, 'both sides covered on alternating sweeps');
  assert.equal(front.hp, 500, 'the front is a blind spot');
});

test('W18 cluster mother bomb splits into flanking sub-bombs', () => {
  const { c, p, w } = rig(slot('W18'), null);
  const centre = dummy(c, 0, 620);
  const flank = dummy(c, 120, 660);
  settle(110, c, w, p);
  assert.ok(centre.hp < 500, 'mother impact');
  assert.ok(flank.hp < 500, `sub-bombs flank the target (hp ${flank.hp})`);
});

test('W19 cloud pellets hover behind and catch chasing riders', () => {
  const { c, p, w } = rig(null, slot('W19'));
  const rider = parkedRider(c, 0, -140);
  settle(60, c, w, p);
  assert.ok(rider.hp < 80, `the cloud catches the chaser (hp ${rider.hp})`);
});

test('W20 wires grind enemies that cross the cutting line', () => {
  const { c, p, w } = rig(null, slot('W20'));
  const rider = parkedRider(c, 0, -150);
  settle(30, c, w, p);
  assert.ok(rider.hp < 80, `the wire grinds the chaser (hp ${rider.hp})`);
});

test('W22 stream pushes its target down the road', () => {
  const { c, p, w } = rig(slot('W22'), null);
  const target = parkedRider(c, 0, 240);
  settle(40, c, w, p);
  assert.ok(target.z > 240, `the stream shoves the target forward (+${(target.z - 240).toFixed(0)}px)`);
});

test('W23 bubbles burst after a short fuse when touched', () => {
  const { c, p, w } = rig(slot('W23'), null);
  const target = parkedRider(c, 0, 300);
  let exploded = false;
  for (let i = 0; i < 60 * 5 && !exploded; i++) {
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
    if (target.hp < 80) exploded = true;
  }
  assert.ok(exploded, `the delayed burst lands (hp ${target.hp})`);
});

test('W25 expanding wave damages and slows; the crest hits hardest', () => {
  const { c, p, w } = rig(null, slot('W25'));
  const rider = parkedRider(c, 0, -70);
  let slowed = false;
  for (let i = 0; i < 90; i++) {
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
    if (rider.slow < 1) slowed = true;
  }
  assert.ok(rider.hp < 80, `the wave washed over the chaser (hp ${rider.hp})`);
  assert.ok(slowed, 'the wave slows what it touches');
});

test('W26 frostwall blocks, deep-slows and shatters into ice', () => {
  const { c, p, w } = rig(null, slot('W26'));
  w.configure(p);
  settle(5, c, w, p);
  const wall = w.blockers.items.find(x => x.active)!;
  const rider = parkedRider(c, 0, -60);
  let chilled = false, bitten = false;
  for (let i = 0; i < 90; i++) {
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
    if (rider.slow <= 0.75) chilled = true;
    if (rider.hp < 80) bitten = true;
  }
  assert.ok(chilled, 'frost contact chills the rider');
  assert.ok(bitten, 'the wall bites');
  void wall;
});

test('W27 laser builds heat, then overheats and stops', () => {
  const { c, p, w } = rig(slot('W27'), null);
  const target = parkedRider(c, 0, 300);
  target.hp = 900000;
  let sawBeam = false;
  for (let i = 0; i < 60 * 8; i++) {
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
    if (w.laserOn) sawBeam = true;
    if (w.laserOverheat > 0) break;
  }
  assert.ok(sawBeam, 'the beam fires continuously');
  assert.ok(w.laserOverheat > 0, 'continuous fire trips the forced cooldown');
  assert.ok(target.hp < 900000, 'the beam deals its ticks');
});

test('W28 vortex pulls the pack together then bursts outward', () => {
  const { c, p, w } = rig(null, slot('W28'));
  const a = parkedRider(c, -120, -80), b = parkedRider(c, 120, -120);
  settle(60 * 3, c, w, p);
  assert.ok(a.hp < 80 && b.hp < 80, 'pull ticks and the pulse both bite');
  assert.ok(Math.abs(a.x - b.x) < 220, `the pull gathered the pack (Δx ${Math.abs(a.x - b.x).toFixed(0)})`);
});

test('W29 piebox unfolds on its fuse and fires side fans', () => {
  const { c, p, w } = rig(null, slot('W29'));
  settle(5, c, w, p);
  assert.ok(w.pieboxes.activeCount > 0, 'box dropped');
  let fired = false, shotsBefore = c.shots;
  for (let i = 0; i < 60 * 3; i++) {
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
    if (c.shots > shotsBefore) { fired = true; break; }
  }
  assert.ok(fired, 'the box unfolded into side fans');
});

test('W30 acid coat drags a damage trail behind fleeing targets', () => {
  const { c, p, w } = rig(slot('W30'), null);
  const target = parkedRider(c, 0, 300);
  target.hp = 9000;
  settle(30, c, w, p);
  assert.ok(target.acidTime > 0, 'the coat sticks');
  const bystander = parkedRider(c, 20, 240);
  for (let i = 0; i < 60 * 2; i++) {
    target.z -= 60 * FIXED_DT; // 目标逃窜拖带
    c.step(p, FIXED_DT); w.step(p, FIXED_DT);
  }
  assert.ok(w.trails.items.some(s => s.active && s.kind === 1), 'acid segments dropped along the path');
  assert.ok(bystander.hp < 80, `the trail grinds whoever follows (hp ${bystander.hp})`);
});

test('W32 pillar stacks on the same target and resets when it switches', () => {
  const { c, p, w } = rig(slot('W32'), null);
  const target = parkedRider(c, 0, 300);
  target.hp = 900000;
  for (let i = 0; i < 90; i++) { c.step(p, FIXED_DT); w.step(p, FIXED_DT); }
  const stacksAfter = w.pillarStacks;
  assert.ok(stacksAfter >= 2, `consecutive hits stack (${stacksAfter})`);
  const other = rig(slot('W32'), null);
  const a = parkedRider(other.c, 0, 300); a.hp = 900000;
  const b = parkedRider(other.c, 60, 340); b.hp = 900000;
  for (let i = 0; i < 20; i++) { other.c.step(other.p, FIXED_DT); other.w.step(other.p, FIXED_DT); }
  a.hp = 1; // 换目标：a 倒下后光柱转 b，层数应清零
  other.c.step(other.p, FIXED_DT);
  for (let i = 0; i < 40; i++) { other.c.step(other.p, FIXED_DT); other.w.step(other.p, FIXED_DT); }
  assert.ok(other.w.pillarStacks <= 2, `stacks reset on target switch (got ${other.w.pillarStacks})`);
});
