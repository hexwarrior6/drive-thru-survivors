/**
 * 酱料包（§7）：从「通用加成」收敛为有边界的规则组合。
 *
 * 首版八种方向中先实现四种（§7.2）：甜酸 / 番茄 / 辣椒 / 奶油咖啡。
 * 每种酱料只改写兼容攻击的一部分规则，并在卡片上列出受影响装备：
 * - 甜酸酱：有反弹能力的弹丸撞路沿折向新路径；导弹、火带和光束不弹墙。
 * - 番茄酱：直接命中产生小范围溅射；不再触发分裂或新一轮溅射。
 * - 辣椒酱：直接命中附着灼烧；原生尾焰只获得有限的持续时间强化，不叠双份灼烧。
 * - 奶油咖啡酱：完成有效漂移后获得短射速窗口（有冷却），不是全局永久攻速。
 *
 * 随机规则（§7.1）：新局生成独立 runSeed，候选由种子、奖励波号与已持有内容
 * 共同决定；同一存档恢复不重抽。第 2 波结束首次三选一，5/10/15 波 Boss 后
 * 各一次，最多 4 包；第 20 波直接结算。
 */

export type SauceKey = 'sweetSour' | 'ketchup' | 'chili' | 'crema';

export interface SauceDef {
  key: SauceKey;
  /** 中文小名（奖励卡与酱料架）。 */
  label: string;
  /** 效果一句话。 */
  effect: string;
  /** 边界与代价（卡片第三行）。 */
  bound: string;
  /** 受影响装备（卡片列出，§7.1）。 */
  targets: string;
  /** 包装主色。 */
  tint: number;
}

/** 数值中枢：所有酱料强度常量集中在此，测试逐项锁定。 */
export const SAUCE = {
  wallLife: 1.5,
  wallBound: 150,
  splashRadius: 80,
  splashShare: 0.45,
  burnSeconds: 3,
  burnRate: 0.22,
  /** 原生灼烧来源（尾焰火带）在辣椒酱下的持续时间强化倍率，不是第二份灼烧。 */
  nativeBurnBoost: 1.25,
  /** 奶油咖啡酱：有效漂移后的射速窗口与冷却。 */
  driftWindow: 3,
  driftRate: 0.8,
  driftCooldown: 8,
  /** 跳过酱料时的安慰金币。 */
  skipGold: 15,
} as const;

export const SAUCES: readonly SauceDef[] = [
  {
    key: 'sweetSour', label: '甜酸酱', tint: 0xff8c42,
    effect: `弹墙 · 弹丸撞路沿反弹折向新路径，存活时间×${SAUCE.wallLife}`,
    bound: '仅指定弹道兼容；导弹、火带和光束不弹墙',
    targets: '扭扭薯回旋刃 · 通用改装·前炮 · 初始散弹炮',
  },
  {
    key: 'ketchup', label: '番茄酱', tint: 0xc23a2e,
    effect: `爆破 · 直接命中点 ${SAUCE.splashRadius}px 范围溅射 ${Math.round(SAUCE.splashShare * 100)}% 伤害`,
    bound: '不再触发分裂或新一轮溅射；空炮仍然空',
    targets: '全部弹丸武器（贯穿炮 · 回旋刃 · 散弹 · 直射）',
  },
  {
    key: 'chili', label: '辣椒酱', tint: 0xd9553f,
    effect: `灼烧 · 直接命中附着 ${SAUCE.burnSeconds}s、每秒 ${Math.round(SAUCE.burnRate * 100)}% 命中伤害`,
    bound: '原生尾焰只获得有限的持续时间强化，不叠第二份灼烧',
    targets: '全部直接命中武器 · 板烧炙烤尾焰（时长强化）',
  },
  {
    key: 'crema', label: '奶油咖啡酱', tint: 0xc9a77c,
    effect: `疾射 · 完成有效漂移后 ${SAUCE.driftWindow}s 内射击间隔×${SAUCE.driftRate}`,
    bound: `有 ${SAUCE.driftCooldown}s 冷却；不是全局永久攻速`,
    targets: '全部武器（含尾喷与散弹）',
  },
];

const KEYS = SAUCES.map(s => s.key);
/** 每包一位的位掩码；bullet.traits 与 combat.sauceBits 共用这一编码。 */
export const SAUCE_BITS: Readonly<Record<SauceKey, number>> = (() => {
  const bits = {} as Record<SauceKey, number>;
  KEYS.forEach((key, i) => { bits[key] = 1 << i; });
  return bits;
})();

export function hasSauce(bits: number, key: SauceKey): boolean {
  return (bits & SAUCE_BITS[key]) !== 0;
}

/** Owned packets in registry order. */
export function ownedSauceKeys(bits: number): SauceKey[] {
  const keys: SauceKey[] = [];
  for (const sauce of SAUCES) if (hasSauce(bits, sauce.key)) keys.push(sauce.key);
  return keys;
}

/** FNV-1a；作用域独立，避免 data↔combat 相互依赖。 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * 一次奖励的三个候选（§7.1）：由 runSeed、奖励波号与已持有集合确定。
 * 同一局 + 同一波 + 同一持有状态必然得到同一组候选，存档恢复后无需持久化候选。
 * 「至少一项对当前装备实际有效」：甜酸酱只对有弹墙兼容弹道的构筑有效，
 * 无效候选排到有效候选之后；兼容池为空时仍按余量返回（回退保证不空手）。
 */
export function sauceOffersFor(seed: number, wave: number, ownedBits: number, wallCapable: boolean): SauceKey[] {
  const pool = KEYS.filter(key => !hasSauce(ownedBits, key));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = hash(`${seed}:${wave}:${i}:${pool[i]}`) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // 稳定分区：有效的在前，保留洗牌后的相对顺序。
  const valid: SauceKey[] = [];
  const waiting: SauceKey[] = [];
  for (const key of pool) (key === 'sweetSour' && !wallCapable ? waiting : valid).push(key);
  return valid.concat(waiting).slice(0, 3);
}

export function sauceByKey(key: string): SauceDef | undefined {
  return SAUCES.find(s => s.key === key);
}

/** 酱料包矢量绘制：与食物变体同一套暖色卡通规范。 */
export function drawSaucePacket(ctx: CanvasRenderingContext2D, tint: number): void {
  const hex = `#${tint.toString(16).padStart(6, '0')}`;
  const w = 36;
  ctx.beginPath();
  ctx.roundRect(5, 3, 26, 8, 2);
  ctx.fillStyle = hex; ctx.fill();
  ctx.lineWidth = 1.6; ctx.strokeStyle = '#754329'; ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(4, 9, 28, 34, 7);
  ctx.fillStyle = hex; ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(4, 30, 28, 13, 7);
  ctx.fillStyle = 'rgba(60, 30, 10, 0.18)'; ctx.fill();
  ctx.beginPath();
  ctx.roundRect(7, 12, 9, 14, 4);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w / 2 + 3, 27, 8, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fff5e0'; ctx.fill();
  ctx.lineWidth = 1.2; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w / 2 + 3, 21);
  ctx.quadraticCurveTo(w / 2 + 7, 27, w / 2 + 3, 30);
  ctx.quadraticCurveTo(w / 2 - 1, 27, w / 2 + 3, 21);
  ctx.fillStyle = hex; ctx.fill();
}

/** 酱料包 dataURL 快照（Boot 后填充；未填充时 DOM 回落到色块）。 */
export const SAUCE_DATA_URLS: Record<string, string> = {};

/** Boot 阶段烘焙全部酱料包；node 测试不调用。 */
export function bakeSauceArt(): void {
  const scale = 3;
  for (const sauce of SAUCES) {
    const canvas = document.createElement('canvas');
    canvas.width = 36 * scale; canvas.height = 46 * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    drawSaucePacket(ctx, sauce.tint);
    SAUCE_DATA_URLS[sauce.key] = canvas.toDataURL();
  }
}
