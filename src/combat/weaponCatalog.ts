/**
 * 武器统一规则表：具体餐品 = 独立武器，食品品类 = 武器家族。
 *
 * 结构（对应 docs/WEAPON_SYSTEM_REDESIGN.md §4.3/§12.1）：
 * - 稳定战斗 ID（W01…W32）：升级、存档、酱料兼容都不依赖贴图 key 或商品名哈希。
 * - 目录先落全 32 件的「身份承诺」（家族/挂载/一句话机制），`ready: false` 的条目
 *   是显式待映射名单：任何商品都不允许假装它们已经实现，未就绪者一律走
 *   「通用改装」占位（generic-front / generic-rear），不计入独立武器数量。
 * - 首阶段（文档 §13 第一阶段）ready 的战斗武器为三件技术原型：
 *   W01 巨堡贯穿炮 / W12 扭扭薯回旋刃 / W07 板烧炙烤尾焰，
 *   另有可替换初始后槽散弹（scatter）、免费基础前炮（service-front）与通用改装。
 * - Lv.3 的互斥分支二选一（branches），Lv.4/5 只强化所选分支。
 * - 数值尚未平衡定稿：先用道路单位与固定步长校准，测试锁定关键档位。
 */
import type { StatIcon } from '../ui/icons';

export type Mount = 'front' | 'rear' | 'module';
export type WeaponFamily = '炮械' | '薯类' | '鸡肉' | '饮品' | '甜品' | '通用' | '服务';
export type Behavior = 'scatter' | 'pierce' | 'boomerang' | 'exhaust' | 'straight' | 'spray';
export type BranchId = 'a' | 'b';

export interface BranchDef {
  id: BranchId;
  name: string;
  /** Lv.3 选择时的说明；Lv.4/5 的强化并入 blurb 尾注。 */
  note: string;
}

export interface WeaponDef {
  id: string;
  name: string;
  family: WeaponFamily;
  mount: Mount;
  /** 目录承诺就绪 = 有可玩的独立攻击行为；false = 待映射，不出售为专属武器。 */
  ready: boolean;
  behavior: Behavior;
  /** 卡片第二行：一句行为与弱点（§9.3）。 */
  blurb: string;
  /** 逐级数值（索引 = 等级-1）；待映射条目留空数组。 */
  damage: readonly number[];
  interval: readonly number[];
  range: readonly number[];
  count: readonly number[];
  speed: number;
  pierce: readonly number[];
  branches?: readonly [BranchDef, BranchDef];
  /** 甜酸酱弹墙兼容边界：仅指定弹道（§7.2）。导弹、火带和光束不弹墙。 */
  wall?: boolean;
  /** 专属武器的固定弹幕/卡片贴图 key；通用改装按商品名走身份美术分组。 */
  artKey?: string;
}

export const MOUNT_NAMES: Record<Mount, string> = { front: '前武器', rear: '后武器', module: '车辆模块' };

export const WEAPONS: readonly WeaponDef[] = [
  // ---- A. 汉堡／早餐主食：炮械家族（10 件） ----
  {
    id: 'W01', name: '巨堡贯穿炮', family: '炮械', mount: 'front', ready: true, behavior: 'pierce',
    blurb: '重弹沿窄线贯穿，越穿越弱；横移目标容易躲开，空炮恢复慢。',
    damage: [55, 75, 100, 130, 170], interval: [1.5, 1.4, 1.3, 1.25, 1.2],
    range: [1250, 1250, 1250, 1250, 1250], count: [1, 1, 1, 1, 1], speed: 1050, pierce: [2, 2, 3, 3, 4], artKey: 'food-burger-double',
    branches: [
      { id: 'a', name: '压路重炮', note: '贯穿 +2 · 每穿一名保留更多伤害 · 间隔更长' },
      { id: 'b', name: '夹心破甲', note: '贯穿降至 1 · 连续命中同一目标施加破甲，全武器增伤' },
    ],
  },
  { id: 'W02', name: '双联交错炮', family: '炮械', mount: 'front', ready: false, behavior: 'straight', blurb: '左右炮管交替开火，连续两发打中同一敌人触发夹击。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W03', name: '熔酪黏弹炮', family: '炮械', mount: 'front', ready: false, behavior: 'straight', blurb: '炮弹黏附目标，持续集火达标后剥落爆片。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W04', name: '鱼跃跳弹炮', family: '炮械', mount: 'front', ready: false, behavior: 'straight', blurb: '第一目标受击后弹向侧方新目标，逐跳衰减。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W05', name: '鸡排霰弹炮', family: '炮械', mount: 'front', ready: false, behavior: 'straight', blurb: '近距宽扇爆发，距离增加后弹丸快速消散。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W06', name: '麦辣标记火箭炮', family: '炮械', mount: 'front', ready: false, behavior: 'straight', blurb: '稳定走线完成锁定后齐射有限转向火箭。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W07', name: '板烧炙烤尾焰', family: '炮械', mount: 'rear', ready: true, behavior: 'exhaust',
    blurb: '近距尾喷并沿车尾留短火带；直线冲刺会拉断输出，远距低效。',
    damage: [8, 12, 18, 26, 36], interval: [0.25, 0.25, 0.25, 0.25, 0.25],
    range: [90, 130, 170, 210, 250], count: [1, 1, 1, 1, 1], speed: 0, pierce: [1, 1, 1, 1, 1], artKey: 'food-flame-grill',
    branches: [
      { id: 'a', name: '长燃火带', note: '火带更久更连贯 · 直喷伤害降低' },
      { id: 'b', name: '过热喷口', note: '短时贴近爆发 · 随后强制冷却' },
    ],
  },
  { id: 'W08', name: '培根蓄能轨道炮', family: '炮械', mount: 'front', ready: false, behavior: 'straight', blurb: '自动蓄能后瞬时线击，开火前显示细瞄线。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W09', name: '安格斯重迫击炮', family: '炮械', mount: 'front', ready: false, behavior: 'straight', blurb: '向前方预测点抛射，延迟落地形成范围爆炸。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W10', name: '松饼弹跳轰击炮', family: '炮械', mount: 'front', ready: false, behavior: 'straight', blurb: '厚圆弹沿地有限跳跃，每次落地形成局部震荡。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  // ---- B. 薯类：齐射、回旋与切割家族（6 件） ----
  { id: 'W11', name: '薯条排射枪', family: '薯类', mount: 'front', ready: false, behavior: 'straight', blurb: '多根平行细弹逐排推进，以短连射形成前向覆盖。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W12', name: '扭扭薯回旋刃', family: '薯类', mount: 'front', ready: true, behavior: 'boomerang',
    blurb: '弧形出击后折返车身，去回两程各可命中一次；直线赶路接不到回程。',
    damage: [20, 26, 34, 44, 56], interval: [1.7, 1.6, 1.5, 1.45, 1.4],
    range: [620, 640, 660, 680, 700], count: [1, 2, 2, 3, 3], speed: 850, pierce: [1, 1, 1, 1, 1], artKey: 'food-fries-curly',
    wall: true,
    branches: [
      { id: 'a', name: '宽弧收割', note: '弧距扩大擅长侧向敌群 · 单体直击降低' },
      { id: 'b', name: '回手连斩', note: '连续接回逐层缩短下一轮 · 漏接则无收益' },
    ],
  },
  { id: 'W13', name: '薯饼后置圆锯', family: '薯类', mount: 'rear', ready: false, behavior: 'spray', blurb: '后侧释放缓慢旋转的锯盘，接触持续切割后消失。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W14', name: '薯格封路栅', family: '薯类', mount: 'rear', ready: false, behavior: 'spray', blurb: '在身后横铺带孔短栅栏，拦截穿越敌人后破碎。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W15', name: '薯角钻头弹', family: '薯类', mount: 'front', ready: false, behavior: 'straight', blurb: '楔形弹命中后短暂钻入同一目标，削减其护甲。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W16', name: '旋风薯侧扇', family: '薯类', mount: 'rear', ready: false, behavior: 'spray', blurb: '后侧左右交替甩出弧形扇面，漂移时允许双侧合击。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  // ---- C. 鸡肉小食：爆破与布置家族（4 件） ----
  { id: 'W17', name: '麦乐鸡雷阵', family: '鸡肉', mount: 'rear', ready: false, behavior: 'spray', blurb: '沿行驶路线留下接触雷，先布路径再引追兵踩入。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W18', name: '翼形集束炸弹', family: '鸡肉', mount: 'front', ready: false, behavior: 'straight', blurb: '向前抛出母弹，落地后向两侧散出有限子炸弹。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W19', name: '爆米鸡弹幕盒', family: '鸡肉', mount: 'rear', ready: false, behavior: 'spray', blurb: '向后短时喷出弹丸云，让追兵穿过弹云。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W20', name: '鸡柳双索切割器', family: '鸡肉', mount: 'rear', ready: false, behavior: 'spray', blurb: '两个后侧锚点拉出短暂切割线，转向改变夹角。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  // ---- D. 饮品：压力、光束与控场家族（8 件） ----
  { id: 'W21', name: '可乐高压脉冲炮', family: '饮品', mount: 'rear', ready: false, behavior: 'spray', blurb: '车周周期性压力环推敌，撞向其他敌人造成碰撞伤害。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W22', name: '雪碧贯流喷枪', family: '饮品', mount: 'front', ready: false, behavior: 'straight', blurb: '前方窄束持续水流，沿同一方向推移目标。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W23', name: '芬达爆泡发射器', family: '饮品', mount: 'front', ready: false, behavior: 'straight', blurb: '发射慢速漂浮泡，敌人进入后延迟爆裂。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W24', name: '冰茶锁冻器', family: '饮品', mount: 'rear', ready: false, behavior: 'spray', blurb: '后侧单体寒意累积，完整冻结后可安全窗口撞碎。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W25', name: '果汁扩散波', family: '饮品', mount: 'rear', ready: false, behavior: 'spray', blurb: '车后逐渐扩大的低伤缓速波，波前命中收益更高。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W26', name: '牛奶凝霜墙', family: '饮品', mount: 'rear', ready: false, behavior: 'spray', blurb: '后方生成短暂霜墙，阻挡次数耗尽后碎成近距冰片。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W27', name: '浓缩过热激光', family: '饮品', mount: 'front', ready: false, behavior: 'straight', blurb: '连续照射同一目标提升热度，过热后强制冷却。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W28', name: '拿铁涡流炮', family: '饮品', mount: 'rear', ready: false, behavior: 'spray', blurb: '后方先形成短暂聚拢涡流，再向外释放脉冲。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  // ---- E. 甜品：展开、附着与环绕家族（4 件） ----
  { id: 'W29', name: '苹果派折叠弹匣', family: '甜品', mount: 'rear', ready: false, behavior: 'spray', blurb: '身后投下派盒，定时展开向两侧各射一扇弹片。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W30', name: '菠萝熔心弹', family: '甜品', mount: 'front', ready: false, behavior: 'straight', blurb: '前弹击中后使目标沿自身轨迹留下酸浆伤害带。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W31', name: '麦旋风螺旋刃', family: '甜品', mount: 'rear', ready: false, behavior: 'spray', blurb: '车后螺旋刃逐圈外扩后回收，按节奏调整交战距离。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },
  { id: 'W32', name: '圣代叠层光柱', family: '甜品', mount: 'front', ready: false, behavior: 'straight', blurb: '前方自动点射光柱，连续命中同一目标逐层扩宽。', damage: [], interval: [], range: [], count: [], speed: 0, pierce: [] },

  // ---- 非目录装备：初始散弹 / 游戏服务 / 通用改装（不计入 32 件） ----
  {
    id: 'scatter', name: '初始散弹炮', family: '服务', mount: 'rear', ready: true, behavior: 'scatter',
    blurb: '后向索敌 · 三发散弹；近距多弹命中，可被任意后武器替换。',
    damage: [12, 12, 12, 12, 12], interval: [0.38, 0.38, 0.38, 0.38, 0.38],
    range: [360, 360, 360, 360, 360], count: [3, 3, 3, 3, 3], speed: 800, pierce: [1, 1, 1, 1, 1], wall: true, artKey: 'food-starter',
  },
  {
    id: 'service-front', name: '基础前炮', family: '服务', mount: 'front', ready: true, behavior: 'straight',
    blurb: '游戏服务 · 统一初始补全的前向火力；不是任何餐品的专属武器，可用改装服务升阶。',
    damage: [30, 40, 52, 66, 82], interval: [1.1, 1.05, 1.0, 0.95, 0.9],
    range: [900, 900, 900, 900, 900], count: [1, 1, 1, 1, 1], speed: 900, pierce: [1, 1, 1, 1, 1], wall: true, artKey: 'food-starter',
  },
  {
    id: 'generic-front', name: '通用改装·前炮', family: '通用', mount: 'front', ready: true, behavior: 'straight',
    blurb: '通用改装：该餐品的专属武器尚未实装，先以基础直射炮占位。',
    damage: [26, 34, 44, 56, 70], interval: [1, 0.95, 0.9, 0.85, 0.8],
    range: [900, 900, 900, 900, 900], count: [1, 1, 1, 1, 1], speed: 900, pierce: [1, 1, 1, 1, 1], wall: true,
  },
  {
    id: 'generic-rear', name: '通用改装·尾喷', family: '通用', mount: 'rear', ready: true, behavior: 'spray',
    blurb: '通用改装：该餐品的专属武器尚未实装，先以后方尾喷占位。',
    damage: [9, 13, 18, 24, 31], interval: [0.25, 0.25, 0.25, 0.25, 0.25],
    range: [110, 140, 170, 200, 230], count: [1, 1, 1, 1, 1], speed: 0, pierce: [1, 1, 1, 1, 1],
  },
];

const BY_ID = new Map<string, WeaponDef>();
for (const def of WEAPONS) BY_ID.set(def.id, def);

export function weaponById(id: string): WeaponDef {
  return BY_ID.get(id) ?? BY_ID.get('generic-front')!;
}

/** 目录里 ready 的战斗武器（不含散弹/服务/通用占位）。 */
export function catalogWeapons(): WeaponDef[] {
  return WEAPONS.filter(w => w.ready && w.family !== '服务' && w.family !== '通用');
}

// ---- 车辆模块（§8）：独立游戏改装服务，机械名称，不占餐品武器数量。 ----

export interface ModuleDef {
  id: string;
  name: string;
  /** 卡片行为与取舍说明。 */
  note: string;
}

export const MODULES: readonly ModuleDef[] = [
  {
    id: 'M-drift', name: '漂移增压器',
    note: '完成有效漂移（蓝焰以上）后，接下来一轮攻击伤害 ×1.5，最多存 3 层；轻点不触发。',
  },
  {
    id: 'M-bumper', name: '应急保险杠',
    note: '持续安全驾驶 10s 积一层护盾（上限 2）；碎盾后 1.5s 内受伤减半，只作脱身窗口。',
  },
  {
    id: 'M-pump', name: '车载维修泵',
    note: '持续 5s 无碰撞驾驶后缓慢回复车况；换来的续航挤占进攻模块的位置。',
  },
];

const MODULE_BY_ID = new Map<string, ModuleDef>();
for (const m of MODULES) MODULE_BY_ID.set(m.id, m);
export function moduleById(id: string): ModuleDef | undefined { return MODULE_BY_ID.get(id); }

// ---- 卡片数值行（§9.3 第 5 层可展开明细；DOM 侧调用，允许小对象） ----

export interface StatLine { icon: StatIcon; text: string }
const line = (icon: StatIcon, text: string): StatLine => ({ icon, text });

/** 尾焰火带参数：与 WeaponSystem.step 的实现共用同一份档位。 */
export const EXHAUST_TRAIL = {
  dps: [12, 17, 25, 36, 50],
  life: [2, 2.4, 2.8, 3.2, 3.6],
  longLife: 1.7,
} as const;

/** 逐级行为与分支后的数值行；卡片、图鉴与实际开火读取同一份定义。 */
export function weaponStats(id: string, level: number, branch?: BranchId): StatLine[] {
  const def = weaponById(id);
  const l = Math.max(0, Math.min(4, level - 1));
  if (!def.ready || !def.damage.length) return [line('up', '专属武器待实装 · 暂以通用改装占位')];
  const dmg = Math.round(def.damage[l]);
  const branchLine = (b?: BranchDef) => (b ? [line('up', b.name)] : []);
  switch (def.behavior) {
    case 'scatter': return [
      line('burst', `${dmg} × 3 散弹`),
      line('pierce', '后向索敌 · 近距多弹'),
    ];
    case 'pierce': {
      const road = branch === 'a';
      const pierce = def.pierce[l] + (road && level >= 3 ? 2 : 0);
      return [
        line('burst', `${dmg} 重击`),
        line('clock', `${def.interval[l]}s/发`),
        line('pierce', `直排贯穿 ${pierce} 敌`),
        ...branchLine(level >= 3 ? def.branches?.find(b => b.id === branch) : undefined),
        ...(level >= 5 ? [line('boom', road ? '贯穿终点窄向冲击' : '破甲结束引爆碎片')] : []),
      ];
    }
    case 'boomerang': {
      const blades = Math.max(1, def.count[l] + (branch === 'a' && level >= 4 ? 1 : 0));
      return [
        line('burst', `${blades} 枚薯刃 × ${dmg}`),
        line('fan', '去回两程各可命中一次'),
        line('clock', `${def.interval[l]}s/轮`),
        ...branchLine(level >= 3 ? def.branches?.find(b => b.id === branch) : undefined),
      ];
    }
    case 'exhaust': {
      const trailLife = Math.round(EXHAUST_TRAIL.life[l] * (branch === 'a' && level >= 3 ? EXHAUST_TRAIL.longLife : 1) * 10) / 10;
      const direct = Math.round(dmg * (branch === 'a' && level >= 3 ? 0.7 : 1) * 100) / 100;
      return [
        line('flame', `${direct}/tick 尾喷`),
        line('fan', `后方 ${70 + l * 5}° · ${def.range[l]}px`),
        line('boom', `火带 ${trailLife}s · ${EXHAUST_TRAIL.dps[l]}/s`),
        ...branchLine(level >= 3 ? def.branches?.find(b => b.id === branch) : undefined),
      ];
    }
    case 'straight': return [
      line('burst', `${dmg} 直射`),
      line('clock', `${def.interval[l]}s/发`),
    ];
    case 'spray': return [
      line('flame', `${dmg}/tick 尾喷`),
      line('fan', `后方 ${def.range[l]}px`),
      ...(level >= 3 ? [line('flame', '灼烧')] : []),
    ];
  }
}
