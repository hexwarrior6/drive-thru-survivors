import test from 'node:test';
import assert from 'node:assert/strict';
import { demoSnapshot } from '../src/data/snapshot';
import { ShopSystem, MODULE_SLOTS, SLOT_FRONT, SLOT_REAR } from '../src/systems/ShopSystem';
import { weaponById, MODULES } from '../src/combat/weaponCatalog';
import { migrateV5Slots } from '../src/systems/SaveSystem';

function setup() {
  const snapshot = demoSnapshot();
  snapshot.stores = [snapshot.stores[0]!]; // 全品门店：映射断言不受洗牌门店影响
  const shop = new ShopSystem(snapshot, () => .5);
  shop.open(1);
  return shop;
}
function product(name: string) {
  const template = demoSnapshot().stores[0].products[0]!;
  return { ...template, id: name, name };
}
const wallet = (money: number) => ({ money, health: 100 });

test('identity mapping: same-weaponId dishes feed each other, others replace', () => {
  const shop = setup();
  shop.offers = [product('巨无霸'), product('巨无霸（大份）'), product('麦香鱼')];
  const w = wallet(999);
  assert.equal(shop.buy(0, w), 'bought');
  assert.equal(shop.slots[SLOT_FRONT]!.weaponId, 'W01');
  // 大小份/别名归入同一身份：喂养同一件武器而不是占第二个槽。
  assert.equal(shop.buy(1, w), 'bought');
  assert.equal(shop.slots[SLOT_FRONT]!.level, 2);
  // 麦香鱼 → 鱼跃跳弹炮（W04 已实装）：另一件前武器 → 走替换流程。
  assert.equal(shop.buy(2, w), 'replace');
});

test('products route to their mounts; the scatter gun is a real replaceable occupant', () => {
  const shop = setup();
  shop.offers = [product('巨无霸'), product('板烧鸡腿堡'), product('柠檬红茶')];
  const w = wallet(999);
  assert.equal(shop.weaponFor(shop.offers[0]), 'W01');
  assert.equal(shop.weaponFor(shop.offers[1]), 'W07');
  assert.equal(shop.weaponFor(shop.offers[2]), 'W24');
  assert.equal(shop.slots[SLOT_REAR]?.weaponId, 'scatter', 'run starts with the scatter');
  assert.equal(shop.buy(0, w), 'bought');
  assert.equal(shop.slots[SLOT_FRONT]!.weaponId, 'W01');
  assert.equal(shop.buy(1, w), 'replace', 'rear slot holds the scatter — displacement is explicit');
  assert.equal(shop.buy(1, w, SLOT_REAR), 'bought');
  assert.equal(shop.slots[SLOT_REAR]!.weaponId, 'W07');
  assert.ok(!shop.slots.some(x => x?.weaponId === 'scatter'), 'scatter does not linger after the swap');
});

test('Lv.3 demands an explicit branch choice; the chosen branch is saved on the weapon', () => {
  const shop = setup();
  shop.offers = [product('巨无霸')];
  const w = wallet(9999);
  for (let i = 0; i < 2; i++) { assert.equal(shop.buy(0, w), 'bought'); shop.sold.clear(); }
  assert.equal(shop.slots[SLOT_FRONT]!.level, 2);
  assert.equal(shop.buy(0, w), 'branch', 'Lv.3 without a branch refuses to settle');
  assert.equal(shop.buy(0, w, -1, 'a'), 'bought');
  assert.equal(shop.slots[SLOT_FRONT]!.branch, 'a');
  assert.equal(weaponById('W01').branches![0].name, '压路重炮');
});

test('replacement credits half of the invested coins and never pays out cash', () => {
  const shop = setup();
  shop.offers = [product('巨无霸'), product('扭扭薯条')];
  const w = wallet(999);
  assert.equal(shop.buy(0, w), 'bought');
  const invested = shop.slots[SLOT_FRONT]!.invested;
  assert.ok(invested > 0);
  const balanceBefore = w.money;
  assert.equal(shop.buy(1, w), 'replace');
  const gross = shop.price(shop.offers[1], 0);
  const credit = shop.replacementCredit(SLOT_FRONT);
  assert.equal(credit, Math.floor(invested * 0.5));
  assert.equal(shop.buy(1, w, SLOT_FRONT), 'bought');
  assert.equal(w.money, balanceBefore - (gross - credit), 'credit discounts the new install');
  assert.equal(shop.slots[SLOT_FRONT]!.invested, gross - credit, 'invested tracks what was actually paid');
  assert.ok(w.money < balanceBefore, 'the swap still costs money — credit is not cashback');
});

test('free front-gun service installs once at the first stop only', () => {
  const shop = setup();
  assert.equal(shop.freeFrontAvailable(), true);
  assert.equal(shop.installFrontService(), true);
  assert.equal(shop.slots[SLOT_FRONT]!.weaponId, 'service-front');
  assert.equal(shop.slots[SLOT_FRONT]!.invested, 0, 'the service is free and grants no credit');
  assert.equal(shop.freeFrontAvailable(), false);
  const later = setup();
  later.open(2);
  assert.equal(later.freeFrontAvailable(), false, 'only the first stop offers the install');
});

test('vehicle modules buy into their own slots, one each, priced as services', () => {
  const shop = setup();
  const w = wallet(999);
  for (const mod of MODULES) assert.ok(shop.modulePrice(mod.id) > 0, `${mod.id} needs a price`);
  assert.equal(shop.buyModule('M-drift', w), true);
  assert.equal(shop.buyModule('M-drift', w), false, 'same module never stacks');
  assert.equal(shop.buyModule('M-bumper', w), true);
  assert.equal(shop.buyModule('M-pump', w), true);
  assert.equal(shop.buyModule('M-drift', w), false, 'module slots are full anyway');
  assert.deepEqual(shop.slots[MODULE_SLOTS[0]]!.weaponId, 'M-drift');
});

test('reroll charges coins, swaps in unpurchased dishes and clears replacement state', () => {
  const shop = setup();
  const [burger, lemon, fries] = ['巨无霸', '柠檬红茶', '中薯条'].map(name => shop.store.products.find(p => p.name === name)!);
  shop.offers = [burger!, lemon!, fries!];
  const w = wallet(999);
  assert.equal(shop.buy(0, w), 'bought');
  assert.ok(shop.sold.has(0));
  shop.pending = 1; shop.selected = 2; shop.pendingBranch = 'a';
  assert.equal(shop.canReroll(), true);
  const beforeRoll = w.money;
  assert.equal(shop.rerollPrice(), 3);
  assert.equal(shop.reroll(w), 'rolled');
  assert.equal(w.money, beforeRoll - 3, 'reroll charges the wave-scaled price');
  assert.equal(shop.rerollPrice(), 5, 'the next reroll at this stop costs more');
  assert.equal(shop.offers.length, 3);
  assert.equal(shop.sold.size, 0);
  assert.equal(shop.pending, -1);
  assert.equal(shop.selected, -1);
  assert.equal(shop.pendingBranch, undefined);
  assert.ok(!shop.offers.some(p => p.id === burger!.id), 'bought dish is excluded from reroll');
  assert.ok(shop.offers.every(p => shop.store.products.includes(p)));
  assert.ok(shop.offers.some(p => p.id !== lemon!.id && p.id !== fries!.id), 'reroll surfaces at least one new dish');
});

test('reroll refuses an empty wallet without changing the menu', () => {
  const shop = setup();
  const before = shop.offers.map(p => p.id);
  const broke = wallet(2);
  assert.equal(shop.rerollPrice(), 3);
  assert.equal(shop.reroll(broke), 'unaffordable');
  assert.equal(broke.money, 2);
  assert.deepEqual(shop.offers.map(p => p.id), before);
  assert.equal(shop.rerollPrice(), 3, 'a rejected reroll does not raise the price');
});

test('reroll price rises with the wave and repeated rolls', () => {
  const shop = setup();
  shop.open(10);
  assert.equal(shop.rerollPrice(), 7);
  assert.equal(shop.reroll(wallet(999)), 'rolled');
  assert.equal(shop.rerollPrice(), 9);
});

test('reroll stops when every other priced dish is already on the table', () => {
  const shop = setup();
  shop.store = { ...shop.store, products: shop.offers.slice(0, 3) };
  assert.equal(shop.canReroll(), false);
  assert.equal(shop.reroll(wallet(999)), 'exhausted');
  assert.equal(shop.offers.length, 3);
});

test('upgrade service backs up growth when no material dish is in this store', () => {
  const shop = setup();
  const lemon = shop.store.products.find(p => p.name === '柠檬红茶')!;
  // 本店完整菜单只有柠檬红茶：巨无霸既不在三张卡里，也不在重投后备池里。
  shop.store = { ...shop.store, products: [lemon] };
  shop.offers = [lemon];
  const w = wallet(999);
  shop.slots[SLOT_FRONT] = { weaponId: 'W01', name: '巨无霸', level: 1, cooldown: 0, invested: 40, art: 'food-burger-double' };
  assert.equal(shop.lacksMaterial(shop.slots[SLOT_FRONT]!), true);
  const cost = shop.upgradeServiceCost(SLOT_FRONT);
  assert.equal(cost, Math.ceil(14 * 1.8), 'service price = base × current-level multiplier');
  assert.equal(shop.upgradeService(SLOT_FRONT, w), 'bought');
  assert.equal(shop.slots[SLOT_FRONT]!.level, 2);
  assert.equal(shop.slots[SLOT_FRONT]!.invested, 40 + cost);
  assert.equal(w.money, 999 - cost);
  // Lv.3 同样要求显式分支。
  shop.upgradeService(SLOT_FRONT, w);
  assert.equal(shop.upgradeService(SLOT_FRONT, w), 'branch');
  assert.equal(shop.upgradeService(SLOT_FRONT, w, 'b'), 'bought');
  assert.equal(shop.slots[SLOT_FRONT]!.branch, 'b');
});

test('upgrade fallback reads the whole store menu, not just the three cards', () => {
  const shop = setup();
  const lemon = shop.store.products.find(p => p.name === '柠檬红茶')!;
  shop.offers = [lemon]; // 巨无霸被重投换走，但本店仍备有这件升级材料。
  shop.slots[SLOT_FRONT] = { weaponId: 'W01', name: '巨无霸', level: 1, cooldown: 0, invested: 40, art: 'food-burger-double' };
  assert.equal(shop.lacksMaterial(shop.slots[SLOT_FRONT]!), false);
  shop.store = { ...shop.store, products: [lemon] };
  assert.equal(shop.lacksMaterial(shop.slots[SLOT_FRONT]!), true);
});

test('featured cards are all implemented exclusive weapons; generics only cover unknowns', () => {
  const shop = setup();
  const kinds = shop.offers.slice(0, 3).map(p => shop.weaponFor(p));
  assert.ok(kinds.every(k => /^W\d+$/.test(k)), `featured cards must be catalog weapons (got ${kinds.join(',')})`);
});

test('repair pricing is unchanged and refuses full health or broke wallets', () => {
  const shop = setup();
  const w = wallet(20);
  w.health = 85;
  assert.equal(shop.repair(w), true);
  assert.equal(w.health, 100);
  assert.equal(w.money, 10);
  assert.equal(shop.repair(w), false);
  w.health = 20; w.money = 9;
  assert.equal(shop.repair(w), false);
});

test('v5 saves migrate by dish name without inventing branches or credit', () => {
  const slots = migrateV5Slots({
    slots: [
      { name: '巨无霸', type: 'burger', level: 3 },
      { name: '麦乐鸡', type: 'mine', level: 2 },
      { name: '甜筒', type: 'shield', level: 1 },
      null,
      null,
    ],
  });
  assert.equal(slots![0]!.weaponId, 'W01', '巨无霸 derives its real prototype');
  assert.equal(slots![0]!.level, 3);
  assert.equal(slots![0]!.branch, undefined, 'migration never picks a branch for the player');
  assert.equal(slots![0]!.invested, 0, 'unknown investment grants no replacement credit');
  assert.equal(slots![1]!.weaponId, 'W17', '旧后槽武器按名字还原成已实装的专属武器');
  // 旧辅助位被动随模块层退役；后槽 starter 还原为初始散弹。
  assert.equal(slots![2], null);
  const scatterRear = migrateV5Slots({ slots: [null, { name: '后置散弹', type: 'starter', level: 1 }, null, null, null] });
  assert.equal(scatterRear![1]!.weaponId, 'scatter');
});
