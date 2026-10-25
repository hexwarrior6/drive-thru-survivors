import test from 'node:test';
import assert from 'node:assert/strict';
import { FOOD_VARIANTS, FOOD_TEXTURE_KEYS, BULLET_SCALE, variantFor, variantKeyFor, hashName, type ArtGroup, type FoodVariant } from '../src/data/foodArt';

const GROUPS: ArtGroup[] = ['starter', 'burger', 'fries', 'cola', 'ice', 'mine', 'flame', 'coffee', 'heal', 'shield', 'missile', 'wingman'];

test('every art group ships at least one variant with unique keys', () => {
  for (const type of GROUPS) {
    const list = FOOD_VARIANTS[type];
    assert.ok(Array.isArray(list) && list.length >= 1, `${type} needs variants`);
    for (const v of list) assert.ok(v.key.startsWith('food-'), `${v.key} should use the food- prefix`);
  }
  assert.equal(new Set(FOOD_TEXTURE_KEYS).size, FOOD_TEXTURE_KEYS.length, 'variant keys must be unique');
  const byKey = new Map<string, FoodVariant>();
  for (const list of Object.values(FOOD_VARIANTS)) for (const v of list) byKey.set(v.key, v);
  assert.equal(byKey.size, FOOD_TEXTURE_KEYS.length);
});

test('keyword mapping: real menu names land on the intended variant', () => {
  assert.equal(variantKeyFor('burger', '巨无霸'), 'food-burger-double');
  assert.equal(variantKeyFor('burger', '双层皇堡'), 'food-burger-double');
  assert.equal(variantKeyFor('burger', '麦香鱼'), 'food-burger-fish');
  assert.equal(variantKeyFor('burger', '香辣鸡腿堡'), 'food-burger-spicy');
  assert.equal(variantKeyFor('flame', '板烧鸡腿堡'), 'food-flame-grill');
  assert.equal(variantKeyFor('fries', '扭扭薯条'), 'food-fries-curly');
  assert.equal(variantKeyFor('fries', '薯饼'), 'food-fries-hash');
  assert.equal(variantKeyFor('fries', '中薯条'), 'food-fries-box');
  assert.equal(variantKeyFor('cola', '可口可乐'), 'food-cola-classic');
  assert.equal(variantKeyFor('cola', '雪碧'), 'food-cola-sprite');
  assert.equal(variantKeyFor('ice', '柠檬红茶'), 'food-ice-tea');
  assert.equal(variantKeyFor('mine', '麦乐鸡'), 'food-mine-box');
  assert.equal(variantKeyFor('coffee', '冰拿铁'), 'food-coffee-iced');
  assert.equal(variantKeyFor('heal', '苹果派'), 'food-heal-pie');
  assert.equal(variantKeyFor('heal', '草莓圣代'), 'food-heal-sundae');
  assert.equal(variantKeyFor('shield', '巧克力甜筒'), 'food-shield-choco');
});

test('hash fallback: deterministic, always inside the family, and spreads across names', () => {
  for (const name of ['神秘餐品甲', '神秘餐品甲 ', '店长推荐']) {
    assert.equal(variantKeyFor('burger', name), variantKeyFor('burger', name), 'same name must be stable');
  }
  const burgerKeys = new Set(FOOD_VARIANTS.burger.map(v => v.key));
  const picks = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const key = variantKeyFor('burger', `无关键词名称样本${i}`);
    assert.ok(burgerKeys.has(key), `fallback must stay in family: ${key}`);
    picks.add(key);
  }
  assert.ok(picks.size >= 2, 'fallback hash should spread across variants');
  // Trim only normalizes whitespace — no keyword interplay for keyword-free names.
  assert.equal(variantKeyFor('cola', '自研汽水'), variantKeyFor('cola', '自研汽水'));
});

test('variant lookups and bullet scales reference registered keys', () => {
  const all = new Set(FOOD_TEXTURE_KEYS);
  assert.equal(variantFor('missile', '麦辣鸡腿堡').key, 'food-missile-burger');
  assert.ok(variantFor('missile', '麦辣鸡腿堡').label.length > 0);
  for (const key of Object.keys(BULLET_SCALE)) assert.ok(all.has(key), `BULLET_SCALE references unknown key ${key}`);
  assert.ok(BULLET_SCALE['food-burger-double'] < 1, 'oversized shop art must scale down as bullets');
  assert.equal(hashName('可口可乐'), hashName('可口可乐'));
  assert.notEqual(hashName('可口可乐'), hashName('雪碧'));
});
