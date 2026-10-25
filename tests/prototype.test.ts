import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatSystem } from '../src/combat/CombatSystem';
import { WeaponSystem } from '../src/combat/WeaponSystem';
import { DriftPhysics } from '../src/systems/DriftPhysics';
import { WaveSystem } from '../src/systems/WaveSystem';
import { TrackRoute } from '../src/systems/TrackRoute';
import { FIXED_DT } from '../src/config';

/** Scripted inputs are test fixtures, never an autopilot shipped to players. */
function driveWave(react: boolean) {
  const player = new DriftPhysics(), combat = new CombatSystem({ explode() {} });
  // 初始散弹现在是真实的后槽装备：驾驶对比测试照常带着它开火。
  const weapons = new WeaponSystem([null, { weaponId: 'scatter', name: 's', level: 1, cooldown: 0, invested: 0, art: '' }, null, null, null], combat);
  const wave = new WaveSystem(), route = new TrackRoute();
  const input = { steer: 0, throttle: true, brake: false, drift: false, boost: false };
  let frames = 0;
  for (; frames < 2700; frames++) {
    if (react) {
      let targetLane = 225, bestScore = -Infinity, closePursuers = 0;
      for (const lane of [129, 225, 321]) {
        let score = -Math.abs(lane - player.x) * 0.05;
        for (const enemy of combat.enemies.items) {
          if (!enemy.active || enemy.kind === 2) continue;
          const dz = enemy.z - player.progress;
          if (dz > -50 && dz < 350) {
            const predictedX = Math.max(-139, Math.min(139, enemy.x + enemy.vx * Math.max(0, dz) / Math.max(150, player.speed)));
            if (Math.abs(predictedX - (lane - 225)) < 62) score -= 400 - dz;
          }
        }
        if (score > bestScore) { bestScore = score; targetLane = lane; }
      }
      input.steer = Math.max(-1, Math.min(1, (targetLane - player.x) * 0.04 - player.vx * 0.035));
      for (const enemy of combat.enemies.items) {
        if (enemy.active && enemy.kind === 2 && enemy.z < player.progress && enemy.z > player.progress - 130) closePursuers++;
      }
      input.boost = closePursuers >= 2 && player.nitro >= 20;
    }
    player.step(input, FIXED_DT, route.curvatureAt(player.progress));
    combat.step(player, FIXED_DT); weapons.step(player, FIXED_DT); wave.step(player, combat, FIXED_DT);
    if (combat.health <= 0 || wave.state !== 'combat') break;
  }
  return { seconds: (frames + 1) * FIXED_DT, health: combat.health, money: combat.money, state: wave.state, wallHits: player.wallHits };
}

test('same loadout and wave reward hazard avoidance and timed escape over straight driving', () => {
  const straight = driveWave(false), reactive = driveWave(true);
  // Round one is the teaching round: even lazy driving limps to the pit stop,
  // but reactive steering must finish clearly healthier (straight driving can
  // still farm ram-killed cones for coins, so income is not the discriminator).
  const near = (seconds: number) => assert.ok(Math.abs(seconds - 42) < 0.5, `wave must run its full 42s (got ${seconds})`);
  assert.equal(straight.state, 'entering'); near(straight.seconds);
  assert.ok(straight.health < 60, `straight driving must still pay for it (${straight.health})`);
  assert.equal(reactive.state, 'entering'); near(reactive.seconds);
  assert.ok(reactive.health >= 40); assert.equal(reactive.wallHits, 0);
  assert.ok(reactive.health > straight.health, `reactive ${reactive.health} vs straight ${straight.health}`);
  assert.ok(reactive.money >= 9 && straight.money >= 9, 'both bank the pit arrival bonus');
});
