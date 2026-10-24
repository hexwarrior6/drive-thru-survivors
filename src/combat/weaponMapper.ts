import type { Product } from '../data/snapshot';
import type { StatIcon } from '../ui/icons';
import { MAX_WEAPON_LEVEL } from '../systems/balance';
export type WeaponType = 'starter' | 'burger' | 'fries' | 'cola' | 'ice' | 'mine' | 'flame' | 'coffee' | 'desperate' | 'heal' | 'shield' | 'missile' | 'wingman';
export { MAX_WEAPON_LEVEL };
export const weaponNames: Record<WeaponType, string> = { starter: '后置散弹炮', burger: '汉堡炮台', fries: '薯条散射枪', cola: '可乐喷泉', ice: '冰冻射线', mine: '鸡块地雷', flame: '辣椒喷射器', coffee: '咖啡涡轮', desperate: '绝境提速', heal: '回复光环', shield: '甜筒护盾', missile: '麦辣制导飞弹', wingman: '开心乐园僚车' };
/** Where a weapon mounts: front gun, rear gun, or a passive aux slot. */
export type Mount = 'front' | 'rear' | 'aux';
export const mountNames: Record<Mount, string> = { front: '前炮台', rear: '后炮台', aux: '辅助位' };
const MOUNT_OF: Record<WeaponType, Mount> = {
  burger: 'front', fries: 'front', missile: 'front',
  starter: 'rear', flame: 'rear', mine: 'rear', ice: 'rear',
  cola: 'aux', coffee: 'aux', desperate: 'aux', heal: 'aux', shield: 'aux', wingman: 'aux',
};
export function mountOf(type: WeaponType): Mount { return MOUNT_OF[type]; }
/** Boss-killer tools the shop only surfaces from round two onward. */
export const LATE_GAME_TYPES: ReadonlySet<WeaponType> = new Set(['missile', 'wingman']);
export function mapProductToWeapon(p: Product): WeaponType {
  const n = p.name;
  if (/开心乐园/.test(n)) return 'wingman';
  if (/咖啡|拿铁|奶铁|美式|浓缩|卡布奇诺/.test(n)) return /浓缩/.test(n) ? 'desperate' : 'coffee';
  if (/甜筒|圆筒|冰淇淋/.test(n)) return 'shield';
  if (/派|圣代|麦旋风|甜品/.test(n)) return 'heal';
  if (/鸡块|麦乐鸡|鸡翅|鸡腿(?!堡)/.test(n)) return 'mine';
  if (/薯条|扭扭薯|薯饼/.test(n)) return 'fries';
  if (/麦辣鸡腿堡/.test(n)) return 'missile';
  if (/巨无霸|麦香鸡|麦香鱼|堡|卷|麦满分|帕尼尼/.test(n)) return /辣/.test(n) ? 'flame' : 'burger';
  if (/可乐|雪碧|芬达|汽水/.test(n)) return 'cola';
  if (/柠檬|茶|果汁|牛奶|豆浆/.test(n)) return 'ice';
  return p.category === 'drink' ? 'ice' : p.category === 'side' ? 'fries' : 'burger';
}
/** Per-level numbers, Lv1 → Lv5. Every array is indexable by level-1. */
export const stats = {
  burger: { damage: [40, 60, 90, 125, 170], interval: [1.2, 1, .8, .7, .6], range: [1400, 1400, 1400, 1400, 1400], count: [1, 1, 1, 1, 1] },
  fries: { damage: [12, 18, 25, 32, 40], interval: [1.5, 1.3, 1, .9, .8], range: [700, 700, 700, 700, 700], count: [5, 7, 9, 11, 13] },
  cola: { damage: [3, 5, 8, 12, 16], interval: [.25, .25, .25, .25, .25], range: [60, 80, 100, 120, 140], count: [0, 0, 0, 0, 0] },
  ice: { damage: [5, 8, 12, 17, 23], interval: [.25, .25, .25, .25, .25], range: [120, 160, 200, 240, 280], count: [0, 0, 0, 0, 0] },
  mine: { damage: [50, 75, 100, 140, 190], interval: [3, 2.5, 2, 1.8, 1.6], range: [40, 60, 80, 95, 110], count: [1, 1, 2, 2, 3] },
  flame: { damage: [8, 12, 18, 26, 36], interval: [.25, .25, .25, .25, .25], range: [80, 120, 160, 200, 240], count: [0, 0, 0, 0, 0] },
  missile: { damage: [30, 45, 70, 100, 140], interval: [1.5, 1.25, 1, .85, .7], range: [900, 1100, 1300, 1500, 1700], count: [1, 1, 2, 2, 3] },
  wingman: { damage: [9, 14, 20, 28, 38], interval: [1.1, .9, .75, .65, .55], range: [430, 430, 430, 430, 430], count: [1, 1, 2, 2, 3] },
} as const;
/** 辣椒喷射器的后方扫射角（度），Lv1-5。 */
export const FLAME_ARC = [60, 60, 80, 90, 100] as const;
/** 薯条弹减速保留比例：Lv2 减 20% → Lv5 减 50%。 */
export function friesSlow(level: number): number { return Math.max(0.5, 1 - level * 0.1); }
/** 冰冻武器的减速/冻结强度文案与行为共用表。 */
export const ICE_FREEZE_TIME = [0, 0, 2, 2.5, 3] as const;
/** 冰爆伤害（冻结目标被撞碎时的范围爆发）：Lv1-3 基础 12，Lv4/5 增强。 */
export const ICE_BURST_DAMAGE = [12, 12, 12, 20, 28] as const;
/** 咖啡涡轮蓄力加成。 */
export const COFFEE_CHARGE = [0, .2, .3, .35, .4] as const;
/** 回复光环磁吸范围。 */
export const HEAL_MAGNET = [80, 80, 110, 120, 130] as const;
/** 甜筒护盾无伤积盾间隔。 */
export const SHIELD_INTERVAL = [15, 12, 10, 8.5, 7] as const;
export interface StatLine { icon: StatIcon; text: string }
const line = (icon: StatIcon, text: string): StatLine => ({ icon, text });
/** One segment per effect so the shop can render each with its own small icon. */
export function weaponStats(type: WeaponType, level: number): StatLine[] {
  const l = level - 1;
  switch (type) {
    case 'burger': return [
      line('burst', `${stats.burger.damage[l]} 重击`),
      line('clock', `${stats.burger.interval[l]}s/发`),
      line('pierce', `直排贯穿 ${level} 敌`),
      ...(level >= 3 ? [line('up', '弹丸 +50%')] : []),
      ...(level === 5 ? [line('up', '重击 +35%')] : []),
    ];
    case 'fries': return [
      line('burst', `${stats.fries.count[l]} 根 × ${stats.fries.damage[l]}`),
      line('fan', `${45 + l * 15}° 前向扇形`),
      ...(level > 1 ? [line('snow', `减速 ${Math.round((1 - friesSlow(level)) * 100)}%`)] : []),
      ...(level >= 3 ? [line('pierce', `穿透 ${level >= 5 ? 3 : 2} 敌`)] : []),
    ];
    case 'cola': return [
      line('burst', `${stats.cola.damage[l]}/tick`),
      line('snow', `${stats.cola.range[l]}px 击退减速`),
      ...(level > 1 ? [line('up', '碰撞伤害')] : []),
      ...(level >= 3 ? [line('boom', '气泡爆炸')] : []),
    ];
    case 'ice': return [
      line('burst', `${stats.ice.damage[l]}/tick`),
      level >= 3 ? line('snow', `冻结 ${ICE_FREEZE_TIME[l]}s · 冰爆${level >= 4 ? '增强' : ''}`) : line('snow', `减速 ${level === 1 ? 50 : 70}% 3s`),
      line('pierce', `锁定追兵 · ${stats.ice.range[l]}px`),
    ];
    case 'mine': return [
      line('boom', `${stats.mine.damage[l]} 爆炸`),
      line('pierce', `${stats.mine.range[l]}px`),
      ...(level > 1 ? [line('snow', `减速区 ${level}s`)] : []),
      ...(stats.mine.count[l] > 1 ? [line('up', `${stats.mine.count[l]} 地雷`)] : []),
    ];
    case 'flame': return [
      line('flame', `${stats.flame.damage[l]}/tick`),
      line('fan', `后方 ${FLAME_ARC[l]}° 扫清追兵`),
      line('pierce', `${stats.flame.range[l]}px`),
      ...(level > 1 ? [line('clock', `灼烧 ${Math.min(4, level)}s`)] : []),
    ];
    case 'coffee': return [
      line('gauge', `最高速度 +${level * 5}%`),
      ...(level > 1 ? [line('bolt', `蓄力 +${Math.round(COFFEE_CHARGE[l] * 100)}%`)] : []),
      ...(level >= 3 ? [line('bolt', `氮气 +${1 + (level - 3) * 0.5}/s`)] : []),
    ];
    case 'desperate': return [
      line('gauge', `车况 <${20 + level * 10}% · 速度 +${5 + level * 5}%`),
      line('drain', level >= 4 ? `损耗 ${level === 5 ? '-5' : '0'}%` : `损耗 +${Math.round((1.2 - level * 0.05 - 1) * 100)}%`),
    ];
    case 'heal': return [
      line('heart', `车况 +${[2, 3, 5, 7, 9][l]}/${[10, 8, 6, 5, 4][l]}s`),
      ...(level > 1 ? [line('up', `击杀 +${level - 1}`)] : []),
      ...(level >= 3 ? [line('magnet', `磁吸 ${HEAL_MAGNET[l]}`)] : []),
    ];
    case 'shield': return [
      line('shield', `无碰撞 ${SHIELD_INTERVAL[l]}s 得盾`),
      line('up', `上限 ${level >= 5 ? 3 : level >= 3 ? 2 : 1} 层`),
      ...(level > 1 ? [line('burst', '反伤')] : []),
      ...(level > 1 ? [line('orbit', `环绕甜筒 ×${Math.min(3, level - 1)}`)] : []),
    ];
    case 'missile': return [
      line('burst', `${stats.missile.damage[l]} 伤害`),
      line('clock', `${stats.missile.interval[l]}s/发`),
      line('magnet', '锁定霸王 · 自动追踪'),
      ...(stats.missile.count[l] > 1 ? [line('up', `${stats.missile.count[l]} 发齐射`)] : []),
    ];
    case 'wingman': return [
      line('burst', `僚车火力 ${stats.wingman.damage[l]}`),
      line('clock', `${stats.wingman.interval[l]}s/发`),
      line('magnet', '侧翼协同射击'),
      ...(stats.wingman.count[l] > 1 ? [line('up', `召唤第 ${stats.wingman.count[l]} 辆`)] : []),
    ];
    default: return [line('burst', '后向索敌 · 三发散弹')];
  }
}
