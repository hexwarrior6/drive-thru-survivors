import type Phaser from 'phaser';
import { C } from './colors';

/**
 * 世界装饰贴图：城市原型的路边装饰件（棕榈/秋树/灯笼柱/霓虹招牌/飞檐亭）
 * 与 12 座主要城市的地标，Boot 阶段一次性烘焙。地标贴图按大尺度绘制
 * （130-200px 高），TrackGenerator 每周期在赛道远侧摆放一座。
 */
type G = Phaser.GameObjects.Graphics;

const shadow = (g: G, cx: number, cy: number, w: number, h: number): void => {
  g.fillStyle(0x354e3c, 0.15); g.fillEllipse(cx, cy, w, h);
};
/** 上翘飞檐屋顶：屋脊 + 两端翘角（三段折线近似）。 */
const eavedRoof = (g: G, cx: number, y: number, span: number, color: number): void => {
  g.fillStyle(color);
  g.fillPoints([
    { x: cx - span / 2, y: y - 8 }, { x: cx, y: y - 14 }, { x: cx + span / 2, y: y - 8 },
    { x: cx + span / 2 - 6, y: y + 2 }, { x: cx, y: y - 4 }, { x: cx - span / 2 + 6, y: y + 2 },
  ], true);
};

/** ——— 路边装饰件 ——— */

// tree/building/cafe 原在 BootScene 内联绘制，随装饰体系扩充一并收编至此。
function drawTree(g: G): void {
  g.fillStyle(0x354e3c, 0.15); g.fillEllipse(33, 53, 46, 17);
  g.fillStyle(C.border); g.fillRoundedRect(27, 27, 8, 29, 3);
  g.fillStyle(0x537b47); g.fillCircle(29, 26, 24); g.fillCircle(40, 31, 18);
  g.fillStyle(C.leaf); g.fillCircle(26, 23, 21); g.fillCircle(40, 27, 15);
  g.fillStyle(0x96bd71); g.fillEllipse(22, 14, 22, 12);
}

function drawBuilding(g: G): void {
  g.fillStyle(0x354e3c, 0.15); g.fillEllipse(45, 80, 76, 19);
  g.fillStyle(0xb9aa8e); g.fillPoints([{x:7,y:25},{x:23,y:35},{x:23,y:83},{x:7,y:73}], true);
  g.fillStyle(0xdca16c); g.fillRect(23, 35, 52, 48);
  g.fillStyle(0xfff2cb); g.fillPoints([{x:7,y:25},{x:60,y:15},{x:75,y:35},{x:23,y:35}], true);
  g.fillStyle(C.mint); for (let y = 43; y < 76; y += 14) g.fillRect(31, y, 35, 6);
  g.lineStyle(2, C.border, 0.4); g.strokeRect(23, 35, 52, 48);
}

function drawCafe(g: G): void {
  g.fillStyle(0x354e3c, 0.16); g.fillEllipse(54, 83, 96, 18);
  g.fillStyle(C.panel); g.lineStyle(2, C.border); g.fillRoundedRect(10, 34, 82, 47, 4); g.strokeRoundedRect(10, 34, 82, 47, 4);
  g.fillStyle(C.car); g.fillRoundedRect(4, 26, 96, 18, 4);
  g.fillStyle(C.gold); for (let x = 13; x < 99; x += 20) g.fillRect(x, 26, 8, 18);
  g.fillStyle(0x80c6c3); g.fillRect(19, 52, 28, 21); g.fillRect(57, 52, 25, 28);
  g.fillStyle(C.border); g.fillRect(75, 9, 4, 20);
  g.fillStyle(C.car); g.fillRoundedRect(58, 0, 37, 23, 5);
  g.lineStyle(3, C.gold); g.beginPath(); g.moveTo(65, 18);
  g.lineTo(67, 7); g.lineTo(72, 5); g.lineTo(77, 18); g.lineTo(82, 5); g.lineTo(87, 7); g.lineTo(89, 18); g.strokePath();
}

function drawPalm(g: G): void {
  shadow(g, 28, 66, 44, 12);
  g.fillStyle(0x8a6a42);
  g.fillPoints([{ x: 24, y: 64 }, { x: 29, y: 64 }, { x: 33, y: 22 }, { x: 27, y: 24 }], true);
  g.fillStyle(0x537b47);
  for (const [dx, dy] of [[-22, 6], [22, 6], [-16, -8], [16, -8], [0, -15]] as const) {
    g.fillEllipse(29 + dx, 20 + dy, 30, 11);
  }
  g.fillStyle(0x6b9d57);
  for (const [dx, dy] of [[-20, 4], [20, 4], [-14, -9], [14, -9], [0, -16]] as const) {
    g.fillEllipse(29 + dx, 19 + dy, 24, 8);
  }
  g.fillStyle(0xad4931); g.fillCircle(29, 22, 3);
}

function drawAutumnTree(g: G): void {
  shadow(g, 33, 60, 46, 14);
  g.fillStyle(0x6b4a2e); g.fillRoundedRect(28, 30, 8, 30, 3);
  g.fillStyle(0xb35c33); g.fillCircle(29, 28, 23); g.fillCircle(40, 33, 17);
  g.fillStyle(0xcc7a3d); g.fillCircle(26, 25, 20); g.fillCircle(40, 29, 14);
  g.fillStyle(0xe0a050); g.fillEllipse(22, 16, 22, 12); g.fillEllipse(38, 20, 16, 9);
}

function drawLantern(g: G): void {
  shadow(g, 13, 66, 20, 7);
  g.fillStyle(C.border); g.fillRoundedRect(10, 20, 6, 46, 2);
  g.fillStyle(0xffdf9e, 0.5); g.fillCircle(13, 12, 11);
  g.fillStyle(0xad3945); g.fillRoundedRect(5, 5, 16, 15, 4);
  g.fillStyle(0xffcf52, 0.9); g.fillRoundedRect(7, 7, 12, 11, 3);
  g.fillStyle(C.border); g.fillRect(8, 3, 10, 3); g.fillRect(9, 20, 8, 2);
}

function drawBillboard(g: G): void {
  shadow(g, 38, 74, 56, 10);
  g.fillStyle(C.border); g.fillRect(16, 40, 7, 34); g.fillRect(53, 40, 7, 34);
  g.fillStyle(C.ink); g.lineStyle(3, C.border); g.fillRoundedRect(2, 2, 72, 42, 6); g.strokeRoundedRect(2, 2, 72, 42, 6);
  g.fillStyle(0x2c3a4a); g.fillRoundedRect(6, 6, 64, 34, 4);
  g.lineStyle(3.5, C.gold); g.beginPath(); g.moveTo(24, 34);
  g.lineTo(27, 16); g.lineTo(32, 13); g.lineTo(37, 34); g.lineTo(42, 13); g.lineTo(47, 16); g.lineTo(50, 34); g.strokePath();
  g.fillStyle(C.gold); g.fillCircle(58, 12, 2); g.fillCircle(18, 12, 2);
}

function drawPavilion(g: G): void {
  shadow(g, 42, 56, 66, 12);
  g.fillStyle(0xb9aa8e); g.fillRoundedRect(14, 44, 56, 10, 2);
  g.fillStyle(0x9a3a2e); g.fillRect(20, 26, 5, 18); g.fillRect(59, 26, 5, 18);
  g.fillStyle(0xd9556b); g.fillRect(31, 26, 5, 18); g.fillRect(48, 26, 5, 18);
  g.fillStyle(0xfff2cb, 0.85); g.fillRect(38, 28, 8, 16);
  eavedRoof(g, 42, 26, 64, 0x4a6a8a);
  eavedRoof(g, 42, 10, 34, 0x4a6a8a);
  g.fillStyle(C.gold); g.fillCircle(42, 3, 3);
}

/** ——— 12 座城市地标 ——— */

function drawPearl(g: G): void {
  shadow(g, 75, 160, 110, 16);
  g.fillStyle(0x8a97a4);
  g.fillPoints([{ x: 52, y: 150 }, { x: 70, y: 96 }, { x: 82, y: 96 }], true);
  g.fillPoints([{ x: 98, y: 150 }, { x: 80, y: 96 }, { x: 68, y: 96 }], true);
  g.fillRect(22, 146, 106, 8);
  g.lineStyle(4, 0x8a97a4); g.lineBetween(75, 34, 98, 150); g.lineBetween(75, 34, 52, 150);
  g.fillStyle(0xd9556b); g.fillCircle(75, 106, 21); g.fillCircle(75, 66, 15);
  g.fillStyle(0xe88aa0); g.fillCircle(70, 100, 7); g.fillCircle(70, 61, 5);
  g.lineStyle(2, 0x8a97a4, 0.8); g.strokeCircle(75, 106, 21); g.strokeCircle(75, 66, 15);
  g.fillStyle(0x8a97a4); g.fillRoundedRect(72, 22, 6, 30, 3); g.fillCircle(75, 18, 5);
}

function drawPalace(g: G): void {
  shadow(g, 80, 102, 130, 14);
  g.fillStyle(0x9a3a2e); g.fillRect(28, 62, 104, 40);
  g.fillStyle(0xfff2cb); for (let x = 32; x < 130; x += 14) g.fillRect(x, 68, 8, 26);
  g.fillStyle(0x7a2e24); g.fillRect(24, 98, 112, 6);
  g.fillStyle(0x8a4a3a); g.fillRect(46, 42, 68, 22);
  g.fillStyle(0xfff2cb, 0.9); g.fillRect(52, 46, 10, 16); g.fillRect(98, 46, 10, 16);
  eavedRoof(g, 80, 42, 96, 0xdba24a);
  eavedRoof(g, 80, 22, 66, 0xdba24a);
  g.fillStyle(C.gold); g.fillRect(74, 8, 12, 8); g.fillCircle(80, 6, 4);
}

function drawCantonTower(g: G): void {
  shadow(g, 55, 180, 60, 12);
  g.fillStyle(0xc9d4dc);
  g.fillPoints([
    { x: 22, y: 172 }, { x: 38, y: 96 }, { x: 48, y: 58 }, { x: 55, y: 34 },
    { x: 62, y: 58 }, { x: 72, y: 96 }, { x: 88, y: 172 },
  ], true);
  g.lineStyle(2.5, 0x8ba2b3);
  g.beginPath(); g.moveTo(30, 150); g.lineTo(42, 126); g.lineTo(55, 118); g.lineTo(68, 126); g.lineTo(80, 150); g.strokePath();
  g.beginPath(); g.moveTo(40, 108); g.lineTo(48, 94); g.lineTo(55, 90); g.lineTo(62, 94); g.lineTo(70, 108); g.strokePath();
  g.fillStyle(0xdfe8ee); g.fillEllipse(55, 96, 44, 14);
  g.fillStyle(0x8ba2b3); g.fillEllipse(55, 92, 20, 10);
  g.fillStyle(0xc9d4dc); g.fillRoundedRect(52, 6, 6, 28, 3); g.fillCircle(55, 4, 4);
}

function drawPingan(g: G): void {
  shadow(g, 60, 190, 84, 12);
  g.fillStyle(0x9fb3c2);
  g.fillPoints([{ x: 24, y: 186 }, { x: 36, y: 40 }, { x: 84, y: 40 }, { x: 96, y: 186 }], true);
  g.fillStyle(0xb7c7d4);
  g.fillPoints([{ x: 44, y: 186 }, { x: 52, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 186 }], true);
  g.lineStyle(2, 0x8ba2b3, 0.7);
  for (const y of [70, 104, 138, 172]) g.lineBetween(30 + (186 - y) * 0.13, y, 90 - (186 - y) * 0.13, y);
  g.fillStyle(0xdff0f4); g.fillTriangle(60, 6, 44, 40, 76, 40);
  g.fillStyle(0x8ba2b3); g.fillRect(58, 0, 4, 12);
  g.fillStyle(0xffcf52, 0.9); g.fillCircle(60, 8, 3);
}

function drawLeifeng(g: G): void {
  shadow(g, 65, 122, 90, 13);
  g.fillStyle(0xb9aa8e); g.fillRoundedRect(28, 104, 74, 16, 3);
  g.fillStyle(0x8a4a3a); g.fillRoundedRect(38, 86, 54, 20, 2);
  eavedRoof(g, 65, 86, 78, 0xd9a24b);
  g.fillStyle(0x8a4a3a); g.fillRoundedRect(44, 64, 42, 22, 2);
  eavedRoof(g, 65, 64, 62, 0xd9a24b);
  g.fillStyle(0x8a4a3a); g.fillRoundedRect(50, 44, 30, 20, 2);
  eavedRoof(g, 65, 44, 46, 0xd9a24b);
  g.fillStyle(C.gold); g.fillCircle(65, 24, 4); g.fillRect(63, 18, 4, 10);
}

function drawHongya(g: G): void {
  shadow(g, 75, 122, 110, 13);
  g.fillStyle(0x6b4a2e);
  g.fillRect(22, 100, 14, 22); g.fillRect(114, 100, 14, 22);
  g.fillRect(48, 112, 12, 10); g.fillRect(90, 112, 12, 10);
  for (const y of [78, 56, 34]) {
    g.fillStyle(0xb0703a); g.fillRoundedRect(20, y, 110, 24, 3);
    g.fillStyle(0x8a5a3a); g.fillRect(20, y + 24, 110, 5);
    g.fillStyle(0xffcf52, 0.95);
    for (let x = 28; x < 122; x += 16) g.fillRoundedRect(x, y + 6, 9, 12, 2);
    eavedRoof(g, 75, y, 124, 0x4a3a50);
  }
  g.fillStyle(0x4a3a50); g.fillRoundedRect(30, 12, 90, 10, 4);
  g.fillStyle(C.gold); g.fillCircle(75, 8, 4);
}

function drawPanda(g: G): void {
  shadow(g, 55, 100, 80, 12);
  g.fillStyle(0x6b9d57); g.fillRoundedRect(90, 18, 8, 82, 3);
  g.fillStyle(0x8bbf57); g.fillEllipse(94, 16, 22, 9); g.fillEllipse(94, 28, 20, 8);
  g.fillStyle(0xfff9e8); g.fillEllipse(52, 74, 58, 44); g.fillCircle(52, 36, 24);
  g.fillStyle(0x354e3c);
  g.fillCircle(36, 16, 8); g.fillCircle(68, 16, 8);
  g.fillEllipse(42, 34, 13, 15); g.fillEllipse(62, 34, 13, 15);
  g.fillCircle(52, 48, 6);
  g.fillEllipse(26, 78, 14, 26); g.fillEllipse(78, 78, 14, 26);
  g.fillRoundedRect(34, 88, 36, 12, 6);
  g.fillStyle(0xfff9e8); g.fillCircle(46, 33, 3); g.fillCircle(58, 33, 3);
  g.fillStyle(0xff9db0); g.fillEllipse(44, 56, 8, 5);
}

function drawCrane(g: G): void {
  shadow(g, 70, 122, 100, 13);
  g.fillStyle(0xb9aa8e); g.fillRoundedRect(30, 104, 80, 16, 3);
  g.fillStyle(0x9a3a2e);
  g.fillRect(36, 84, 6, 22); g.fillRect(98, 84, 6, 22); g.fillRect(52, 84, 6, 22); g.fillRect(82, 84, 6, 22);
  eavedRoof(g, 70, 84, 88, 0xc99a4a);
  g.fillStyle(0x9a3a2e);
  g.fillRect(42, 62, 6, 24); g.fillRect(92, 62, 6, 24); g.fillRect(56, 62, 6, 24); g.fillRect(78, 62, 6, 24);
  g.fillStyle(0xfff2cb, 0.9); g.fillRect(64, 66, 12, 20);
  eavedRoof(g, 70, 62, 72, 0xc99a4a);
  g.fillStyle(0x9a3a2e); g.fillRect(56, 44, 28, 20);
  g.fillStyle(0xfff2cb, 0.9); g.fillRect(64, 48, 12, 16);
  eavedRoof(g, 70, 44, 52, 0xc99a4a);
  g.fillStyle(C.gold); g.fillCircle(70, 22, 4); g.fillRect(68, 16, 4, 10);
}

function drawCityWall(g: G): void {
  shadow(g, 85, 102, 140, 13);
  g.fillStyle(0x9a9482);
  g.fillRect(12, 62, 146, 40);
  for (let x = 14; x < 156; x += 18) g.fillRect(x, 54, 11, 10);
  g.fillStyle(0x5a4636); g.fillEllipse(85, 100, 44, 26);
  g.fillStyle(0x3a2e28); g.fillEllipse(85, 98, 34, 20);
  g.lineStyle(2, 0x7a7462, 0.6);
  for (const y of [74, 88]) g.lineBetween(14, y, 156, y);
  g.fillStyle(0x9a3a2e); g.fillRect(62, 36, 46, 28);
  g.fillStyle(0xfff2cb, 0.9); g.fillRect(70, 40, 9, 22); g.fillRect(92, 40, 9, 22);
  eavedRoof(g, 85, 36, 64, 0x6a7484);
}

function drawFerris(g: G): void {
  shadow(g, 80, 150, 90, 12);
  g.fillStyle(0x8ba2b3);
  g.fillPoints([{ x: 56, y: 146 }, { x: 76, y: 88 }, { x: 96, y: 146 }], true);
  g.fillStyle(0x6a7484); g.fillRect(8, 142, 144, 8);
  g.lineStyle(5, 0xc9d4dc); g.strokeCircle(76, 72, 56);
  g.lineStyle(2, 0x8ba2b3, 0.8);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    g.lineBetween(76 + Math.cos(a) * 56, 72 + Math.sin(a) * 56, 76, 72);
  }
  g.fillStyle(C.gold);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    g.fillCircle(76 + Math.cos(a) * 56, 72 + Math.sin(a) * 56, 5);
  }
  g.fillStyle(0xff9db0); g.fillCircle(76, 72, 7);
}

function drawIfs(g: G): void {
  shadow(g, 66, 186, 92, 12);
  g.fillStyle(0x9fb3c2);
  g.fillRoundedRect(20, 66, 52, 120, 3);
  g.fillRoundedRect(66, 40, 42, 146, 3);
  g.fillPoints([{ x: 66, y: 40 }, { x: 70, y: 14 }, { x: 86, y: 14 }, { x: 96, y: 40 }], true);
  g.fillStyle(0xb7c7d4);
  g.fillRect(24, 66, 10, 120); g.fillRect(70, 40, 8, 146);
  g.lineStyle(2, 0x8ba2b3, 0.7);
  for (const y of [70, 96, 122, 148, 174]) { g.lineBetween(20, y, 72, y); g.lineBetween(66, y, 108, y); }
  g.fillStyle(0xdff0f4); g.fillTriangle(78, 2, 70, 14, 86, 14);
  g.fillStyle(C.gold); g.fillCircle(78, 0, 3);
}

function drawSophia(g: G): void {
  shadow(g, 70, 112, 100, 13);
  g.fillStyle(0xa3543f); g.fillRoundedRect(30, 58, 80, 54, 4);
  g.fillStyle(0xfff2cb, 0.9);
  for (let x = 38; x < 102; x += 16) g.fillPoints([{ x, y: 70 }, { x: x + 10, y: 70 }, { x: x + 10, y: 88 }, { x: x + 5, y: 94 }, { x, y: 88 }], true);
  g.fillStyle(0x8a4636); g.fillRect(26, 56, 88, 6);
  g.fillStyle(0x59b368);
  g.fillPoints([
    { x: 38, y: 56 }, { x: 52, y: 34 }, { x: 62, y: 26 }, { x: 70, y: 12 }, { x: 78, y: 26 }, { x: 88, y: 34 }, { x: 102, y: 56 },
  ], true);
  g.fillStyle(0x7ac98a);
  g.fillPoints([{ x: 54, y: 44 }, { x: 70, y: 20 }, { x: 86, y: 44 }], true);
  g.fillStyle(C.gold); g.fillRect(68, 2, 4, 12); g.fillRect(64, 6, 12, 4);
}

const SCENERY: Record<string, [number, number, (g: G) => void]> = {
  tree: [64, 66, drawTree],
  building: [88, 96, drawBuilding],
  cafe: [108, 96, drawCafe],
  palm: [56, 74, drawPalm],
  'autumn-tree': [64, 68, drawAutumnTree],
  lantern: [26, 70, drawLantern],
  billboard: [76, 78, drawBillboard],
  pavilion: [84, 60, drawPavilion],
};

const LANDMARKS: Record<string, [number, number, (g: G) => void]> = {
  'lm-pearl': [150, 170, drawPearl],
  'lm-palace': [160, 106, drawPalace],
  'lm-canton': [110, 186, drawCantonTower],
  'lm-pingan': [120, 196, drawPingan],
  'lm-leifeng': [130, 128, drawLeifeng],
  'lm-hongya': [150, 126, drawHongya],
  'lm-panda': [110, 106, drawPanda],
  'lm-crane': [140, 128, drawCrane],
  'lm-wall': [170, 106, drawCityWall],
  'lm-ferris': [160, 154, drawFerris],
  'lm-ifs': [120, 190, drawIfs],
  'lm-sophia': [140, 116, drawSophia],
};

export function createWorldTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 });
  for (const [key, [w, h, draw]] of Object.entries(SCENERY)) {
    draw(g); g.generateTexture(key, w, h); g.clear();
  }
  for (const [key, [w, h, draw]] of Object.entries(LANDMARKS)) {
    draw(g); g.generateTexture(key, w, h); g.clear();
  }
  g.destroy();
}

/** 供测试断言：装饰件与地标的 key 清单（与 cityProfiles 引用一致性校验用）。 */
export const SCENERY_KEYS = Object.keys(SCENERY);
export const LANDMARK_KEYS = Object.keys(LANDMARKS);
