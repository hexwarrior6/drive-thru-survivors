/**
 * 餐品身份标准化（§4.3）：商品名 → 标准化餐品身份 → 餐品专属 weaponId。
 *
 * 规则：
 * - 关键配方词（辣/鱼/双层/板烧/扭扭/薯饼…）是身份的一部分，不可当修饰语删除；
 *   跨门店相同餐品同一武器，同一门店不同配方不同武器。
 * - 身份指向目录中的目标 weaponId；该武器 `ready: false` 时降级为对应挂载的
 *   「通用改装」占位（generic-front / generic-rear）——显式降级而非伪装成专属。
 * - 大小份/加量/包装别名归入同一身份（中薯和大薯不制造两件假差异武器）。
 * - 完全未收录的名字走类别兜底，同样落在通用改装，绝不冒领独立武器身份。
 */
import type { Product } from '../data/snapshot';
import type { WeaponFamily } from './weaponCatalog';
import { weaponById } from './weaponCatalog';
import { variantKeyFor } from '../data/foodArt';

export interface FoodIdentity {
  /** 稳定身份 ID（与贴图无关）。 */
  id: string;
  /** 标准化餐品名。 */
  label: string;
  /** 目录目标武器；可能尚未 ready。 */
  weaponId: string;
  family: WeaponFamily;
  /** 美术分组（foodArt 的组名），用于弹幕与卡片贴图。 */
  artGroup: string;
}

interface IdentityRule {
  test: RegExp;
  id: string;
  label: string;
  weaponId: string;
  family: WeaponFamily;
  artGroup: string;
}

/** 顺序敏感：具体配方在前，泛化关键词在后。 */
const RULES: readonly IdentityRule[] = [
  // 汉堡/早餐主食（炮械家族，W01-W10）
  { test: /巨无霸|大麦克|皇室堡/, id: 'big-mac', label: '巨无霸', weaponId: 'W01', family: '炮械', artGroup: 'burger' },
  { test: /双层|双牛/, id: 'double-cheese', label: '双层吉士', weaponId: 'W02', family: '炮械', artGroup: 'burger' },
  { test: /吉士|芝士/, id: 'cheeseburger', label: '吉士汉堡', weaponId: 'W03', family: '炮械', artGroup: 'burger' },
  { test: /麦香鱼|鳕鱼/, id: 'filet-o-fish', label: '麦香鱼', weaponId: 'W04', family: '炮械', artGroup: 'burger' },
  { test: /麦香鸡/, id: 'mc-chicken', label: '麦香鸡', weaponId: 'W05', family: '炮械', artGroup: 'burger' },
  { test: /麦辣鸡腿堡|辣鸡腿/, id: 'spicy-mc', label: '麦辣鸡腿堡', weaponId: 'W06', family: '炮械', artGroup: 'flame' },
  { test: /板烧|炙烧/, id: 'grilled-chicken', label: '板烧鸡腿堡', weaponId: 'W07', family: '炮械', artGroup: 'flame' },
  { test: /培根/, id: 'bacon-beef', label: '培根牛肉堡', weaponId: 'W08', family: '炮械', artGroup: 'burger' },
  { test: /安格斯/, id: 'angus', label: '安格斯牛肉堡', weaponId: 'W09', family: '炮械', artGroup: 'burger' },
  { test: /麦满分|松饼|帕尼尼|早餐卷|吉士蛋/, id: 'muffin', label: '麦满分', weaponId: 'W10', family: '炮械', artGroup: 'burger' },
  { test: /麦辣|香辣/, id: 'spicy-burger', label: '麦辣堡', weaponId: 'W06', family: '炮械', artGroup: 'flame' },
  // 薯类（齐射、回旋与切割家族，W11-W16）
  { test: /扭扭薯|波波薯|卷卷薯/, id: 'curly-fries', label: '扭扭薯条', weaponId: 'W12', family: '薯类', artGroup: 'fries' },
  { test: /薯饼/, id: 'hash-brown', label: '薯饼', weaponId: 'W13', family: '薯类', artGroup: 'fries' },
  { test: /薯格|网格薯/, id: 'waffle-fries', label: '薯格', weaponId: 'W14', family: '薯类', artGroup: 'fries' },
  { test: /薯角|薯块/, id: 'potato-wedges', label: '薯角', weaponId: 'W15', family: '薯类', artGroup: 'fries' },
  { test: /薯条|薯/, id: 'fries', label: '长薯条', weaponId: 'W11', family: '薯类', artGroup: 'fries' },
  // 鸡肉小食（爆破与布置家族，W17-W20）
  { test: /麦乐鸡|鸡块/, id: 'nugget', label: '麦乐鸡', weaponId: 'W17', family: '鸡肉', artGroup: 'mine' },
  { test: /鸡翅|辣翅|翅/, id: 'spicy-wings', label: '辣鸡翅', weaponId: 'W18', family: '鸡肉', artGroup: 'mine' },
  { test: /鸡米花|popcorn/, id: 'popcorn-chicken', label: '鸡米花', weaponId: 'W19', family: '鸡肉', artGroup: 'mine' },
  { test: /鸡柳/, id: 'chicken-tenders', label: '鸡柳', weaponId: 'W20', family: '鸡肉', artGroup: 'mine' },
  // 饮品（压力、光束与控场家族，W21-W28）
  { test: /雪碧/, id: 'sprite', label: '雪碧', weaponId: 'W22', family: '饮品', artGroup: 'cola' },
  { test: /芬达|汽水|苏打/, id: 'fanta', label: '芬达', weaponId: 'W23', family: '饮品', artGroup: 'cola' },
  { test: /可乐/, id: 'cola', label: '可口可乐', weaponId: 'W21', family: '饮品', artGroup: 'cola' },
  { test: /柠檬|冰茶|红茶|乌龙|绿茶|奶茶|茶/, id: 'ice-tea', label: '柠檬红茶', weaponId: 'W24', family: '饮品', artGroup: 'ice' },
  { test: /果汁|橙汁|芒果汁/, id: 'juice', label: '果汁', weaponId: 'W25', family: '饮品', artGroup: 'ice' },
  { test: /牛奶|豆奶|豆浆|纯奶|酸奶|奶/, id: 'milk', label: '牛奶', weaponId: 'W26', family: '饮品', artGroup: 'ice' },
  { test: /拿铁|奶铁|卡布奇诺/, id: 'latte', label: '冰拿铁', weaponId: 'W28', family: '饮品', artGroup: 'coffee' },
  { test: /浓缩|美式|咖啡/, id: 'espresso', label: '浓缩咖啡', weaponId: 'W27', family: '饮品', artGroup: 'coffee' },
  // 甜品（展开、附着与环绕家族，W29-W32）
  { test: /菠萝派|香芋派/, id: 'pineapple-pie', label: '菠萝派', weaponId: 'W30', family: '甜品', artGroup: 'heal' },
  { test: /苹果派|派/, id: 'apple-pie', label: '苹果派', weaponId: 'W29', family: '甜品', artGroup: 'heal' },
  { test: /麦旋风|旋风/, id: 'mcflurry', label: '麦旋风', weaponId: 'W31', family: '甜品', artGroup: 'heal' },
  { test: /圣代|新地/, id: 'sundae', label: '圣代', weaponId: 'W32', family: '甜品', artGroup: 'heal' },
  { test: /甜筒|圆筒|冰淇淋/, id: 'cone', label: '甜筒', weaponId: 'W32', family: '甜品', artGroup: 'shield' },
];

/** 未收录餐品的显式兜底：按类别落通用改装，标注「通用」，绝不冒领独立身份。 */
export function identityFor(name: string, category: Product['category']): FoodIdentity {
  const trimmed = name.trim();
  for (const rule of RULES) {
    if (rule.test.test(trimmed)) {
      return { id: rule.id, label: rule.label, weaponId: rule.weaponId, family: rule.family, artGroup: rule.artGroup };
    }
  }
  if (category === 'drink') {
    return { id: 'generic-drink', label: '未收录饮品', weaponId: 'generic-rear', family: '通用', artGroup: 'cola' };
  }
  if (category === 'side') {
    return { id: 'generic-side', label: '未收录配餐', weaponId: 'generic-front', family: '通用', artGroup: 'fries' };
  }
  return { id: 'generic-main', label: '未收录主食', weaponId: 'generic-front', family: '通用', artGroup: 'burger' };
}

/** 旧存档迁移用：没有类别信息的名字，按名称匹配、兜底按主食处理。 */
export function identityForName(name: string): FoodIdentity {
  return identityFor(name, 'main');
}

/** 展示资源表（§4.3）：商品图与弹丸图由身份/目录解析，机制层不依赖贴图。 */
export function resolveArt(weaponId: string, productName: string): string {
  const def = weaponById(weaponId);
  if (def.artKey) return def.artKey;
  return variantKeyFor(identityForName(productName).artGroup as never, productName);
}
