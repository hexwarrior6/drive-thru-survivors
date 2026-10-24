/** Three starter karts with distinct passives; one stat each keeps choices legible. */
export type CarId = 'flash' | 'frost' | 'magnet';
export interface CarDef {
  id: CarId;
  name: string;
  en: string;
  css: string;
  /** Kart livery painted at boot: chassis and hood colors. */
  body: number;
  hood: number;
  tagline: string;
  /** +8% cruise top speed, stacked into the coffee/desperate bonus pool. */
  speedBonus: number;
  /** Passive nitro per second. */
  nitroRegen: number;
  /** Ram contact slows the victim for 2s (0 disables). */
  ramSlow: number;
  /** Base coin magnet radius in road units. */
  magnetRange: number;
  /** Multiplier applied when a coin is banked. */
  coinBonus: number;
  lines: string[];
}
export const CARS: readonly CarDef[] = [
  {
    id: 'flash', name: '闪电红', en: 'FLASH RED', css: '#c9503a', body: 0xc9503a, hood: 0xf4773e,
    tagline: '均衡高速 · 冲刺压制',
    speedBonus: 0.08, nitroRegen: 0.5, ramSlow: 0, magnetRange: 80, coinBonus: 0,
    lines: ['最高速度 +8%', '氮气自动回复 +0.5/秒', '标准磁吸 · 标准金币'],
  },
  {
    id: 'frost', name: '寒冰蓝', en: 'FROST BLUE', css: '#4a86b4', body: 0x4a86b4, hood: 0x77b7de,
    tagline: '冲撞冰冻 · 稳健控场',
    speedBonus: 0, nitroRegen: 0, ramSlow: 0.5, magnetRange: 80, coinBonus: 0,
    lines: ['冲撞使敌人减速 50% · 2 秒', '冰冻敌人受到撞击伤害 ×2', '标准磁吸 · 标准金币'],
  },
  {
    id: 'magnet', name: '磁力金', en: 'MAGNET GOLD', css: '#c2921f', body: 0xc2921f, hood: 0xffcf52,
    tagline: '磁吸金币 · 经济滚雪球',
    speedBonus: 0, nitroRegen: 0, ramSlow: 0, magnetRange: 130, coinBonus: 0.2,
    lines: ['磁吸范围 +62%', '金币价值 +20%', '标准速度 · 标准车况'],
  },
] as const;
export function carById(id: string | null | undefined): CarDef {
  return CARS.find(car => car.id === id) ?? CARS[0]!;
}
