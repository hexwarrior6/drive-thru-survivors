/**
 * 餐品美术变体库：让「名称不同」的商品长得不同。
 * 每个武器家族一组变体（双层堡/辣堡/鱼堡、长薯/扭扭薯/薯饼、可乐/雪碧/芬达…），
 * 购买时由商品名确定性解析：先关键词匹配，未命中回退名称哈希——离线示例与
 * 线上真实菜单（任意名字）都能得到稳定且分散的外观。
 *
 * 画风规范（与全局一致）：暖色卡通矢量——每个主体 1.6px 棕描边（#754329）、
 * 暖色分层明暗与左上高光、圆润玩具感造型；以逻辑像素绘制并在启动时烘焙 3 倍图，
 * 商店使用高清图，弹幕用 bulletScale 缩回旧尺寸量级。
 * 绘制入口与数据同址（draw(ctx)），Boot 阶段逐条烘焙；不依赖 Phaser 运行时，
 * node 测试可直接导入做映射断言。
 */
import { paintFood } from './foodIllustrations';
import type { WeaponType } from '../combat/weaponMapper';

export interface FoodVariant {
  /** 烘焙贴图 key（'food-' 前缀）。 */
  key: string;
  /** 中文小名，用于排查与文案。 */
  label: string;
  /** 商品名关键词（可选）；先于哈希兜底逐条测试。 */
  match?: RegExp;
  /** 辅助光环/喷泉/光束用色（可乐喷泉、回复光环、护盾甜筒等）。 */
  tint?: number;
  /** 弹幕渲染缩放（贴图按商店清晰度约 2-3 倍绘制）；默认 1。 */
  bulletScale?: number;
  w: number;
  h: number;
  draw(ctx: CanvasRenderingContext2D): void;
}

/**
 * 变体贴图 → dataURL 快照（Boot 后由 createFoodTextures 填充）。DOM 商店用它
 * 渲染与游戏内弹幕完全同源的图；未填充（测试环境）时 ShopView 回落到内置 SVG。
 */
export const FOOD_DATA_URLS: Record<string, string> = {};

export const FOOD_VARIANTS: Record<WeaponType, FoodVariant[]> = {
  starter: [{
    key: 'food-starter', label: '后置散弹', w: 22, h: 48, draw(ctx) { paintFood(ctx, 'food-starter'); },
  }],
  burger: [
    {
      key: 'food-burger-double', label: '双层巨堡', match: /巨无霸|双层|大麦克|皇室/, bulletScale: .3, w: 56, h: 66, draw(ctx) { paintFood(ctx, 'food-burger-double'); },
    },
    {
      key: 'food-burger-spicy', label: '麦辣红堡', match: /辣|板烧|烧烤/, tint: 0xc23a2e, bulletScale: .3, w: 56, h: 56, draw(ctx) { paintFood(ctx, 'food-burger-spicy'); },
    },
    {
      key: 'food-burger-fish', label: '鳕鱼堡', match: /鱼|鳕/, tint: 0x80c6c3, bulletScale: .3, w: 56, h: 54, draw(ctx) { paintFood(ctx, 'food-burger-fish'); },
    },
    {
      key: 'food-burger-classic', label: '芝士堡', tint: 0xedb355, bulletScale: .3, w: 56, h: 54, draw(ctx) { paintFood(ctx, 'food-burger-classic'); },
    },
  ],
  fries: [
    {
      key: 'food-fries-curly', label: '扭扭薯', match: /扭扭|卷/, bulletScale: .24, tint: 0xf2c14e, w: 52, h: 58, draw(ctx) { paintFood(ctx, 'food-fries-curly'); },
    },
    {
      key: 'food-fries-hash', label: '黄金薯饼', match: /薯饼|薯格|薯片/, bulletScale: .24, tint: 0xd9a24b, w: 52, h: 44, draw(ctx) { paintFood(ctx, 'food-fries-hash'); },
    },
    {
      key: 'food-fries-box', label: '长薯条', match: /薯/, bulletScale: .24, tint: 0xffcf52, w: 52, h: 58, draw(ctx) { paintFood(ctx, 'food-fries-box'); },
    },
  ],
  cola: [
    {
      key: 'food-cola-sprite', label: '雪碧', match: /雪碧/, tint: 0x59b368, w: 44, h: 62, draw(ctx) { paintFood(ctx, 'food-cola-sprite'); },
    },
    {
      key: 'food-cola-fanta', label: '芬达', match: /芬达|汽水|苏打/, tint: 0xff8c42, w: 44, h: 62, draw(ctx) { paintFood(ctx, 'food-cola-fanta'); },
    },
    {
      key: 'food-cola-classic', label: '可乐', match: /可乐|cola/, tint: 0xad3945, w: 44, h: 62, draw(ctx) { paintFood(ctx, 'food-cola-classic'); },
    },
  ],
  ice: [
    {
      key: 'food-ice-tea', label: '柠檬红茶', match: /柠檬|红茶|茶/, tint: 0xd9a441, w: 44, h: 62, draw(ctx) { paintFood(ctx, 'food-ice-tea'); },
    },
    {
      key: 'food-ice-juice', label: '鲜榨果汁', match: /果汁|橙汁|汁/, tint: 0xffa13f, w: 44, h: 62, draw(ctx) { paintFood(ctx, 'food-ice-juice'); },
    },
    {
      key: 'food-ice-milk', label: '醇香牛奶', match: /牛奶|豆奶|豆浆|奶/, tint: 0xf7f0e2, w: 42, h: 62, draw(ctx) { paintFood(ctx, 'food-ice-milk'); },
    },
  ],
  flame: [
    {
      key: 'food-flame-grill', label: '板烧堡', match: /板烧|烧烤|烟/, tint: 0x6b4a3a, bulletScale: .3, w: 56, h: 56, draw(ctx) { paintFood(ctx, 'food-flame-grill'); },
    },
    {
      key: 'food-flame-chicken', label: '麦辣鸡腿堡', match: /麦辣|鸡腿|辣/, tint: 0xc23a2e, bulletScale: .3, w: 56, h: 56, draw(ctx) { paintFood(ctx, 'food-flame-chicken'); },
    },
  ],
  mine: [
    {
      key: 'food-mine-wing', label: '麦辣鸡翅', match: /鸡翅|辣翅|翼/, tint: 0xc23a2e, w: 54, h: 34, draw(ctx) { paintFood(ctx, 'food-mine-wing'); },
    },
    {
      key: 'food-mine-box', label: '麦乐鸡', match: /鸡块|麦乐鸡/, tint: 0xd9a24b, w: 52, h: 36, draw(ctx) { paintFood(ctx, 'food-mine-box'); },
    },
  ],
  coffee: [
    {
      key: 'food-coffee-iced', label: '冰拿铁', match: /冰|冷/, tint: 0xc9a77c, w: 44, h: 62, draw(ctx) { paintFood(ctx, 'food-coffee-iced'); },
    },
    {
      key: 'food-coffee-hot', label: '热咖啡', tint: 0x8a5a3b, w: 44, h: 62, draw(ctx) { paintFood(ctx, 'food-coffee-hot'); },
    },
  ],
  desperate: [{
    key: 'food-desperate-espresso', label: '双份浓缩', tint: 0x3a2e28, w: 36, h: 42, draw(ctx) { paintFood(ctx, 'food-desperate-espresso'); },
  }],
  heal: [
    {
      key: 'food-heal-mcflurry', label: '麦旋风', match: /麦旋风|旋风/, tint: 0xbfe0ea, w: 48, h: 62, draw(ctx) { paintFood(ctx, 'food-heal-mcflurry'); },
    },
    {
      key: 'food-heal-sundae', label: '圣代', match: /圣代/, tint: 0xff9db0, w: 48, h: 60, draw(ctx) { paintFood(ctx, 'food-heal-sundae'); },
    },
    {
      key: 'food-heal-pie', label: '香酥派', match: /派|甜品/, tint: 0xdba24a, w: 52, h: 50, draw(ctx) { paintFood(ctx, 'food-heal-pie'); },
    },
  ],
  shield: [
    {
      key: 'food-shield-choco', label: '巧克力甜筒', match: /巧克力|朱古力/, tint: 0x9a6b4f, w: 44, h: 60, draw(ctx) { paintFood(ctx, 'food-shield-choco'); },
    },
    {
      key: 'food-shield-vanilla', label: '香草甜筒', match: /甜筒|圆筒|冰淇淋/, tint: 0xfff5e0, w: 44, h: 60, draw(ctx) { paintFood(ctx, 'food-shield-vanilla'); },
    },
  ],
  missile: [{
    key: 'food-missile-burger', label: '麦辣追踪弹', tint: 0xd9553f, bulletScale: .3, w: 40, h: 60, draw(ctx) { paintFood(ctx, 'food-missile-burger'); },
  }],
  wingman: [{
    key: 'food-wingman-kart', label: '乐园餐车', tint: 0xffcf52, w: 56, h: 50, draw(ctx) { paintFood(ctx, 'food-wingman-kart'); },
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
