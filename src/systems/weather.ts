/**
 * 轮次天气：一局的四轮走「晴朗 → 多云 → 黄昏 → 雨夜」，氛围随难度推进收紧。
 * 实现是对城市原色板的确定性色彩叠加（TrackGenerator.applyRound 调用），
 * 不改赛道几何；雨夜另由 GameScene 叠一层轻量雨丝。纯函数，可测。
 */
import { ROUNDS_PER_RUN } from './balance';
import type { TrackPalette } from '../data/cityProfiles';

export interface RoundWeather { id: string; name: string; note: string }

export const ROUND_WEATHER: RoundWeather[] = [
  { id: 'sunny', name: '晴朗', note: '' },
  { id: 'cloudy', name: '多云', note: '天色转灰' },
  { id: 'dusk', name: '黄昏', note: '夕阳低垂' },
  { id: 'rain', name: '雨夜', note: '车灯照雨' },
];

export function weatherOf(round: number): RoundWeather {
  return ROUND_WEATHER[Math.max(0, Math.min(ROUNDS_PER_RUN - 1, round - 1))];
}

export function isRainyRound(round: number): boolean {
  return weatherOf(round).id === 'rain';
}

// —— 色彩小工具（0xRRGGBB 数字的整数运算，无字符串往返） ——

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const pack = (r: number, g: number, b: number): number =>
  (Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b)));

/** 颜色 a 向 b 收敛比例 t（0 原样，1 全替换）。 */
function mix(a: number, b: number, t: number): number {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return pack(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** 亮度乘数 + 向目标色相偏移；brightness>1 提亮。 */
function shade(c: number, brightness: number, hueTarget: number, hueAmount: number): number {
  const [r, g, b] = rgb(c);
  return mix(pack(r * brightness, g * brightness, b * brightness), hueTarget, hueAmount);
}

/** 去饱和（t=1 全灰），去饱和时按亮度加权而不是简单平均，避免草地发闷。 */
function desaturate(c: number, t: number): number {
  const [r, g, b] = rgb(c);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return pack(r + (luma - r) * t, g + (luma - g) * t, b + (luma - b) * t);
}

/** 供雨夜路面湿润感：车道线提亮并微偏冷白。 */
function brightenLane(lane: number, amount: number): number {
  const [r, g, b] = rgb(lane);
  return mix(pack(255 - (255 - r) * 0.6, 255 - (255 - g) * 0.6, 255 - (255 - b) * 0.4), 0xdce8f4, amount);
}

/**
 * 四档叠加（数值刻意保守，压不住敌人/路缘石的红，保证可读性）：
 * 晴朗 = 微暖提亮；多云 = 去饱和 45% + 冷灰；黄昏 = 琥珀暖移 24%；
 * 雨夜 = 亮度 ×0.58 + 靛蓝 30%，天色压得更狠（45%），车道线反向提亮。
 */
export function applyWeather(base: TrackPalette, round: number): TrackPalette {
  const w = weatherOf(round);
  const p = { ...base };
  if (w.id === 'sunny') {
    for (const k of PALETTE_KEYS) p[k] = shade(base[k], 1.02, 0xfff3d6, 0.05);
  } else if (w.id === 'cloudy') {
    for (const k of PALETTE_KEYS) p[k] = shade(desaturate(base[k], 0.45), 0.93, 0x8fa3b4, 0.1);
  } else if (w.id === 'dusk') {
    for (const k of PALETTE_KEYS) p[k] = shade(base[k], 0.9, 0xe89a56, 0.24);
    p.lane = mix(base.lane, 0xffd9a0, 0.3);
    p.curb = shade(base.curb, 0.94, 0xd86a4a, 0.18);
    p.curbAlt = mix(base.curbAlt, 0xffe2c4, 0.25);
  } else {
    for (const k of PALETTE_KEYS) p[k] = shade(base[k], 0.58, 0x2e3a52, 0.3);
    p.horizonBand = mix(shade(base.horizonBand, 0.5, 0x2e3a52, 0.3), 0x252e45, 0.45);
    p.horizonHill = mix(shade(base.horizonHill, 0.52, 0x2e3a52, 0.3), 0x2a3750, 0.4);
    p.horizonHillAlt = mix(shade(base.horizonHillAlt, 0.5, 0x2e3a52, 0.3), 0x33415e, 0.35);
    // 车道线是雨夜唯一的「反光」，刻意提亮，其余全部下沉。
    p.lane = brightenLane(base.lane, 0.5);
    p.curb = shade(base.curb, 0.66, 0xc23a2e, 0.22);
    p.curbAlt = shade(base.curbAlt, 0.68, 0x8a97b4, 0.25);
  }
  return p;
}

const PALETTE_KEYS = ['grass', 'shoulder', 'road', 'roadAlt', 'lane', 'border', 'curb', 'curbAlt', 'horizonBand', 'horizonHill', 'horizonHillAlt'] as const;
