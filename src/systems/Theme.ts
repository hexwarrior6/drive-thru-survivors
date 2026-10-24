/** Campaign-calendar themes: keyword matched, with a small honest gameplay bonus. */
export type ThemeId = 'classic' | 'autumn' | 'festival' | 'winter';
export interface Theme {
  id: ThemeId;
  name: string;
  /** Festival runs put party hats on pursuing riders. */
  hat: boolean;
  /** Multiply tint applied to enemies when not slowed. */
  tint: number;
  /** Extra coin multiplier on top of the car bonus. */
  coinBonus: number;
  note: string;
}
export const THEMES: Record<ThemeId, Theme> = {
  classic: { id: 'classic', name: '经典公路', hat: false, tint: 0xffffff, coinBonus: 0, note: '' },
  autumn: { id: 'autumn', name: '金秋补给', hat: false, tint: 0xffe0b0, coinBonus: 0.05, note: '金币价值 +5%' },
  festival: { id: 'festival', name: '节日庆典', hat: true, tint: 0xffd4d4, coinBonus: 0.1, note: '追兵戴上派对帽 · 金币价值 +10%' },
  winter: { id: 'winter', name: '冰雪季', hat: false, tint: 0xbfd8f2, coinBonus: 0, note: '路面泛起寒色' },
};
export function themeFor(campaign: string): Theme {
  if (/圣诞|新年|春节|元宵|周年|庆典|节日|万圣|六一|嘉年华/.test(campaign)) return THEMES.festival;
  if (/秋|金|丰收|感恩/.test(campaign)) return THEMES.autumn;
  if (/冬|雪|冰/.test(campaign)) return THEMES.winter;
  return THEMES.classic;
}
