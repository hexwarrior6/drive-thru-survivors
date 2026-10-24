import type { Product } from '../data/snapshot';
export type WeaponType = 'starter' | 'burger' | 'fries' | 'cola' | 'ice' | 'mine' | 'flame' | 'coffee' | 'desperate' | 'heal' | 'shield';
export const weaponNames: Record<WeaponType, string> = { starter: '后置散弹炮', burger: '汉堡炮台', fries: '薯条散射枪', cola: '可乐喷泉', ice: '冰冻射线', mine: '鸡块地雷', flame: '辣椒喷射器', coffee: '咖啡涡轮', desperate: '绝境提速', heal: '回复光环', shield: '甜筒护盾' };
export function mapProductToWeapon(p: Product): WeaponType {
  const n = p.name;
  if (/咖啡|拿铁|奶铁|美式|浓缩|卡布奇诺/.test(n)) return /浓缩/.test(n) ? 'desperate' : 'coffee';
  if (/甜筒|圆筒|冰淇淋/.test(n)) return 'shield';
  if (/派|圣代|麦旋风|甜品/.test(n)) return 'heal';
  if (/鸡块|麦乐鸡|鸡翅|鸡腿(?!堡)/.test(n)) return 'mine';
  if (/薯条|扭扭薯|薯饼/.test(n)) return 'fries';
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
} as const;
export function weaponDescription(type: WeaponType, level: number): string {
  const l = level - 1;
  switch (type) {
    case 'burger': return `${stats.burger.damage[l]} 伤害 · ${stats.burger.interval[l]}s/发 · 前向${level === 1 ? '单发' : `穿透 ${level} 敌人`}${level === 3 ? ' · 弹丸增大 50%' : ''}`;
    case 'fries': return `${stats.fries.count[l]} 根 × ${stats.fries.damage[l]} · ${[45,60,75][l]}°扇形${level > 1 ? ` · 减速 ${level === 2 ? 20 : 30}%` : ''}${level === 3 ? ' · 穿透' : ''}`;
    case 'cola': return `${stats.cola.damage[l]}/tick · ${stats.cola.range[l]}px 环形击退减速${level > 1 ? ' · 敌人碰撞伤害' : ''}${level === 3 ? ' · 气泡爆炸' : ''}`;
    case 'ice': return `${stats.ice.damage[l]}/tick · ${stats.ice.range[l]}px · ${level === 3 ? '冻结 2s / 撞碎冰爆' : `减速 ${level === 1 ? 50 : 70}% 3s`}`;
    case 'mine': return `${stats.mine.damage[l]} 爆炸伤害 · ${stats.mine.range[l]}px${level > 1 ? ` · 减速区 ${level}s` : ''}${level === 3 ? ' · 双地雷' : ''}`;
    case 'flame': return `${stats.flame.damage[l]}/tick · 后方 ${level === 3 ? 160 : 120}° · ${stats.flame.range[l]}px${level > 1 ? ` · 灼烧 ${level === 3 ? 3 : 2}s` : ''}`;
    case 'coffee': return `最高速度 +${level * 5}%${level > 1 ? ` · 蓄力 +${level === 2 ? 20 : 30}%` : ''}${level === 3 ? ' · 氮气 +1/s' : ''}`;
    case 'desperate': return `车况 <${[30,40,50][l]}% 时速度 +${[10,15,20][l]}% · 损耗 +${[15,10,5][l]}%`;
    case 'heal': return `车况 +${[2,3,5][l]}/${[10,8,6][l]}s${level > 1 ? ` · 击杀 +${level - 1}` : ''}${level === 3 ? ' · 扩大磁吸' : ''}`;
    case 'shield': return `无碰撞 ${[15,12,10][l]}s 获得护盾 · 上限 ${level === 3 ? 2 : 1} 层${level > 1 ? ' · 反伤' : ''}`;
    default: return '自动索敌追兵 · 三发散弹';
  }
}
