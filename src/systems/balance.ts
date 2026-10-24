/**
 * 数值中枢：一局的结构、难度曲线与经济参数全部出自这里。
 *
 * 结构 —— 一局 4 轮 × 5 波 = 20 波。每轮第 5 波是 Boss 战，击破后照常进站
 * 补给并开启下一轮；第 4 个 Boss（第 20 波）击破后才算通关。
 *
 * 难度 —— 敌人血量按波线性放大（1 → ×3.28），碰撞伤害缓升（×1 → ×1.86），
 * 刷怪间隔与追兵包规模逐波收紧；Boss 按档位（1-4）抬血量、加撞击频率。
 * 玩家侧靠武器 5 级成长与槽位扩容对冲，曲线目标是：前两波轻松教学、
 * 中期开始吃构筑、末期容错归零但不至于必死。
 *
 * 经济 —— 击杀掉币面值不变，收入增长来自敌人密度（实测脚本局每波约
 * 45 → 250，Boss 波与终波是奖金高峰，全程约 3200-3900）；支出靠升阶定价
 * 曲线（同名升级按当前等级 ×1.8/2.8/4.2/6 放大，升满一件约 15.8 倍基础价）
 * 和递增的维修费挤压——每次进站只够办一两件大事。
 */

/** 每轮常规波数（含轮末 Boss 波）。 */
export const WAVES_PER_ROUND = 5;
/** 一局的轮数，即 Boss 战次数。 */
export const ROUNDS_PER_RUN = 4;
/** 一局总波数。 */
export const WAVES_PER_RUN = WAVES_PER_ROUND * ROUNDS_PER_RUN;
/** 武器等级上限；同名第 5 次购买后封顶。 */
export const MAX_WEAPON_LEVEL = 5;

export function roundOf(wave: number): number { return Math.floor((wave - 1) / WAVES_PER_ROUND) + 1; }
export function isBossWave(wave: number): boolean { return wave % WAVES_PER_ROUND === 0; }
export function bossTierOf(wave: number): number { return roundOf(wave); }
/** 四档 Boss 的名字，供 HUD 与结算文案使用（档位 1-4）。 */
export const BOSS_NAMES = ['霸王皮卡', '双挂霸王', '狂暴车队长', '终极麦霸王'] as const;
export function bossName(tier: number): string { return BOSS_NAMES[Math.max(0, Math.min(BOSS_NAMES.length - 1, tier - 1))]; }

/**
 * 常规波时长：42s 起步，每波 +2s，50s 封顶。16 个常规波总时长约 12 分钟，
 * 加上 4 场 Boss 与进站补给，一局约 18-22 分钟。
 */
export function waveDuration(wave: number): number { return Math.min(50, 42 + (wave - 1) * 2); }

/**
 * 敌人血量倍率：×(1 + 0.12·(波-1))。第 1 波 1.00 → 第 20 波 3.28，
 * 与玩家武器 5 级成长（单武器 DPS 约 ×3-4）保持同一量级。
 */
export function enemyHpScale(wave: number): number { return 1 + (wave - 1) * 0.12; }

/** 碰撞基础伤害：路锥 5 / 购物车与骑手 9 / Boss 14，随波升到约 ×2.05（第 20 波）。 */
const CONTACT_BASE = [5, 9, 9, 14] as const;
export function contactDamage(kind: number, wave: number): number {
  return Math.round(CONTACT_BASE[kind] * (1 + (wave - 1) * 0.055));
}

/** 常规波前方路障间隔：1.29s → 0.55s（约第 14 波触底）。 */
export function hazardInterval(wave: number): number { return Math.max(0.55, 1.35 - wave * 0.06); }
/** 常规波追兵包间隔（开场 15 秒后）：4.22s → 3.0s。 */
export function pursuitInterval(wave: number): number { return Math.max(3.0, 4.4 - wave * 0.18); }
/** 追兵包规模：第 1-3 波 2 骑（教学期），第 4 波起 3 骑，8 波起 4 骑封顶。 */
export function pursuitPack(wave: number): number { return Math.min(4, 2 + Math.floor(wave / 4)); }

/** Boss 档位参数：血量 1050 → 6090，行为逐档更凶。 */
export function bossHpScale(tier: number): number { return [1, 2.2, 3.6, 5.8][Math.max(0, Math.min(3, tier - 1))]; }
/** Boss 波中路障间隔：2.1s → 1.2s。 */
export function bossHazardInterval(tier: number): number { return Math.max(0.9, 2.1 - (tier - 1) * 0.3); }
/** Boss 波中追兵包间隔：8.5s → 4.0s。 */
export function bossPursuitInterval(tier: number): number { return Math.max(3.4, 8.5 - (tier - 1) * 1.5); }
/** Boss 波中追兵包规模：2 → 5 骑。 */
export function bossPursuitPack(tier: number): number { return 1 + tier; }
/** 侧撞预警时长：0.9s → 0.6s，档位越高反应窗口越短。 */
export function bossTelegraph(tier: number): number { return 0.9 - (tier - 1) * 0.1; }
/** 侧撞横移速度上限：640 → 880。 */
export function bossSlamSpeed(tier: number): number { return 640 + (tier - 1) * 80; }
/** 巡航休整时长倍率：×1 → ×0.61，撞击更频繁。 */
export function bossCruiseRest(tier: number): number { return 3.2 * (1 - (tier - 1) * 0.13); }
/** 侧撞后硬直：1.5s → 0.9s。 */
export function bossRecover(tier: number): number { return 1.5 * (1 - (tier - 1) * 0.15); }
/** 投掷路障间隔：4.6s → 3.2s。 */
export function bossThrowInterval(tier: number): number { return 4.6 * (1 - (tier - 1) * 0.12); }
/** 每次投掷的路障数：前两档 1 个，后两档对车道双侧各 1 个。 */
export function bossCones(tier: number): number { return tier >= 3 ? 2 : 1; }

/** Boss 击破庆祝金币总额：70 / 100 / 130 / 160。 */
export function bossReward(tier: number): number { return 40 + tier * 30; }
/** 庆祝撒币枚数：28 / 34 / 40 / 46。 */
export function bossBurstCount(tier: number): number { return 22 + tier * 6; }

/**
 * 经济：进站奖励 = 8 + 波次（9 → 28），保证空手波也有底薪；
 * 维修 = 10 + 3×(波-1)（10 → 67），每次回复 30 车况，后期被撞两次就值得维修。
 */
export function pitArrivalBonus(wave: number): number { return 8 + wave; }
export function repairCost(wave: number): number { return 10 + (wave - 1) * 3; }

/**
 * 升阶定价：同名升级按当前等级放大基础价 —— 新购 ×1，之后 ×1.8/2.8/4.2/6。
 * 一件武器从 Lv1 升到 Lv5 共需约 15.8 倍基础价；Lv4/Lv5 的高溢价是后期
 * 的主要金钱去向，让「升满一件」和「多买两件」始终是二选一。
 */
export const UPGRADE_COST = [1, 1.8, 2.8, 4.2, 6] as const;
export function upgradeCostMultiplier(level: number): number {
  return UPGRADE_COST[Math.max(0, Math.min(UPGRADE_COST.length - 1, level))];
}
