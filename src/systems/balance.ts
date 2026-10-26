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
 * 曲线（同名升级按当前等级 ×1.8/2.8/4.2/6 放大，升满一件约 15.8 倍基础价）、
 * 递增的维修费和重投菜单挤压——每次进站只够办一两件大事。
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
 * 敌人血量倍率：×(1 + 0.10·(波-1))。第 1 波 1.00 → 第 20 波 2.90。
 * 武器系统重构后火力池更强调身份与取舍（数值节奏见 WEAPON_SYSTEM_REDESIGN §9.4），
 * 斜率与玩家成长曲线同步放缓。
 */
export function enemyHpScale(wave: number): number { return 1 + (wave - 1) * 0.085; }

/** 碰撞基础伤害：路锥 5 / 购物车与骑手 9 / Boss 14，随波升到约 ×1.86（第 20 波）。 */
const CONTACT_BASE = [5, 9, 9, 14] as const;
export function contactDamage(kind: number, wave: number): number {
  return Math.round(CONTACT_BASE[kind] * (1 + (wave - 1) * 0.045));
}

/** 常规波前方路障间隔：1.30s → 0.62s（约第 14 波触底）。武器系统重构后
 *  原型期火力池没有旧版的全场清场工具，刷怪坡度随之放缓（§9.4 校准）。 */
export function hazardInterval(wave: number): number { return Math.max(0.68, 1.35 - wave * 0.055); }
/** 常规波追兵包间隔（开场 15 秒后）：4.45s → 3.4s。 */
export function pursuitInterval(wave: number): number { return Math.max(3.4, 4.6 - wave * 0.15); }
/** 追兵包规模：第 1-4 波 2 骑（教学期），第 5 波起 3 骑，10 波起 4 骑封顶。 */
export function pursuitPack(wave: number): number { return Math.min(4, 2 + Math.floor(wave / 5)); }

/** Boss 档位参数：血量 1050 → 5250，行为逐档更凶（武器重构后前炮对滑行
 *  Boss 的有效命中率校准，档位曲线同步放缓）。 */
export function bossHpScale(tier: number): number { return [1, 2.1, 3.3, 5.0][Math.max(0, Math.min(3, tier - 1))]; }
/** Boss 波中路障间隔：2.1s → 1.2s。 */
export function bossHazardInterval(tier: number): number { return Math.max(0.9, 2.1 - (tier - 1) * 0.3); }
/** Boss 波中追兵包间隔：8.5s → 4.0s。 */
export function bossPursuitInterval(tier: number): number { return Math.max(3.6, 8.5 - (tier - 1) * 1.5); }
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
 * 重投菜单：基础价随波次上涨，同一站每再投一次再加 2。
 * 第 1 波 3/5/7/9，第 20 波 12/14/16/18；收入随敌人密度增长，
 * 因此重投在中后期仍可负担，但连续重投是明确的额外支出。
 */
export function rerollCost(wave: number, used = 0): number {
  return 2 + Math.ceil(wave / 2) + Math.max(0, used) * 2;
}

/**
 * 升阶定价：同名升级按当前等级放大基础价 —— 新购 ×1，之后 ×1.8/2.8/4.2/6。
 * 一件武器从 Lv1 升到 Lv5 共需约 15.8 倍基础价；Lv4/Lv5 的高溢价是后期
 * 的主要金钱去向，让「升满一件」和「多买两件」始终是二选一。
 */
export const UPGRADE_COST = [1, 1.8, 2.8, 4.2, 6] as const;
export function upgradeCostMultiplier(level: number): number {
  return UPGRADE_COST[Math.max(0, Math.min(UPGRADE_COST.length - 1, level))];
}

/** 酱料奖励波（§7.1）：第 2 波结束首次三选一，之后 5/10/15 波 Boss 后各一次；最多 4 包。 */
export const SAUCE_REWARD_WAVES = [2, 5, 10, 15] as const;

/** 车辆模块定价（§8/§9.1）：独立游戏改装服务，单独列示，不动真实餐品报价。 */
export const MODULE_PRICES: Record<string, number> = { 'M-drift': 26, 'M-bumper': 30, 'M-pump': 22 };

/** 改装服务升阶基价（§6 兜底）：无对应餐品材料时，按当前等级 × 升阶倍率计价。 */
export const SERVICE_UPGRADE_BASE = 14;

/** 替换抵扣（§9.2）：按旧武器累计实际金币投入的 50% 抵扣新装，不可套现。 */
export const REPLACE_CREDIT = 0.5;

/** 免费基础前炮安装（§4.2）：仅第一站提供，明确标为游戏服务。 */
export const FREE_FRONT_WAVE = 1;
