import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatSystem, BOSS_HP } from '../src/combat/CombatSystem';
import { WeaponSystem } from '../src/combat/WeaponSystem';
import { ShopSystem } from '../src/systems/ShopSystem';
import { WaveSystem } from '../src/systems/WaveSystem';
import { bossBurstCount, bossReward, MODULE_PRICES } from '../src/systems/balance';
import { DriftPhysics } from '../src/systems/DriftPhysics';
import { TrackRoute } from '../src/systems/TrackRoute';
import { themeFor } from '../src/systems/Theme';
import { clearRun, loadRun, recordRun, saveRun, type RunSave } from '../src/systems/SaveSystem';
import { demoSnapshot } from '../src/data/snapshot';
import { carById } from '../src/data/cars';
import { BASE_SPEED, FIXED_DT } from '../src/config';
const silent = { explode() {} };

test('wave five fields the tyrant truck without a clock; the kill rolls into the next round', () => {
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
  assert.equal(w.bossTier, 1);
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
  for (let i = 0; i < 160 && w.state === 'bossdown'; i++) w.step(p, c, FIXED_DT);
  assert.equal(w.state, 'entering', 'a mid-run boss kill opens the pit stop for the next round');
  for (let i = 0; i < 60 * 8 && w.state !== 'pit'; i++) w.step(p, c, FIXED_DT);
  assert.equal(w.state, 'pit');
  w.next(c, p);
  assert.equal(w.number, 6);
  assert.equal(w.isBossWave, false);
});

test('the fourth boss at wave twenty ends the run with victory', () => {
  const c = new CombatSystem(silent), w = new WaveSystem(), p = new DriftPhysics();
  w.number = 20; w.beginCountdown(0.01);
  w.step(p, c, FIXED_DT);
  for (let i = 0; i < 120 && c.bossSlot < 0; i++) {
    p.previousProgress = p.progress; p.progress += 340 * FIXED_DT; p.speed = 340; p.vy = -340;
    w.step(p, c, FIXED_DT);
  }
  const boss = c.enemies.items[c.bossSlot];
  assert.ok(boss?.active, 'the final tyrant must spawn');
  assert.equal(w.bossTier, 4);
  assert.equal(c.bossMaxHp, Math.round(BOSS_HP * 5.0));
  boss!.hp = 100;
  c.hit(boss!, 99999);
  w.bossDown(0.02);
  for (let i = 0; i < 10 && w.state === 'bossdown'; i++) w.step(p, c, FIXED_DT);
  assert.equal(w.state, 'victory', 'only the fourth boss finishes the run');
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

test('the starter scatter and the pierce cannon both lock onto the truck', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  p.speed = 0; p.vy = 0;
  const w = new WeaponSystem(
    [{ weaponId: 'W01', name: '巨无霸', level: 1, cooldown: 0, invested: 0, art: '' },
     { weaponId: 'scatter', name: 's', level: 1, cooldown: 0, invested: 0, art: '' }, null, null, null],
    c,
  );
  c.spawn(3, 0, 200);
  c.step(p, FIXED_DT);
  w.step(p, FIXED_DT);
  assert.ok(c.shots >= 2, 'scatter and pierce cannon both open up on the boss');
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
});

test('frost kart ram leaves survivors chilled', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  c.ramSlow = 0.5; p.speed = BASE_SPEED; p.vy = -BASE_SPEED;
  const rider = c.spawn(2, 0, 0)!;
  c.step(p, FIXED_DT);
  assert.equal(rider.slow, 0.5);
  assert.ok(rider.slowTime > 0);
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
  assert.equal(shop.repairCost(), 16);
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
    v: 6, runSeed: 777, car: 'magnet', city: '杭州', wave: 3, duration: 51, atPit: true,
    health: 64, money: 77, kills: 88, maxCombo: 12, distance: 5432, nitro: 80,
    slots: [
      { weaponId: 'W01', name: '巨无霸', level: 2, branch: 'a', invested: 60 },
      { weaponId: 'scatter', name: '初始散弹炮', level: 1, invested: 0 },
      { weaponId: 'M-drift', name: '漂移增压器', level: 1, invested: 26 },
      null, null,
    ],
    sauces: ['ketchup'], sauceWaves: [2],
    route, bagIds: shop.bag.map(s => s.id), snapshot, savedAt: '2026-10-26T00:00:00.000Z',
  };
  saveRun(run);
  assert.deepEqual(loadRun(), run);
  clearRun();
  assert.equal(loadRun(), null);
  const first = recordRun({ car: 'flash', build: ['巨堡贯穿炮 Lv.2 · 压路重炮'], wave: 5, distance: 9000, kills: 100, maxCombo: 30, victory: true, at: '2026-10-26T00:00:00.000Z' });
  assert.ok(first.newDistance && first.newWave);
  recordRun({ car: 'magnet', build: [], wave: 3, distance: 5000, kills: 60, maxCombo: 20, victory: false, at: '2026-10-26T00:00:00.000Z' });
  const third = recordRun({ car: 'frost', build: [], wave: 2, distance: 3000, kills: 30, maxCombo: 10, victory: false, at: '2026-10-26T00:00:00.000Z' });
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

/** mulberry32: 经济长跑测试用固定种子，模拟不再随 Math.random 波动。 */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scripted run: reactive steering, build-first shopping, repairs under pressure. */
function driveRun(snapshot = demoSnapshot(), seed = 20261026) {
  const originalRandom = Math.random;
  Math.random = seededRandom(seed);
  try {
  const combat = new CombatSystem(silent);
  const wave = new WaveSystem();
  const p = new DriftPhysics();
  const route = new TrackRoute();
  const input = { steer: 0, throttle: true, brake: false, drift: false, boost: false };
  const shop = new ShopSystem(snapshot, () => .5);
  shop.open(1);
  const weapons = new WeaponSystem(shop.slots, combat);
  const income: number[] = Array.from({ length: 21 }, () => 0);
  const bossFrames: number[] = [];
  let bossOpen = false;
  let startMoney = 0, lastWave = 1, frames = 0, purchases = 0, repairs = 0;
  let celebrated = false, minHealth = 100;
  const shopVisit = () => {
    shop.open(wave.number);
    while (combat.health < 90 && combat.money >= shop.repairCost() + 6) { shop.repair(combat); repairs++; }
    // 前槽：优先买得起实装专属（巨无霸→W01 等）；买不起才吃免费前炮服务（§4.2 保底）。
    if (shop.slots[0] === null) {
      const readyFront = shop.offers
        .map((offer, i) => ({ i, offer, price: shop.price(offer, 0) }))
        .filter(({ offer, price }) => ['W01', 'W12'].includes(shop.weaponFor(offer)) && combat.money >= price)
        .sort((a, b) => a.price - b.price)[0];
      if (readyFront) { if (shop.buy(readyFront.i, combat) === 'bought') purchases++; }
      else shop.installFrontService();
    }
    // 前火力成长优先（旧脚本验证过的策略：先军备后容错），留维修余量。
    const upgradeInStop = () => {
      // 商品材料喂养（同 weaponId 升阶，Lv.3 选压路分支）。
      const ranked = shop.offers.map((offer, i) => {
        const same = shop.equipped(offer);
        return { i, same, price: shop.price(offer, same?.level ?? 0) };
      }).filter(({ same }) => same).sort((a, b) => a.price - b.price);
      for (const { i, same, price } of ranked) {
        if (shop.sold.has(i) || same!.level >= 5 || combat.money < price) continue;
        const branch = same!.level + 1 === 3 ? 'a' : undefined;
        if (shop.buy(i, combat, -1, branch) === 'bought') purchases++;
      }
      // 改装服务兜底（§6）：本店没有材料时直接升阶（前武器优先于后武器）。
      for (let i = 0; i < 2; i++) {
        const weapon = shop.slots[i];
        if (!weapon || weapon.level >= 5 || !shop.lacksMaterial(weapon)) continue;
        const cost = shop.upgradeServiceCost(i);
        if (combat.money < cost + shop.repairCost()) continue;
        const branch = weapon.level + 1 === 3 && !weapon.branch ? 'a' : undefined;
        if (shop.upgradeService(i, combat, branch) === 'bought') purchases++;
      }
    };
    upgradeInStop();
    // 前火力到达 Lv2 前不买容错模块；之后按续航→攻击→容错补齐。
    const frontLevel = shop.slots[0]?.level ?? 0;
    if (frontLevel >= 3) {
      for (const id of ['M-pump', 'M-drift', 'M-bumper']) {
        if (!shop.moduleInstalled(id) && combat.money >= shop.modulePrice(id) + shop.repairCost()) {
          if (shop.buyModule(id, combat)) purchases++;
        }
      }
    }
    // 散弹替换（§4.2）：只换成文档 §10 推荐构筑的后武器（雷阵/冰饮/尾焰），
    // 控场型（W21 脉冲）与细腻型（W13 圆锯）留给真人取舍，不进脚本构筑。
    const rearPreference = ['W17', 'W24', 'W07'];
    for (const wid of rearPreference) {
      // 控场型冰饮只在成长起来后有价值：前武器 Lv4 前保持常驻散弹（§4.2 实验）。
      if (wid !== 'W17' && (shop.slots[0]?.level ?? 0) < 4) continue;
      const offer = shop.offers.find(o => shop.weaponFor(o) === wid);
      if (!offer) continue;
      const same = shop.equipped(offer);
      const index = shop.offers.indexOf(offer);
      if (same) {
        const price = shop.price(offer, same.level);
        if (same.level < 5 && combat.money >= price) {
          const branch = same.level + 1 === 3 ? 'a' : undefined;
          if (shop.buy(index, combat, -1, branch) === 'bought') purchases++;
        }
        break;
      }
      if (shop.slots[1]?.weaponId === 'scatter' && combat.money >= shop.price(offer, 0)) {
        if (shop.buy(index, combat, 1) === 'bought') purchases++;
        break;
      }
      break;
    }
    p.nitro = Math.min(100, p.nitro + 20);
  };
  for (frames = 0; frames < 60 * 60 * 25; frames++) {
    if (wave.state === 'combat' || wave.state === 'countdown') {
      weapons.configure(p);
      let targetLane = 225, bestScore = -Infinity;
      let closePursuers = 0;
      for (const lane of [129, 225, 321]) {
        let score = -Math.abs(lane - p.x) * 0.05;
        for (const enemy of combat.enemies.items) {
          if (!enemy.active) continue;
          const dz = enemy.z - p.progress;
          // 前方路障照旧避让；正在突进的骑手也占用车道， lateral 拉开一个身位。
          if (enemy.kind === 2 ? dz > -220 && dz < 40 : dz > -50 && dz < 350) {
            const reach = enemy.kind === 2 ? 0.5 : Math.max(0, dz) / Math.max(150, p.speed);
            const predictedX = Math.max(-139, Math.min(139, enemy.x + enemy.vx * reach));
            if (Math.abs(predictedX - (lane - 225)) < 62) score -= enemy.kind === 2 ? 220 : 400 - dz;
          }
        }
        if (score > bestScore) { bestScore = score; targetLane = lane; }
      }
      input.steer = Math.max(-1, Math.min(1, (targetLane - p.x) * 0.04 - p.vx * 0.035));
      for (const enemy of combat.enemies.items) {
        if (enemy.active && enemy.kind === 2 && enemy.z < p.progress && enemy.z > p.progress - 130) closePursuers++;
      }
      input.boost = closePursuers >= 2 && p.nitro >= 20;
      // 会玩的司机用漂移喂增压器：每 4s 顺着自己要去的方向漂一段（§10 漂移构筑）。
      const driftPhase = frames % 240;
      input.drift = driftPhase >= 150 && driftPhase < 195 && Math.abs(input.steer) > 0.25;
      p.step(input, FIXED_DT, route.curvatureAt(p.progress));
      combat.step(p, FIXED_DT);
      weapons.step(p, FIXED_DT);
      if (combat.health < minHealth) minHealth = combat.health;
      if (wave.isBossWave) {
        if (!bossOpen) { bossOpen = true; bossFrames.push(0); }
        bossFrames[bossFrames.length - 1]++;
      }
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
      bossOpen = false;
      combat.burstCoins(combat.bossX, combat.bossZ, bossBurstCount(wave.bossTier), bossReward(wave.bossTier));
      wave.bossDown(2.4);
    }
    wave.step(p, combat, FIXED_DT);
    if (wave.state === 'pit') {
      income[lastWave] = combat.money - startMoney;
      shopVisit();
      wave.next(combat, p);
      celebrated = false;
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
    frames, bossFrames, bosses: bossFrames.length, income, spent: purchases, repairs, minHealth,
    weapons: shop.slots.filter(Boolean).length, health: combat.health,
    kills: combat.kills, maxCombo: combat.maxCombo, distance: p.distance,
    slots: shop.slots.map(w => w ? `${w.weaponId} Lv.${w.level}${w.branch ?? ''}` : '·'),
    modules: shop.slots.slice(2).filter(Boolean).length,
    frontMaxLevel: shop.slots[0]?.level ?? 0,
    bossDefeated: combat.bossDefeated,
    waveReached: wave.number,
  };
  } finally { Math.random = originalRandom; }
}

test('first round: economy funds the opening build and reaches the wave-five boss (phase-1 gate)', () => {
  const run = driveRun(demoSnapshot(), 20261026);
  assert.ok(run.waveReached >= 5, `the run must reach the wave-five boss (reached wave ${run.waveReached}, died at frame ${run.frames})`);
  const band = (w: number, low: number, high: number) =>
    assert.ok(run.income[w] >= low && run.income[w] <= high, `wave ${w} income ${run.income[w]}`);
  band(1, 30, 90); band(2, 35, 100); band(3, 40, 130); band(4, 50, 150); band(5, 45, 200);
  assert.ok(run.health > 0 || run.bosses >= 1, `the first round must be survivable (health ${run.health}, bosses ${run.bosses})`);
  assert.ok(run.frontMaxLevel >= 3, `front firepower must reach Lv.3 in round one (got Lv.${run.frontMaxLevel})`);
  console.log(`round-one: income [${run.income.slice(1, 6).join(', ')}] frontMax Lv.${run.frontMaxLevel} slots [${run.slots.join(' | ')}] modules ${run.modules} health ${run.health} min ${run.minHealth} kills ${run.kills} bosses ${run.bosses}`);
});

test('round-two soak: the full-menu route funds the whole growth path by the second round', () => {
  // 阶段一范围（§13）：三件原型 + 模块/酱料/替换经济的完整循环。
  // 全 20 波四 Boss 通关是第二阶段（12 件武器）的验收，这里先锁定：
  // Boss 战可胜、前火力与三个模块的成长路径被经济完整兑现、经济带不回归。
  // 注：成长节奏与原型期武器池深度存在张力（司机 Lv.5 早于文档 §9.4 的
  // 「10–15 波」目标），等第二阶段武器池变厚后再校准升阶曲线。
  const snapshot = demoSnapshot();
  snapshot.stores = [snapshot.stores[0]];
  const run = driveRun(snapshot, 271828);
  assert.ok(run.waveReached >= 6, `the run must enter the second round (reached wave ${run.waveReached}, frames ${run.frames})`);
  assert.ok(run.bosses >= 1, 'the wave-five boss fight must happen');
  for (const frames of run.bossFrames) assert.ok(frames > 60 && frames < 60 * 240, `each boss fight must be a real fight (${run.bossFrames.join(',')})`);
  const band = (w: number, low: number, high: number) =>
    assert.ok(run.income[w] >= low && run.income[w] <= high, `wave ${w} income ${run.income[w]}`);
  band(1, 30, 90); band(2, 35, 100); band(3, 40, 130); band(4, 50, 150); band(5, 45, 190);
  // 第二轮入口可能死在第 6 波早段：只有真的采集到收入时才校验第 6 波带。
  if (run.income[6] > 0) band(6, 40, 210);
  assert.ok(run.frontMaxLevel >= 3, `front firepower must keep growing (got Lv.${run.frontMaxLevel})`);
  assert.ok(run.modules >= 2, `vehicle modules must be affordable by round two (got ${run.modules})`);
  console.log(`soak: waves ${run.waveReached} income [${run.income.slice(1, 8).join(', ')}] frontMax Lv.${run.frontMaxLevel} slots [${run.slots.join(' | ')}] modules ${run.modules} health ${run.health} min ${run.minHealth} repairs ${run.repairs} purchases ${run.spent} kills ${run.kills} bosses ${run.bosses}`);
  void MODULE_PRICES;
});

test('twenty waves four bosses: the full-menu route beats the whole route (phase-2 gate)', () => {
  const snapshot = demoSnapshot();
  snapshot.stores = [snapshot.stores[0]];
  const run = driveRun(snapshot, 555777);
  assert.ok(run.victory, `the scripted run must beat all four bosses (frames ${run.frames}, wave ${run.waveReached}, health ${run.health.toFixed(1)}, min ${run.minHealth.toFixed(1)})`);
  assert.equal(run.bosses, 4, `the run must field four boss fights (got ${run.bosses})`);
  for (const frames of run.bossFrames) assert.ok(frames > 60 && frames < 60 * 240, `each boss fight must be a real fight (${run.bossFrames.join(',')})`);
  assert.ok(run.kills > 1000, `full-route kill volume (got ${run.kills})`);
  console.log(`full-route: wave ${run.waveReached} slots [${run.slots.join(' | ')}] modules ${run.modules} kills ${run.kills} bosses ${run.bosses} bossFrames [${run.bossFrames.join(',')}] repairs ${run.repairs} min ${run.minHealth.toFixed(1)}`);
  void MODULE_PRICES;
});
