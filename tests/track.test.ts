import test from 'node:test';
import assert from 'node:assert/strict';
import { TrackRoute, ROUTE_SECTIONS } from '../src/systems/TrackRoute';
import { TrackProjection } from '../src/systems/TrackProjection';
import { DriftPhysics, type DriveInput } from '../src/systems/DriftPhysics';
import { FIXED_DT } from '../src/config';

test('road joins and repeat seam have continuous position, tangent and curvature', () => {
  const route = new TrackRoute();
  let join = 0;
  for (const section of ROUTE_SECTIONS) {
    join += section.length;
    route.sample(join - 0.01); const x = route.x, z = route.z, angle = route.heading;
    route.sample(join + 0.01);
    assert.ok(Math.hypot(route.x - x, route.z - z) < 0.021);
    assert.ok(Math.abs(route.heading - angle) < 0.001);
    assert.ok(Math.abs(route.curvatureAt(join - 0.01)) < 0.000001);
    assert.ok(Math.abs(route.curvatureAt(join + 0.01)) < 0.000001);
  }
  route.sample(route.length); assert.ok(Math.abs(route.heading) < 0.000001);
});
test('projection preserves near-road width, shrinks the distance, and shares car/contact coordinates', () => {
  const route = new TrackRoute(), projection = new TrackProjection(route);
  for (let progress = 0; progress < route.length * 2; progress += 67) {
    projection.configure(progress, 974, 640);
    projection.project(progress, 0);
    assert.ok(Math.abs(projection.x - 225) < 0.0001);
    assert.ok(Math.abs(projection.y - 640) < 0.0001);
    assert.ok(Math.abs(projection.scale - 1) < 0.0001);
    projection.project(progress + 1000, 0);
    assert.ok(projection.scale < 0.7 && projection.scale > 0);
    assert.ok(Number.isFinite(projection.x) && Number.isFinite(projection.y));
  }
});
test('a right bend creates outward movement and steering into it corrects the line', () => {
  const coasting = new DriftPhysics(), steering = new DriftPhysics();
  const a: DriveInput = { steer: 0, throttle: true, brake: false, drift: false, boost: false };
  const b = { ...a, steer: 0.12 };
  for (let i = 0; i < 75; i++) { coasting.step(a, FIXED_DT, 0.001); steering.step(b, FIXED_DT, 0.001); }
  assert.ok(coasting.x < 215);
  assert.ok(steering.x > coasting.x + 5);
  assert.equal(coasting.wallHits, 0); assert.equal(steering.wallHits, 0);
});
test('road boundaries remain safe across bends, repeated sections and boosts', () => {
  const route = new TrackRoute(), p = new DriftPhysics();
  const input: DriveInput = { steer: 0, throttle: true, brake: false, drift: false, boost: false };
  for (let i = 0; i < 12000; i++) {
    input.steer = Math.sin(i / 60); input.drift = i % 240 < 150; input.boost = i % 420 === 0;
    p.step(input, FIXED_DT, route.curvatureAt(p.progress));
    assert.ok(p.x >= 93 && p.x <= 357);
    assert.ok(Number.isFinite(p.vx) && Number.isFinite(p.vy) && Number.isFinite(p.heading));
  }
  assert.ok(p.progress > route.length * 3);
});
