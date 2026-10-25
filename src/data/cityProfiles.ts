/**
 * 城市风貌档案：赛道配色、地平线形态、路边装饰组合与地标，全部由城市名确定性派生。
 * 40 座常用城市逐一指派 6 种原型之一；未知城市按名称哈希落原型。同一城市永远
 * 同貌；不同城市即使同原型，装饰序列与地标也不同——「排列组合」而非逐城手绘。
 * 一切随机都来自 hashCity 的确定性序列（TrackGenerator 用 mulberry32 展开），
 * 不引入任何运行时 Math.random，保持装饰与 progress 稳定绑定的红线。
 */
import { STARTING_CITIES } from './cities';

/** 赛道绘制的全部颜色。classic 即原有全局配色，其余原型在其上偏移。 */
export interface TrackPalette {
  /** 满屏地面底色。 */
  grass: number;
  /** 路肩草带（原 0x91b170）。 */
  shoulder: number;
  /** 沥青主色。 */
  road: number;
  /** 沥青交替色（分段节奏感）。 */
  roadAlt: number;
  /** 车道虚线与边线。 */
  lane: number;
  /** 路缘描边色。 */
  border: number;
  /** 红白路缘石的正色（品牌红，全部原型保持）。 */
  curb: number;
  curbAlt: number;
  /** 地平线天色带。 */
  horizonBand: number;
  /** 远景主色：山丘 / 海面 / 楼群剪影。 */
  horizonHill: number;
  /** 远景副色：第二层山 / 浪光 / 高塔。 */
  horizonHillAlt: number;
}

export type HorizonKind = 'hills' | 'sea' | 'skyline' | 'ridges';
export type CityArchetypeId = 'classic' | 'metro' | 'seaside' | 'jiangnan' | 'northern' | 'southwest' | 'ancient';

export interface CityArchetype {
  id: CityArchetypeId;
  name: string;
  palette: TrackPalette;
  horizon: HorizonKind;
  /** 装饰物纹理 key 抽样池（重复项即权重）。 */
  props: string[];
}

export const CLASSIC_PALETTE: TrackPalette = {
  grass: 0xbed994, shoulder: 0x91b170, road: 0x5c6564, roadAlt: 0x596260,
  lane: 0xe9dfc1, border: 0x754329, curb: 0xe75239, curbAlt: 0xfff9e8,
  horizonBand: 0xd8ebaf, horizonHill: 0xd0e2a2, horizonHillAlt: 0xc4d89b,
};

/** 6 种城市原型；classic 仅用于未选城的标题/选车页背景。 */
export const ARCHETYPES: Record<CityArchetypeId, CityArchetype> = {
  classic: {
    id: 'classic', name: '经典公路', palette: CLASSIC_PALETTE, horizon: 'hills', props: ['tree', 'building'],
  },
  metro: {
    id: 'metro', name: '都市霓虹', horizon: 'skyline', props: ['building', 'building', 'billboard', 'tree', 'lantern'],
    palette: {
      grass: 0xa8bd9a, shoulder: 0x8ba57e, road: 0x565e63, roadAlt: 0x535b60,
      lane: 0xe3e9ec, border: 0x5c6a72, curb: 0xe75239, curbAlt: 0xfff9e8,
      horizonBand: 0xcfdce4, horizonHill: 0x9fb3c2, horizonHillAlt: 0x8ba2b3,
    },
  },
  seaside: {
    id: 'seaside', name: '滨海大道', horizon: 'sea', props: ['palm', 'palm', 'tree', 'building'],
    palette: {
      grass: 0xc0e0a4, shoulder: 0x96ca80, road: 0x5e6a6e, roadAlt: 0x5b676b,
      lane: 0xf2ead0, border: 0x6d7a80, curb: 0xe75239, curbAlt: 0xfff9e8,
      horizonBand: 0xbfe8f2, horizonHill: 0x6fc0d8, horizonHillAlt: 0x8fd4e2,
    },
  },
  jiangnan: {
    id: 'jiangnan', name: '江南水乡', horizon: 'hills', props: ['tree', 'tree', 'pavilion', 'building'],
    palette: {
      grass: 0xb4da9e, shoulder: 0x8aba79, road: 0x5b6a62, roadAlt: 0x58675f,
      lane: 0xeee6c8, border: 0x6f5f4a, curb: 0xe75239, curbAlt: 0xfff9e8,
      horizonBand: 0xdcecc0, horizonHill: 0xa6d29e, horizonHillAlt: 0x8fc48e,
    },
  },
  northern: {
    id: 'northern', name: '北国秋色', horizon: 'hills', props: ['autumn-tree', 'autumn-tree', 'tree', 'building'],
    palette: {
      grass: 0xd6c687, shoulder: 0xb0a267, road: 0x5f5b55, roadAlt: 0x5c5852,
      lane: 0xefe3c4, border: 0x7a5b36, curb: 0xe75239, curbAlt: 0xfff9e8,
      horizonBand: 0xe8ddb0, horizonHill: 0xd9b878, horizonHillAlt: 0xc7a468,
    },
  },
  southwest: {
    id: 'southwest', name: '山城层峦', horizon: 'ridges', props: ['tree', 'tree', 'building', 'pavilion'],
    palette: {
      grass: 0x9cbb8e, shoulder: 0x7e9f6f, road: 0x556065, roadAlt: 0x525d62,
      lane: 0xdfe4d2, border: 0x4f5a52, curb: 0xe75239, curbAlt: 0xfff9e8,
      horizonBand: 0xc6d5d0, horizonHill: 0x8fb5ac, horizonHillAlt: 0x7aa299,
    },
  },
  ancient: {
    id: 'ancient', name: '古都风华', horizon: 'hills', props: ['lantern', 'pavilion', 'building', 'tree'],
    palette: {
      grass: 0xc3cf9b, shoulder: 0x9dab75, road: 0x5d5f58, roadAlt: 0x5a5c55,
      lane: 0xe8dcc0, border: 0x8a4a3a, curb: 0xb03a2e, curbAlt: 0xfff3dd,
      horizonBand: 0xe0d8b8, horizonHill: 0xc8bfa0, horizonHillAlt: 0xb5ab8a,
    },
  },
};

/** 40 城的原型指派；语义近邻城市共享原型，观感靠装饰序列与地标拉开。 */
const CITY_ARCHETYPE: Record<string, CityArchetypeId> = {
  上海: 'metro', 北京: 'ancient', 广州: 'metro', 深圳: 'metro', 杭州: 'jiangnan',
  南京: 'ancient', 苏州: 'jiangnan', 成都: 'southwest', 重庆: 'southwest', 武汉: 'metro',
  西安: 'ancient', 长沙: 'metro', 郑州: 'metro', 天津: 'northern', 青岛: 'seaside',
  济南: 'northern', 合肥: 'jiangnan', 宁波: 'seaside', 厦门: 'seaside', 福州: 'seaside',
  泉州: 'ancient', 东莞: 'metro', 佛山: 'metro', 珠海: 'seaside', 海口: 'seaside',
  三亚: 'seaside', 昆明: 'southwest', 贵阳: 'southwest', 南宁: 'jiangnan', 南昌: 'jiangnan',
  沈阳: 'northern', 大连: 'seaside', 哈尔滨: 'northern', 长春: 'northern', 石家庄: 'northern',
  太原: 'ancient', 无锡: 'jiangnan', 温州: 'seaside', 常州: 'jiangnan', 南通: 'seaside',
};

/** 12 座主要城市的地标贴图 key（createWorldTextures 逐一烘焙）。 */
export interface LandmarkDef { key: string; name: string }
export const LANDMARKS: Record<string, LandmarkDef> = {
  上海: { key: 'lm-pearl', name: '东方明珠' },
  北京: { key: 'lm-palace', name: '故宫角楼' },
  广州: { key: 'lm-canton', name: '广州塔' },
  深圳: { key: 'lm-pingan', name: '平安大厦' },
  杭州: { key: 'lm-leifeng', name: '雷峰塔' },
  重庆: { key: 'lm-hongya', name: '洪崖洞' },
  成都: { key: 'lm-panda', name: '滚滚熊猫' },
  武汉: { key: 'lm-crane', name: '黄鹤楼' },
  西安: { key: 'lm-wall', name: '古城门楼' },
  天津: { key: 'lm-ferris', name: '天津之眼' },
  长沙: { key: 'lm-ifs', name: '国金中心' },
  哈尔滨: { key: 'lm-sophia', name: '圣索菲亚' },
};

/** FNV-1a：城市名 → 32 位种子。空串返回 0（classic 固定路径）。 */
export function hashCity(city: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < city.length; i++) {
    h ^= city.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 逆时针 32 位确定性 RNG（mulberry32）；装饰序列的唯一随机源。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 未知城市的哈希落型（classic 不参与轮转，保持默认背景语义）。 */
const ROTATION: CityArchetypeId[] = ['metro', 'seaside', 'jiangnan', 'northern', 'southwest', 'ancient'];

/** 交给 TrackGenerator 的完整风貌计划；palette 拷贝一份供天气叠加原地改写。 */
export interface TrackPlan {
  palette: TrackPalette;
  horizon: HorizonKind;
  props: string[];
  seed: number;
  /** 地标贴图 key；无地标城市为 undefined。 */
  landmark?: string;
}

export function archetypeOf(city: string): CityArchetype {
  const trimmed = city.trim();
  // 未选城（标题/选车页）固定经典公路；未知城市按名称哈希确定性落型。
  if (!trimmed) return ARCHETYPES.classic;
  const id = CITY_ARCHETYPE[trimmed] ?? ROTATION[hashCity(trimmed) % ROTATION.length];
  return ARCHETYPES[id];
}

export function resolveTrackPlan(city: string): TrackPlan {
  const trimmed = city.trim();
  const archetype = archetypeOf(trimmed);
  const seed = trimmed ? hashCity(trimmed) : 1;
  return {
    palette: { ...archetype.palette },
    horizon: archetype.horizon,
    props: archetype.props,
    seed,
    landmark: trimmed ? LANDMARKS[trimmed]?.key : undefined,
  };
}

/** 供测试断言：40 座预置城市全部有显式原型，不落入哈希路径。 */
export function presetCities(): string[] {
  return STARTING_CITIES.filter(city => CITY_ARCHETYPE[city] !== undefined);
}
