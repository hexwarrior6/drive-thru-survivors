import { BASE_SPEED } from '../config';
import { bossCones, bossCruiseRest, bossHpScale, bossRecover, bossSlamSpeed, bossTelegraph, bossThrowInterval, contactDamage } from '../systems/balance';
import { SAUCE, SAUCE_BITS, hasSauce, ownedSauceKeys, type SauceKey } from './sauces';
import type { DriftPhysics } from '../systems/DriftPhysics';
import { ObjectPool } from '../utils/ObjectPool';

export const ENEMY_HP = [24, 55, 80] as const;
export const ENEMY_RADIUS = [16, 21, 18, 52] as const;
export const BOSS_HP = 1050;
export const WEAPON_RANGE = 360;
export const PELLET_DAMAGE = 12;
export const PELLET_SPREAD = 0.24;
export const MAGNET_RANGE = 80;
/** 贯穿炮伤害保留率：普通每穿一名 ×0.7，压路分支 ×0.85。 */
export const PIERCE_RETAIN = 0.7;
export const PIERCE_RETAIN_ROAD = 0.85;
/** 破甲状态：破甲期间全武器对该目标伤害 ×ARMOR_BREAK_MULT。 */
export const ARMOR_BREAK_TIME = 2.5;
export const ARMOR_BREAK_MULT = 1.3;
/** Combo milestone rewards; index is the tier reached (1 per threshold crossing). */
const COMBO_TIERS = [10, 20, 35, 50, 75] as const;
const COMBO_BONUS = [0, 1, 2, 3, 5, 8] as const;
/** Coin value per kind: cones 1, carts 2, riders 2, tyrant 4. Riders are the volume farm. */
const COIN_VALUE = [1, 2, 2, 4] as const;
const GRID_COLUMNS = 10, GRID_ROWS = 36, CELL = 80, GRID_MIN_X = -400;
/** Riders tail the car from this distance behind its center, just outside the near-miss alarm. */
const RIDER_GAP = 100;
export interface Enemy {
  active: boolean; slot: number; kind: number; x: number; z: number; px: number; pz: number;
  hp: number; flash: number; contact: number; vx: number; vz: number; slow: number; slowTime: number; burn: number; burnDamage: number;
  /** 夹心破甲：剩余时长与连续命中计数（命中其他来源或破甲到期时清零）。 */
  armorBreak: number; armorHits: number;
  /** 双联交错炮的夹击窗口：窗口内再命中同一目标触发夹击加成。 */
  flankTime: number; flankStreak: number;
  /** 冰茶锁冻器的寒意累积（0-100）与解冻后的短暂控制抗性。 */
  chill: number; chillResist: number; frozen: boolean;
  /** 圆锯/螺旋刃等近身磨切的每目标命中冷却。 */
  grindCd: number;
  /** Boss state machine: 0 cruise, 1 telegraph, 2 slam dash, 3 recover. Riders reuse it: 0 hover, 1 lunge, 2 recover. */
  phase: number; timer: number; tx: number; throwCd: number;
}
export interface Bullet {
  active: boolean; slot: number; x: number; z: number; px: number; pz: number;
  vx: number; vz: number; life: number; damage: number; kind: number; level: number; pierce: number; targetSlot: number; hitMask: Uint8Array;
  /** 变体美术贴图 key；空串回落到按 kind 的默认弹幕贴图。 */
  tex: string;
  /** 发射时快照的酱料位掩码；辣椒/番茄只在弹丸命中路径上读取。 */
  traits: number;
  /** 发射时打包的武器元数据：bit0 分支a · bit1 分支b · bit2 Lv5 · bit3 甜酸弹墙兼容。 */
  meta: number;
  /** 回旋刃行程：0 去程 / 1 回程；回程清空 hitMask 重新记账（同敌每程各一次）。 */
  leg: number;
  /** 贯穿炮已穿透数（伤害衰减按 hits 递增）。 */
  hits: number;
  /** 形态相位计时（回旋折返触发）。 */
  age: number;
}
export interface Coin {
  active: boolean; slot: number; x: number; z: number; px: number; pz: number;
  vx: number; vz: number; life: number; value: number; magnet: boolean;
}
export interface Damage {
  active: boolean; slot: number; x: number; z: number; life: number; value: number;
}
export interface CombatEffects { explode(x: number, z: number, kind: number): void }
/** Simulation owns no Phaser objects. Every slot, free list and grid cell is allocated at startup. */
export class CombatSystem {
  readonly enemies = new ObjectPool<Enemy>(128, slot => ({ active: false, slot, kind: 0, x: 0, z: 0, px: 0, pz: 0, hp: 0, flash: 0, contact: 0, vx: 0, vz: 0, slow: 1, slowTime: 0, burn: 0, burnDamage: 0, armorBreak: 0, armorHits: 0, flankTime: 0, flankStreak: 0, chill: 0, chillResist: 0, frozen: false, grindCd: 0, phase: 0, timer: 0, tx: 0, throwCd: 0 }));
  readonly bullets = new ObjectPool<Bullet>(256, slot => ({ active: false, slot, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, life: 0, damage: PELLET_DAMAGE, kind: 0, level: 1, pierce: 1, targetSlot: -1, hitMask: new Uint8Array(128), tex: '', traits: 0, meta: 0, leg: 0, hits: 0, age: 0 }));
  readonly coins = new ObjectPool<Coin>(128, slot => ({ active: false, slot, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, life: 0, value: 0, magnet: false }));
  readonly damage = new ObjectPool<Damage>(64, slot => ({ active: false, slot, x: 0, z: 0, life: 0, value: 0 }));
  private readonly heads = new Int32Array(GRID_COLUMNS * GRID_ROWS);
  private readonly next = new Int32Array(128);
  private gridZ = 0;
  private invincible = 0;
  private time = 0;
  shields = 0;
  magnetRange = MAGNET_RANGE;
  baseMagnetRange = MAGNET_RANGE;
  /** Difficulty scaling and run modifiers, set by the scene from car + theme + wave. */
  hpScale = 1;
  /** Current wave number, set by the wave system; drives the contact damage curve. */
  wave = 1;
  /** Boss tier for the current round (1-4); set before the boss spawns. */
  bossTier = 1;
  /** Sauce packets equipped this run; one bit each, shared by bullets at fire time. */
  sauceBits = 0;
  coinMultiplier = 1;
  ramSlow = 0;
  private coinCarry = 0;
  combo = 0;
  comboTimer = 0;
  maxCombo = 0;
  comboTier = 0;
  /** Guided pit-entry mode: riders break off the chase and hazards cannot hurt the car. */
  entering = false;
  bossSlot = -1;
  bossMaxHp = 0;
  bossDefeated = false;
  bossX = 0;
  bossZ = 0;
  health = 100;
  money = 0;
  kills = 0;
  shots = 0;
  hits = 0;
  impact = 0;
  lastRamDamage = 0;
  aimX = 0;
  aimZ = -1;
  muzzleFlash = 0;
  targetSlot = -1;
  targetDistance = 0;
  pursuers = 0;
  pelletsFired = 0;
  /** 奶油咖啡酱的射速窗口剩余时间；由 WeaponSystem 在有效漂移时置入。 */
  rateWindow = 0;
  /** 应急保险杠的脱身窗口：碎盾后短时间内碰撞伤害减半。 */
  escapeTime = 0;
  /** 回旋刃本轮接回数；WeaponSystem 读取后清零，用于「回手连斩」收益。 */
  boomerangCatch = 0;
  constructor(private readonly effects: CombatEffects) {}

  spawn(kind: number, x: number, z: number): Enemy | null {
    const e = this.enemies.acquire(); if (!e) return null;
    e.kind = kind; e.x = e.px = x; e.z = e.pz = z;
    e.slow = 1; e.slowTime = e.burn = e.burnDamage = 0;
    e.armorBreak = 0; e.armorHits = 0;
    e.flankTime = 0; e.flankStreak = 0;
    e.chill = 0; e.chillResist = 0; e.frozen = false; e.grindCd = 0;
    e.hp = kind === 3 ? Math.round(BOSS_HP * bossHpScale(this.bossTier)) : Math.round(ENEMY_HP[kind] * this.hpScale);
    e.flash = e.contact = 0; e.phase = 0; e.timer = 0; e.tx = 0; e.throwCd = 2.4;
    // Riders line up behind the car briefly before their first lunge; a lone rider
    // usually dies to return fire first, packs are what get through.
    if (kind === 2) e.timer = 1.6 + Math.random() * 1.0;
    e.vx = kind === 1 ? (x < 0 ? 95 : -95) : 0;
    e.vz = kind === 2 ? BASE_SPEED * 1.16 : 0;
    if (kind === 3) { this.bossSlot = e.slot; this.bossMaxHp = e.hp; }
    return e;
  }
  nearest(x: number, z: number): Enemy | null {
    let target: Enemy | null = null, distance = WEAPON_RANGE * WEAPON_RANGE;
    for (let i = 0; i < this.enemies.capacity; i++) {
      const e = this.enemies.items[i]; if (!e.active || (e.kind !== 2 && e.kind !== 3)) continue;
      const dx = e.x - x, dz = e.z - z, d = dx * dx + dz * dz;
      if (d <= distance) { target = e; distance = d; }
    }
    return target;
  }
  static ramDamage(p: DriftPhysics): number {
    const multiplier = p.pulseTime > 0 ? (p.pulseRatio >= 0.4 ? 3 : p.pulseRatio >= 0.25 ? 2.5 : 2) : p.nitroTime > 0 ? 2 : 1;
    return 36 * p.speed / BASE_SPEED * multiplier;
  }
  hit(e: Enemy, amount: number): void {
    if (!e.active || amount <= 0) return;
    if (e.armorBreak > 0) amount *= ARMOR_BREAK_MULT;
    e.hp -= amount; e.flash = 0.12; this.hits++;
    const d = this.damage.acquire();
    if (d) { d.x = e.x; d.z = e.z; d.life = 0.65; d.value = Math.min(999, Math.max(1, Math.round(amount))); }
    if (e.hp > 0) return;
    if (e.kind === 3) { this.bossDefeated = true; this.bossX = e.x; this.bossZ = e.z; this.bossSlot = -1; }
    this.enemies.release(e); this.kills++; this.bumpCombo(e.x, e.z);
    this.effects.explode(e.x, e.z, e.kind);
    const coin = this.coins.acquire();
    if (coin) {
      coin.x = coin.px = e.x; coin.z = coin.pz = e.z;
      coin.vx = (Math.random() - 0.5) * 95; coin.vz = -35;
      coin.life = 8; coin.value = COIN_VALUE[e.kind];
      // Pursuit rewards return automatically: the player cannot drive backwards to collect them.
      // Road drops still require entering the standard magnet radius.
      coin.magnet = e.kind !== 0;
    } else {
      // Full pickup pool merges value into an existing drop; no lost currency or allocation.
      const existing = this.coins.items[this.kills % this.coins.capacity]; existing.value += COIN_VALUE[e.kind];
    }
  }
  /** Equip a sauce packet: set its bit (§7 规则组合层，无全局数值加成). */
  equipSauce(key: SauceKey): void {
    this.sauceBits |= SAUCE_BITS[key];
  }
  ownedSauces(): SauceKey[] { return ownedSauceKeys(this.sauceBits); }
  /** 奶油咖啡酱射速窗口：WeaponSystem 在有效漂移后开启，全武器共享。 */
  get rateMult(): number { return this.rateWindow > 0 ? SAUCE.driftRate : 1; }
  /** Fire-time mods shared by every bullet source. 甜酸延飞只作用于发射点判定过
   * 兼容（meta bit3）的弹道；不兼容武器携带该酱料时完全不生效（§7.2 边界）。 */
  prepareBullet(b: Bullet): void {
    if ((b.meta & 8) !== 0) b.life *= SAUCE.wallLife;
  }
  /** 辣椒酱直接命中附着灼烧：与任何已有灼烧取最强来源并刷新时间，不叠第二份。 */
  applyBurn(e: Enemy, seconds: number, dps: number): void {
    if (!e.active) return;
    if (dps >= e.burnDamage) { e.burn = seconds; e.burnDamage = dps; }
    else e.burn = Math.max(e.burn, seconds);
  }
  /** Weapon damage with sauce seasoning: chili burn attach on direct hits.
   * Derived damage (splash, trails, burn ticks, rams) never re-enters here —
   * that is the recursion guard for the whole sauce pipeline. */
  seasonedHit(e: Enemy, amount: number, traits: number): void {
    this.hit(e, amount);
    if (!e.active) return;
    if (hasSauce(traits, 'chili')) this.applyBurn(e, SAUCE.burnSeconds, amount * SAUCE.burnRate);
  }
  /** Ketchup splash around the struck enemy; raw hits so it never re-triggers sauces. */
  private sauceSplash(origin: Enemy, amount: number, radius: number): void {
    this.effects.explode(origin.x, origin.z, 0);
    for (let i = 0; i < this.enemies.capacity; i++) {
      const e = this.enemies.items[i];
      if (e.active && e !== origin && Math.hypot(e.x - origin.x, e.z - origin.z) <= radius) this.hit(e, amount);
    }
  }
  /** 鱼跃跳弹的侧跳：优先横向错开的新目标（邻接敌群收益），逐跳衰减由调用方处理。 */
  private hopBullet(b: Bullet, struck: Enemy): boolean {
    // 两轮最近搜索：优先横向错开 24px 以上的新目标（敌群收益），否则就近起跳。
    let lateralTarget: Enemy | null = null, lateralD2 = 340 * 340;
    let anyTarget: Enemy | null = null, anyD2 = 340 * 340;
    for (let i = 0; i < this.enemies.capacity; i++) {
      const e = this.enemies.items[i];
      if (!e.active || b.hitMask[e.slot]) continue;
      const dx = e.x - struck.x, dz = e.z - struck.z, d2 = dx * dx + dz * dz;
      if (Math.abs(dx) > 24 && d2 < lateralD2) { lateralTarget = e; lateralD2 = d2; }
      if (d2 < anyD2) { anyTarget = e; anyD2 = d2; }
    }
    const target = lateralTarget ?? anyTarget;
    if (!target) return false;
    const speed = Math.hypot(b.vx, b.vz);
    const dx = target.x - b.x, dz = target.z - b.z;
    const length = Math.max(1, Math.hypot(dx, dz));
    b.vx = dx / length * speed; b.vz = dz / length * speed;
    return true;
  }
  /** Kill streak with timed decay and milestone coin bonuses. */
  private bumpCombo(x: number, z: number): void {
    this.combo++; this.comboTimer = 3.5;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    let tier = 0;
    for (let i = 0; i < COMBO_TIERS.length; i++) if (this.combo >= COMBO_TIERS[i]) tier = i + 1;
    if (tier > this.comboTier) {
      this.comboTier = tier;
      const bonus = COMBO_BONUS[tier];
      this.money += bonus;
      const d = this.damage.acquire();
      if (d) { d.x = x; d.z = z - 24; d.life = 0.8; d.value = Math.min(999, bonus); }
    }
  }
  /** Celebration drop: coins scatter around the fallen boss and stream into the car. */
  burstCoins(x: number, z: number, count: number, total: number): void {
    const per = Math.max(1, Math.floor(total / count));
    for (let i = 0; i < count; i++) {
      const coin = this.coins.acquire(); if (!coin) break;
      const angle = (i / count) * Math.PI * 2;
      coin.x = coin.px = x; coin.z = coin.pz = z;
      coin.vx = Math.cos(angle) * 150; coin.vz = Math.sin(angle) * 90;
      coin.life = 9; coin.value = per; coin.magnet = true;
    }
  }  private cellX(x: number): number { return Math.max(0, Math.min(GRID_COLUMNS - 1, Math.floor((x - GRID_MIN_X) / CELL))); }
  private cellZ(z: number): number { return Math.max(0, Math.min(GRID_ROWS - 1, Math.floor((z - this.gridZ) / CELL))); }
  step(p: DriftPhysics, dt: number): void {
    this.time += dt;
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
    this.rateWindow = Math.max(0, this.rateWindow - dt);
    this.escapeTime = Math.max(0, this.escapeTime - dt);
    this.impact = 0; this.invincible = Math.max(0, this.invincible - dt);
    this.gridZ = p.progress - 500; this.heads.fill(-1);
    const carX = p.x - 225; this.pursuers = 0;
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) { this.combo = 0; this.comboTier = 0; }
    for (let i = 0; i < this.damage.capacity; i++) {
      const d = this.damage.items[i]; if (d.active && (d.life -= dt) <= 0) this.damage.release(d);
    }
    for (let i = 0; i < this.enemies.capacity; i++) {
      const e = this.enemies.items[i]; if (!e.active) continue;
      e.px = e.x; e.pz = e.z;
      e.flash = Math.max(0, e.flash - dt); e.contact = Math.max(0, e.contact - dt);
      e.slowTime = Math.max(0, e.slowTime - dt);
      if (e.slowTime === 0) {
        if (e.frozen) { e.frozen = false; e.chillResist = 4; }
        e.slow = 1;
      }
      e.flankTime = Math.max(0, e.flankTime - dt);
      if (e.flankTime === 0) e.flankStreak = 0;
      e.chillResist = Math.max(0, e.chillResist - dt);
      e.grindCd = Math.max(0, e.grindCd - dt);
      e.chill = Math.max(0, e.chill - 8 * dt);
      e.armorBreak = Math.max(0, e.armorBreak - dt);
      // 命中计数跨弹累积（「连续命中」）；触发破甲时清零（见弹丸命中路径），
      // 因此破甲到期后自然从零重计，不需要逐帧重置。
      if (e.burn > 0) { e.burn -= dt; this.hit(e, e.burnDamage * dt); if (!e.active) continue; }
      if (e.kind === 1) { e.x += e.vx * dt * e.slow; if (e.x < -139 || e.x > 139) e.vx = e.x < 0 ? 95 : -95; }
      if (e.kind === 2) {
        // Delayed lateral pursuit rewards sudden lane changes. Nitro genuinely opens a gap:
        // riders cap at an absolute pace and never rubber-band up to boosted player speed.
        e.vx += (Math.max(-70, Math.min(70, (carX - e.x) * 1.3)) - e.vx) * Math.min(1, dt * 3);
        if (this.entering) {
          // Pit call: the chase is off — riders brake, turn around and ride off-screen.
          e.vx *= Math.pow(0.05, dt);
          e.vz += (-BASE_SPEED * 0.85 - e.vz) * Math.min(1, dt * 2.2);
        } else {
          // Riders chase the car itself: braking slows them with it and they never
          // overtake forward. Each rider lines up off the bumper, then lunges at it.
          e.timer -= dt;
          const target = e.phase === 1 ? p.progress - 30 : p.progress - RIDER_GAP;
          const closing = Math.max(-150, Math.min(e.phase === 1 ? 260 : 85, (target - e.z) * (e.phase === 1 ? 2.2 : 0.9)));
          e.vz += (Math.max(0, -p.vy) + closing - e.vz) * Math.min(1, dt * 3);
          const cap = e.phase === 1 ? BASE_SPEED * 1.38 : BASE_SPEED * 1.16;
          if (e.vz > cap) e.vz = cap;
          if (e.phase === 0) { if (e.timer <= 0) { e.phase = 1; e.timer = 0.8; } }
          else if (e.phase === 1) { if (e.timer <= 0 || e.z >= target) { e.phase = 2; e.timer = 0.6 + Math.random() * 0.5; } }
          else if (e.timer <= 0) { e.phase = 0; e.timer = 0.7 + Math.random() * 0.7; }
        }
        e.x += e.vx * dt * e.slow; e.z += e.vz * dt * e.slow;
      }
      if (e.kind === 3) {
        // Tyrant truck: drifts ahead, telegraphs a lane-slam, and drops barriers.
        // Every boss tier slams harder, faster and litters more of the road.
        const tier = this.bossTier;
        e.timer -= dt; e.throwCd -= dt;
        const relative = e.z - p.progress;
        if (e.phase === 0) {
          e.vx += (Math.sin(this.time * 0.7) * 120 - e.vx) * Math.min(1, dt * 1.6);
          if (e.timer <= 0) { e.phase = 1; e.timer = bossTelegraph(tier); e.tx = carX; }
        } else if (e.phase === 1) {
          e.flash = 0.09; e.vx *= Math.pow(0.01, dt);
          const slam = bossSlamSpeed(tier);
          if (e.timer <= 0) { e.phase = 2; e.timer = 0.5; e.vx = Math.max(-slam, Math.min(slam, (e.tx - e.x) / 0.5)); }
        } else if (e.phase === 2) {
          if (e.timer <= 0) { e.phase = 3; e.timer = bossRecover(tier); }
        } else {
          e.vx *= Math.pow(0.05, dt);
          if (e.timer <= 0) { e.phase = 0; e.timer = bossCruiseRest(tier) + Math.random() * 1.4; }
        }
        // Hover ahead of the car at an absolute pace; a slow correction keeps the
        // truck on screen and the emergency chase means it can never fall behind.
        const hover = e.phase === 0 ? 2.5 : 1.2;
        const pace = Math.max(0, -p.vy);
        const correction = Math.max(-70, Math.min(90, (260 - relative) * 0.8));
        e.vz += (pace * 1.02 + correction - e.vz) * Math.min(1, dt * hover);
        if (relative < 60) e.vz = Math.max(e.vz, pace * 1.35);
        // Chilled truck slides at half effectiveness; it is never fully frozen.
        const glide = e.slow < 1 ? 0.55 : 1;
        e.x += e.vx * dt * glide; e.z += e.vz * dt;
        // 卡车必须留在路面上：急刹横冲的滑行惯性不允许把它甩出道路（可读性/公平性）。
        if (e.x < -150) { e.x = -150; if (e.vx < 0) e.vx = 0; }
        if (e.x > 150) { e.x = 150; if (e.vx > 0) e.vx = 0; }
        if (e.throwCd <= 0) {
          e.throwCd = bossThrowInterval(tier);
          const coneX = Math.max(-138, Math.min(138, carX));
          this.spawn(0, coneX, p.progress + 560);
          // Tiers three and four cover both lanes: one barrier at the car, one across.
          if (bossCones(tier) > 1) this.spawn(0, coneX > 0 ? coneX - 190 : coneX + 190, p.progress + 560);
        }
      }
      if (e.z < p.progress - 450 || e.z > p.progress + 2000) {
        if (e.kind === 3) { this.bossSlot = -1; }
        this.enemies.release(e); continue;
      }
      // Car OBB versus enemy circle, including both front and trailing contacts.
      const dx = e.x - carX, dz = e.z - p.progress;
      if (Math.abs(dx) < 100 && Math.abs(dz) < 100 && e.contact === 0) {
        const cos = Math.cos(p.heading), sin = Math.sin(p.heading);
        const side = dx * cos - dz * sin, forward = dx * sin + dz * cos;
        const cx = Math.max(Math.abs(side) - 24, 0), cz = Math.max(Math.abs(forward) - 34, 0);
        if (cx * cx + cz * cz <= ENEMY_RADIUS[e.kind] ** 2) {
          e.contact = 0.5; this.lastRamDamage = CombatSystem.ramDamage(p);
          // 冰冻撞碎（§5.6/§12.2）：显式允许的联动，最多一次冰爆，不递归冻结。
          const shatter = e.frozen && e.slow === 0;
          this.hit(e, this.lastRamDamage * (shatter ? 2 : 1)); this.impact = 1;
          if (shatter && !e.active) this.iceBurst(e);
          // Guided pit entry plows through leftover hazards on rails without hurting the car.
          if (this.invincible === 0 && p.pulseTime === 0 && p.nitroTime === 0 && !this.entering) {
            this.hurt(contactDamage(e.kind, this.wave));
          }
          if (e.active) {
            // Push along travel direction: a rider re-crossing the car from ahead must
            // keep falling back, or the forward shove would trap it in front forever.
            e.z += e.kind === 2 && e.vz < 0 ? -48 : dz >= 0 ? 48 : -48;
            e.x += dx >= 0 ? 15 : -15;
            if (this.ramSlow > 0 && e.kind !== 3) { e.slow = Math.min(e.slow, 1 - this.ramSlow); e.slowTime = 2; }
          }
        }
      }
      if (!e.active) continue;
      if (e.kind === 2) this.pursuers++;
      const cell = this.cellZ(e.z) * GRID_COLUMNS + this.cellX(e.x);
      this.next[i] = this.heads[cell]; this.heads[cell] = i;
    }
    const target = this.nearest(carX, p.progress);
    this.targetSlot = target?.slot ?? -1;
    this.targetDistance = target ? Math.hypot(target.x - carX, target.z - p.progress) : 0;

    for (let i = 0; i < this.bullets.capacity; i++) {
      const b = this.bullets.items[i]; if (!b.active) continue;
      b.px = b.x; b.pz = b.z; b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      // Sweet-and-sour only steers wall-capable ballistics off the road edges.
      if ((b.meta & 8) !== 0 && ((b.x > SAUCE.wallBound && b.vx > 0) || (b.x < -SAUCE.wallBound && b.vx < 0))) b.vx = -b.vx;
      if (b.kind === 4) {
        // 麦辣标记火箭：有限转向率追踪锁定目标，不等于瞬间命中。
        const locked = b.targetSlot >= 0 ? this.enemies.items[b.targetSlot] : null;
        if (locked && locked.active) {
          const wanted = Math.atan2(locked.x - b.x, locked.z - b.z);
          const current = Math.atan2(b.vx, b.vz);
          let diff = wanted - current;
          if (diff > Math.PI) diff -= Math.PI * 2; else if (diff < -Math.PI) diff += Math.PI * 2;
          const turn = Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
          const speed = Math.hypot(b.vx, b.vz);
          b.vx = Math.sin(current + turn) * speed; b.vz = Math.cos(current + turn) * speed;
        }
      }
      if (b.kind === 2) {
        // 扭扭薯回旋刃：去程飞满后折返车身，回程清空命中账本重新记账。
        b.age += dt;
        if (b.leg === 0 && b.age > 0.42 + b.level * 0.04) {
          b.leg = 1; b.hitMask.fill(0);
        }
        if (b.leg === 1) {
          const dx = carX - b.x, dz = p.progress - b.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 1936) {
            this.bullets.release(b); this.boomerangCatch++; continue;
          }
          // 回程强锁定回航：转向率压住回旋半径（v/22 < 44px 接取圈），
          // 弧线必定收进车身；变道改变回程路线，漏接由寿命兜底超时回收。
          const wanted = Math.atan2(dx, dz), current = Math.atan2(b.vx, b.vz);
          let diff = wanted - current;
          if (diff > Math.PI) diff -= Math.PI * 2; else if (diff < -Math.PI) diff += Math.PI * 2;
          const turn = Math.max(-22 * dt, Math.min(22 * dt, diff));
          const speed = Math.hypot(b.vx, b.vz);
          b.vx = Math.sin(current + turn) * speed; b.vz = Math.cos(current + turn) * speed;
        }
      }
      const minX = this.cellX(Math.min(b.x, b.px) - 26), maxX = this.cellX(Math.max(b.x, b.px) + 26);
      const minZ = this.cellZ(Math.min(b.z, b.pz) - 26), maxZ = this.cellZ(Math.max(b.z, b.pz) + 26);
      let target: Enemy | null = null, closest = 2;
      const sx = b.x - b.px, sz = b.z - b.pz, length2 = sx * sx + sz * sz;
      for (let row = minZ; row <= maxZ; row++) for (let col = minX; col <= maxX; col++) {
        let index = this.heads[row * GRID_COLUMNS + col];
        while (index !== -1) {
          const e = this.enemies.items[index]; index = this.next[index]; if (!e.active || (b.kind !== 0 && b.hitMask[e.slot])) continue;
          const radius = ENEMY_RADIUS[e.kind] + 4;
          if (e.x + radius < Math.min(b.x, b.px) || e.x - radius > Math.max(b.x, b.px) || e.z + radius < Math.min(b.z, b.pz) || e.z - radius > Math.max(b.z, b.pz)) continue;
          // Swept circle test avoids tunneling at boosted projectile speeds.
          const t = Math.max(0, Math.min(1, ((e.x - b.px) * sx + (e.z - b.pz) * sz) / Math.max(0.001, length2)));
          const dx = e.x - b.px - t * sx, dz = e.z - b.pz - t * sz;
          if (dx * dx + dz * dz <= radius * radius && t < closest) { closest = t; target = e; }
        }
      }
      if (target) {
        b.hitMask[target.slot] = 1;
        // 双联交错炮夹击：窗口内再命中同一目标伤害加成（第二发起算）。
        let amount = b.damage;
        if ((b.meta & 16) !== 0 && target.flankTime > 0 && target.flankStreak >= 1) amount *= (b.meta & 1) !== 0 ? 1.8 : 1.6;
        if ((b.meta & 16) !== 0) {
          target.flankStreak = target.flankTime > 0 ? target.flankStreak + 1 : 1;
          target.flankTime = (b.meta & 1) !== 0 ? 2 : 1.2;
        }
        this.seasonedHit(target, amount, b.traits);
        if (b.kind === 5) {
          // 鱼跃跳弹：侧跳向邻近新目标，逐跳衰减；跳尽或无目标即落地。
          if (b.pierce > 1 && this.hopBullet(b, target)) {
            b.pierce--;
            if ((b.meta & 2) !== 0) this.sauceSplash(target, b.damage * 0.4, (b.meta & 4) !== 0 ? 64 : 45);
            b.damage *= (b.meta & 1) !== 0 ? 0.85 : 0.75;
            continue;
          }
          this.bullets.release(b);
          continue;
        }
        if (b.kind === 1) {
          // 巨堡贯穿炮：每穿一名敌人伤害按分支保留率衰减；破甲分支累计命中。
          b.damage *= (b.meta & 1) !== 0 ? PIERCE_RETAIN_ROAD : PIERCE_RETAIN;
          b.hits++;
          if ((b.meta & 2) !== 0 && target.active) {
            target.armorHits++;
            if (target.armorHits >= 2) { target.armorBreak = ARMOR_BREAK_TIME; target.armorHits = 0; }
          }
        }
        if (b.kind === 4 && (b.meta & 2) !== 0 && target.active) {
          // 麦辣标记火箭（单点破甲分支）：命中施加破甲，全武器增伤。
          target.armorHits++;
          if (target.armorHits >= 2) { target.armorBreak = ARMOR_BREAK_TIME; target.armorHits = 0; }
        }
        if (hasSauce(b.traits, 'ketchup')) this.sauceSplash(target, b.damage * SAUCE.splashShare, SAUCE.splashRadius);
        if (--b.pierce <= 0) {
          // 压路重炮 Lv5：贯穿终点产生一次窄向冲击，不变成全屏清场。
          if (b.kind === 1 && (b.meta & 5) === 5) {
            this.effects.explode(b.x, b.z, 0);
            for (let k = 0; k < this.enemies.capacity; k++) {
              const victim = this.enemies.items[k];
              if (victim.active && Math.hypot(victim.x - b.x, victim.z - b.z) <= 70) this.hit(victim, b.damage * 0.6);
            }
          }
          this.bullets.release(b);
        }
      }
      else if (b.life <= 0 || b.z < p.progress - 450 || b.z > p.progress + 1600) this.bullets.release(b);
    }
    for (let i = 0; i < this.coins.capacity; i++) {
      const c = this.coins.items[i]; if (!c.active) continue;
      c.px = c.x; c.pz = c.z; c.life -= dt;
      const dx = carX - c.x, dz = p.progress - c.z, distance = Math.hypot(dx, dz * 0.85);
      // Magnet radius at the car plane, matching the road's vertical compression.
      if (distance <= this.magnetRange) c.magnet = true;
      if (c.magnet) {
        const ease = 1 - Math.exp(-14 * dt); c.x += dx * ease + p.vx * dt; c.z += dz * ease + Math.max(0, -p.vy) * dt;
        if (distance < 24) {
          this.coinCarry += c.value * this.coinMultiplier;
          const gain = Math.floor(this.coinCarry); this.coinCarry -= gain; this.money += gain;
          this.coins.release(c); continue;
        }
      } else {
        c.x += c.vx * dt; c.z += c.vz * dt; c.vx *= 0.92; c.vz *= 0.92;
      }
      if (c.life <= 0 || c.z < p.progress - 450) this.coins.release(c);
    }
    if (p.hitWall !== 0 && this.invincible === 0 && p.nitroTime === 0) this.hurt(3);
  }
  /** 武器层部署物的爆炸表现入口（雷阵/冰爆共用粒子爆发）。 */
  blast(x: number, z: number): void { this.effects.explode(x, z, 0); }
  /** 冻结撞碎的冰爆：一次性范围伤害，不再施加冰冻（§12.2 防递归）。 */
  private iceBurst(origin: Enemy): void {
    this.effects.explode(origin.x, origin.z, 0);
    for (let i = 0; i < this.enemies.capacity; i++) {
      const e = this.enemies.items[i];
      if (e.active && Math.hypot(e.x - origin.x, e.z - origin.z) <= 100) this.hit(e, 20);
    }
  }
  private hurt(amount: number): void {
    if (this.combo > 1) { this.combo = this.combo >> 1; this.comboTier = 0; this.comboTimer = 1.5; }
    // 应急保险杠：碎盾只给短脱身窗口（受伤减半），不贡献常驻伤害。
    if (this.shields > 0) {
      this.shields--;
      this.escapeTime = 1.5;
    }
    else if (this.escapeTime > 0) this.health = Math.max(0, this.health - amount * 0.5);
    else this.health = Math.max(0, this.health - amount);
    this.invincible = 0.5;
  }
  clear(): void {
    this.enemies.clear(); this.bullets.clear(); this.coins.clear(); this.damage.clear();
    this.muzzleFlash = 0; this.targetSlot = -1; this.targetDistance = this.pursuers = 0; this.aimX = 0; this.aimZ = -1;
    this.combo = this.comboTimer = this.comboTier = 0; this.bossSlot = -1; this.bossMaxHp = 0;
    this.rateWindow = this.escapeTime = this.boomerangCatch = 0;
  }
}

/** Positive interception root, bounded to the projectile lifetime. */
export function interceptTime(dx: number, dz: number, vx: number, vz: number, speed: number): number {
  const a = vx * vx + vz * vz - speed * speed;
  const b = 2 * (dx * vx + dz * vz), c = dx * dx + dz * dz;
  if (Math.abs(a) < 0.001) return b < -0.001 ? Math.min(1.2, -c / b) : 0;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  const root = Math.sqrt(discriminant);
  const t1 = (-b - root) / (2 * a), t2 = (-b + root) / (2 * a);
  const t = t1 >= 0 && t2 >= 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  return Math.max(0, Math.min(1.2, t));
}
