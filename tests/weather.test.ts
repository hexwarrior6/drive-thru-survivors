import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSIC_PALETTE } from '../src/data/cityProfiles';
import { ROUND_WEATHER, applyWeather, isRainyRound, weatherOf } from '../src/systems/weather';

const luma = (c: number): number => ((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114;

test('four escalating rounds, clamped at both ends', () => {
  assert.deepEqual(ROUND_WEATHER.map(w => w.name), ['晴朗', '多云', '黄昏', '雨夜']);
  assert.equal(weatherOf(1).id, 'sunny');
  assert.equal(weatherOf(4).id, 'rain');
  assert.equal(weatherOf(0).id, 'sunny');
  assert.equal(weatherOf(9).id, 'rain');
  assert.equal(isRainyRound(4), true);
  assert.equal(isRainyRound(3), false);
});

test('each round yields a distinct palette; transforms are deterministic', () => {
  const rounds = [1, 2, 3, 4].map(r => applyWeather(CLASSIC_PALETTE, r));
  for (let i = 0; i < rounds.length; i++) {
    assert.deepEqual(rounds[i], applyWeather(CLASSIC_PALETTE, i + 1), 'repeat call must match');
    for (let j = i + 1; j < rounds.length; j++) {
      assert.notDeepEqual(rounds[i], rounds[j], `round ${i + 1} and ${j + 1} must differ`);
    }
  }
});

test('atmosphere darkens as the run escalates', () => {
  const sunny = applyWeather(CLASSIC_PALETTE, 1);
  const cloudy = applyWeather(CLASSIC_PALETTE, 2);
  const dusk = applyWeather(CLASSIC_PALETTE, 3);
  const rain = applyWeather(CLASSIC_PALETTE, 4);
  assert.ok(luma(rain.grass) < luma(sunny.grass) * 0.8, 'rain grass must sink well below sunny');
  assert.ok(luma(dusk.grass) < luma(sunny.grass), 'dusk dims the ground');
  assert.ok(luma(cloudy.grass) < luma(sunny.grass), 'cloudy dims the ground');
  assert.ok(luma(rain.horizonBand) < luma(sunny.horizonBand) * 0.7, 'rain sky goes deep');
});

test('rain keeps the lane reflective and never buries the brand curb', () => {
  const sunny = applyWeather(CLASSIC_PALETTE, 1);
  const rain = applyWeather(CLASSIC_PALETTE, 4);
  assert.ok(luma(rain.lane) > luma(sunny.lane), 'wet lane lines brighten');
  assert.ok(luma(rain.lane) > luma(rain.road) * 1.6, 'lane keeps dominating wet asphalt');
  // Brand red survives the night: still red; the red/cream alternation stays
  // high-contrast (either order — what matters for readability is the gap).
  const curb = rain.curb;
  const r = (curb >> 16) & 255, g = (curb >> 8) & 255, b = curb & 255;
  assert.ok(r > g * 1.5 && r > b * 1.5, 'rain curb stays red');
  assert.ok(Math.abs(luma(rain.curb) - luma(rain.curbAlt)) > 25, 'curb alternation stays readable');
});

test('sunny round stays close to the city base palette', () => {
  const sunny = applyWeather(CLASSIC_PALETTE, 1);
  for (const key of ['grass', 'road', 'lane', 'horizonBand'] as const) {
    assert.ok(Math.abs(luma(sunny[key]) - luma(CLASSIC_PALETTE[key])) < 18, `${key} barely shifts in round one`);
  }
});
