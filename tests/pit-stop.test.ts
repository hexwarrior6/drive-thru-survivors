import test from 'node:test';
import assert from 'node:assert/strict';
import { WaveSystem } from '../src/systems/WaveSystem';
import { CombatSystem } from '../src/combat/CombatSystem';
import { DriftPhysics } from '../src/systems/DriftPhysics';
import { TrackRoute } from '../src/systems/TrackRoute';
import { TrackProjection } from '../src/systems/TrackProjection';
import { PIT_CAMERA_SIDE, PIT_ENTRY_SECONDS, PIT_EXIT_SECONDS, PIT_PLAYER_X, PIT_LANE_HALF, MAIN_ROAD_HALF, PIT_DIVIDER_SIDE, PIT_WALL_START, PIT_WALL_END, pitDividerVisible, pitLaneCenter } from '../src/systems/PitStopLayout';
import { FIXED_DT } from '../src/config';
const silent = { explode() {} };

test('the advance marker stays fixed in world space while the car approaches', () => {
  const wave = new WaveSystem(), p = new DriftPhysics(), combat = new CombatSystem(silent);
  wave.remaining = 3.1; p.speed = 340;
  for (let i = 0; i < 8; i++) { p.progress += 340 * FIXED_DT; wave.step(p, combat, FIXED_DT); }
  const station = wave.pitProgress; assert.ok(Number.isFinite(station));
  for (let i = 0; i < 100; i++) { p.progress += 340 * FIXED_DT; wave.step(p, combat, FIXED_DT); assert.equal(wave.pitProgress, station); }
  assert.equal(wave.state, 'combat'); assert.ok(station > p.progress);
});
test('entry from any driving lane clears the divider before parking in the original rightmost lane', () => {
  for (const x of [108, 225, 342]) {
    const wave = new WaveSystem(), p = new DriftPhysics(), combat = new CombatSystem(silent);
    p.x = x; p.speed = 340; wave.remaining = FIXED_DT;
    wave.step(p, combat, FIXED_DT); assert.equal(wave.state, 'entering');
    let crossed = false, camera = 0;
    for (let i = 0; i < Math.ceil(PIT_ENTRY_SECONDS / FIXED_DT) + 2; i++) {
      const before = p.progress; wave.step(p, combat, FIXED_DT);
      assert.ok(p.progress >= before); assert.ok(wave.cameraSide >= camera); camera = wave.cameraSide;
      if (!crossed && p.progress >= wave.pitProgress + PIT_WALL_START) {
        crossed = true; assert.ok(Math.abs(p.x - 225 - pitLaneCenter(p.progress - wave.pitProgress)) < 2);
      }
      if (pitDividerVisible(p.progress - wave.pitProgress)) {
        assert.ok(p.x - 225 - 18 > PIT_DIVIDER_SIDE + 5, 'car must clear the divider with its full width');
      }
      assert.ok(Number.isFinite(p.heading) && Math.abs(p.heading) <= 0.71);
    }
    assert.ok(crossed); assert.equal(wave.state, 'pit'); assert.equal(p.x, PIT_PLAYER_X);
    assert.equal(p.speed, 0); assert.equal(wave.cameraSide, PIT_CAMERA_SIDE);
    const projection = new TrackProjection(new TrackRoute()); projection.configure(p.progress, 844, 416, wave.cameraSide);
    projection.project(p.progress, p.x - 225);
    assert.ok(projection.x > 40 && projection.x < 410);
  }
});
test('exit freezes the wave clock and returns to a safe main-road position before driving resumes', () => {
  const wave = new WaveSystem(), p = new DriftPhysics(), combat = new CombatSystem(silent);
  wave.state = 'pit'; wave.cameraSide = PIT_CAMERA_SIDE; p.x = PIT_PLAYER_X; p.progress = 500;
  wave.next(combat, p); assert.equal(wave.state, 'exiting'); assert.equal(wave.remaining, 44);
  let lastX = p.x;
  for (let i = 0; i < Math.ceil(PIT_EXIT_SECONDS / FIXED_DT); i++) {
    wave.step(p, combat, FIXED_DT); assert.ok(p.x <= lastX); lastX = p.x;
    assert.equal(wave.remaining, 44); assert.equal(combat.enemies.activeCount, 0);
  }
  assert.equal(wave.state, 'combat'); assert.equal(p.x, PIT_PLAYER_X);
  assert.ok(p.progress - wave.pitProgress > PIT_WALL_END, 'manual driving resumes beyond the divider'); assert.equal(wave.cameraSide, 0);
  assert.ok(p.speed > 200);
  p.step({ steer: 0, throttle: true, brake: false, drift: false, boost: false }, FIXED_DT);
  assert.equal(p.hitWall, 0);
});


test('the original third lane becomes the pit lane without adding road width', () => {
  assert.ok(pitLaneCenter(0) + PIT_LANE_HALF <= MAIN_ROAD_HALF);
  assert.ok(pitLaneCenter(0) - PIT_LANE_HALF > PIT_DIVIDER_SIDE + 5);
  assert.equal(pitDividerVisible(PIT_WALL_START - 1), false);
  assert.equal(pitDividerVisible(PIT_WALL_START), true);
  assert.equal(pitDividerVisible(PIT_WALL_END), true);
  assert.equal(pitDividerVisible(PIT_WALL_END + 1), false);
  assert.equal(pitDividerVisible(NaN), false);
  assert.equal(pitLaneCenter(420), 104);
});

test('a visible station never relocates when approach speed changes, including entry from the left lane', () => {
  for (const [initialSpeed, approachSpeed] of [[340, 65], [65, 510], [340, 340]]) {
    for (const x of [108, 225, 342]) {
      const wave = new WaveSystem(), p = new DriftPhysics(), combat = new CombatSystem(silent);
      p.x = x; p.speed = initialSpeed; p.vy = -initialSpeed; wave.remaining = 3;
      wave.step(p, combat, FIXED_DT);
      const station = wave.pitProgress;
      let crossed = false;
      for (let frame = 0; frame < 1800 && wave.state !== 'pit'; frame++) {
        const before = p.progress;
        if (wave.state === 'combat') {
          p.previousProgress = p.progress; p.progress += approachSpeed * FIXED_DT;
          p.speed = approachSpeed; p.vy = -approachSpeed;
        }
        wave.step(p, combat, FIXED_DT);
        assert.equal(wave.pitProgress, station, 'announced station must stay fixed through handover and parking');
        assert.ok(p.progress >= before && p.progress <= station, 'car advances to the fixed station without reversing or overshooting');
        assert.ok(p.progress - before <= 12, 'approach must not teleport the car to compensate');
        if (pitDividerVisible(p.progress - station)) {
          crossed = true; assert.ok(p.x - 225 - 18 > PIT_DIVIDER_SIDE + 5);
        }
      }
      assert.ok(crossed); assert.equal(wave.state, 'pit'); assert.equal(wave.remaining, 0);
      assert.equal(p.x, PIT_PLAYER_X); assert.equal(p.progress, station);
    }
  }
});
