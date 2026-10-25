/**
 * 餐品美术变体库：让「名称不同」的商品长得不同。
 * 每个武器家族一组变体（双层堡/辣堡/鱼堡、长薯/扭扭薯/薯饼、可乐/雪碧/芬达…），
 * 购买时由商品名确定性解析：先关键词匹配，未命中回退名称哈希——离线示例与
 * 线上真实菜单（任意名字）都能得到稳定且分散的外观。
 * 绘制规格与数据同址（draw(g)），Boot 阶段逐条烘焙成贴图；本文件仅类型引用
 * Phaser，node 测试可直接导入做映射断言。
 */
import type Phaser from 'phaser';
import type { WeaponType } from '../combat/weaponMapper';
import { C } from './colors';

export interface FoodVariant {
  /** 烘焙贴图 key（'food-' 前缀）。 */
  key: string;
  /** 中文小名，用于排查与文案。 */
  label: string;
  /** 商品名关键词（可选）；先于哈希兜底逐条测试。 */
  match?: RegExp;
  /** 辅助光环/喷泉/光束用色（可乐喷泉、回复光环、护盾甜筒等）。 */
  tint?: number;
  /** 弹幕渲染缩放（贴图按商店清晰度约 2 倍绘制）；默认 1。 */
  bulletScale?: number;
  w: number;
  h: number;
  draw(g: Phaser.GameObjects.Graphics): void;
}

/** 杯型饮料的公共骨架：梯形杯 + 杯口条 + 吸管，杯身色与腰带色按变体定。 */
function cup(g: Phaser.GameObjects.Graphics, body: number, band: number, accent: number): void {
  g.fillStyle(body); g.fillPoints([{ x: 5, y: 8 }, { x: 17, y: 8 }, { x: 15, y: 26 }, { x: 7, y: 26 }], true);
  g.lineStyle(1.5, C.border, 0.5); g.strokePoints([{ x: 5, y: 8 }, { x: 17, y: 8 }, { x: 15, y: 26 }, { x: 7, y: 26 }, { x: 5, y: 8 }], true);
  g.fillStyle(band); g.fillRect(5.5, 13, 11, 4);
  g.fillStyle(accent); g.fillRect(7, 19, 7, 2);
  g.fillStyle(0x754329); g.fillRect(4, 5, 14, 4);
  g.fillStyle(C.panel); g.fillRect(13, 0, 3, 8);
}

const BURGER_BASE = (g: Phaser.GameObjects.Graphics, bun: number, bottom: number) => {
  g.fillStyle(0xad713a); g.fillRoundedRect(3, 12, 24, 5, 2);
  g.fillStyle(C.gold); g.fillRect(3, 10, 24, 3);
  g.fillStyle(bottom); g.fillRoundedRect(3, 17, 24, 4, 2);
  g.fillStyle(bun); g.fillEllipse(15, 5, 28, 10);
};

/**
 * 变体贴图 → dataURL 快照（Boot 后由 createFoodTextures 填充）。DOM 商店用它
 * 渲染与游戏内弹幕完全同源的图；未填充（测试环境）时 ShopView 回落到内置 SVG。
 */
export const FOOD_DATA_URLS: Record<string, string> = {};

export const FOOD_VARIANTS: Record<WeaponType, FoodVariant[]> = {
  starter: [{
    key: 'food-starter', label: '后置散弹', w: 12, h: 24, draw(g) {
      g.fillStyle(C.orange); g.fillRoundedRect(0, 0, 10, 22, 5);
      g.fillStyle(C.panel); g.fillRoundedRect(3, 3, 4, 13, 2);
    },
  }],
  burger: [
    {
      key: 'food-burger-double', label: '双层巨堡', match: /巨无霸|双层|大麦克|皇室/, bulletScale: .55, w: 30, h: 30, draw(g) {
        g.fillStyle(0xad713a); g.fillRoundedRect(3, 10, 24, 5, 2); g.fillRoundedRect(3, 19, 24, 5, 2);
        g.fillStyle(0xf0d49a); g.fillRect(3, 16, 24, 3);
        g.fillStyle(C.gold); g.fillRect(3, 24, 24, 2);
        g.fillStyle(0xedb355); g.fillEllipse(15, 5, 28, 10);
        g.fillStyle(0xf7e2ae); g.fillRect(9, 2, 2, 2); g.fillRect(15, 4, 2, 2); g.fillRect(21, 2, 2, 2);
        g.fillStyle(0xdba24b); g.fillRoundedRect(3, 26, 24, 4, 2);
      },
    },
    {
      key: 'food-burger-spicy', label: '麦辣红堡', match: /辣|板烧|烧烤/, tint: 0xc23a2e, bulletScale: .55, w: 30, h: 24, draw(g) {
        BURGER_BASE(g, 0xd98a4a, 0xdba24b);
        g.fillStyle(0xc23a2e); g.fillRect(2, 9, 26, 4);
        g.fillRect(5, 12, 3, 4); g.fillRect(14, 12, 3, 5); g.fillRect(22, 12, 3, 3);
        g.fillStyle(0xe75239); g.fillCircle(9, 4, 1.3); g.fillCircle(20, 5, 1.3);
      },
    },
    {
      key: 'food-burger-fish', label: '鳕鱼堡', match: /鱼|鳕/, tint: 0x80c6c3, bulletScale: .55, w: 30, h: 24, draw(g) {
        g.fillStyle(0x80c6c3); g.fillRect(2, 9, 26, 3);
        g.fillStyle(0xf2e6c8); g.fillRoundedRect(3, 13, 24, 6, 3);
        g.lineStyle(1.5, 0xc9b47e); g.strokeRoundedRect(3, 13, 24, 6, 3);
        g.fillStyle(0xe0cd98); g.fillRoundedRect(3, 20, 24, 4, 2);
        g.fillStyle(0xe8d9a8); g.fillEllipse(15, 5, 28, 10);
      },
    },
    {
      key: 'food-burger-classic', label: '芝士堡', tint: 0xedb355, bulletScale: .55, w: 30, h: 24, draw(g) {
        BURGER_BASE(g, 0xedb355, 0xdba24b);
        g.fillStyle(C.leaf); g.fillRect(2, 8, 26, 3);
        g.fillStyle(0xf7e2ae); g.fillRect(9, 2, 2, 2); g.fillRect(20, 3, 2, 2);
      },
    },
  ],
  fries: [
    {
      key: 'food-fries-curly', label: '扭扭薯', match: /扭扭|卷/, bulletScale: .45, tint: 0xf2c14e, w: 26, h: 24, draw(g) {
        g.lineStyle(5, C.gold); g.beginPath(); g.moveTo(3, 20); g.lineTo(9, 8); g.lineTo(14, 18); g.lineTo(20, 6); g.lineTo(23, 12); g.strokePath();
        g.lineStyle(2, 0xf2d488); g.beginPath(); g.moveTo(6, 22); g.lineTo(12, 11); g.lineTo(17, 20); g.strokePath();
        g.fillStyle(0xad3945); g.fillCircle(6, 7, 1.6); g.fillCircle(20, 16, 1.6);
      },
    },
    {
      key: 'food-fries-hash', label: '黄金薯饼', match: /薯饼|薯格|薯片/, bulletScale: .45, tint: 0xd9a24b, w: 26, h: 18, draw(g) {
        g.fillStyle(0xd9a24b); g.fillRoundedRect(2, 3, 22, 12, 6);
        g.lineStyle(1.6, 0xb07f36); g.lineBetween(5, 5, 21, 13); g.lineBetween(5, 13, 21, 5);
        g.strokeRoundedRect(2, 3, 22, 12, 6);
      },
    },
    {
      key: 'food-fries-box', label: '长薯条', match: /薯/, bulletScale: .45, tint: 0xffcf52, w: 26, h: 26, draw(g) {
        g.fillStyle(C.gold); g.fillRect(6, 2, 3, 14); g.fillRect(11, 0, 3, 16); g.fillRect(16, 3, 3, 13);
        g.fillStyle(0xad3945); g.fillPoints([{ x: 4, y: 10 }, { x: 22, y: 10 }, { x: 24, y: 24 }, { x: 2, y: 24 }], true);
        g.fillStyle(C.panel); g.fillRect(4, 14, 20, 3);
      },
    },
  ],
  cola: [
    {
      key: 'food-cola-sprite', label: '雪碧', match: /雪碧/, tint: 0x59b368, w: 22, h: 28, draw(g) {
        cup(g, 0x59b368, 0xfff2cb, 0xdff2c8);
        g.fillStyle(0xffe08a); g.fillCircle(11, 15, 1.8);
      },
    },
    {
      key: 'food-cola-fanta', label: '芬达', match: /芬达|汽水|苏打/, tint: 0xff8c42, w: 22, h: 28, draw(g) {
        cup(g, 0xff8c42, 0xfff2cb, 0xffd9a0);
      },
    },
    {
      key: 'food-cola-classic', label: '可乐', match: /可乐|cola/, tint: 0xad3945, w: 22, h: 28, draw(g) {
        cup(g, 0xad3945, C.panel, 0xfff2cb);
      },
    },
  ],
  ice: [
    {
      key: 'food-ice-tea', label: '柠檬红茶', match: /柠檬|红茶|茶/, tint: 0xd9a441, w: 22, h: 28, draw(g) {
        cup(g, 0xd9a441, 0xfff2cb, 0xf2c14e);
      },
    },
    {
      key: 'food-ice-juice', label: '鲜榨果汁', match: /果汁|橙汁|汁/, tint: 0xffa13f, w: 22, h: 28, draw(g) {
        cup(g, 0xffa13f, 0xfff2cb, 0xffcf52);
      },
    },
    {
      key: 'food-ice-milk', label: '醇香牛奶', match: /牛奶|豆奶|豆浆|奶/, tint: 0xf7f0e2, w: 22, h: 28, draw(g) {
        g.fillStyle(0xf7f0e2); g.fillRect(5, 8, 12, 18);
        g.fillPoints([{ x: 5, y: 8 }, { x: 11, y: 2 }, { x: 17, y: 8 }], true);
        g.lineStyle(1.5, C.border, 0.5); g.strokeRect(5, 8, 12, 18);
        g.fillStyle(C.blue); g.fillRect(5, 14, 12, 3);
      },
    },
  ],
  flame: [
    {
      key: 'food-flame-grill', label: '板烧堡', match: /板烧|烧烤|烟/, tint: 0x6b4a3a, w: 30, h: 24, draw(g) {
        g.fillStyle(0x6b4a3a); g.fillRoundedRect(3, 12, 24, 6, 3);
        g.fillStyle(C.gold); g.fillRect(3, 10, 24, 3);
        g.fillStyle(0xdba24b); g.fillRoundedRect(3, 18, 24, 4, 2);
        g.fillStyle(0x8a5a3a); g.fillEllipse(15, 5, 28, 10);
        g.lineStyle(2, 0x53331f); g.lineBetween(7, 2, 11, 8); g.lineBetween(14, 1, 18, 8); g.lineBetween(21, 2, 24, 7);
      },
    },
    {
      key: 'food-flame-chicken', label: '麦辣鸡腿堡', match: /麦辣|鸡腿|辣/, tint: 0xc23a2e, w: 30, h: 26, draw(g) {
        g.fillStyle(0xffa13f); g.fillTriangle(25, 1, 21, 11, 29, 11);
        g.fillStyle(0xe75239); g.fillTriangle(25, 5, 23, 10, 27, 10);
        BURGER_BASE(g, 0xd98a4a, 0xdba24b);
        g.fillStyle(0xc23a2e); g.fillRect(2, 9, 26, 4); g.fillRect(14, 12, 3, 4);
      },
    },
  ],
  mine: [
    {
      key: 'food-mine-wing', label: '麦辣鸡翅', match: /鸡翅|辣翅|翼/, tint: 0xc23a2e, w: 26, h: 22, draw(g) {
        g.fillStyle(0xd9a24b); g.fillEllipse(9, 13, 17, 11);
        g.fillStyle(0xfff2cb); g.fillCircle(21, 10, 3); g.fillCircle(23, 14, 3);
        g.fillRect(15, 11, 7, 3);
        g.fillStyle(0xc23a2e); g.fillCircle(5, 11, 1.4); g.fillCircle(10, 15, 1.4); g.fillCircle(8, 9, 1.4);
      },
    },
    {
      key: 'food-mine-box', label: '麦乐鸡', match: /鸡块|麦乐鸡/, tint: 0xd9a24b, w: 26, h: 22, draw(g) {
        g.fillStyle(0xd9a24b); g.fillRoundedRect(5, 3, 7, 7, 3); g.fillRoundedRect(12, 1, 7, 8, 3); g.fillRoundedRect(19, 4, 6, 6, 3);
        g.fillStyle(0xad3945); g.fillPoints([{ x: 2, y: 8 }, { x: 24, y: 8 }, { x: 26, y: 21 }, { x: 0, y: 21 }], true);
        g.fillStyle(C.panel); g.fillRect(3, 13, 20, 3);
      },
    },
  ],
  coffee: [
    {
      key: 'food-coffee-iced', label: '冰拿铁', match: /冰|冷/, tint: 0xc9a77c, w: 24, h: 28, draw(g) {
        g.fillStyle(0xdff0f4); g.fillPoints([{ x: 5, y: 7 }, { x: 19, y: 7 }, { x: 17, y: 26 }, { x: 7, y: 26 }], true);
        g.fillStyle(0x6b4a3a); g.fillRect(7, 18, 10, 8);
        g.fillStyle(0xf2e6d0); g.fillRect(6, 11, 11, 7);
        g.fillStyle(0xffffff, 0.85); g.fillRect(8, 9, 4, 4); g.fillRect(13, 13, 4, 4);
        g.fillStyle(0x754329); g.fillRect(4, 4, 16, 4);
        g.fillStyle(0x354e3c); g.fillRect(14, 0, 3, 7);
      },
    },
    {
      key: 'food-coffee-hot', label: '热咖啡', tint: 0x8a5a3b, w: 24, h: 28, draw(g) {
        g.fillStyle(C.panel); g.fillPoints([{ x: 5, y: 7 }, { x: 19, y: 7 }, { x: 17, y: 26 }, { x: 7, y: 26 }], true);
        g.fillStyle(0xad3945); g.fillRect(5, 12, 13, 6);
        g.lineStyle(2, C.gold); g.beginPath(); g.moveTo(9, 17); g.lineTo(9, 14); g.arc(11.5, 14, 2.5, Math.PI, 0); g.lineTo(14, 17); g.strokePath();
        g.fillStyle(0x754329); g.fillRect(4, 4, 16, 4);
      },
    },
  ],
  desperate: [{
    key: 'food-desperate-espresso', label: '双份浓缩', tint: 0x3a2e28, w: 18, h: 20, draw(g) {
      g.fillStyle(0x3a2e28); g.fillPoints([{ x: 3, y: 6 }, { x: 15, y: 6 }, { x: 13, y: 18 }, { x: 5, y: 18 }], true);
      g.fillStyle(0xc9a26b); g.fillRect(3, 5, 12, 3);
      g.fillStyle(0xfff2cb); g.fillRect(1, 18, 16, 2);
      g.fillStyle(0x754329, 0.8); g.fillCircle(9, 1, 1.2);
    },
  }],
  heal: [
    {
      key: 'food-heal-mcflurry', label: '麦旋风', match: /麦旋风|旋风/, tint: 0xbfe0ea, w: 24, h: 28, draw(g) {
        g.fillStyle(0xfff5e0); g.fillEllipse(12, 8, 18, 12);
        g.fillStyle(0x6b4a3a); g.fillCircle(9, 6, 1.5); g.fillCircle(14, 9, 1.5); g.fillCircle(11, 4, 1.5);
        g.fillStyle(0xbfe0ea); g.fillPoints([{ x: 6, y: 12 }, { x: 18, y: 12 }, { x: 15, y: 26 }, { x: 9, y: 26 }], true);
        g.lineStyle(1.5, C.border, 0.4); g.strokePoints([{ x: 6, y: 12 }, { x: 18, y: 12 }, { x: 15, y: 26 }, { x: 9, y: 26 }, { x: 6, y: 12 }], true);
        g.fillStyle(C.panel); g.fillRect(19, 0, 2, 12);
      },
    },
    {
      key: 'food-heal-sundae', label: '圣代', match: /圣代/, tint: 0xff9db0, w: 24, h: 28, draw(g) {
        g.fillStyle(0xff9db0); g.fillEllipse(12, 7, 17, 11); g.fillCircle(12, 2, 3);
        g.fillStyle(0xc23a2e); g.fillCircle(12, 2, 1.6);
        g.fillStyle(0xe8f4f6); g.fillPoints([{ x: 6, y: 11 }, { x: 18, y: 11 }, { x: 14, y: 26 }, { x: 10, y: 26 }], true);
        g.lineStyle(1.5, 0x9fb8bd, 0.8); g.strokePoints([{ x: 6, y: 11 }, { x: 18, y: 11 }, { x: 14, y: 26 }, { x: 10, y: 26 }, { x: 6, y: 11 }], true);
      },
    },
    {
      key: 'food-heal-pie', label: '香酥派', match: /派|甜品/, tint: 0xdba24a, w: 24, h: 26, draw(g) {
        g.fillStyle(0xdba24a); g.fillPoints([{ x: 12, y: 2 }, { x: 22, y: 13 }, { x: 12, y: 24 }, { x: 2, y: 13 }], true);
        g.lineStyle(1.6, 0xb07f36); g.lineBetween(7, 8, 17, 18); g.lineBetween(17, 8, 7, 18); g.strokePoints([{ x: 12, y: 2 }, { x: 22, y: 13 }, { x: 12, y: 24 }, { x: 2, y: 13 }, { x: 12, y: 2 }], true);
        g.fillStyle(C.panel); g.fillCircle(12, 6, 1.2); g.fillCircle(16, 15, 1.2); g.fillCircle(8, 15, 1.2);
      },
    },
  ],
  shield: [
    {
      key: 'food-shield-choco', label: '巧克力甜筒', match: /巧克力|朱古力/, tint: 0x9a6b4f, w: 22, h: 30, draw(g) {
        g.fillStyle(0xd9a24b); g.fillPoints([{ x: 4, y: 15 }, { x: 18, y: 15 }, { x: 11, y: 29 }], true);
        g.lineStyle(1.4, 0xb07f36); g.lineBetween(6, 18, 15, 18); g.lineBetween(8, 22, 13, 22);
        g.fillStyle(0x9a6b4f); g.fillEllipse(11, 9, 18, 12); g.fillTriangle(11, 1, 7, 8, 15, 8);
      },
    },
    {
      key: 'food-shield-vanilla', label: '香草甜筒', match: /甜筒|圆筒|冰淇淋/, tint: 0xfff5e0, w: 22, h: 30, draw(g) {
        g.fillStyle(0xd9a24b); g.fillPoints([{ x: 4, y: 15 }, { x: 18, y: 15 }, { x: 11, y: 29 }], true);
        g.lineStyle(1.4, 0xb07f36); g.lineBetween(6, 18, 15, 18); g.lineBetween(8, 22, 13, 22);
        g.fillStyle(0xfff5e0); g.fillEllipse(11, 9, 18, 12); g.fillTriangle(11, 1, 7, 8, 15, 8);
        g.fillStyle(0xc23a2e); g.fillCircle(11, 3, 1.6);
      },
    },
  ],
  missile: [{
    key: 'food-missile-burger', label: '麦辣追踪弹', tint: 0xd9553f, bulletScale: .55, w: 20, h: 26, draw(g) {
      g.fillStyle(0xd9553f); g.fillCircle(10, 12, 7.5);
      g.fillStyle(0xfff2cb); g.fillTriangle(10, 0, 6, 7, 14, 7);
      g.fillStyle(C.border); g.fillTriangle(3, 17, 3, 23, 8, 19); g.fillTriangle(17, 17, 17, 23, 12, 19);
      g.fillStyle(0xf7e2ae); g.fillCircle(8, 10, 1.2); g.fillCircle(13, 13, 1.2);
      g.fillStyle(C.gold); g.fillTriangle(10, 26, 7, 20, 13, 20);
    },
  }],
  wingman: [{
    key: 'food-wingman-kart', label: '乐园餐车', tint: 0xffcf52, w: 30, h: 24, draw(g) {
      g.fillStyle(0x354e3c, 0.15); g.fillEllipse(15, 22, 26, 6);
      g.fillStyle(0xad3945); g.fillRoundedRect(4, 5, 22, 13, 3);
      g.lineStyle(2, C.gold); g.beginPath(); g.moveTo(10, 15); g.lineTo(11, 9); g.arc(13, 9, 2, Math.PI, 0); g.lineTo(16, 15); g.lineTo(17, 9); g.arc(19, 9, 2, Math.PI, 0); g.lineTo(21, 15); g.strokePath();
      g.fillStyle(C.panel); g.fillRoundedRect(11, 1, 8, 5, 2);
      g.fillStyle(0x293e37); g.fillCircle(9, 19, 3.4); g.fillCircle(21, 19, 3.4);
      g.fillStyle(0xfff2cb); g.fillCircle(9, 19, 1.4); g.fillCircle(21, 19, 1.4);
    },
  }],
};

/** FNV-1a 名称哈希（与 cityProfiles.hashCity 同族，作用域不同即可）。 */
export function hashName(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 解析一个商品的美术变体：关键词优先，未命中按名称哈希稳定落位。 */
export function variantFor(type: WeaponType, name: string): FoodVariant {
  const list = FOOD_VARIANTS[type];
  const trimmed = name.trim();
  for (const v of list) if (v.match && v.match.test(trimmed)) return v;
  return list[hashName(type + ':' + trimmed) % list.length];
}

export function variantKeyFor(type: WeaponType, name: string): string {
  return variantFor(type, name).key;
}

const BY_KEY = new Map<string, FoodVariant>();
for (const list of Object.values(FOOD_VARIANTS)) for (const v of list) BY_KEY.set(v.key, v);

export function variantByKey(key: string): FoodVariant | undefined {
  return BY_KEY.get(key);
}

/** 弹幕贴图 → 渲染缩放（贴图按商店清晰度放大绘制，弹幕缩回原尺寸量级）。 */
export const BULLET_SCALE: Readonly<Record<string, number>> = (() => {
  const map: Record<string, number> = {};
  for (const list of Object.values(FOOD_VARIANTS)) for (const v of list) if (v.bulletScale) map[v.key] = v.bulletScale;
  return map;
})();

/** 全部贴图 key（createFoodTextures 逐条烘焙；测试校验覆盖一致）。 */
export const FOOD_TEXTURE_KEYS: string[] = Object.values(FOOD_VARIANTS).flat().map(v => v.key);
