import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTING_CITIES } from '../src/data/cities';
import { LANDMARK_KEYS, SCENERY_KEYS } from '../src/data/createWorldTextures';
import {
  ARCHETYPES, LANDMARKS, archetypeOf, hashCity, mulberry32, presetCities, resolveTrackPlan,
  type CityArchetypeId, type TrackPalette,
} from '../src/data/cityProfiles';

const PALETTE_KEYS: (keyof TrackPalette)[] = ['grass', 'shoulder', 'road', 'roadAlt', 'lane', 'border', 'curb', 'curbAlt', 'horizonBand', 'horizonHill', 'horizonHillAlt'];
const luma = (c: number): number => ((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114;

test('all 40 preset cities have an explicit archetype', () => {
  assert.equal(STARTING_CITIES.length, 40);
  assert.equal(presetCities().length, 40);
  for (const city of STARTING_CITIES) assert.ok(archetypeOf(city).id !== 'classic', `${city} needs a real archetype`);
});

test('every archetype palette is complete, opaque and mutually distinct on the ground', () => {
  const ids = Object.keys(ARCHETYPES) as CityArchetypeId[];
  assert.equal(ids.length, 7);
  const grasses = new Set<number>();
  for (const id of ids) {
    const p = ARCHETYPES[id].palette;
    for (const k of PALETTE_KEYS) {
      assert.ok(Number.isInteger(p[k]) && p[k] > 0 && p[k] <= 0xffffff, `${id}.${k} must be a packed RGB value`);
    }
    assert.ok(ARCHETYPES[id].props.length >= 2, `${id} needs a prop mix`);
    grasses.add(p.grass);
  }
  assert.equal(grasses.size, ids.length, 'archetype grass colors must differ');
});

test('plans are deterministic; unknown cities hash-pick a stable rotation archetype', () => {
  for (const city of ['上海', '克拉玛依', ' '] as const) {
    const a = resolveTrackPlan(city), b = resolveTrackPlan(city);
    assert.deepEqual(a, b, `${city} plan must be stable`);
    for (const k of PALETTE_KEYS) assert.ok(Number.isInteger(a.palette[k]));
  }
  const unknown = resolveTrackPlan('某个不存在的城市');
  assert.notEqual(unknown.palette.grass, ARCHETYPES.classic.palette.grass, 'unknown cities never get the classic backdrop');
  const empty = resolveTrackPlan('');
  assert.deepEqual(empty.palette, ARCHETYPES.classic.palette);
  assert.equal(empty.landmark, undefined);
  assert.notEqual(resolveTrackPlan('上海').seed, resolveTrackPlan('北京').seed, 'cities need distinct jitter seeds');
});

test('12 landmark cities map to baked landmark textures; prop mixes reference baked scenery', () => {
  const landmarkCities = Object.keys(LANDMARKS);
  assert.equal(landmarkCities.length, 12);
  assert.ok(landmarkCities.every(city => STARTING_CITIES.includes(city as never)));
  const baked = new Set(LANDMARK_KEYS);
  for (const [city, def] of Object.entries(LANDMARKS)) {
    assert.ok(baked.has(def.key), `${def.key} must be baked by createWorldTextures`);
    assert.equal(resolveTrackPlan(city).landmark, def.key);
  }
  const scenery = new Set(SCENERY_KEYS);
  scenery.add('tree'); scenery.add('building'); scenery.add('cafe');
  for (const id of Object.keys(ARCHETYPES) as CityArchetypeId[]) {
    for (const prop of ARCHETYPES[id].props) assert.ok(scenery.has(prop), `${id} references unbaked prop ${prop}`);
  }
});

test('hashCity and mulberry32 are deterministic and seed-sensitive', () => {
  assert.equal(hashCity('上海'), hashCity('上海'));
  assert.notEqual(hashCity('上海'), hashCity('上海 '));
  assert.ok(hashCity('上海') > 0);
  const a = mulberry32(1234), b = mulberry32(1234), c = mulberry32(5678);
  const seqA = Array.from({ length: 8 }, () => a());
  const seqB = Array.from({ length: 8 }, () => b());
  const seqC = Array.from({ length: 8 }, () => c());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  for (const v of [...seqA, ...seqC]) assert.ok(v >= 0 && v < 1);
  // Ground readability: every base palette keeps its lane brighter than its asphalt.
  for (const id of Object.keys(ARCHETYPES) as CityArchetypeId[]) {
    assert.ok(luma(ARCHETYPES[id].palette.lane) > luma(ARCHETYPES[id].palette.road), `${id} lane must outshine asphalt`);
  }
});
