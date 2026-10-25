/**
 * 餐品美术变体库：让「名称不同」的商品长得不同。
 * 每个武器家族一组变体（双层堡/辣堡/鱼堡、长薯/扭扭薯/薯饼、可乐/雪碧/芬达…），
 * 购买时由商品名确定性解析：先关键词匹配，未命中回退名称哈希——离线示例与
 * 线上真实菜单（任意名字）都能得到稳定且分散的外观。
 *
 * 画风规范（与全局一致）：暖色卡通矢量——每个主体 2px 棕描边（#754329）、
 * 2-3 层明暗（本色 + 暗部 + 高光）、圆润玩具感造型；贴图按 44-60px 原生绘制，
 * 商店 48px 卡片按近原生尺寸显示不发糊，弹幕用 bulletScale 缩回旧尺寸量级。
 * 绘制规格与数据同址（draw(g)），Boot 阶段逐条烘焙；本文件仅类型引用 Phaser，
 * node 测试可直接导入做映射断言。
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
  /** 弹幕渲染缩放（贴图按商店清晰度约 2-3 倍绘制）；默认 1。 */
  bulletScale?: number;
  w: number;
  h: number;
  draw(g: Phaser.GameObjects.Graphics): void;
}

/**
 * 变体贴图 → dataURL 快照（Boot 后由 createFoodTextures 填充）。DOM 商店用它
 * 渲染与游戏内弹幕完全同源的图；未填充（测试环境）时 ShopView 回落到内置 SVG。
 */
export const FOOD_DATA_URLS: Record<string, string> = {};

// ——— 公共绘制小件 ——————————————————————————————

const OUT = C.border; // 0x754329 统一棕描边
type G = Phaser.GameObjects.Graphics;

/** 描边圆角矩形。 */
function rrect(g: G, x: number, y: number, w: number, h: number, r: number, fill: number, lw = 2): void {
  g.fillStyle(fill); g.fillRoundedRect(x, y, w, h, r);
  if (lw > 0) { g.lineStyle(lw, OUT); g.strokeRoundedRect(x, y, w, h, r); }
}
/** 描边多边形。 */
function poly(g: G, pts: { x: number; y: number }[], fill: number, alpha = 1, lw = 2): void {
  g.fillStyle(fill, alpha); g.fillPoints(pts, true);
  if (lw > 0) { g.lineStyle(lw, OUT, alpha); g.strokePoints(pts, true); }
}
/** 描边椭圆。 */
function ell(g: G, x: number, y: number, w: number, h: number, fill: number, alpha = 1, lw = 2): void {
  g.fillStyle(fill, alpha); g.fillEllipse(x, y, w, h);
  if (lw > 0) { g.lineStyle(lw, OUT, alpha); g.strokeEllipse(x, y, w, h);
  }
}
/** 汉堡穹顶面包：整椭圆填充+描边，底缘描边随后被生菜/酱料层覆盖，只留上弧。 */
function dome(g: G, cx: number, cy: number, w: number, h: number, color: number): void {
  ell(g, cx, cy, w, h, color);
  g.fillStyle(0xf7dfae, 0.55); g.fillEllipse(cx - w * 0.18, cy - h * 0.38, w * 0.42, h * 0.4);
}
/** 芝麻点。 */
function sesame(g: G, cx: number, cy: number): void {
  g.fillStyle(0xf7e2ae);
  for (const [dx, dy] of [[-9, -3], [0, -6], [9, -3], [-4, 1], [6, 1]] as const) {
    g.fillEllipse(cx + dx, cy + dy, 4.5, 3);
  }
}
/** 肉饼：本体 + 底缘暗部 + 描边。 */
function patty(g: G, x: number, y: number, w: number, h: number, color = 0xad713a): void {
  rrect(g, x, y, w, h, h / 2, color);
  g.fillStyle(0x000000, 0.14); g.fillRoundedRect(x + 2, y + h - 4, w - 4, 3, 2);
}
/** 芝士片：横片 + 两个垂落的滴耳。 */
function cheese(g: G, x: number, y: number, w: number): void {
  g.fillStyle(C.gold);
  g.fillRoundedRect(x, y, w, 7, 3);
  g.fillRoundedRect(x + 5, y + 4, 6, 9, 3);
  g.fillRoundedRect(x + w - 12, y + 4, 6, 8, 3);
  g.lineStyle(2, OUT); g.strokeRoundedRect(x, y, w, 7, 3);
}
/** 生菜皱边：横带 + 下缘波浪球。 */
function lettuce(g: G, x: number, y: number, w: number): void {
  g.fillStyle(0x8bbf57);
  g.fillRect(x, y, w, 7);
  for (let i = 0; i < 5; i++) g.fillCircle(x + 5 + i * (w - 10) / 4, y + 7, 4.5);
  g.fillStyle(0x6b9d57, 0.7);
  for (let i = 0; i < 5; i++) g.fillCircle(x + 5 + i * (w - 10) / 4, y + 8, 2.2);
}
/** 底包：圆角短枕 + 底缘暗部。 */
function bunBottom(g: G, x: number, y: number, w: number, color = 0xdba24b): void {
  rrect(g, x, y, w, 11, 5, color);
  g.fillStyle(0x000000, 0.12); g.fillRoundedRect(x + 3, y + 7, w - 6, 3, 2);
}
/** 奶昔杯族骨架：梯形奶油杯身 + 深色杯盖 + 弯吸管 + 色带槽。 */
function cup(g: G, band: number, mark: (g: G) => void): void {
  // 吸管（在盖后探出）
  g.fillStyle(band); g.fillRoundedRect(29, 2, 6, 16, 3);
  g.lineStyle(1.6, OUT); g.strokeRoundedRect(29, 2, 6, 16, 3);
  g.fillStyle(0xffffff, 0.35); g.fillRect(30, 4, 2, 10);
  // 杯身（奶油白）
  poly(g, [{ x: 7, y: 17 }, { x: 37, y: 17 }, { x: 33, y: 57 }, { x: 11, y: 57 }], 0xfff9e8);
  g.fillStyle(0x000000, 0.05);
  poly(g, [{ x: 11, y: 46 }, { x: 33, y: 46 }, { x: 32, y: 57 }, { x: 12, y: 57 }], 0x354e3c, 0.08, 0);
  // 品牌色带
  poly(g, [{ x: 8, y: 27 }, { x: 36, y: 27 }, { x: 35, y: 39 }, { x: 9, y: 39 }], band, 1, 2);
  mark(g);
  // 杯盖
  rrect(g, 4, 9, 36, 9, 4, 0x8a5a3a);
  g.fillStyle(0x3a2e28, 0.4); g.fillRect(9, 11, 26, 2);
  // 杯身高光与冷凝点
  g.fillStyle(0xffffff, 0.5); g.fillRect(12, 20, 3, 22);
  g.fillStyle(0xdcecf4, 0.8); g.fillCircle(28, 47, 2); g.fillCircle(24, 51, 1.6);
}
/** 小金拱 M 标（用于杯带/餐盒正面）。 */
function archMark(g: G, cx: number, cy: number, s: number): void {
  g.lineStyle(2.4 * s, C.gold);
  g.beginPath();
  g.moveTo(cx - 7 * s, cy + 5 * s); g.lineTo(cx - 7 * s, cy - 2 * s);
  g.arc(cx - 3.5 * s, cy - 2 * s, 3.5 * s, Math.PI, 0);
  g.lineTo(cx + 0.5 * s, cy + 5 * s); g.lineTo(cx + 0.5 * s, cy - 2 * s);
  g.arc(cx + 4 * s, cy - 2 * s, 3.5 * s, Math.PI, 0);
  g.lineTo(cx + 7.5 * s, cy + 5 * s);
  g.strokePath();
}
/** 热气小卷：y 为下段圆心，向上叠一段，整体控制在 y-9 以内不越画布顶。 */
function steam(g: G, x: number, y: number): void {
  g.lineStyle(2, 0xd9c9a8, 0.85);
  for (const dx of [0, 9]) {
    g.beginPath();
    g.arc(x + dx, y, 3.2, Math.PI * 0.85, Math.PI * 2.15);
    g.arc(x + dx, y - 5.5, 3.2, Math.PI * 0.85, Math.PI * 2.15);
    g.strokePath();
  }
}
/** 甜筒华夫纹（两组斜线）。 */
function waffle(g: G, x1: number, y1: number, x2: number, y2: number): void {
  g.lineStyle(1.6, 0xb07f36, 0.75);
  for (let i = 1; i <= 2; i++) {
    const t = i / 3;
    g.lineBetween(x1 + (x2 - x1) * t * 0.4, y1 + (y2 - y1) * t, x2 - (x2 - x1) * t * 0.4, y1 + (y2 - y1) * t + 2);
    g.lineBetween(x2 - (x2 - x1) * t * 0.4, y1 + (y2 - y1) * t, x1 + (x2 - x1) * t * 0.4, y1 + (y2 - y1) * t + 2);
  }
}
/** 软冰淇淋旋（两层球 + 顶球，带整体描边）。 */
function swirl(g: G, cx: number, cy: number, color: number, hi = 0xffffff): void {
  ell(g, cx, cy + 8, 27, 14, color);
  ell(g, cx, cy - 1, 20, 12, color);
  ell(g, cx, cy - 9, 12, 11, color);
  g.fillStyle(hi, 0.4); g.fillEllipse(cx - 5, cy - 11, 8, 5);
}

// ——— 28 个变体 —————————————————————————————————

export const FOOD_VARIANTS: Record<WeaponType, FoodVariant[]> = {
  starter: [{
    key: 'food-starter', label: '后置散弹', w: 22, h: 48, draw(g) {
      // 炮弹语义：奶油尖头 + 橙色弹体 + 尾翼 + 底部助推纹
      g.fillStyle(C.panel); g.fillTriangle(11, 2, 5, 14, 17, 14);
      g.lineStyle(2, OUT); g.strokeTriangle(11, 2, 5, 14, 17, 14);
      rrect(g, 4, 12, 14, 24, 6, C.orange);
      g.fillStyle(0xffffff, 0.4); g.fillRect(7, 17, 3, 14);
      g.fillStyle(C.border); g.fillTriangle(4, 28, 1, 40, 7, 36); g.fillTriangle(18, 28, 21, 40, 15, 36);
      rrect(g, 4, 36, 14, 6, 2, 0x8a5a3a);
      g.lineStyle(1.8, C.orange, 0.8);
      g.lineBetween(6, 45, 6, 48); g.lineBetween(16, 45, 16, 48);
    },
  }],
  burger: [
    {
      key: 'food-burger-double', label: '双层巨堡', match: /巨无霸|双层|大麦克|皇室/, bulletScale: .3, w: 56, h: 66, draw(g) {
        dome(g, 28, 13, 48, 22, 0xedb355);
        sesame(g, 28, 11);
        lettuce(g, 5, 23, 46);
        patty(g, 7, 31, 42, 9);
        rrect(g, 6, 40, 44, 7, 3, 0xf0d49a);
        patty(g, 7, 47, 42, 9);
        cheese(g, 7, 50, 42);
        bunBottom(g, 6, 52, 44);
      },
    },
    {
      key: 'food-burger-spicy', label: '麦辣红堡', match: /辣|板烧|烧烤/, tint: 0xc23a2e, bulletScale: .3, w: 56, h: 56, draw(g) {
        dome(g, 28, 13, 48, 22, 0xd98a4a);
        // 红辣酱从穹顶垂落
        g.fillStyle(0xc23a2e);
        g.fillEllipse(28, 16, 42, 14);
        g.fillRoundedRect(8, 17, 6, 12, 3); g.fillRoundedRect(24, 19, 7, 16, 3); g.fillRoundedRect(40, 17, 6, 10, 3);
        g.lineStyle(2, OUT); g.strokeRoundedRect(24, 19, 7, 16, 3);
        sesame(g, 28, 9);
        patty(g, 7, 29, 42, 9, 0x8a4a3a);
        bunBottom(g, 6, 40, 44);
        g.fillStyle(0xe75239); g.fillCircle(14, 27, 1.8); g.fillCircle(43, 26, 1.8); g.fillCircle(36, 33, 1.8);
      },
    },
    {
      key: 'food-burger-fish', label: '鳕鱼堡', match: /鱼|鳕/, tint: 0x80c6c3, bulletScale: .3, w: 56, h: 54, draw(g) {
        dome(g, 28, 13, 48, 22, 0xe8d9a8);
        sesame(g, 28, 9);
        // 塔塔酱波浪带（饱和青，层间加深色分界）
        g.fillStyle(0x6fc4cc); g.fillRect(5, 20, 46, 6);
        for (let i = 0; i < 5; i++) g.fillCircle(9 + i * 9.5, 26, 4);
        g.fillStyle(0xbdeff2, 0.9); g.fillRect(5, 20, 46, 2);
        g.fillStyle(0x4d9aa4, 0.9); g.fillRect(5, 26.5, 46, 1.6);
        // 方形鱼饼（浅金黄脆皮 + 鱼肉波浪纹）
        rrect(g, 8, 28, 40, 11, 5, 0xf2e6c8);
        g.fillStyle(0xe0cfa4, 0.85); g.fillRect(11, 31, 34, 2);
        g.lineStyle(1.8, 0xc9b47e, 0.9);
        g.beginPath(); g.moveTo(12, 34); g.lineTo(17, 36); g.lineTo(23, 33); g.lineTo(29, 36); g.lineTo(35, 33); g.lineTo(42, 35); g.strokePath();
        bunBottom(g, 6, 39, 44, 0xe0cd98);
      },
    },
    {
      key: 'food-burger-classic', label: '芝士堡', tint: 0xedb355, bulletScale: .3, w: 56, h: 54, draw(g) {
        dome(g, 28, 13, 48, 22, 0xedb355);
        sesame(g, 28, 11);
        lettuce(g, 5, 22, 46);
        cheese(g, 7, 27, 42);
        patty(g, 7, 29, 42, 9);
        bunBottom(g, 6, 39, 44);
      },
    },
  ],
  fries: [
    {
      key: 'food-fries-curly', label: '扭扭薯', match: /扭扭|卷/, bulletScale: .24, tint: 0xf2c14e, w: 52, h: 58, draw(g) {
        // 后层薯条探出
        g.fillStyle(0xffe28a); g.fillRoundedRect(9, 6, 7, 26, 3); g.fillRoundedRect(42, 9, 7, 24, 3);
        g.lineStyle(1.6, OUT, 0.8); g.strokeRoundedRect(9, 6, 7, 26, 3); g.strokeRoundedRect(42, 9, 7, 24, 3);
        // 卷曲主薯：先深色宽线打底再金色覆盖，形成描边
        const path = (lw: number, color: number): void => {
          g.lineStyle(lw, color);
          g.beginPath();
          g.moveTo(8, 34); g.lineTo(17, 15); g.lineTo(24, 28); g.lineTo(33, 10); g.lineTo(40, 25); g.lineTo(46, 16);
          g.strokePath();
        };
        path(12, 0xcf8f36); path(8, C.gold);
        g.lineStyle(3, 0xffe28a, 0.9);
        g.beginPath(); g.moveTo(9, 33); g.lineTo(17, 16); g.lineTo(24, 28); g.strokePath();
        // 红盒
        poly(g, [{ x: 6, y: 30 }, { x: 46, y: 30 }, { x: 50, y: 54 }, { x: 2, y: 54 }], 0xad3945);
        g.fillStyle(0x8a2d38); poly(g, [{ x: 6, y: 30 }, { x: 46, y: 30 }, { x: 47, y: 36 }, { x: 5, y: 36 }], 0x8a2d38, 1, 0);
        archMark(g, 26, 46, 1);
      },
    },
    {
      key: 'food-fries-hash', label: '黄金薯饼', match: /薯饼|薯格|薯片/, bulletScale: .24, tint: 0xd9a24b, w: 52, h: 44, draw(g) {
        steam(g, 17, 14);
        rrect(g, 4, 16, 44, 24, 11, 0xd9a24b);
        g.fillStyle(0xe8bb62, 0.9); g.fillRoundedRect(8, 19, 36, 6, 3);
        g.lineStyle(2, 0xb07f36, 0.9);
        g.lineBetween(10, 20, 42, 36); g.lineBetween(10, 36, 42, 20);
        g.lineBetween(15, 18, 37, 38); g.lineBetween(37, 18, 15, 38);
      },
    },
    {
      key: 'food-fries-box', label: '长薯条', match: /薯/, bulletScale: .24, tint: 0xffcf52, w: 52, h: 58, draw(g) {
        // 五根薯条错落探出（金身 + 高光 + 细描边）
        const xs = [8, 16.5, 25, 33.5, 42], ys = [8, 4, 9, 3, 7];
        for (let i = 0; i < 5; i++) {
          rrect(g, xs[i], ys[i], 7, 26, 3, C.gold, 1.5);
          g.fillStyle(0xffe28a, 0.9); g.fillRect(xs[i] + 1.5, ys[i] + 2, 2, 20);
        }
        // 红盒（前倾梯形 + 深色口沿 + 金拱标）
        poly(g, [{ x: 5, y: 26 }, { x: 47, y: 26 }, { x: 49.5, y: 56 }, { x: 2.5, y: 56 }], 0xad3945);
        poly(g, [{ x: 5, y: 26 }, { x: 47, y: 26 }, { x: 48, y: 32 }, { x: 4, y: 32 }], 0x8a2d38, 1, 0);
        archMark(g, 26, 48, 1.1);
      },
    },
  ],
  cola: [
    {
      key: 'food-cola-sprite', label: '雪碧', match: /雪碧/, tint: 0x59b368, w: 44, h: 62, draw(g) {
        cup(g, 0x59b368, g2 => {
          g2.fillStyle(0xdff2c8); g2.fillCircle(22, 33, 5.5);
          g2.fillStyle(0x59b368); g2.fillCircle(22, 33, 2.4);
        });
      },
    },
    {
      key: 'food-cola-fanta', label: '芬达', match: /芬达|汽水|苏打/, tint: 0xff8c42, w: 44, h: 62, draw(g) {
        cup(g, 0xff8c42, g2 => {
          g2.fillStyle(C.gold); g2.fillCircle(22, 33, 5.5);
          g2.fillStyle(0xfff2cb); g2.fillCircle(20.5, 31.5, 1.8);
        });
      },
    },
    {
      key: 'food-cola-classic', label: '可乐', match: /可乐|cola/, tint: 0xad3945, w: 44, h: 62, draw(g) {
        cup(g, 0xad3945, g2 => archMark(g2, 22, 36, 0.85));
      },
    },
  ],
  ice: [
    {
      key: 'food-ice-tea', label: '柠檬红茶', match: /柠檬|红茶|茶/, tint: 0xd9a441, w: 44, h: 62, draw(g) {
        cup(g, 0xd9a441, g2 => {
          g2.fillStyle(0x8a5a3a, 0.5); g2.fillRect(10, 30, 24, 2);
        });
        // 柠檬片躺在杯盖上（放大居中，更醒目）
        g.fillStyle(0xffe08a); g.fillCircle(13, 9, 7);
        g.lineStyle(2, OUT); g.strokeCircle(13, 9, 7);
        g.fillStyle(0xfff7cf); g.fillCircle(13, 9, 3.4);
        g.lineStyle(1.3, 0xf2c14e); g.lineBetween(13, 3.5, 13, 14.5); g.lineBetween(7.5, 9, 18.5, 9);
        g.lineStyle(1.1, 0xf2c14e, 0.8); g.lineBetween(9, 5, 17, 13); g.lineBetween(17, 5, 9, 13);
      },
    },
    {
      key: 'food-ice-juice', label: '鲜榨果汁', match: /果汁|橙汁|汁/, tint: 0xffa13f, w: 44, h: 62, draw(g) {
        cup(g, 0xffa13f, g2 => {
          g2.fillStyle(C.gold); g2.fillCircle(22, 33, 6);
          g2.fillStyle(0xfff2cb); g2.fillCircle(22, 33, 2.2);
          g2.lineStyle(1.4, 0xe8912e); g2.lineBetween(17, 33, 27, 33); g2.lineBetween(22, 28, 22, 38);
        });
      },
    },
    {
      key: 'food-ice-milk', label: '醇香牛奶', match: /牛奶|豆奶|豆浆|奶/, tint: 0xf7f0e2, w: 42, h: 62, draw(g) {
        // 屋顶奶盒（不同剪影区分杯型饮品）
        poly(g, [{ x: 8, y: 20 }, { x: 21, y: 8 }, { x: 34, y: 20 }], 0xf7f0e2);
        g.fillStyle(0xe8dfc8); g.fillPoints([{ x: 8, y: 20 }, { x: 21, y: 8 }, { x: 21, y: 20 }], true);
        rrect(g, 8, 20, 26, 34, 3, 0xf7f0e2);
        g.lineStyle(2, OUT); g.lineBetween(21, 20, 21, 8);
        g.fillStyle(0x000000, 0.06); g.fillRoundedRect(27, 22, 6, 31, 2);
        g.fillStyle(C.blue); g.fillRect(8, 30, 26, 9);
        g.lineStyle(2, OUT); g.strokeRect(8, 30, 26, 9);
        // 蓝带上的奶滴标与波浪
        g.fillStyle(0xffffff); g.fillCircle(15, 34.5, 3.2); g.fillCircle(19.5, 33.5, 2);
        g.lineStyle(1.6, 0xffffff, 0.9);
        g.beginPath(); g.moveTo(24, 36); g.lineTo(26, 34); g.lineTo(28, 36); g.lineTo(30, 34); g.strokePath();
        g.fillStyle(0xffffff, 0.5); g.fillRect(10, 23, 3, 28);
      },
    },
  ],
  flame: [
    {
      key: 'food-flame-grill', label: '板烧堡', match: /板烧|烧烤|烟/, tint: 0x6b4a3a, bulletScale: .3, w: 56, h: 56, draw(g) {
        dome(g, 28, 13, 48, 22, 0x8a5a3a);
        // 烧烤焦痕
        g.lineStyle(2.2, 0x53331f, 0.9);
        g.lineBetween(14, 8, 19, 16); g.lineBetween(25, 6, 30, 16); g.lineBetween(36, 8, 41, 16);
        cheese(g, 7, 27, 42);
        patty(g, 7, 30, 42, 9, 0x6b4a3a);
        bunBottom(g, 6, 41, 44);
        g.fillStyle(0xd96a2e); g.fillCircle(13, 32, 1.8); g.fillCircle(44, 31, 1.8);
      },
    },
    {
      key: 'food-flame-chicken', label: '麦辣鸡腿堡', match: /麦辣|鸡腿|辣/, tint: 0xc23a2e, bulletScale: .3, w: 56, h: 56, draw(g) {
        // 穹顶上方的小火苗
        g.fillStyle(0xffa13f); g.fillTriangle(45, 2, 39, 14, 51, 14);
        g.fillStyle(0xe75239); g.fillTriangle(45, 7, 41.5, 14, 48.5, 14);
        dome(g, 28, 16, 48, 22, 0xd98a4a);
        g.fillStyle(0xc23a2e);
        g.fillEllipse(28, 19, 42, 13);
        g.fillRoundedRect(10, 20, 6, 11, 3); g.fillRoundedRect(26, 22, 7, 14, 3); g.fillRoundedRect(42, 20, 5, 9, 3);
        g.lineStyle(2, OUT); g.strokeRoundedRect(26, 22, 7, 14, 3);
        sesame(g, 28, 11);
        patty(g, 7, 32, 42, 9, 0x8a4a3a);
        bunBottom(g, 6, 42, 44);
      },
    },
  ],
  mine: [
    {
      key: 'food-mine-wing', label: '麦辣鸡翅', match: /鸡翅|辣翅|翼/, tint: 0xc23a2e, w: 54, h: 34, draw(g) {
        // 鼓槌翅：大块裹粉翅身 + 辣酱刷面 + 单根骨柄（一眼可读的剪影）
        ell(g, 19, 17, 32, 20, 0xd9a24b);
        g.fillStyle(0xe8bb62, 0.85); g.fillEllipse(13, 11, 15, 7);
        // 红辣酱刷面（斜向厚笔触）
        g.lineStyle(5, 0xc23a2e, 0.9);
        g.beginPath(); g.moveTo(6, 20); g.lineTo(30, 9); g.strokePath();
        g.lineStyle(2.5, 0xe75239, 0.9);
        g.beginPath(); g.moveTo(9, 25); g.lineTo(26, 16); g.strokePath();
        // 辣椒粒
        g.fillStyle(0xc23a2e); g.fillCircle(24, 22, 1.8); g.fillCircle(12, 13, 1.6);
        // 单骨柄 + 双球骨节
        rrect(g, 33, 14, 12, 6, 3, 0xfff2cb, 1.5);
        g.fillStyle(0xfff2cb); g.fillCircle(47, 14, 3.6); g.fillCircle(48, 20, 3.2);
        g.lineStyle(1.5, OUT, 0.85); g.strokeCircle(47, 14, 3.6); g.strokeCircle(48, 20, 3.2);
      },
    },
    {
      key: 'food-mine-box', label: '麦乐鸡', match: /鸡块|麦乐鸡/, tint: 0xd9a24b, w: 52, h: 36, draw(g) {
        // 三块麦乐鸡从盒口探出
        for (const [x, y] of [[8, 6], [19, 3], [33, 7]] as const) {
          rrect(g, x, y, 13, 12, 5, 0xd9a24b, 1.5);
          g.fillStyle(0xe8bb62, 0.9); g.fillEllipse(x + 6, y + 3, 7, 4);
        }
        poly(g, [{ x: 4, y: 14 }, { x: 48, y: 14 }, { x: 49, y: 32 }, { x: 3, y: 32 }], 0xad3945);
        poly(g, [{ x: 4, y: 14 }, { x: 48, y: 14 }, { x: 48.5, y: 19 }, { x: 3.5, y: 19 }], 0x8a2d38, 1, 0);
        archMark(g, 26, 27, 0.7);
      },
    },
  ],
  coffee: [
    {
      key: 'food-coffee-iced', label: '冰拿铁', match: /冰|冷/, tint: 0xc9a77c, w: 44, h: 62, draw(g) {
        // 透明杯身：分层咖啡 + 冰块
        poly(g, [{ x: 7, y: 17 }, { x: 37, y: 17 }, { x: 33, y: 57 }, { x: 11, y: 57 }], 0xe8f4f6, 0.55);
        poly(g, [{ x: 10, y: 38 }, { x: 34, y: 38 }, { x: 32, y: 57 }, { x: 12, y: 57 }], 0x6b4a3a, 0.95, 0);
        poly(g, [{ x: 8, y: 24 }, { x: 36, y: 24 }, { x: 35, y: 38 }, { x: 9, y: 38 }], 0xe2d3b8, 0.95, 0);
        poly(g, [{ x: 8, y: 17 }, { x: 36, y: 17 }, { x: 35, y: 24 }, { x: 9, y: 24 }], 0xd8b98a, 0.9, 0);
        for (const [x, y] of [[13, 27], [24, 30]] as const) {
          g.fillStyle(0xffffff, 0.85); g.fillRect(x, y, 8, 7);
          g.lineStyle(1.4, 0xbcd8de); g.strokeRect(x, y, 8, 7);
        }
        g.lineStyle(2, OUT, 0.7);
        g.strokePoints([{ x: 7, y: 17 }, { x: 37, y: 17 }, { x: 33, y: 57 }, { x: 11, y: 57 }, { x: 7, y: 17 }], true);
        // 深色吸管 + 奶盖
        g.fillStyle(0x354e3c); g.fillRoundedRect(29, 2, 6, 18, 3);
        g.lineStyle(1.6, OUT); g.strokeRoundedRect(29, 2, 6, 18, 3);
        rrect(g, 4, 9, 36, 9, 4, C.panel);
        g.fillStyle(0x000000, 0.08); g.fillRect(9, 11, 26, 2);
      },
    },
    {
      key: 'food-coffee-hot', label: '热咖啡', tint: 0x8a5a3b, w: 44, h: 62, draw(g) {
        steam(g, 14, 10.5);
        poly(g, [{ x: 7, y: 17 }, { x: 37, y: 17 }, { x: 33, y: 57 }, { x: 11, y: 57 }], 0xfff9e8);
        g.fillStyle(0x000000, 0.05);
        poly(g, [{ x: 11, y: 46 }, { x: 33, y: 46 }, { x: 32, y: 57 }, { x: 12, y: 57 }], 0x354e3c, 0.08, 0);
        poly(g, [{ x: 8, y: 28 }, { x: 36, y: 28 }, { x: 35, y: 42 }, { x: 9, y: 42 }], 0xad3945, 1, 2);
        archMark(g, 22, 39, 0.8);
        rrect(g, 4, 9, 36, 9, 4, 0x8a5a3a);
        g.fillStyle(0x3a2e28, 0.45); g.fillRect(15, 11, 14, 3);
        g.fillStyle(0xffffff, 0.45); g.fillRect(12, 20, 3, 22);
      },
    },
  ],
  desperate: [{
    key: 'food-desperate-espresso', label: '双份浓缩', tint: 0x3a2e28, w: 36, h: 42, draw(g) {
      steam(g, 12, 14);
      ell(g, 18, 35, 26, 8, 0xfff2cb);
      poly(g, [{ x: 7, y: 19 }, { x: 27, y: 19 }, { x: 24, y: 33 }, { x: 10, y: 33 }], 0x3a2e28);
      g.fillStyle(0xc9a26b); g.fillRoundedRect(8, 18, 18, 4, 2);
      g.fillStyle(0xffffff, 0.3); g.fillRect(10, 19, 5, 2);
      // 杯耳（双层描环）
      g.lineStyle(3, 0x3a2e28); g.beginPath(); g.arc(27, 25, 4.5, -1.1, 1.1); g.strokePath();
      g.lineStyle(2, OUT); g.beginPath(); g.arc(27, 25, 6.5, -1.1, 1.1); g.strokePath();
    },
  }],
  heal: [
    {
      key: 'food-heal-mcflurry', label: '麦旋风', match: /麦旋风|旋风/, tint: 0xbfe0ea, w: 48, h: 62, draw(g) {
        swirl(g, 24, 18, 0xfff5e0, 0xffffff);
        // 「旋」的特征：巧克力酱螺旋卷
        g.lineStyle(2.4, 0x6b4a3a, 0.85);
        g.beginPath(); g.moveTo(17, 15); g.lineTo(24, 9); g.lineTo(31, 15); g.lineTo(24, 21); g.lineTo(19, 18); g.strokePath();
        g.fillStyle(0x6b4a3a); g.fillCircle(16, 11, 1.8); g.fillCircle(30, 12, 1.8);
        // 勺子（头 + 柄）
        ell(g, 35.5, 4, 8, 6, C.panel, 1, 1.5);
        rrect(g, 33, 8, 5, 14, 2.5, C.panel, 1.5);
        // 杯身（浅蓝）+ 金拱标
        poly(g, [{ x: 10, y: 26 }, { x: 38, y: 26 }, { x: 34, y: 58 }, { x: 14, y: 58 }], 0xbfe0ea);
        g.fillStyle(0xffffff, 0.4); g.fillRect(14, 29, 3, 26);
        archMark(g, 24, 45, 0.8);
      },
    },
    {
      key: 'food-heal-sundae', label: '圣代', match: /圣代/, tint: 0xff9db0, w: 48, h: 60, draw(g) {
        swirl(g, 24, 17, 0xff9db0, 0xffd3db);
        // 樱桃（带柄点）
        g.lineStyle(2, 0x6b4a3a); g.lineBetween(24, 4, 27, 1);
        g.fillStyle(0xc23a2e); g.fillCircle(24, 7, 4);
        g.lineStyle(1.8, OUT); g.strokeCircle(24, 7, 4);
        g.fillStyle(0xffffff, 0.7); g.fillCircle(22.5, 5.8, 1.2);
        // 高脚玻璃杯
        poly(g, [{ x: 11, y: 26 }, { x: 37, y: 26 }, { x: 28, y: 50 }, { x: 20, y: 50 }], 0xe8f4f6, 0.6);
        g.lineStyle(2, OUT, 0.75);
        g.strokePoints([{ x: 11, y: 26 }, { x: 37, y: 26 }, { x: 28, y: 50 }, { x: 20, y: 50 }, { x: 11, y: 26 }], true);
        ell(g, 24, 52, 16, 6, 0xe8f4f6, 0.8, 2);
        g.fillStyle(0xff9db0, 0.5); g.fillPoints([{ x: 14, y: 26 }, { x: 24, y: 26 }, { x: 22, y: 42 }], true);
      },
    },
    {
      key: 'food-heal-pie', label: '香酥派', match: /派|甜品/, tint: 0xdba24a, w: 52, h: 50, draw(g) {
        // 酥皮角：胖菱形 + 编花纹 + 糖霜点
        poly(g, [{ x: 26, y: 5 }, { x: 47, y: 20 }, { x: 26, y: 45 }, { x: 5, y: 20 }], 0xdba24a);
        g.fillStyle(0xc9913f, 0.45); g.fillPoints([{ x: 26, y: 5 }, { x: 47, y: 20 }, { x: 26, y: 24 }], true);
        g.lineStyle(2.2, 0xb07f36, 0.85);
        g.lineBetween(12, 15, 40, 30); g.lineBetween(12, 30, 40, 15);
        g.lineBetween(26, 8, 26, 42);
        g.fillStyle(C.panel);
        g.fillCircle(26, 12, 1.6); g.fillCircle(36, 24, 1.6); g.fillCircle(16, 24, 1.6); g.fillCircle(26, 36, 1.6);
      },
    },
  ],
  shield: [
    {
      key: 'food-shield-choco', label: '巧克力甜筒', match: /巧克力|朱古力/, tint: 0x9a6b4f, w: 44, h: 60, draw(g) {
        swirl(g, 22, 16, 0x9a6b4f, 0xc49a7c);
        // 巧克力淋酱波浪
        g.lineStyle(2.4, 0x6b4a3a, 0.9);
        g.beginPath(); g.moveTo(11, 22); g.lineTo(16, 26); g.lineTo(22, 22); g.lineTo(28, 26); g.lineTo(33, 22); g.strokePath();
        poly(g, [{ x: 8, y: 28 }, { x: 36, y: 28 }, { x: 22, y: 58 }], 0xd9a24b);
        waffle(g, 10, 30, 34, 30);
      },
    },
    {
      key: 'food-shield-vanilla', label: '香草甜筒', match: /甜筒|圆筒|冰淇淋/, tint: 0xfff5e0, w: 44, h: 60, draw(g) {
        swirl(g, 22, 16, 0xfff5e0, 0xffffff);
        g.fillStyle(0xc23a2e); g.fillCircle(22, 4, 3.6);
        g.lineStyle(1.8, OUT); g.strokeCircle(22, 4, 3.6);
        g.fillStyle(0xffffff, 0.7); g.fillCircle(20.6, 2.8, 1.1);
        poly(g, [{ x: 8, y: 28 }, { x: 36, y: 28 }, { x: 22, y: 58 }], 0xd9a24b);
        waffle(g, 10, 30, 34, 30);
      },
    },
  ],
  missile: [{
    key: 'food-missile-burger', label: '麦辣追踪弹', tint: 0xd9553f, bulletScale: .3, w: 40, h: 60, draw(g) {
      // 尾焰（先画，被弹体压住底缘）
      g.fillStyle(0xffa13f); g.fillTriangle(20, 58, 10, 41, 30, 41);
      g.fillStyle(C.gold); g.fillTriangle(20, 52, 14, 42, 26, 42);
      // 弹体：麦辣堡车身
      rrect(g, 7, 16, 26, 27, 10, 0xd9553f);
      g.fillStyle(0x000000, 0.12); g.fillRoundedRect(9, 37, 22, 4, 2);
      g.fillStyle(0xf7e2ae); g.fillEllipse(15, 22, 5, 3.4); g.fillEllipse(26, 28, 5, 3.4);
      // 尾翼
      g.fillStyle(OUT); g.fillTriangle(7, 32, 1, 46, 9, 42); g.fillTriangle(33, 32, 39, 46, 31, 42);
      // 穹顶弹头
      ell(g, 20, 12, 24, 20, 0xedb355);
      sesame(g, 20, 10);
    },
  }],
  wingman: [{
    key: 'food-wingman-kart', label: '乐园餐车', tint: 0xffcf52, w: 56, h: 50, draw(g) {
      g.fillStyle(0x354e3c, 0.15); g.fillEllipse(28, 44, 42, 8);
      // 车轮
      for (const x of [15, 41]) {
        g.fillStyle(0x293e37); g.fillCircle(x, 39, 6.5);
        g.lineStyle(2, OUT); g.strokeCircle(x, 39, 6.5);
        g.fillStyle(0xfff2cb); g.fillCircle(x, 39, 2.6);
      }
      // 开心乐园餐盒车身
      rrect(g, 8, 13, 40, 24, 5, 0xad3945);
      g.fillStyle(0x8a2d38, 0.6); g.fillRoundedRect(10, 31, 36, 4, 2);
      archMark(g, 28, 27, 1);
      // 提手 + 车灯
      rrect(g, 21, 6, 14, 9, 4, 0xfff2cb, 1.5);
      g.fillStyle(C.gold); g.fillCircle(11, 19, 2.2); g.fillCircle(45, 19, 2.2);
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
