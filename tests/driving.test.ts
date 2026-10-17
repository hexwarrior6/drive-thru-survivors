import test from 'node:test';
import assert from 'node:assert/strict';
import { DriftPhysics, tierForCharge, type DriveInput } from '../src/systems/DriftPhysics';
import { FIXED_DT, ROAD_LEFT, ROAD_RIGHT } from '../src/config';
import { slerpAngle } from '../src/utils/math';
const drive = (): DriveInput => ({ steer: 0, throttle: true, brake: false, drift: false, boost: false });
function tick(p: DriftPhysics, input: DriveInput, frames: number) { for (let i = 0; i < frames; i++) p.step(input, FIXED_DT); }

test('charge thresholds map exactly to blue / orange / purple', () => {
  assert.equal(tierForCharge(0.499), 0); assert.equal(tierForCharge(0.5), 1);
  assert.equal(tierForCharge(1), 2); assert.equal(tierForCharge(2), 3);
});
test('heading leads velocity and drift retains more lateral slip', () => {
  const grip = new DriftPhysics(), drift = new DriftPhysics();
  const a = drive(), b = drive(); a.steer = b.steer = 1; b.drift = true;
  tick(grip, a, 12); tick(drift, b, 12);
  assert.ok(drift.heading > Math.atan2(drift.vx, -drift.vy) + 0.1);
  assert.ok(Math.abs(drift.lateralSpeed) > Math.abs(grip.lateralSpeed));
});
for (const [frames, tier, ratio] of [[34, 1, 0.15], [65, 2, 0.25], [125, 3, 0.4]]) {
  test(`tier ${tier} release applies ${ratio * 100}% pulse without discontinuous direction`, () => {
    const p = new DriftPhysics(), input = drive();
    input.drift = true; input.steer = 1; tick(p, input, 1);
    input.steer = 0; tick(p, input, frames);
    assert.equal(p.tier, tier); assert.equal(p.wallHits, 0);
    const before = p.speed, angle = Math.atan2(p.vx, -p.vy);
    input.drift = false; p.step(input, FIXED_DT);
    assert.equal(p.released, tier); assert.equal(p.pulseRatio, ratio);
    assert.ok(p.speed > before * (1 + ratio - 0.03));
    assert.ok(Math.abs(Math.atan2(p.vx, -p.vy) - angle) < 0.15);
  });
}
test('unearned releases do not boost, brake cancels drift', () => {
  const p = new DriftPhysics(), input = drive(); input.drift = true; input.steer = 1;
  tick(p, input, 10); input.drift = false; p.step(input, FIXED_DT); assert.equal(p.released, 0);
  input.drift = true; input.steer = 0.2; tick(p, input, 35); input.brake = true;
  p.step(input, FIXED_DT); assert.equal(p.released, 0); assert.equal(p.drifting, false);
});
test('held steering never penetrates either guardrail, rebounds and remains steerable', () => {
  for (const side of [-1, 1]) {
    const p = new DriftPhysics(), input = drive(); input.steer = side; input.drift = true;
    let bounced = false;
    for (let i = 0; i < 600; i++) {
      p.step(input, FIXED_DT);
      const half = Math.abs(Math.cos(p.heading)) * 24 + Math.abs(Math.sin(p.heading)) * 34;
      assert.ok(p.x - half >= ROAD_LEFT); assert.ok(p.x + half <= ROAD_RIGHT);
      if (p.hitWall) { bounced = true; assert.ok(p.vx * side < 0); }
    }
    assert.ok(bounced); input.steer = -side; input.drift = false; tick(p, input, 50);
    assert.ok(side < 0 ? p.x > ROAD_LEFT + 65 : p.x < ROAD_RIGHT - 65);
  }
});
test('nitro spends once, lasts two seconds and cannot exceed the budget', () => {
  const p = new DriftPhysics(), input = drive(); input.boost = true; p.step(input, FIXED_DT);
  assert.equal(p.nitro, 80); assert.equal(p.nitroTime, 2);
  input.boost = false; tick(p, input, 119); assert.ok(p.nitroTime > 0);
  tick(p, input, 2); assert.equal(p.nitroTime, 0);
  for (let i = 0; i < 7; i++) { input.boost = true; p.step(input, FIXED_DT); input.boost = false; tick(p, input, 121); }
  assert.equal(p.nitro, 0);
});
test('coasting decelerates smoothly and braking decelerates faster', () => {
  const p = new DriftPhysics(), input = drive(); tick(p, input, 200);
  const speed = p.speed; input.throttle = false; p.step(input, FIXED_DT);
  assert.ok(p.speed < speed && p.speed > speed * 0.95);
  tick(p, input, 60); assert.ok(p.speed < speed * 0.6);
  input.brake = true; tick(p, input, 60); assert.ok(p.speed < 80);
});
test('slerp follows the short path across angle wraparound', () => {
  assert.ok(slerpAngle(Math.PI - 0.05, -Math.PI + 0.05, 0.15) > Math.PI - 0.05);
});
