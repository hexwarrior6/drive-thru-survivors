import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatSystem } from '../src/combat/CombatSystem';
import { DriftPhysics } from '../src/systems/DriftPhysics';
import { WaveSystem } from '../src/systems/WaveSystem';
import { TrackRoute } from '../src/systems/TrackRoute';
import { FIXED_DT } from '../src/config';

/** Scripted inputs are test fixtures, never an autopilot shipped to players. */
function driveWave(react: boolean) {
  const player = new DriftPhysics(), combat = new CombatSystem({ explode() {} });
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
    combat.step(player, FIXED_DT); wave.step(player, combat, FIXED_DT);
    if (combat.health <= 0 || wave.state !== 'combat') break;
  }
  return { seconds: (frames + 1) * FIXED_DT, health: combat.health, money: combat.money, state: wave.state, wallHits: player.wallHits };
}

test('same loadout and wave reward hazard avoidance and timed escape over straight driving', () => {
  const straight = driveWave(false), reactive = driveWave(true);
  // Round one is the teaching round: even lazy driving limps to the pit stop,
  // but reactive steering must finish clearly healthier (straight driving can
  // still farm ram-killed cones for coins, so income is not the discriminator).
  assert.equal(straight.state, 'entering'); assert.equal(straight.seconds, 42);
  assert.ok(straight.health < 60, `straight driving must still pay for it (${straight.health})`);
  assert.equal(reactive.state, 'entering'); assert.equal(reactive.seconds, 42);
  assert.ok(reactive.health >= 40); assert.equal(reactive.wallHits, 0);
  assert.ok(reactive.health > straight.health, `reactive ${reactive.health} vs straight ${straight.health}`);
  assert.ok(reactive.money >= 9 && straight.money >= 9, 'both bank the pit arrival bonus');
});
