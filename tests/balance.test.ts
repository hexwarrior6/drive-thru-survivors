import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WAVES_PER_RUN, WAVES_PER_ROUND, ROUNDS_PER_RUN, MAX_WEAPON_LEVEL, roundOf, isBossWave, bossTierOf, bossName,
  waveDuration, enemyHpScale, contactDamage, hazardInterval, pursuitInterval, pursuitPack,
  bossHpScale, bossTelegraph, bossSlamSpeed, bossThrowInterval, bossCones, bossReward,
  pitArrivalBonus, repairCost, upgradeCostMultiplier, rerollCost,
} from '../src/systems/balance';

test('run structure: four rounds of five waves, boss closing each round', () => {
  assert.equal(WAVES_PER_ROUND * ROUNDS_PER_RUN, WAVES_PER_RUN);
  assert.equal(WAVES_PER_RUN, 20);
  assert.equal(MAX_WEAPON_LEVEL, 5);
  const bosses = Array.from({ length: WAVES_PER_RUN }, (_, i) => i + 1).filter(isBossWave);
  assert.deepEqual(bosses, [5, 10, 15, 20]);
  for (const wave of [1, 4, 5, 6, 9, 10, 15, 16, 20]) assert.equal(isBossWave(wave), wave % 5 === 0);
  assert.equal(roundOf(1), 1); assert.equal(roundOf(5), 1); assert.equal(roundOf(6), 2); assert.equal(roundOf(20), 4);
  assert.equal(bossTierOf(10), 2);
  assert.equal(bossName(1), '霸王皮卡'); assert.equal(bossName(4), '终极麦霸王');
});

test('difficulty curves rise monotonically and stay within design bounds', () => {
  assert.equal(waveDuration(1), 42); assert.equal(waveDuration(5), 50); assert.equal(waveDuration(20), 50);
  for (let w = 2; w <= WAVES_PER_RUN; w++) {
    assert.ok(enemyHpScale(w) > enemyHpScale(w - 1), 'enemy hp must keep rising');
    assert.ok(contactDamage(2, w) >= contactDamage(2, w - 1), 'contact damage must never fall');
    assert.ok(hazardInterval(w) <= hazardInterval(w - 1), 'hazard cadence must keep tightening');
    assert.ok(pursuitInterval(w) <= pursuitInterval(w - 1), 'pursuit cadence must keep tightening');
    assert.ok(pursuitPack(w) >= pursuitPack(w - 1), 'pursuit packs never shrink');
  }
  assert.ok(Math.abs(enemyHpScale(20) - 2.615) < 1e-9);
  assert.deepEqual([1, 9, 20].map(w => contactDamage(0, w)), [5, 7, 9]);
  assert.deepEqual([1, 9, 20].map(w => contactDamage(3, w)), [14, 19, 26]);
  assert.ok(Math.abs(hazardInterval(1) - 1.295) < 1e-9); assert.equal(hazardInterval(20), 0.68);
  assert.equal(pursuitPack(1), 2); assert.equal(pursuitPack(4), 2); assert.equal(pursuitPack(5), 3); assert.equal(pursuitPack(10), 4); assert.equal(pursuitPack(20), 4);
});

test('boss tiers escalate on every axis the player feels', () => {
  for (let t = 2; t <= 4; t++) {
    assert.ok(bossHpScale(t) > bossHpScale(t - 1));
    assert.ok(bossTelegraph(t) < bossTelegraph(t - 1));
    assert.ok(bossSlamSpeed(t) > bossSlamSpeed(t - 1));
    assert.ok(bossThrowInterval(t) < bossThrowInterval(t - 1));
    assert.ok(bossReward(t) > bossReward(t - 1));
  }
  assert.equal(bossHpScale(1), 1); assert.equal(bossHpScale(4), 5.0);
  assert.deepEqual([1, 2, 3, 4].map(bossCones), [1, 1, 2, 2]);
  assert.deepEqual([1, 2, 3, 4].map(bossReward), [70, 100, 130, 160]);
});

test('economy curves: floor income, rising repair pressure, upgrade premium', () => {
  assert.equal(pitArrivalBonus(1), 9); assert.equal(pitArrivalBonus(20), 28);
  assert.equal(repairCost(1), 10); assert.equal(repairCost(20), 67);
  assert.ok(repairCost(20) < 7.5 * repairCost(1), 'repair must pressure, not starve');
  assert.deepEqual([0, 1, 2, 3, 4].map(upgradeCostMultiplier), [1, 1.8, 2.8, 4.2, 6]);
  assert.equal(upgradeCostMultiplier(9), 6, 'levels past the table clamp to the top multiplier');
  const totalForMax = [0, 1, 2, 3, 4].reduce((sum, l) => sum + upgradeCostMultiplier(l), 0);
  assert.ok(totalForMax > 14.5 && totalForMax < 17, `a Lv5 weapon costs ~15.8x base (got ${totalForMax})`);
});

test('reroll price scales with the wave and repeated rolls at one stop', () => {
  assert.deepEqual([0, 1, 2, 3].map(used => rerollCost(1, used)), [3, 5, 7, 9]);
  assert.deepEqual([0, 1, 2, 3].map(used => rerollCost(10, used)), [7, 9, 11, 13]);
  assert.deepEqual([0, 1, 2, 3].map(used => rerollCost(20, used)), [12, 14, 16, 18]);
  for (let wave = 2; wave <= WAVES_PER_RUN; wave++) {
    assert.ok(rerollCost(wave, 0) >= rerollCost(wave - 1, 0), 'first reroll never gets cheaper as waves rise');
  }
  assert.ok(rerollCost(20, 0) <= pitArrivalBonus(20), 'one late reroll stays inside the stop bonus');
});
