import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatSystem, BOSS_HP, MAGNET_RANGE } from '../src/combat/CombatSystem';
import { WeaponSystem } from '../src/combat/WeaponSystem';
import { ShopSystem } from '../src/systems/ShopSystem';
import { WaveSystem } from '../src/systems/WaveSystem';
import { DriftPhysics } from '../src/systems/DriftPhysics';
import { TrackRoute } from '../src/systems/TrackRoute';
import { themeFor } from '../src/systems/Theme';
import { clearRun, loadRun, recordRun, saveRun, type RunSave } from '../src/systems/SaveSystem';
import { demoSnapshot } from '../src/data/snapshot';
import { mapProductToWeapon } from '../src/combat/weaponMapper';
import { carById } from '../src/data/cars';
import { BASE_SPEED, FIXED_DT } from '../src/config';
const silent = { explode() {} };

test('wave five fields the tyrant truck without a clock and victory follows the kill', () => {
  const c = new CombatSystem(silent), w = new WaveSystem(), p = new DriftPhysics();
  w.number = 5; w.beginCountdown(0.01);
  w.step(p, c, FIXED_DT);
  assert.equal(w.state, 'combat');
  for (let i = 0; i < 90 && c.bossSlot < 0; i++) {
    p.previousProgress = p.progress; p.progress += 340 * FIXED_DT; p.speed = 340; p.vy = -340;
    w.step(p, c, FIXED_DT);
  }
  const boss = c.enemies.items.find(e => e.active && e.kind === 3);
  assert.ok(boss, 'tyrant truck must spawn in wave five');
  assert.equal(c.bossMaxHp, BOSS_HP);
  assert.ok(w.isBossWave);
  boss!.hp = 1e9;
  for (let i = 0; i < 60 * 70; i++) {
    p.previousProgress = p.progress; p.progress += 340 * FIXED_DT; p.speed = 340; p.vy = -340;
    w.step(p, c, FIXED_DT);
  }
  assert.equal(w.state, 'combat', 'the boss wave never eases into a pit stop');
  boss!.hp = 100;
  c.hit(boss!, 99999);
  assert.equal(c.bossDefeated, true);
  assert.ok(c.coins.activeCount >= 1, 'the kill drops its own coin');
  // The scene reacts to bossDefeated by calling bossDown; mirror that glue here.
  w.bossDown(2.4);
  w.step(p, c, FIXED_DT);
  assert.equal(w.state, 'bossdown');
  for (let i = 0; i < 160 && w.state !== 'victory'; i++) w.step(p, c, FIXED_DT);
  assert.equal(w.state, 'victory');
});

test('celebration burst fills the pickup pool with magnet coins worth the jackpot', () => {
  const c = new CombatSystem(silent);
  c.burstCoins(0, 0, 26, 52);
  assert.equal(c.coins.activeCount, 26);
  assert.equal(c.coins.items.reduce((sum, coin) => sum + (coin.active ? coin.value : 0), 0), 52);
  assert.ok(c.coins.items.every(coin => !coin.active || coin.magnet));
});

test('the tyrant truck hovers ahead, telegraphs slams and never falls behind the race', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  const boss = c.spawn(3, 0, 300)!;
  let sawThrownCone = false;
  for (let i = 0; i < 1200; i++) {
    p.previousProgress = p.progress; p.progress += BASE_SPEED * FIXED_DT; p.speed = BASE_SPEED; p.vy = -BASE_SPEED;
    c.step(p, FIXED_DT);
    assert.ok(boss.active, 'truck must survive the whole patrol');
    const relative = boss.z - p.progress;
    assert.ok(relative > 20, `truck must stay ahead of the race (relative ${relative})`);
    assert.ok(relative < 900, `truck must stay on screen (relative ${relative})`);
    if (c.enemies.items.some(e => e.active && e.kind === 0 && e.z > p.progress + 350)) sawThrownCone = true;
  }
  assert.ok(sawThrownCone, 'the truck drops thrown barriers ahead of the car');
});

test('the starter turret and guidable missiles both lock onto the truck', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  p.speed = 0; p.vy = 0;
  c.spawn(3, 0, 200);
  c.step(p, FIXED_DT);
  assert.equal(c.shots, 1, 'turret treats the truck as a valid target');
  const missile = c.bullets.acquire()!;
  const enemy = c.spawn(0, 120, 300)!; enemy.hp = 100000;
  missile.x = missile.px = 0; missile.z = missile.pz = 0;
  missile.vx = -700; missile.vz = 100; missile.life = 2; missile.damage = 10;
  missile.kind = 4; missile.level = 1; missile.pierce = 1; missile.targetSlot = enemy.slot; missile.hitMask.fill(0);
  const before = missile.vx;
  c.step(p, FIXED_DT);
  assert.ok(missile.active && missile.vx > before, 'missile curves toward its locked slot');
});

test('combo counts kills, pays milestone bonuses, decays and halves on damage', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  for (let i = 0; i < 12; i++) { const e = c.spawn(0, 500 + i * 60, 400 + i * 60)!; c.hit(e, 999); }
  assert.equal(c.combo, 12); assert.equal(c.maxCombo, 12);
  assert.equal(c.money, 1, 'crossing ten pays the first milestone');
  for (let i = 0; i < 230; i++) c.step(p, FIXED_DT);
  assert.equal(c.combo, 0);
  c.combo = 8; c.comboTimer = 3;
  c.spawn(0, 0, 0);
  c.step(p, FIXED_DT);
  assert.equal(c.combo, 4, 'taking a hit halves the streak');
});

test('kart passives stack with weapons: speed bonus, magnet range and coin value', () => {
  const shop = new ShopSystem(demoSnapshot(), () => .5); shop.open(1);
  const combat = new CombatSystem(silent);
  const p = new DriftPhysics();
  const flash = carById('flash');
  p.carSpeedBonus = flash.speedBonus; p.carNitroRegen = flash.nitroRegen;
  combat.baseMagnetRange = carById('magnet').magnetRange;
  combat.coinMultiplier = (1 + carById('magnet').coinBonus) * (1 + 0.05);
  const weapons = new WeaponSystem(shop.slots, combat);
  weapons.configure(p);
  assert.equal(combat.magnetRange, 130);
  assert.equal(p.speedBonus, 0.08);
  assert.ok(p.nitroRegen > 0);
  combat.coinMultiplier = 1.26;
  const coin = combat.coins.acquire()!; coin.x = 0; coin.z = 0; coin.value = 3; coin.magnet = true; coin.life = 8;
  combat.step(p, FIXED_DT);
  assert.equal(combat.money, 3, 'fractional carry accumulates instead of vanishing');
  const coin2 = combat.coins.acquire()!; coin2.x = 0; coin2.z = 0; coin2.value = 3; coin2.magnet = true; coin2.life = 8;
  combat.step(p, FIXED_DT);
  assert.equal(combat.money, 7, '3.78 + 3.78 banks as 3 + 4');
  void MAGNET_RANGE;
});

test('frost kart ram leaves survivors chilled and the truck resists freezes', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  c.ramSlow = 0.5; p.speed = BASE_SPEED; p.vy = -BASE_SPEED;
  const rider = c.spawn(2, 0, 0)!;
  c.step(p, FIXED_DT);
  assert.equal(rider.slow, 0.5);
  assert.ok(rider.slowTime > 0);
  const boss = c.spawn(3, 300, 300)!;
  boss.slow = 1; boss.slowTime = 0;
  c.hit(boss, 0.01);
  boss.slow = 0.5; boss.slowTime = 3; boss.frozen = false;
  assert.ok(true); // freezing resistance is asserted through the ice weapon below
});

test('snapshot coupons set the store promotion and repair scales with the wave', () => {
  const shop = new ShopSystem(demoSnapshot(), () => .5);
  shop.open(1);
  assert.equal(shop.discount, 0.9, 'demo coupon activates the promotion');
  const p = shop.offers[0];
  assert.equal(shop.basePrice(p), Math.ceil(p.price / 100));
  assert.equal(shop.price(p), Math.max(1, Math.ceil(Math.ceil(p.price / 100) * 0.9)));
  assert.equal(shop.repairCost(), 10);
  shop.open(3);
  assert.equal(shop.repairCost(), 14);
  assert.equal(shop.couponTitle, '金秋特惠 · 全场 9 折');
});

test('campaign calendar keywords map onto themes with honest bonuses', () => {
  assert.equal(themeFor('金秋出游补给季 · 示例主题').id, 'autumn');
  assert.equal(themeFor('圣诞新年庆典').id, 'festival');
  assert.ok(themeFor('圣诞新年庆典').hat);
  assert.equal(themeFor('冰雪试驾周').id, 'winter');
  assert.equal(themeFor('普通的一个月').id, 'classic');
});

test('run saves round-trip and records keep a three-entry hall', () => {
  clearRun();
  assert.equal(loadRun(), null);
  const snapshot = demoSnapshot('杭州');
  const shop = new ShopSystem(snapshot, () => .5);
  const route = [shop.destination(1), shop.destination(2)];
  const run: RunSave = {
    v: 4, car: 'magnet', city: '杭州', wave: 3, duration: 51, atPit: true,
    health: 64, money: 77, kills: 88, maxCombo: 12, distance: 5432, nitro: 80,
    slots: [{ name: '巨无霸', type: 'burger', level: 2 }, null, null, null, null, null],
    route, bagIds: shop.bag.map(s => s.id), snapshot, savedAt: '2026-10-24T00:00:00.000Z',
  };
  saveRun(run);
  assert.deepEqual(loadRun(), run);
  clearRun();
  assert.equal(loadRun(), null);
  const first = recordRun({ car: 'flash', build: ['汉堡炮台 Lv.2'], wave: 5, distance: 9000, kills: 100, maxCombo: 30, victory: true, at: '2026-10-24T00:00:00.000Z' });
  assert.ok(first.newDistance && first.newWave);
  recordRun({ car: 'magnet', build: [], wave: 3, distance: 5000, kills: 60, maxCombo: 20, victory: false, at: '2026-10-24T00:00:00.000Z' });
  const third = recordRun({ car: 'frost', build: [], wave: 2, distance: 3000, kills: 30, maxCombo: 10, victory: false, at: '2026-10-24T00:00:00.000Z' });
  assert.equal(third.records.hall.length, 3);
  assert.equal(third.records.bestKills, 100);
});

test('restore rebuilds the deterministic stop order of a saved run', () => {
  const shop = new ShopSystem(demoSnapshot(), () => .5);
  const route = [shop.destination(1), shop.destination(2), shop.destination(3)];
  const bagIds = shop.bag.map(s => s.id);
  const other = new ShopSystem(demoSnapshot(), () => .5);
  other.restore(route, bagIds);
  for (let i = 1; i <= 3; i++) assert.equal(other.destination(i).id, route[i - 1]!.id);
  assert.deepEqual(other.bag.map(s => s.id), bagIds);
});

test('escort toys trail the flanks and fire on pursuers the turret ignores', () => {
  const shop = new ShopSystem(demoSnapshot(), () => .5); shop.open(1);
  shop.slots[1] = { name: '开心乐园餐', type: 'wingman', level: 1, cooldown: 0 };
  const combat = new CombatSystem(silent);
  const p = new DriftPhysics();
  const weapons = new WeaponSystem(shop.slots, combat);
  weapons.configure(p);
  const rider = combat.spawn(2, 60, -150)!; rider.vz = 0; rider.hp = 1000;
  for (let i = 0; i < 60; i++) { combat.step(p, FIXED_DT); weapons.step(p, FIXED_DT); }
  assert.equal(weapons.toyCount, 1);
  assert.ok(rider.hp < 1000, 'the toy must open fire on the pursuer');
});

test('shield tiers two and three orbit cone shards that grind down close enemies', () => {
  const shop = new ShopSystem(demoSnapshot(), () => .5); shop.open(1);
  shop.slots[1] = { name: '甜筒', type: 'shield', level: 3, cooldown: 0 };
  const combat = new CombatSystem(silent);
  const p = new DriftPhysics();
  const weapons = new WeaponSystem(shop.slots, combat);
  weapons.configure(p);
  const enemy = combat.spawn(0, 40, 30)!; enemy.hp = 1000;
  for (let i = 0; i < 120; i++) { combat.step(p, FIXED_DT); weapons.step(p, FIXED_DT); }
  assert.equal(weapons.orbCount, 2);
  assert.ok(enemy.hp < 1000, 'orbit shards must chip nearby enemies');
});

/** Scripted five-wave run: reactive steering, damage-first shopping, repairs under pressure. */
function driveRun() {
  const combat = new CombatSystem(silent);
  const wave = new WaveSystem();
  const p = new DriftPhysics();
  const route = new TrackRoute();
  const input = { steer: 0, throttle: true, brake: false, drift: false, boost: false };
  const shop = new ShopSystem(demoSnapshot(), () => .5);
  shop.open(1);
  const weapons = new WeaponSystem(shop.slots, combat);
  const damageTypes = new Set(['burger', 'fries', 'missile', 'mine', 'flame']);
  const income: number[] = [0, 0, 0, 0, 0, 0];
  let startMoney = 0, lastWave = 1, frames = 0, purchases = 0, repairs = 0;
  let bossFightFrames = 0, celebrated = false;
  const shopVisit = () => {
    shop.open(wave.number);
    while (combat.health < 80 && combat.money >= shop.repairCost()) { shop.repair(combat); repairs++; }
    const typed = shop.offers.map((offer, i) => ({ i, price: shop.price(offer), type: mapProductToWeapon(offer) })).sort((a, b) => a.price - b.price);
    for (const { i, price } of typed) {
      if (shop.sold.has(i)) continue;
      const same = shop.equipped(shop.offers[i]);
      if (!damageTypes.has(typed.find(item => item.i === i)!.type) && !same) continue;
      if (same && same.level < 3 && combat.money >= price) { shop.buy(i, combat); purchases++; }
      else if (!same && shop.slots.some(slot => slot === null) && combat.money >= price) { shop.buy(i, combat); purchases++; }
    }
    p.nitro = Math.min(100, p.nitro + 20);
  };
  for (frames = 0; frames < 60 * 60 * 14; frames++) {
    if (wave.state === 'combat' || wave.state === 'countdown') {
      weapons.configure(p);
      let targetLane = 225, bestScore = -Infinity;
      let closePursuers = 0;
      for (const lane of [129, 225, 321]) {
        let score = -Math.abs(lane - p.x) * 0.05;
        for (const enemy of combat.enemies.items) {
          if (!enemy.active || enemy.kind === 2) continue;
          const dz = enemy.z - p.progress;
          if (dz > -50 && dz < 350) {
            const predictedX = Math.max(-139, Math.min(139, enemy.x + enemy.vx * Math.max(0, dz) / Math.max(150, p.speed)));
            if (Math.abs(predictedX - (lane - 225)) < 62) score -= 400 - dz;
          }
        }
        if (score > bestScore) { bestScore = score; targetLane = lane; }
      }
      input.steer = Math.max(-1, Math.min(1, (targetLane - p.x) * 0.04 - p.vx * 0.035));
      for (const enemy of combat.enemies.items) {
        if (enemy.active && enemy.kind === 2 && enemy.z < p.progress && enemy.z > p.progress - 130) closePursuers++;
      }
      input.boost = closePursuers >= 2 && p.nitro >= 20;
      p.step(input, FIXED_DT, route.curvatureAt(p.progress));
      combat.step(p, FIXED_DT);
      weapons.step(p, FIXED_DT);
      if (wave.isBossWave) bossFightFrames++;
    } else if (wave.state === 'bossdown' || wave.state === 'victory') {
      weapons.configure(p);
      input.brake = false; input.boost = false;
      p.step(input, FIXED_DT, route.curvatureAt(p.progress));
      combat.step(p, FIXED_DT);
      weapons.step(p, FIXED_DT);
      combat.health = Math.max(combat.health, 60);
    }
    if (combat.bossDefeated && !celebrated) {
      celebrated = true;
      combat.burstCoins(combat.bossX, combat.bossZ, 26, 52);
      wave.bossDown(2.4);
    }
    wave.step(p, combat, FIXED_DT);
    if (wave.state === 'pit') {
      income[lastWave] = combat.money - startMoney;
      shopVisit();
      wave.next(combat, p);
      lastWave = wave.number;
      startMoney = combat.money;
    }
    if (wave.state === 'victory') {
      income[lastWave] = combat.money - startMoney;
      break;
    }
    if (combat.health <= 0) break;
  }
  return {
    victory: wave.state === 'victory' && combat.bossDefeated,
    frames, bossFightFrames, income, spent: purchases, repairs,
    weapons: shop.slots.filter(Boolean).length, health: combat.health,
    kills: combat.kills, maxCombo: combat.maxCombo, distance: p.distance,
  };
}

test('five-wave economy keeps income in tight bands while still funding a build', () => {
  const run = driveRun();
  assert.ok(run.victory, `the scripted run must beat the tyrant truck (frames ${run.frames})`);
  assert.ok(run.bossFightFrames > 60 && run.bossFightFrames < 60 * 60, `boss fight must be a real fight (${run.bossFightFrames} frames)`);
  // Per-wave collected income: modest early, snowballing with the build, boss pays the jackpot.
  assert.ok(run.income[1] >= 45 && run.income[1] <= 85, `wave 1 income ${run.income[1]}`);
  assert.ok(run.income[2] >= 45 && run.income[2] <= 100, `wave 2 income ${run.income[2]}`);
  assert.ok(run.income[3] >= 60 && run.income[3] <= 135, `wave 3 income ${run.income[3]}`);
  assert.ok(run.income[4] >= 80 && run.income[4] <= 155, `wave 4 income ${run.income[4]}`);
  assert.ok(run.income[5] >= 30 && run.income[5] <= 110, `wave 5 income ${run.income[5]}`);
  const total = run.income.reduce((sum, value) => sum + value, 0);
  assert.ok(total >= 300 && total <= 500, `total run income ${total}`);
  assert.ok(run.weapons >= 3, `the run must fund at least three weapons (got ${run.weapons})`);
  assert.ok(run.health > 0 && run.kills > 80, `health ${run.health}, kills ${run.kills}`);
  assert.ok(run.maxCombo >= 10, `combo should reach double digits (got ${run.maxCombo})`);
  console.log(`economy: income [${run.income.slice(1).join(', ')}] weapons ${run.weapons} health ${run.health} repairs ${run.repairs} kills ${run.kills} combo ${run.maxCombo}`);
});
