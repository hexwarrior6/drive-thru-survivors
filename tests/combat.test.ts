import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { StressMeter } from '../src/combat/StressMeter';
import { ObjectPool } from '../src/utils/ObjectPool';
import { CombatSystem, MAGNET_RANGE, WEAPON_RANGE, SHOT_INTERVAL, interceptTime } from '../src/combat/CombatSystem';
import { PIT_ENTRY_SECONDS, PIT_PLAYER_X } from '../src/systems/PitStopLayout';
import { WaveSystem } from '../src/systems/WaveSystem';
import { DriftPhysics } from '../src/systems/DriftPhysics';
import { BASE_SPEED, FIXED_DT } from '../src/config';
const silent = { explode() {} };

test('fixed pools reuse exact slots, reject overflow and tolerate duplicate release', () => {
  let allocations = 0;
  const pool = new ObjectPool(2, slot => { allocations++; return { slot, active: false }; });
  const a = pool.acquire()!, b = pool.acquire()!;
  assert.equal(pool.acquire(), null); assert.equal(pool.dropped, 1);
  pool.release(a); pool.release(a); assert.equal(pool.activeCount, 1);
  assert.equal(pool.acquire(), a); pool.clear();
  for (let i = 0; i < 10000; i++) { const item = pool.acquire()!; pool.release(item); }
  assert.equal(allocations, 2); assert.equal(pool.items.length, 2); assert.equal(b.active, false);
});
test('rear turret targets nearby pursuers in either direction and leaves road obstacles for driving', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  c.spawn(0, 0, 80); c.spawn(1, 80, -80); c.spawn(2, 0, -WEAPON_RANGE - 1);
  assert.equal(c.nearest(0, 0), null);
  const far = c.spawn(2, 80, -300)!, near = c.spawn(2, -30, -160)!;
  far.vz = near.vz = 0;
  assert.equal(c.nearest(0, 0), near);
  c.step(p, FIXED_DT); assert.equal(c.shots, 1);
  const bullet = c.bullets.items[0]; assert.ok(bullet.vx < 0); assert.ok(bullet.vz < 0);
  assert.ok(bullet.pz < p.progress); assert.equal(c.targetSlot, near.slot);
  for (let i = 0; i < Math.ceil(SHOT_INTERVAL / FIXED_DT) - 1; i++) c.step(p, FIXED_DT);
  assert.equal(c.shots, 1); c.step(p, FIXED_DT); assert.equal(c.shots, 2);
  assert.ok(far.active);
  c.clear(); const overtaker = c.spawn(2, 0, 160)!;
  assert.equal(c.nearest(0, 0), overtaker);
});
test('the same scatter turret concentrates more damage at close range', () => {
  const damageAt = (z: number) => {
    const c = new CombatSystem(silent), p = new DriftPhysics();
    const rider = c.spawn(2, 0, z)!; rider.vz = 0;
    for (let i = 0; i < 23; i++) c.step(p, FIXED_DT);
    assert.equal(c.shots, 1); assert.equal(c.pelletsFired, 3);
    return 80 - rider.hp;
  };
  assert.equal(damageAt(-100), 36); assert.equal(damageAt(-300), 12);
});
test('grouped pursuers can share a scatter volley while separated lanes require repositioning', () => {
  const hitCount = (spacing: number) => {
    const c = new CombatSystem(silent), p = new DriftPhysics();
    const riders = [c.spawn(2, -spacing, -125)!, c.spawn(2, 0, -125)!, c.spawn(2, spacing, -125)!];
    for (const rider of riders) rider.vz = 0;
    for (let i = 0; i < 23; i++) c.step(p, FIXED_DT);
    assert.equal(c.shots, 1);
    return riders.filter(rider => rider.hp < 80).length;
  };
  assert.equal(hitCount(40), 3); assert.equal(hitCount(120), 1);
});
test('turret leads moving pursuers using an intercept solution', () => {
  for (const [dx, dz, vx, vz, speed] of [[80, -200, -70, 394, 880], [100, 180, 20, 394, 880], [0, -200, 0, 0, 800], [0, -100, 0, 800, 800]]) {
    const t = interceptTime(dx, dz, vx, vz, speed);
    assert.ok(t > 0);
    assert.ok(Math.abs(Math.hypot(dx + vx * t, dz + vz * t) - speed * t) < 0.001);
  }
  assert.equal(interceptTime(0, 100, 0, 1000, 800), 0);
});
test('rear fire kills a chasing rider and returns its distant reward without reversing', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics(); p.speed = 340; p.vy = -340;
  const cone = c.spawn(0, 130, 1000)!;
  c.spawn(2, 50, -200);
  for (let i = 0; i < 240 && c.kills === 0; i++) { p.previousProgress = p.progress; p.progress += 340 * FIXED_DT; c.step(p, FIXED_DT); }
  assert.equal(c.kills, 1); assert.ok(c.shots >= 5); assert.equal(c.health, 100);
  assert.ok(c.coins.items.some(coin => coin.active && coin.magnet));
  for (let i = 0; i < 120 && c.money === 0; i++) { p.progress += 340 * FIXED_DT; c.step(p, FIXED_DT); }
  assert.equal(c.money, 2); assert.equal(cone.hp, 24);
});
test('rider lateral inertia permits dodging and a real nitro burst opens a gap', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  const input = { steer: 0, throttle: true, brake: false, drift: false, boost: false };
  for (let i = 0; i < 200; i++) p.step(input, FIXED_DT);
  const rider = c.spawn(2, 100, p.progress - 200)!; rider.hp = 1e6;
  c.step(p, FIXED_DT); assert.ok(rider.vx < 0 && rider.vx > -10);
  const gap = p.progress - rider.z;
  input.boost = true; p.step(input, FIXED_DT); input.boost = false; c.step(p, FIXED_DT);
  for (let i = 0; i < 89; i++) { p.step(input, FIXED_DT); c.step(p, FIXED_DT); }
  assert.ok(rider.active); assert.ok(p.progress - rider.z > gap + 15); assert.ok(rider.vz < p.speed);
});
test('waves separately spawn forward hazards and rear pursuit packs', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics(), w = new WaveSystem();
  for (let i = 0; i < 151; i++) { p.progress += 340 * FIXED_DT; w.step(p, c, FIXED_DT); }
  const riders = c.enemies.items.filter(e => e.active && e.kind === 2);
  assert.equal(riders.length, 2); assert.ok(riders.every(e => e.z < p.progress - 100));
  const obstacles = c.enemies.items.filter(e => e.active && e.kind !== 2);
  assert.ok(obstacles.length > 0); assert.ok(obstacles.every(e => e.x >= -138 && e.x <= 138));
});
test('swept bullet hits once at high speed, flashes, shows cached damage and kills into coin pool', () => {
  let explosions = 0;
  const c = new CombatSystem({ explode() { explosions++; } }), p = new DriftPhysics();
  const e = c.spawn(0, 100, 200)!;
  for (let n = 0; n < 2; n++) {
    const b = c.bullets.acquire()!; b.x = 100; b.z = 130; b.vx = 0; b.vz = 8400; b.life = 1; b.damage = 16;
    c.step(p, FIXED_DT);
    if (n === 0) { assert.equal(e.hp, 8); assert.ok(e.flash > 0); assert.equal(c.damage.activeCount, 1); }
    assert.equal(b.active, false);
  }
  assert.equal(explosions, 1); assert.equal(c.kills, 1); assert.equal(c.coins.activeCount, 1); assert.equal(e.active, false);
});
test('ram damage scales linearly with absolute speed and uses blue/orange/purple and nitro multipliers', () => {
  const p = new DriftPhysics(); p.speed = BASE_SPEED;
  assert.equal(CombatSystem.ramDamage(p), 36);
  p.speed *= 0.5; assert.equal(CombatSystem.ramDamage(p), 18);
  p.speed = BASE_SPEED; p.pulseTime = 1;
  for (const [ratio, multiplier] of [[0.15, 2], [0.25, 2.5], [0.4, 3]]) {
    p.pulseRatio = ratio; assert.equal(CombatSystem.ramDamage(p), 36 * multiplier);
  }
  p.pulseTime = 0; p.nitroTime = 1; assert.equal(CombatSystem.ramDamage(p), 72);
  p.nitroTime = 0; p.speed = 0; assert.equal(CombatSystem.ramDamage(p), 0);
});
test('car collision kills under purple boost and contact immunity prevents repeated health drain', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  p.speed = BASE_SPEED; p.pulseTime = 1; p.pulseRatio = 0.4;
  c.spawn(1, 0, 0); c.step(p, FIXED_DT); assert.equal(c.kills, 1); assert.equal(c.health, 100);
  p.pulseTime = 0; p.speed = 0; c.spawn(0, 0, 0); c.spawn(0, 0, 0); c.step(p, FIXED_DT);
  assert.equal(c.health, 95);
});
test('three enemy behaviors are static cone, crossing cart and tracking rider', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  const cone = c.spawn(0, 100, 400)!, cart = c.spawn(1, -100, 400)!, rider = c.spawn(2, 100, -200)!;
  c.step(p, FIXED_DT);
  assert.equal(cone.x, 100); assert.equal(cone.z, 400);
  assert.ok(cart.x > -100); assert.ok(rider.x < 100); assert.ok(rider.z > -200);
});
test('80px magnetic pickup latches, tracks a boosting car and credits each coin once', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  p.vy = -510; p.speed = 510;
  const coin = c.coins.acquire()!; coin.x = MAGNET_RANGE + 1; coin.z = 0; coin.life = 8; coin.value = 3; coin.vx = coin.vz = 0; coin.magnet = false;
  c.step(p, FIXED_DT); assert.equal(coin.magnet, false);
  coin.x = 60; c.step(p, FIXED_DT); assert.equal(coin.magnet, true);
  for (let i = 0; i < 90; i++) { p.progress += 510 * FIXED_DT; c.step(p, FIXED_DT); }
  assert.equal(c.money, 3); assert.equal(coin.active, false);
});
test('pool exhaustion never grows storage, pickup overflow preserves drop value', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics(); p.speed = 340; p.nitroTime = 1;
  for (let i = 0; i < c.coins.capacity; i++) { const coin = c.coins.acquire()!; coin.value = 1; coin.x = 130; coin.z = 400; coin.life = 8; }
  c.spawn(0, 0, 0); c.step(p, FIXED_DT);
  assert.equal(c.coins.activeCount, 128); assert.equal(c.coins.items.reduce((sum, coin) => sum + coin.value, 0), 129);
  for (let i = 0; i < 130; i++) c.spawn(0, 0, 500);
  assert.equal(c.enemies.items.length, 128); assert.equal(c.enemies.activeCount, 128); assert.equal(c.enemies.dropped, 2);
});
test('45-second wave freezes combat, eases into pit, grants reward once, next waves cap at 60s', () => {
  const c = new CombatSystem(silent), w = new WaveSystem(), p = new DriftPhysics(); p.speed = BASE_SPEED;
  for (let i = 0; i < 2699; i++) w.step(p, c, FIXED_DT);
  assert.equal(w.state, 'combat'); w.step(p, c, FIXED_DT);
  assert.equal(w.state, 'entering'); assert.equal(c.enemies.activeCount, 0); assert.equal(c.money, 9);
  const start = p.progress;
  const approachSeconds = Math.max(PIT_ENTRY_SECONDS, 2 * (w.pitProgress - start) / BASE_SPEED);
  for (let i = 0; i < Math.ceil(approachSeconds / FIXED_DT) + 2; i++) w.step(p, c, FIXED_DT);
  assert.equal(w.state, 'pit'); assert.equal(p.x, PIT_PLAYER_X); assert.equal(p.speed, 0); assert.ok(p.progress > start);
  for (let i = 0; i < 90; i++) w.step(p, c, FIXED_DT);
  assert.equal(c.money, 9); w.next(c, p); assert.equal(w.remaining, 48);
  w.number = 10; w.state = 'pit'; w.next(c, p); assert.equal(w.remaining, 60);
});
test('combat hot paths contain no object construction, literals or closure allocation', () => {
  for (const path of ['src/combat/WeaponSystem.ts', 'src/combat/WeaponView.ts', 'src/combat/CombatSystem.ts', 'src/combat/CombatView.ts', 'src/systems/PitStopView.ts', 'src/systems/WaveSystem.ts', 'src/effects/ParticleManager.ts', 'src/scenes/GameScene.ts']) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const scan = (node: ts.Node) => {
      assert.ok(!ts.isNewExpression(node) && !ts.isObjectLiteralExpression(node) && !ts.isArrayLiteralExpression(node) && !ts.isArrowFunction(node) && !ts.isFunctionExpression(node), `${path}: allocation in hot method: ${node.getText(source).slice(0, 70)}`);
      ts.forEachChild(node, scan);
    };
    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) && node.name.getText(source) !== 'create') { if (node.body) scan(node.body); }
      else ts.forEachChild(node, visit);
    };
    // Input handlers and scene lifecycle can allocate; only simulation/presentation methods run per frame.
    if (path.endsWith('GameScene.ts')) {
      const names = new Set(['fixedUpdate', 'update', 'fillStress', 'drawEffects']);
      const gameVisit = (node: ts.Node) => { if (ts.isMethodDeclaration(node) && names.has(node.name.getText(source))) { if (node.body) scan(node.body); } else ts.forEachChild(node, gameVisit); };
      gameVisit(source);
    } else visit(source);
  }
});

test('ten-minute combat soak keeps slot identities and capacities fixed and reclaims all transient state', () => {
  const c = new CombatSystem(silent), p = new DriftPhysics();
  const enemySlots = c.enemies.items.slice(), bulletSlots = c.bullets.items.slice(), coinSlots = c.coins.items.slice();
  for (let frame = 0; frame < 36000; frame++) {
    p.previousProgress = p.progress; p.progress += 340 * FIXED_DT; p.speed = 340; p.vy = -340;
    p.x = 225 + Math.sin(frame / 300) * 95;
    if (frame % 8 === 0) c.spawn(frame % 3, (frame % 5 - 2) * 50, p.progress + (frame % 3 === 2 ? -150 : 450));
    c.step(p, FIXED_DT);
    assert.ok(Number.isFinite(c.money) && Number.isFinite(c.health));
  }
  assert.ok(c.kills > 1000);
  assert.ok(c.enemies.items.every((item, i) => item === enemySlots[i]));
  assert.ok(c.bullets.items.every((item, i) => item === bulletSlots[i]));
  assert.ok(c.coins.items.every((item, i) => item === coinSlots[i]));
  assert.equal(c.enemies.dropped, 0); assert.equal(c.bullets.dropped, 0);
  c.clear(); assert.equal(c.enemies.activeCount + c.bullets.activeCount + c.coins.activeCount + c.damage.activeCount, 0);
});


test('performance sampler excludes warmup, records 600 frames and freezes its result', () => {
  const meter = new StressMeter(); assert.equal(meter.p95, 0);
  for (let i = 0; i < 120; i++) meter.record(80, 0, 0, 0);
  for (let i = 0; i < 600; i++) meter.record(1000 / 60, 48, 96, 480);
  assert.equal(meter.frames, 600); assert.ok(Math.abs(meter.fps - 60) < 0.001);
  assert.equal(meter.p95, 17); assert.equal(meter.slow, 0); assert.equal(meter.minParticles, 480);
  meter.record(200, 0, 0, 0); assert.equal(meter.frames, 600); assert.equal(meter.slow, 0);
});
