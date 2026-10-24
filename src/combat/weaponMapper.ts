import type { Product } from '../data/snapshot';
import type { StatIcon } from '../ui/icons';
export type WeaponType = 'starter' | 'burger' | 'fries' | 'cola' | 'ice' | 'mine' | 'flame' | 'coffee' | 'desperate' | 'heal' | 'shield' | 'missile' | 'wingman';
export const weaponNames: Record<WeaponType, string> = { starter: '后置散弹炮', burger: '汉堡炮台', fries: '薯条散射枪', cola: '可乐喷泉', ice: '冰冻射线', mine: '鸡块地雷', flame: '辣椒喷射器', coffee: '咖啡涡轮', desperate: '绝境提速', heal: '回复光环', shield: '甜筒护盾', missile: '麦辣制导飞弹', wingman: '开心乐园僚车' };
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
export const stats = {
  burger: { damage: [40, 60, 90], interval: [1.2, 1, .8], range: [1400, 1400, 1400], count: [1, 1, 1] },
  fries: { damage: [12, 18, 25], interval: [1.5, 1.3, 1], range: [700, 700, 700], count: [5, 7, 9] },
  cola: { damage: [3, 5, 8], interval: [.25, .25, .25], range: [60, 80, 100], count: [0, 0, 0] },
  ice: { damage: [5, 8, 12], interval: [.25, .25, .25], range: [120, 160, 200], count: [0, 0, 0] },
  mine: { damage: [50, 75, 100], interval: [3, 2.5, 2], range: [40, 60, 80], count: [1, 1, 2] },
  flame: { damage: [8, 12, 18], interval: [.25, .25, .25], range: [80, 120, 160], count: [0, 0, 0] },
  missile: { damage: [30, 45, 70], interval: [1.5, 1.25, 1], range: [900, 1100, 1300], count: [1, 1, 2] },
  wingman: { damage: [9, 14, 20], interval: [1.1, .9, .75], range: [430, 430, 430], count: [1, 1, 2] },
} as const;
export interface StatLine { icon: StatIcon; text: string }
const line = (icon: StatIcon, text: string): StatLine => ({ icon, text });
/** One segment per effect so the shop can render each with its own small icon. */
export function weaponStats(type: WeaponType, level: number): StatLine[] {
  const l = level - 1;
  switch (type) {
    case 'burger': return [
      line('burst', `${stats.burger.damage[l]} 伤害`),
      line('clock', `${stats.burger.interval[l]}s/发`),
      level === 1 ? line('pierce', '前向单发') : line('pierce', `穿透 ${level} 敌`),
      ...(level === 3 ? [line('up', '弹丸 +50%')] : []),
    ];
    case 'fries': return [
      line('burst', `${stats.fries.count[l]} 根 × ${stats.fries.damage[l]}`),
      line('fan', `${[45, 60, 75][l]}° 扇形`),
      ...(level > 1 ? [line('snow', `减速 ${level === 2 ? 20 : 30}%`)] : []),
      ...(level === 3 ? [line('pierce', '穿透')] : []),
    ];
    case 'cola': return [
      line('burst', `${stats.cola.damage[l]}/tick`),
      line('snow', `${stats.cola.range[l]}px 击退减速`),
      ...(level > 1 ? [line('up', '碰撞伤害')] : []),
      ...(level === 3 ? [line('boom', '气泡爆炸')] : []),
    ];
    case 'ice': return [
      line('burst', `${stats.ice.damage[l]}/tick`),
      level === 3 ? line('snow', '冻结 2s · 冰爆') : line('snow', `减速 ${level === 1 ? 50 : 70}% 3s`),
      line('pierce', `${stats.ice.range[l]}px`),
    ];
    case 'mine': return [
      line('boom', `${stats.mine.damage[l]} 爆炸`),
      line('pierce', `${stats.mine.range[l]}px`),
      ...(level > 1 ? [line('snow', `减速区 ${level}s`)] : []),
      ...(level === 3 ? [line('up', '双地雷')] : []),
    ];
    case 'flame': return [
      line('flame', `${stats.flame.damage[l]}/tick`),
      line('fan', `后方 ${level === 3 ? 160 : 120}°`),
      line('pierce', `${stats.flame.range[l]}px`),
      ...(level > 1 ? [line('clock', `灼烧 ${level === 3 ? 3 : 2}s`)] : []),
    ];
    case 'coffee': return [
      line('gauge', `最高速度 +${level * 5}%`),
      ...(level > 1 ? [line('bolt', `蓄力 +${level === 2 ? 20 : 30}%`)] : []),
      ...(level === 3 ? [line('bolt', '氮气 +1/s')] : []),
    ];
    case 'desperate': return [
      line('gauge', `车况 <${[30, 40, 50][l]}% · 速度 +${[10, 15, 20][l]}%`),
      line('drain', `损耗 +${[15, 10, 5][l]}%`),
    ];
    case 'heal': return [
      line('heart', `车况 +${[2, 3, 5][l]}/${[10, 8, 6][l]}s`),
      ...(level > 1 ? [line('up', `击杀 +${level - 1}`)] : []),
      ...(level === 3 ? [line('magnet', '扩大磁吸')] : []),
    ];
    case 'shield': return [
      line('shield', `无碰撞 ${[15, 12, 10][l]}s 得盾`),
      line('up', `上限 ${level === 3 ? 2 : 1} 层`),
      ...(level > 1 ? [line('burst', '反伤')] : []),
      ...(level > 1 ? [line('orbit', `环绕甜筒 ×${level - 1}`)] : []),
    ];
    case 'missile': return [
      line('burst', `${stats.missile.damage[l]} 伤害`),
      line('clock', `${stats.missile.interval[l]}s/发`),
      line('magnet', '自动追踪锁敌'),
      ...(level === 3 ? [line('up', '双发齐射')] : []),
    ];
    case 'wingman': return [
      line('burst', `僚车火力 ${stats.wingman.damage[l]}`),
      line('clock', `${stats.wingman.interval[l]}s/发`),
      line('magnet', '侧翼协同射击'),
      ...(level === 3 ? [line('up', '召唤第二辆')] : []),
    ];
    default: return [line('burst', '自动索敌 · 三发散弹')];
  }
}
