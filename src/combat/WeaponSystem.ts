import { weaponById, EXHAUST_TRAIL, type WeaponDef } from './weaponCatalog';
import { SAUCE, hasSauce } from './sauces';
import { interceptTime, PELLET_SPREAD } from './CombatSystem';
import type { CombatSystem, Enemy } from './CombatSystem';
import type { DriftPhysics } from '../systems/DriftPhysics';
import type { EquippedWeapon } from '../systems/ShopSystem';
import { ObjectPool } from '../utils/ObjectPool';

/** 尾焰沿路 dropping 间隔（秒）；长燃 Lv5 拉长为更连贯的火带段。 */
const TRAIL_DROP = 0.12;
const TRAIL_DROP_LONG = 0.18;
const TRAIL_RADIUS = 40;
/** 回旋刃总寿命：去程 + 回程 + 容错；漏接超时回收，不卡死武器。 */
const BLADE_LIFE = 2.4;
/** 漂移增压器的蓄能层数上限与单层伤害倍率。 */
const DRIFT_CHARGE_MAX = 3;
const DRIFT_CHARGE_MULT = 1.5;
/** meta 位：bit0 分支a · bit1 分支b · bit2 Lv5 · bit3 甜酸弹墙兼容 · bit4 夹击弹（发射时判定）。 */
const META_BRANCH_A = 1;
const META_BRANCH_B = 2;
const META_LV5 = 4;
const META_WALL = 8;
const META_FLANK = 16;
const META_ACID = 64;
const META_CLUSTER = 32;

interface TrailSeg { active: boolean; slot: number; x: number; z: number; life: number; dps: number; kind: number }
interface MineSeg { active: boolean; slot: number; x: number; z: number; life: number; level: number; meta: number; chainDepth: number }
interface SawSeg { active: boolean; slot: number; x: number; z: number; life: number; radius: number; dps: number; spin: number }
/** 封路栅 / 凝霜墙共用阻挡物池：拦截穿越的敌人，次数耗尽碎裂。 */
interface BlockerSeg { active: boolean; slot: number; x: number; z: number; hp: number; life: number; dmg: number; frost: boolean; meta: number }
interface PieboxSeg { active: boolean; slot: number; x: number; z: number; fuse: number; dmg: number; cols: number }

/** 五槽语义（§4.1）：[0] 前武器 · [1] 后武器 · [2..4] 车辆模块；酱料独立收藏。 */
export class WeaponSystem {
  readonly trails = new ObjectPool<TrailSeg>(24, slot => ({ active: false, slot, x: 0, z: 0, life: 0, dps: 0, kind: 0 }));
  readonly mines = new ObjectPool<MineSeg>(12, slot => ({ active: false, slot, x: 0, z: 0, life: 0, level: 1, meta: 0, chainDepth: 0 }));
  readonly saws = new ObjectPool<SawSeg>(8, slot => ({ active: false, slot, x: 0, z: 0, life: 0, radius: 34, dps: 0, spin: 0 }));
  readonly blockers = new ObjectPool<BlockerSeg>(8, slot => ({ active: false, slot, x: 0, z: 0, hp: 0, life: 0, dmg: 0, frost: false, meta: 0 }));
  readonly pieboxes = new ObjectPool<PieboxSeg>(6, slot => ({ active: false, slot, x: 0, z: 0, fuse: 0, dmg: 0, cols: 3 }));
  /** 漂移增压器蓄能层数；有效漂移释放 +1，下一次齐射消耗一层。 */
  driftCharge = 0;
  /** W06 锁定状态（目标槽位/进度/宽限/道路锚点），供渲染层显示锁定进度。 */
  lockSlot = -1;
  lockTime = 0;
  lockNeed = 2.2;
  private lockGrace = 0;
  private lockAnchorX = 0;
  /** W02 交替炮管；W11 连排状态；W24 锁冻目标；W31 螺旋刃相位。 */
  private altSide = 1;
  private volleyRows = 0;
  private volleyTick = 0;
  freezeSlot = -1;
  private sawSide = 1;
  spiralAngle = 0;
  spiralPhase = 0;
  spiralX = 0;
  spiralZ = 0;
  spiralR = 0;
  /** W21 压力环的视觉脉冲衰减。 */
  pulseFlash = 0;
  /** W08 轨道炮蓄能与瞄线；W27 激光热度与目标；W25 波环；W20 索锚点；W28 涡流。 */
  railCharge = 0;
  railAngle = 0;
  railProgress = 0;
  laserSlot = -1;
  laserHeat = 0;
  laserOn = false;
  laserOverheat = 0;
  waveRadius = -1;
  waveRadius2 = -1;
  wireLife = 0;
  wireAx = 0; wireAz = 0; wireBx = 0; wireBz = 0;
  vortexTimer = 0;
  vortexX = 0;
  vortexZ = 0;
  vortexPulling = false;
  private sideSide = 1;
  private acidTick = 0;
  pillarSlot = -1;
  pillarStacks = 0;
  pillarX = 0;
  pillarZ = 0;
  private bumperClock = 0;
  private pumpClock = 0;
  private pumpTick = 0;
  private cremaCd = 0;
  private trailTick = 0;
  private overheat = 0;
  private hotTime = 0;
  private hotBoost = 0;
  private catchStreak = 0;
  private catchFlag = 0;
  constructor(readonly slots: (EquippedWeapon | null)[], readonly combat: CombatSystem) {}
  /** 驾驶侧数值只来自车体被动；武器不再提供速度/氮气加成（§8 模块接管）。 */
  configure(p: DriftPhysics): void {
    p.speedBonus = p.carSpeedBonus;
    p.chargeBonus = 0;
    p.nitroRegen = p.carNitroRegen;
    this.combat.magnetRange = this.combat.baseMagnetRange;
  }
  /** 是否有对当前弹道生效的甜酸酱目标（酱料候选有效性判定）。 */
  wallCapable(): boolean {
    for (let i = 0; i < 2; i++) {
      const w = this.slots[i];
      if (w && weaponById(w.weaponId).wall === true) return true;
    }
    return false;
  }
  private moduleInstalled(id: string): boolean {
    for (let i = 2; i < 5; i++) {
      const w = this.slots[i];
      if (w && w.weaponId === id) return true;
    }
    return false;
  }
  /** meta 打包：分支、Lv5 招牌与甜酸兼容边界在发射点一次判定。 */
  private metaFor(w: EquippedWeapon, def: WeaponDef): number {
    let meta = 0;
    if (def.branches) {
      if (w.branch === 'a') meta |= META_BRANCH_A;
      if (w.branch === 'b') meta |= META_BRANCH_B;
    }
    if (w.level >= 5) meta |= META_LV5;
    if (def.wall && hasSauce(this.combat.sauceBits, 'sweetSour')) meta |= META_WALL;
    return meta;
  }
  /** 漂移增压器：齐射消耗一层蓄能换伤害加成，返回本次倍率。 */
  private spendCharge(): number {
    if (this.moduleInstalled('M-drift') && this.driftCharge > 0) {
      this.driftCharge--;
      return DRIFT_CHARGE_MULT;
    }
    return 1;
  }
  /** 引爆一枚雷：范围伤害；连环分支（上限 3 级链）引爆相邻雷；到期回收不掉金币。 */
  private explodeMine(m: MineSeg, def: WeaponDef, p: DriftPhysics, depth: number, mult: number): void {
    const c = this.combat;
    const l = Math.max(0, Math.min(4, m.level - 1));
    c.blast(m.x, m.z);
    for (let k = 0; k < c.enemies.capacity; k++) {
      const victim = c.enemies.items[k];
      if (!victim.active) continue;
      const dx = victim.x - m.x, dz = victim.z - m.z;
      if (dx * dx + dz * dz <= def.range[l] * def.range[l]) c.seasonedHit(victim, def.damage[l] * mult, c.sauceBits);
    }
    if ((m.meta & 1) !== 0 && m.level >= 3 && depth < 3) {
      for (let i = 0; i < this.mines.capacity; i++) {
        const other = this.mines.items[i];
        if (!other.active || other === m || other.chainDepth > 0) continue;
        const dx = other.x - m.x, dz = other.z - m.z;
        if (dx * dx + dz * dz <= 90 * 90) {
          other.chainDepth = depth + 1;
          this.explodeMine(other, def, p, depth + 1, 1);
        }
      }
    }
    void p;
    this.mines.release(m);
  }
  private nearestForward(px: number, pz: number, range: number): Enemy | null {
    let target: Enemy | null = null, best = range * range;
    for (let i = 0; i < this.combat.enemies.capacity; i++) {
      const e = this.combat.enemies.items[i]; if (!e.active || e.z <= pz) continue;
      const dx = e.x - px, dz = e.z - pz, d = dx * dx + dz * dz;
      if (d < best) { target = e; best = d; }
    }
    return target;
  }
  private leadAngle(e: Enemy, px: number, pz: number, speed: number): number {
    const dx = e.x - px, dz = e.z - pz;
    const lead = interceptTime(dx, dz, e.vx, e.vz, speed);
    return Math.atan2(dx + e.vx * lead, dz + e.vz * lead);
  }
  step(p: DriftPhysics, dt: number): void {
    const c = this.combat, x = p.x - 225;
    // ---- 标准化驾驶事件（§8）：模块与酱料只消费事件，不逐帧读按键。 ----
    if (p.released > 0) {
      if (this.moduleInstalled('M-drift')) this.driftCharge = Math.min(DRIFT_CHARGE_MAX, this.driftCharge + 1);
      if (hasSauce(c.sauceBits, 'crema') && this.cremaCd <= 0) {
        c.rateWindow = SAUCE.driftWindow;
        this.cremaCd = SAUCE.driftCooldown;
      }
    }
    this.cremaCd = Math.max(0, this.cremaCd - dt);
    // ---- 安全驾驶时钟：保险杠积盾 / 维修泵回血共用同一事件源。 ----
    const safe = c.impact === 0 && p.hitWall === 0;
    if (safe) {
      if (this.moduleInstalled('M-bumper')) {
        this.bumperClock = Math.min(10, this.bumperClock + dt);
        if (this.bumperClock >= 10) { this.bumperClock = 0; if (c.shields < 2) c.shields++; }
      }
      if (this.moduleInstalled('M-pump')) {
        this.pumpClock = Math.min(5, this.pumpClock + dt);
        if (this.pumpClock >= 5) {
          this.pumpTick += dt;
          if (this.pumpTick >= 1.2) { this.pumpTick = 0; c.health = Math.min(100, c.health + 1); }
        }
      }
    } else {
      // 碰撞不清空进度而是回退一截：偶尔被蹭的普通驾驶仍能攒出维修/护盾，
      // 持续干净驾驶始终显著更快（§8 模块是续航来源，不是完美驾驶专属）。
      this.bumperClock = Math.max(0, this.bumperClock - 2.5);
      this.pumpClock = Math.max(0, this.pumpClock - 2.5);
      this.pumpTick = 0;
    }
    // ---- 回旋刃接回记账：累积 combat.step 的接回数，开火时结算连击。 ----
    this.catchFlag += c.boomerangCatch;
    c.boomerangCatch = 0;
    // ---- 前武器 / 后武器。 ----
    for (let i = 0; i < 2; i++) {
      const w = this.slots[i]; if (!w) continue;
      const def = weaponById(w.weaponId);
      const l = Math.max(0, Math.min(4, w.level - 1));
      w.cooldown = Math.max(0, w.cooldown - dt);
      const branchA = w.branch === 'a' && w.level >= 3;
      const branchB = w.branch === 'b' && w.level >= 3;
      switch (def.behavior) {
        case 'pierce': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range); if (!target) break;
          const speed = def.speed;
          const angle = this.leadAngle(target, x, p.progress, speed);
          const b = c.bullets.acquire(); if (!b) break;
          b.x = b.px = x; b.z = b.pz = p.progress + 30;
          b.vx = Math.sin(angle) * speed; b.vz = Math.cos(angle) * speed + p.speed * 0.3;
          b.damage = def.damage[l] * this.spendCharge();
          b.life = range / speed; b.kind = 1; b.level = w.level;
          // 压路：贯穿 +2、保留更多伤害；破甲：贯穿降至 1，靠连续命中上破甲。
          b.pierce = branchA ? def.pierce[l] + 2 : branchB ? 1 : def.pierce[l];
          b.targetSlot = -1; b.hitMask.fill(0);
          b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
          b.leg = 0; b.hits = 0; b.age = 0;
          c.prepareBullet(b);
          c.shots++; c.muzzleFlash = 0.08;
          w.cooldown = def.interval[l] * (branchA ? 1.25 : 1) * c.rateMult;
          break;
        }
        case 'boomerang': {
          if (w.cooldown > 0) break;
          // 接回账本：上一轮有接回则连击 +1（漏接清零），连斩分支按层缩短本轮冷却。
          if (this.catchFlag > 0) { this.catchStreak = Math.min(3, this.catchStreak + 1); this.catchFlag = 0; }
          else this.catchStreak = 0;
          const mult = this.spendCharge();
          let blades = def.count[l];
          if (branchA && w.level >= 4) blades++;
          if (branchB && w.level >= 5) blades += Math.min(2, this.catchStreak);
          const spread = branchA ? 0.35 * 1.6 : 0.35;
          const dmg = def.damage[l] * (branchA ? 0.85 : 1) * mult;
          for (let j = 0; j < blades; j++) {
            const b = c.bullets.acquire(); if (!b) break;
            const a = (j - (blades - 1) / 2) * spread;
            b.x = b.px = x; b.z = b.pz = p.progress + 26;
            b.vx = Math.sin(a) * def.speed; b.vz = Math.cos(a) * def.speed + p.speed * 0.3;
            b.damage = dmg; b.life = BLADE_LIFE; b.kind = 2; b.level = w.level;
            b.pierce = 9; b.targetSlot = -1; b.hitMask.fill(0);
            b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
            b.leg = 0; b.hits = 0; b.age = 0;
            c.prepareBullet(b);
          }
          c.shots++;
          const discount = branchB ? 1 - 0.15 * Math.min(2, this.catchStreak) : 1;
          w.cooldown = def.interval[l] * discount * c.rateMult;
          break;
        }
        case 'straight': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range); if (!target) break;
          const speed = def.speed;
          const angle = this.leadAngle(target, x, p.progress, speed);
          const b = c.bullets.acquire(); if (!b) break;
          b.x = b.px = x; b.z = b.pz = p.progress + 30;
          b.vx = Math.sin(angle) * speed; b.vz = Math.cos(angle) * speed + p.speed * 0.3;
          b.damage = def.damage[l] * this.spendCharge();
          b.life = range / speed; b.kind = 3; b.level = w.level;
          b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
          b.tex = ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
          b.leg = 0; b.hits = 0; b.age = 0;
          c.prepareBullet(b);
          c.shots++; c.muzzleFlash = 0.08;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'scatter': {
          if (w.cooldown > 0) break;
          const target = c.nearest(x, p.progress); if (!target) break;
          const originX = x - Math.sin(p.heading) * 24;
          const originZ = p.progress - Math.cos(p.heading) * 24;
          const speed = def.speed + p.speed * 0.3;
          const dx = target.x - originX, dz = target.z - originZ;
          const lead = interceptTime(dx, dz, target.vx, target.vz, speed);
          const aimX = dx + target.vx * lead, aimZ = dz + target.vz * lead;
          const length = Math.max(1, Math.hypot(aimX, aimZ));
          const aimAx = aimX / length, aimAz = aimZ / length;
          const mult = this.spendCharge();
          const meta = this.metaFor(w, def);
          for (let pellet = -1; pellet <= 1; pellet++) {
            const b = c.bullets.acquire(); if (!b) break;
            const angle = pellet * PELLET_SPREAD, cos = Math.cos(angle), sin = Math.sin(angle);
            const vx = aimAx * cos - aimAz * sin, vz = aimAx * sin + aimAz * cos;
            b.x = b.px = originX + vx * 22; b.z = b.pz = originZ + vz * 22;
            b.vx = vx * speed; b.vz = vz * speed;
            b.life = 1.2; b.damage = def.damage[l] * mult; b.kind = 0; b.level = 1;
            b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
            b.tex = ''; b.traits = c.sauceBits; b.meta = meta;
            b.leg = 0; b.hits = 0; b.age = 0;
            c.prepareBullet(b);
            c.pelletsFired++;
          }
          c.shots++; c.muzzleFlash = 0.08;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'exhaust': {
          // 过热喷口：喷 3s 强制冷却 2.2s；Lv5 冷却结束后获得 1s 双倍爆发窗口。
          if (this.overheat > 0) {
            this.overheat = Math.max(0, this.overheat - dt);
            if (this.overheat === 0 && w.level >= 5 && branchB) this.hotBoost = 1;
            break;
          }
          this.hotTime += dt;
          if (branchB && w.level >= 3 && this.hotTime >= 3) { this.overheat = 2.2; this.hotTime = 0; break; }
          this.hotBoost = Math.max(0, this.hotBoost - dt);
          // 火带每帧沿车尾铺设，留在道路坐标，不跟车身移动；直喷按冷却节拍出伤。
          const drop = branchA && w.level >= 5 ? TRAIL_DROP_LONG : TRAIL_DROP;
          const trailDps = EXHAUST_TRAIL.dps[l];
          const trailLife = EXHAUST_TRAIL.life[l] * (branchA ? EXHAUST_TRAIL.longLife : 1);
          this.trailTick += dt;
          while (this.trailTick >= drop) {
            this.trailTick -= drop;
            const seg = this.trails.acquire(); if (!seg) break;
            seg.x = x; seg.z = p.progress - 18; seg.life = trailLife; seg.dps = trailDps;
          }
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const arc = (70 + l * 5) * Math.PI / 180;
          const tick = def.damage[l] * (branchA ? 0.7 : 1) * (this.hotBoost > 0 ? 2 : 1);
          for (let j = 0; j < c.enemies.capacity; j++) {
            const e = c.enemies.items[j]; if (!e.active) continue;
            const dx = e.x - x, dz = e.z - p.progress, d = Math.hypot(dx, dz);
            if (d > range || dz >= 0 || Math.abs(Math.atan2(dx, -dz)) > arc) continue;
            c.seasonedHit(e, tick, c.sauceBits);
            if (e.active && w.level >= 2) c.applyBurn(e, 1.2, tick * 0.8);
          }
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'alternating': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range); if (!target) break;
          const speed = def.speed;
          const angle = this.leadAngle(target, x, p.progress, speed);
          this.altSide = -this.altSide;
          const b = c.bullets.acquire(); if (!b) break;
          let meta = this.metaFor(w, def);
          if (!branchB) meta |= META_FLANK;
          b.x = b.px = x + this.altSide * 12; b.z = b.pz = p.progress + 30;
          b.vx = Math.sin(angle) * speed; b.vz = Math.cos(angle) * speed + p.speed * 0.3;
          b.damage = def.damage[l] * this.spendCharge();
          b.life = range / speed; b.kind = 3; b.level = w.level;
          b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
          b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = meta;
          b.leg = 0; b.hits = 0; b.age = 0;
          c.prepareBullet(b);
          c.shots++; c.muzzleFlash = 0.08;
          w.cooldown = def.interval[l] * (branchB ? (w.level >= 5 ? 0.7 : 0.78) : 1) * c.rateMult;
          break;
        }
        case 'jumper': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range); if (!target) break;
          const speed = def.speed;
          const angle = this.leadAngle(target, x, p.progress, speed);
          const b = c.bullets.acquire(); if (!b) break;
          b.x = b.px = x; b.z = b.pz = p.progress + 30;
          b.vx = Math.sin(angle) * speed; b.vz = Math.cos(angle) * speed + p.speed * 0.3;
          b.damage = def.damage[l] * this.spendCharge();
          b.life = range / speed + 0.8; b.kind = 5; b.level = w.level;
          // pierce 作为跳跃预算：命中后侧跳新目标，逐跳衰减。
          b.pierce = def.pierce[l] + (branchA && w.level >= 3 ? 2 : 0) + (branchA && w.level >= 5 ? 1 : 0);
          b.targetSlot = -1; b.hitMask.fill(0);
          b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
          b.leg = 0; b.hits = 0; b.age = 0;
          c.prepareBullet(b);
          c.shots++; c.muzzleFlash = 0.08;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'rocket': {
          // 锁定区相对道路：目标大幅横移（霸王侧撞）才打断，玩家普通转弯不打断。
          const range = def.range[l];
          let target: Enemy | null = null;
          const boss = c.bossSlot >= 0 ? c.enemies.items[c.bossSlot] : null;
          if (boss && boss.active && boss.z > p.progress) target = boss;
          else target = this.nearestForward(x, p.progress, range);
          if (target && Math.hypot(target.x - x, target.z - p.progress) <= range) {
            if (this.lockSlot !== target.slot) {
              this.lockSlot = target.slot; this.lockTime = 0; this.lockAnchorX = target.x; this.lockGrace = 0;
            } else if (Math.abs(target.x - this.lockAnchorX) > 90) {
              this.lockGrace += dt;
              if (this.lockGrace > 0.5) { this.lockTime = 0; this.lockAnchorX = target.x; this.lockGrace = 0; }
            } else {
              this.lockGrace = 0;
              this.lockTime += dt;
            }
            this.lockNeed = Math.max(1.2, 2.2 - l * 0.15);
            if (this.lockTime >= this.lockNeed && w.cooldown <= 0) {
              let count = def.count[l] + (branchB && w.level >= 3 ? 1 : 0) + (branchB && w.level >= 5 ? 1 : 0);
              const dmg = def.damage[l] * (branchA ? 1.25 : 1) * this.spendCharge();
              const second = branchB && w.level >= 3 ? this.nearestForward(x, p.progress, range) : null;
              for (let j = 0; j < count; j++) {
                const b = c.bullets.acquire(); if (!b) break;
                const a = (j - (count - 1) / 2) * 0.12;
                b.x = b.px = x; b.z = b.pz = p.progress + 26;
                b.vx = Math.sin(a) * def.speed; b.vz = Math.cos(a) * def.speed + p.speed * 0.3;
                b.damage = dmg; b.life = range / def.speed + 0.8; b.kind = 4; b.level = w.level;
                b.pierce = 1; b.targetSlot = second && (j & 1) === 1 ? second.slot : this.lockSlot;
                b.hitMask.fill(0);
                b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
                b.leg = 0; b.hits = 0; b.age = 0;
                c.prepareBullet(b);
                c.shots++;
              }
              c.muzzleFlash = 0.1;
              w.cooldown = def.interval[l] * c.rateMult;
              this.lockTime = 0; // 齐射后重新积累锁定：抓走线窗口的节奏
            }
          } else {
            this.lockSlot = -1; this.lockTime = 0; this.lockGrace = 0;
          }
          break;
        }
        case 'volley': {
          if (this.volleyRows > 0) {
            this.volleyTick -= dt;
            if (this.volleyTick <= 0) {
              this.volleyTick = 0.11;
              this.volleyRows--;
              const cols = def.count[l] + (branchA && w.level >= 3 ? 1 : 0) + (branchA && w.level >= 5 ? 1 : 0);
              const dmg = def.damage[l] * (branchB && w.level >= 3 ? 0.9 : 1) * this.spendCharge();
              const target = this.nearestForward(x, p.progress, def.range[l]);
              const angle = target ? this.leadAngle(target, x, p.progress, def.speed) : 0;
              for (let j = 0; j < cols; j++) {
                const b = c.bullets.acquire(); if (!b) break;
                const off = (j - (cols - 1) / 2) * 46;
                b.x = b.px = x + off; b.z = b.pz = p.progress + 28;
                b.vx = Math.sin(angle) * def.speed; b.vz = Math.cos(angle) * def.speed + p.speed * 0.3;
                b.damage = dmg; b.life = def.range[l] / def.speed; b.kind = 6; b.level = w.level;
                b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
                b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
                b.leg = 0; b.hits = 0; b.age = 0;
                c.prepareBullet(b);
              }
              c.shots++; c.muzzleFlash = 0.06;
            }
            break;
          }
          if (w.cooldown > 0) break;
          this.volleyRows = 3 + (branchB && w.level >= 3 ? 2 : 0) + (branchB && w.level >= 5 ? 1 : 0);
          this.volleyTick = 0;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'saw': {
          if (w.cooldown > 0) break;
          const saw = this.saws.acquire();
          if (saw) {
            const twin = branchB && w.level >= 3;
            this.sawSide = -this.sawSide;
            saw.x = x + (twin ? this.sawSide * 40 : 0);
            saw.z = p.progress - 26;
            saw.life = w.level + 2.5 + (branchA ? 1 : 0);
            saw.radius = def.range[l] * (branchA && w.level >= 3 ? 1.4 : twin ? 0.75 : 1);
            saw.dps = def.damage[l] * (branchA && w.level >= 3 ? 0.8 : twin ? 1.1 : 1) * (branchA && w.level >= 5 ? 1.3 : 1);
            saw.spin = 0;
          }
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'mine': {
          if (w.cooldown > 0) break;
          const mine = this.mines.acquire();
          if (mine) {
            mine.x = x; mine.z = p.progress - 24;
            mine.life = 9; mine.level = w.level; mine.meta = this.metaFor(w, def); mine.chainDepth = 0;
          }
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'pulse': {
          if (w.cooldown > 0) break;
          const range = def.range[l] * (branchA && w.level >= 3 ? 1.4 : 1);
          const push = (30 + l * 6) * (branchA && w.level >= 3 ? 1.5 : 1);
          for (let j = 0; j < c.enemies.capacity; j++) {
            const e = c.enemies.items[j]; if (!e.active) continue;
            const dx = e.x - x, dz = e.z - p.progress, d = Math.hypot(dx, dz);
            if (d > range) continue;
            e.x += dx / Math.max(1, d) * push; e.z += dz / Math.max(1, d) * push;
            c.seasonedHit(e, def.damage[l], c.sauceBits);
            if (!e.active) continue;
            if (branchB && w.level >= 3) {
              e.slow = Math.min(e.slow, 0.6); e.slowTime = 1.2;
              if (w.level >= 5) c.hit(e, 6);
            }
            // 推撞：被推开的敌人压到同伙，双方连带掉血（§5 目录 W21）。
            for (let k = 0; k < c.enemies.capacity; k++) {
              const other = c.enemies.items[k];
              if (other.active && other !== e && Math.hypot(other.x - e.x, other.z - e.z) < 42) {
                c.hit(other, def.damage[l] * 0.8);
                if (e.active) c.hit(e, def.damage[l] * 0.8);
                break;
              }
            }
          }
          this.pulseFlash = 1;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'freeze': {
          if (branchB && w.level >= 3) {
            // 冰雾路障：放弃单体冻结，改为后方范围持续缓速（§5.6 分支）。
            if (w.cooldown > 0) break;
            const range = def.range[l] * (w.level >= 5 ? 1.3 : 1);
            for (let j = 0; j < c.enemies.capacity; j++) {
              const e = c.enemies.items[j]; if (!e.active) continue;
              const dx = e.x - x, dz = e.z - p.progress;
              if (dz > 40 || Math.hypot(dx, dz) > range) continue;
              e.slow = Math.min(e.slow, 0.6); e.slowTime = 1.2;
              c.seasonedHit(e, def.damage[l] * 0.6, c.sauceBits);
            }
            w.cooldown = 0.5 * c.rateMult;
            break;
          }
          if (w.cooldown > 0) break;
          // 锁定最迫近的后侧威胁（§5.6）：追兵可完整冻结，霸王只吃软控。
          let target: Enemy | null = null, best = def.range[l] * def.range[l];
          for (let j = 0; j < c.enemies.capacity; j++) {
            const e = c.enemies.items[j];
            if (!e.active || (e.kind !== 2 && e.kind !== 3) || e.z >= p.progress) continue;
            const dx = e.x - x, dz = e.z - p.progress, d2 = dx * dx + dz * dz;
            if (d2 < best) { target = e; best = d2; }
          }
          if (!target) break;
          // 已冻结的目标跳过积累：冻住后是玩家的撞碎/脱身窗口，续冻会让控制永不解除。
          if (target.frozen) break;
          if (target.chillResist > 0) { w.cooldown = def.interval[l]; break; }
          if (this.freezeSlot !== target.slot) { this.freezeSlot = target.slot; target.chill = 0; }
          const buildup = Math.max(1.2, 2.6 - l * 0.25) * (branchA && w.level >= 3 ? 0.7 : 1);
          target.chill += 100 * def.interval[l] / buildup;
          c.seasonedHit(target, def.damage[l], c.sauceBits);
          if (target.chill >= 100) {
            if (target.kind === 3) {
              // Boss 不完整冻结：只短暂软控，寒意部分保留可再次积累。
              target.slow = Math.min(target.slow, 0.55); target.slowTime = 1.5; target.chill = 55;
            } else {
              target.frozen = true; target.slow = 0;
              target.slowTime = 1.5 + l * 0.25 + (branchA ? 1 : 0) + (w.level >= 5 && branchA ? 0.5 : 0);
              target.chill = 0;
            }
          }
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'spiral': {
          const rot = (2.6 + l * 0.3) * (branchB && w.level >= 3 ? 1.5 : branchA && w.level >= 3 ? 0.8 : 1);
          this.spiralAngle += rot * dt;
          this.spiralPhase += dt * (0.9 + l * 0.08) * (branchA && w.level >= 3 ? 1.15 : 1);
          const near = def.range[l] * 0.55;
          const far = def.range[l] + 26 + (branchA && w.level >= 5 ? def.range[l] * 0.3 : 0);
          const radius = near + (far - near) * (0.5 + 0.5 * Math.sin(this.spiralPhase));
          const bx = x + Math.cos(this.spiralAngle) * radius * 0.8;
          const bz = p.progress - 30 + Math.sin(this.spiralAngle) * radius * 0.55;
          this.spiralX = bx; this.spiralZ = bz; this.spiralR = radius;
          for (let j = 0; j < c.enemies.capacity; j++) {
            const e = c.enemies.items[j]; if (!e.active || e.grindCd > 0) continue;
            const dx = e.x - bx, dz = e.z - bz;
            if (dx * dx + dz * dz > 22 * 22) continue;
            c.seasonedHit(e, def.damage[l], c.sauceBits);
            if (e.active) e.grindCd = branchB && w.level >= 5 ? 0.25 : branchB && w.level >= 3 ? 0.35 : 0.5;
          }
          break;
        }
        case 'sticky': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range); if (!target) break;
          const speed = def.speed;
          const angle = this.leadAngle(target, x, p.progress, speed);
          const b = c.bullets.acquire(); if (!b) break;
          b.x = b.px = x; b.z = b.pz = p.progress + 30;
          b.vx = Math.sin(angle) * speed; b.vz = Math.cos(angle) * speed + p.speed * 0.3;
          b.damage = def.damage[l] * this.spendCharge();
          b.life = range / speed; b.kind = 11; b.level = w.level;
          b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
          b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
          b.leg = 0; b.hits = 0; b.age = 0;
          c.prepareBullet(b);
          c.shots++; c.muzzleFlash = 0.08;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'closeburst': {
          if (w.cooldown > 0) break;
          const range = def.range[l] * (branchA && w.level >= 3 ? 1.4 : 1);
          const target = this.nearestForward(x, p.progress, range);
          const dist = target ? Math.hypot(target.x - x, target.z - p.progress) : range;
          const pellets = def.count[l] + (branchA && w.level >= 5 ? 2 : 0);
          const dmg = def.damage[l] * (branchB && w.level >= 3 ? 0.85 : 1)
            * (branchA && w.level >= 3 && dist < 160 ? 1.5 : 1) * this.spendCharge();
          for (let j = 0; j < pellets; j++) {
            const b = c.bullets.acquire(); if (!b) break;
            const a = (j / Math.max(1, pellets - 1) - 0.5) * 0.9;
            b.x = b.px = x; b.z = b.pz = p.progress + 26;
            b.vx = Math.sin(a) * def.speed; b.vz = Math.cos(a) * def.speed + p.speed * 0.3;
            b.damage = dmg; b.life = range / def.speed * 0.55; b.kind = 6; b.level = w.level;
            b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
            b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
            b.leg = 0; b.hits = 0; b.age = 0;
            c.prepareBullet(b);
          }
          c.shots++; c.muzzleFlash = 0.09;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'rail': {
          // 蓄能不满不开火；开火是瞬时线击，落空整轮蓄能作废（§5 目录 W08）。
          const chargeTime = def.interval[l] * (branchB && w.level >= 3 ? 0.7 : 1);
          const target = this.nearestForward(x, p.progress, def.range[l]);
          if (!target) { this.railCharge = Math.min(this.railCharge, chargeTime * 0.9); break; }
          this.railCharge += dt;
          this.railAngle = this.leadAngle(target, x, p.progress, 2000);
          this.railProgress = Math.min(1, this.railCharge / chargeTime);
          if (this.railCharge < chargeTime || w.cooldown > 0) break;
          let dmg = def.damage[l] * (branchB && w.level >= 5 ? 1.15 : 1) * this.spendCharge();
          const retain = branchA && w.level >= 5 ? 1 : 0.85;
          let remaining = def.range[l];
          let hits = 0;
          for (let j = 0; j < c.enemies.capacity && hits < def.pierce[l]; j++) {
            const e = c.enemies.items[j]; if (!e.active || e.z <= p.progress) continue;
            const dx = e.x - x, dz = e.z - p.progress;
            const along = dx * Math.sin(this.railAngle) + dz * Math.cos(this.railAngle);
            if (along <= 0 || along > remaining) continue;
            const perp = Math.abs(dx * Math.cos(this.railAngle) - dz * Math.sin(this.railAngle));
            if (perp > 20) continue;
            c.seasonedHit(e, dmg, c.sauceBits);
            hits++;
            dmg *= retain;
          }
          c.shots++; c.muzzleFlash = 0.1;
          this.railCharge = 0; this.railProgress = 0;
          w.cooldown = 0.4;
          break;
        }
        case 'mortar': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range);
          const shots = branchB && w.level >= 3 ? 2 : 1;
          for (let j = 0; j < shots; j++) {
            const b = c.bullets.acquire(); if (!b) break;
            const dist = target ? Math.min(range, Math.hypot(target.x - x, target.z - p.progress)) : range * 0.7;
            const lead = target ? interceptTime(target.x - x, target.z - p.progress, target.vx, target.vz, def.speed) : 0;
            const aimX = target ? target.x + target.vx * lead - x : 0;
            const a = Math.atan2(aimX, dist) + (shots > 1 ? (j - 0.5) * 0.22 : 0);
            b.x = b.px = x; b.z = b.pz = p.progress + 24;
            b.vx = Math.sin(a) * def.speed; b.vz = Math.cos(a) * def.speed;
            b.damage = def.damage[l] * (branchB && w.level >= 3 ? 0.85 : 1) * this.spendCharge();
            b.life = dist / def.speed; b.kind = 7; b.level = w.level;
            b.pierce = 9; b.targetSlot = -1; b.hitMask.fill(0);
            b.tex = def.artKey ?? ''; b.traits = c.sauceBits;
            b.meta = (this.metaFor(w, def) & ~8) | (branchB ? 32 : 0);
            b.leg = 0; b.hits = 0; b.age = 0;
            c.prepareBullet(b);
          }
          c.shots++; c.muzzleFlash = 0.09;
          w.cooldown = def.interval[l] * (branchA && w.level >= 3 ? 1.2 : 1) * c.rateMult;
          break;
        }
        case 'bounce': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range);
          const speed = def.speed;
          const angle = target ? this.leadAngle(target, x, p.progress, speed) : 0;
          const b = c.bullets.acquire(); if (!b) break;
          b.x = b.px = x; b.z = b.pz = p.progress + 26;
          b.vx = Math.sin(angle) * speed; b.vz = Math.cos(angle) * speed + p.speed * 0.3;
          b.damage = def.damage[l] * (branchB && w.level >= 3 ? 0.8 : 1) * this.spendCharge();
          b.life = range / speed + 0.6; b.kind = 9; b.level = w.level;
          b.pierce = def.count[l] + (branchB && w.level >= 3 ? 2 : 0) - (branchA && w.level >= 3 ? 1 : 0);
          b.targetSlot = -1; b.hitMask.fill(0);
          b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
          b.leg = 0; b.hits = 0; b.age = 0;
          c.prepareBullet(b);
          c.shots++; c.muzzleFlash = 0.08;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'fence': {
          if (w.cooldown > 0) break;
          const wall = this.blockers.acquire();
          if (wall) {
            wall.x = x; wall.z = p.progress - 34;
            wall.hp = def.range[l] + (branchA && w.level >= 3 ? 2 : 0);
            wall.life = 8; wall.dmg = def.damage[l] * (branchB && w.level >= 3 ? 1.4 : 1);
            wall.frost = false; wall.meta = this.metaFor(w, def);
          }
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'drill': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range); if (!target) break;
          const speed = def.speed;
          const angle = this.leadAngle(target, x, p.progress, speed);
          const b = c.bullets.acquire(); if (!b) break;
          b.x = b.px = x; b.z = b.pz = p.progress + 30;
          b.vx = Math.sin(angle) * speed; b.vz = Math.cos(angle) * speed + p.speed * 0.3;
          b.damage = def.damage[l] * this.spendCharge();
          b.life = range / speed; b.kind = 10; b.level = w.level;
          b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
          b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
          b.leg = 0; b.hits = 0; b.age = 0;
          c.prepareBullet(b);
          c.shots++; c.muzzleFlash = 0.08;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'sidesweep': {
          if (w.cooldown > 0) break;
          const range = def.range[l] * (branchA && w.level >= 3 ? 1.3 : 1);
          const halfArc = (26 + l * 2) * (branchA && w.level >= 3 ? 1.3 : 1) * Math.PI / 180;
          const both = p.released > 0;
          const dmg = def.damage[l] * (branchA && w.level >= 3 ? 0.85 : 1);
          for (let side = -1; side <= 1; side += 2) {
            if (!both && side !== this.sideSide) continue;
            for (let j = 0; j < c.enemies.capacity; j++) {
              const e = c.enemies.items[j]; if (!e.active) continue;
              const dx = e.x - x, dz = e.z - p.progress;
              if (dz >= 0 || Math.hypot(dx, dz) > range) continue;
              const rel = Math.atan2(dx, -dz);
              if (Math.abs(rel - side * (0.6 + halfArc * 0.5)) > halfArc) continue;
              c.seasonedHit(e, dmg, c.sauceBits);
            }
          }
          this.sideSide = -this.sideSide;
          w.cooldown = def.interval[l] * (branchB && w.level >= 3 ? 0.85 : 1) * c.rateMult;
          break;
        }
        case 'cluster': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range);
          const dist = target ? Math.min(range, Math.hypot(target.x - x, target.z - p.progress)) : range * 0.7;
          const lead = target ? interceptTime(target.x - x, target.z - p.progress, target.vx, target.vz, def.speed) : 0;
          const aimX = target ? target.x + target.vx * lead - x : 0;
          const b = c.bullets.acquire(); if (!b) break;
          const a = Math.atan2(aimX, dist);
          b.x = b.px = x; b.z = b.pz = p.progress + 24;
          b.vx = Math.sin(a) * def.speed; b.vz = Math.cos(a) * def.speed;
          b.damage = def.damage[l] * (branchB && w.level >= 3 ? 1.4 : 1) * this.spendCharge();
          b.life = dist / def.speed; b.kind = 7; b.level = w.level;
          b.pierce = 9; b.targetSlot = -1; b.hitMask.fill(0);
          b.tex = def.artKey ?? ''; b.traits = c.sauceBits;
          b.meta = (this.metaFor(w, def) & ~8) | META_CLUSTER;
          b.leg = 0; b.hits = 0; b.age = 0;
          c.prepareBullet(b);
          c.shots++; c.muzzleFlash = 0.09;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'cloud': {
          if (w.cooldown > 0) break;
          const pellets = Math.round(def.count[l] * (branchA && w.level >= 3 ? 1.5 : 1));
          const dmg = def.damage[l] * (branchA && w.level >= 3 ? 0.8 : 1) * this.spendCharge();
          for (let j = 0; j < pellets; j++) {
            const b = c.bullets.acquire(); if (!b) break;
            const a = Math.PI + (j / Math.max(1, pellets - 1) - 0.5) * 0.9;
            b.x = b.px = x; b.z = b.pz = p.progress - 14;
            b.vx = Math.sin(a) * 120; b.vz = Math.cos(a) * 120 - p.speed * 0.92;
            b.damage = dmg; b.life = 1.15; b.kind = 6; b.level = w.level;
            b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
            b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = branchB ? 2 : 0;
            b.leg = 0; b.hits = 0; b.age = 0;
            c.prepareBullet(b);
          }
          c.shots++;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'wires': {
          // 锚点固定在道路坐标，车身转向改变切割索夹角；收网分支随寿命收紧。
          if (this.wireLife <= 0 || w.cooldown <= 0) {
            const reach = def.range[l] * (branchA && w.level >= 3 ? 1.3 : 1);
            this.wireAx = x - reach * 0.5; this.wireAz = p.progress - reach * 0.62;
            this.wireBx = x + reach * 0.5; this.wireBz = p.progress - reach * 0.62;
            this.wireLife = 2.5 + (branchA && w.level >= 3 ? 0.8 : 0);
            w.cooldown = def.interval[l] * c.rateMult;
          }
          this.wireLife -= dt;
          if (branchB && w.level >= 3) {
            const pull = Math.min(1, dt * 1.4);
            this.wireAx += (x - this.wireAx) * pull * 0.35;
            this.wireBx += (x - this.wireBx) * pull * 0.35;
            this.wireAz += (p.progress - this.wireAz) * pull * 0.3;
            this.wireBz += (p.progress - this.wireBz) * pull * 0.3;
          }
          const dmg = def.damage[l] * (branchB && w.level >= 3 ? 1.3 : 1);
          const abx = this.wireBx - this.wireAx, abz = this.wireBz - this.wireAz;
          const len2 = Math.max(1, abx * abx + abz * abz);
          for (let j = 0; j < c.enemies.capacity; j++) {
            const e = c.enemies.items[j]; if (!e.active || e.grindCd > 0) continue;
            const t = Math.max(0, Math.min(1, ((e.x - this.wireAx) * abx + (e.z - this.wireAz) * abz) / len2));
            const px = this.wireAx + abx * t, pz = this.wireAz + abz * t;
            const dx = e.x - px, dz = e.z - pz;
            if (dx * dx + dz * dz < 16 * 16) {
              c.seasonedHit(e, dmg, c.sauceBits);
              if (e.active) e.grindCd = 0.45;
            }
          }
          break;
        }
        case 'stream': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range);
          const aim = target ? this.leadAngle(target, x, p.progress, 1200) : 0;
          const cone = 10 * (branchB && w.level >= 3 ? 1.8 : 1) * Math.PI / 180;
          const push = (22 + l * 4) * (branchA && w.level >= 3 ? 1.5 : 1);
          const dmg = def.damage[l] * ((branchA || branchB) && w.level >= 3 ? 0.85 : 1);
          for (let j = 0; j < c.enemies.capacity; j++) {
            const e = c.enemies.items[j]; if (!e.active) continue;
            const dx = e.x - x, dz = e.z - p.progress;
            if (dz <= 0 || Math.hypot(dx, dz) > range) continue;
            if (Math.abs(Math.atan2(dx, dz) - aim) > cone) continue;
            c.seasonedHit(e, dmg, c.sauceBits);
            if (e.active && e.kind !== 3) { e.z += push; e.x += Math.sin(aim) * push * 0.4; }
          }
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'bubble': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const bubbles = def.count[l] + (branchB && w.level >= 3 ? 1 : 0);
          for (let j = 0; j < bubbles; j++) {
            const b = c.bullets.acquire(); if (!b) break;
            const a = (j - (bubbles - 1) / 2) * 0.16;
            b.x = b.px = x; b.z = b.pz = p.progress + 26;
            b.vx = Math.sin(a) * def.speed * 0.5; b.vz = Math.cos(a) * def.speed;
            b.damage = def.damage[l] * (branchB && w.level >= 3 ? 0.85 : 1) * this.spendCharge();
            b.life = range / def.speed + 1.4; b.kind = 8; b.level = w.level;
            b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
            b.tex = def.artKey ?? ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
            b.leg = 0; b.hits = 0; b.age = 0;
            c.prepareBullet(b);
          }
          c.shots++;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'wave': {
          // 扩散波：从车尾一圈圈扩出，撞上刚扩出的波前收益更高（§5 目录 W25）。
          if (this.waveRadius < 0 && w.cooldown <= 0) {
            this.waveRadius = 30;
            this.waveRadius2 = branchB && w.level >= 3 ? -10 : -1;
            w.cooldown = def.interval[l] * c.rateMult;
          }
          const speed = 220 * (branchA && w.level >= 3 ? 1.3 : 1);
          if (this.waveRadius >= 0) {
            this.waveRadius += speed * dt;
            if (this.waveRadius > def.range[l]) this.waveRadius = -1;
          }
          if (this.waveRadius2 >= 0) {
            this.waveRadius2 += speed * dt;
            if (this.waveRadius2 > def.range[l]) this.waveRadius2 = -1;
          }
          for (let ring = 0; ring < 2; ring++) {
            const r = ring === 0 ? this.waveRadius : this.waveRadius2;
            if (r < 0) continue;
            for (let j = 0; j < c.enemies.capacity; j++) {
              const e = c.enemies.items[j]; if (!e.active || e.grindCd > 0) continue;
              const dx = e.x - x, dz = e.z - p.progress;
              if (dz > 20) continue;
              const d = Math.hypot(dx, dz);
              if (Math.abs(d - r) > 26) continue;
              const crest = r < 90 ? 1.6 : 1;
              c.seasonedHit(e, def.damage[l] * crest, c.sauceBits);
              if (e.active) { e.slow = Math.min(e.slow, 0.7); e.slowTime = 1.2; e.grindCd = 0.6; }
            }
          }
          break;
        }
        case 'frostwall': {
          if (w.cooldown > 0) break;
          const wall = this.blockers.acquire();
          if (wall) {
            wall.x = x; wall.z = p.progress - 34;
            wall.hp = def.range[l] + (branchA && w.level >= 3 ? 2 : 0);
            wall.life = 7; wall.dmg = def.damage[l];
            wall.frost = true; wall.meta = this.metaFor(w, def);
          }
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'laser': {
          // 热度光束：连续照射同一目标渐增，过热强制冷却（§5 目录 W27）。
          if (this.laserOverheat > 0) {
            this.laserOverheat = Math.max(0, this.laserOverheat - dt);
            this.laserOn = false;
            break;
          }
          const range = def.range[l];
          let target: Enemy | null = null;
          const boss = c.bossSlot >= 0 ? c.enemies.items[c.bossSlot] : null;
          if (boss && boss.active && boss.z > p.progress && boss.z - p.progress <= range) target = boss;
          else target = this.nearestForward(x, p.progress, range);
          if (!target) { this.laserHeat = Math.max(0, this.laserHeat - dt * 0.6); this.laserOn = false; break; }
          if (this.laserSlot !== target.slot) { this.laserSlot = target.slot; this.laserHeat *= 0.5; }
          this.laserOn = true;
          if (w.cooldown <= 0) {
            const heatBoost = 1 + Math.min(1, this.laserHeat / 3.5) * 0.8;
            c.seasonedHit(target, def.damage[l] * (branchA && w.level >= 3 ? 1.3 : 1) * heatBoost, c.sauceBits);
            if ((branchB && w.level >= 3) && target.active) {
              for (let k = 0; k < c.enemies.capacity; k++) {
                const other = c.enemies.items[k];
                if (other.active && other !== target && Math.hypot(other.x - target.x, other.z - target.z) <= 40) c.hit(other, def.damage[l] * 0.6);
              }
            }
            w.cooldown = def.interval[l] * c.rateMult;
          }
          this.laserHeat += dt * (branchA && w.level >= 3 ? 1.2 : 1);
          if (this.laserHeat >= 3.5) {
            this.laserHeat = 0; this.laserOverheat = 2.5; this.laserOn = false;
          }
          break;
        }
        case 'vortex': {
          const range = def.range[l];
          if (this.vortexTimer > 0) {
            // 聚拢阶段：后方敌人被拉向涡核，微伤（§5 目录 W28）。
            this.vortexTimer -= dt;
            this.vortexPulling = true;
            const pull = 90 * (branchA && w.level >= 3 ? 1.4 : 1);
            for (let j = 0; j < c.enemies.capacity; j++) {
              const e = c.enemies.items[j]; if (!e.active || e.kind === 3) continue;
              const dx = this.vortexX - e.x, dz = this.vortexZ - e.z;
              const d = Math.hypot(dx, dz);
              if (d > range || dz < -40) continue;
              e.x += dx / Math.max(1, d) * pull * dt;
              e.z += dz / Math.max(1, d) * pull * dt;
              if (w.cooldown <= 0) { c.seasonedHit(e, def.damage[l] * 0.5, c.sauceBits); }
            }
            if (w.cooldown <= 0) w.cooldown = 0.3 * c.rateMult;
            if (this.vortexTimer <= 0) {
              // 脉冲：向外爆发。
              for (let j = 0; j < c.enemies.capacity; j++) {
                const e = c.enemies.items[j]; if (!e.active) continue;
                const dx = e.x - this.vortexX, dz = e.z - this.vortexZ;
                const d = Math.hypot(dx, dz);
                if (d > range) continue;
                c.hit(e, def.damage[l] * 3 * (branchB && w.level >= 3 ? 1.4 : 1));
                if (e.active) {
                  e.x += dx / Math.max(1, d) * 50; e.z += dz / Math.max(1, d) * 50;
                  if (branchB && w.level >= 3) { e.slow = Math.min(e.slow, 0.6); e.slowTime = 1.2; }
                }
              }
              this.pulseFlash = 1;
            }
            break;
          }
          if (w.cooldown > 0) break;
          this.vortexTimer = 1.4;
          this.vortexX = x; this.vortexZ = p.progress - 70;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'piebox': {
          if (w.cooldown > 0) break;
          const box = this.pieboxes.acquire();
          if (box) {
            box.x = x; box.z = p.progress - 26;
            box.fuse = branchB && w.level >= 3 ? 1.6 : 2.2;
            box.dmg = def.damage[l] * (branchB && w.level >= 3 ? 0.85 : 1) * this.spendCharge();
            box.cols = def.count[l] + (branchA && w.level >= 3 ? 1 : 0);
          }
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'acid': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range); if (!target) break;
          const speed = def.speed;
          const angle = this.leadAngle(target, x, p.progress, speed);
          const b = c.bullets.acquire(); if (!b) break;
          b.x = b.px = x; b.z = b.pz = p.progress + 30;
          b.vx = Math.sin(angle) * speed; b.vz = Math.cos(angle) * speed + p.speed * 0.3;
          b.damage = def.damage[l] * this.spendCharge();
          b.life = range / speed; b.kind = 3; b.level = w.level;
          b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
          b.tex = def.artKey ?? ''; b.traits = c.sauceBits;
          b.meta = this.metaFor(w, def) | META_ACID;
          b.leg = 0; b.hits = 0; b.age = 0;
          c.prepareBullet(b);
          c.shots++; c.muzzleFlash = 0.08;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'pillar': {
          if (this.laserOverheat > 0) break;
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const target = this.nearestForward(x, p.progress, range); if (!target) break;
          if (this.pillarSlot !== target.slot) { this.pillarSlot = target.slot; this.pillarStacks = 0; }
          const cap = branchA && w.level >= 3 ? 5 : 4;
          this.pillarStacks = Math.min(cap, this.pillarStacks + 1);
          const dmg = def.damage[l] * (1 + 0.25 * this.pillarStacks) * this.spendCharge();
          c.seasonedHit(target, dmg, c.sauceBits);
          this.pillarX = target.x; this.pillarZ = target.z;
          if ((branchB && w.level >= 3) && target.active) {
            const width = 26 + this.pillarStacks * 7;
            for (let k = 0; k < c.enemies.capacity; k++) {
              const other = c.enemies.items[k];
              if (other.active && other !== target && Math.abs(other.x - target.x) < width && Math.abs(other.z - target.z) < 46) c.hit(other, dmg * 0.5);
            }
          }
          c.shots++;
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
        case 'spray': {
          if (w.cooldown > 0) break;
          const range = def.range[l];
          const arc = 80 * Math.PI / 180;
          for (let j = 0; j < c.enemies.capacity; j++) {
            const e = c.enemies.items[j]; if (!e.active) continue;
            const dx = e.x - x, dz = e.z - p.progress, d = Math.hypot(dx, dz);
            if (d > range || dz >= 0 || Math.abs(Math.atan2(dx, -dz)) > arc) continue;
            c.seasonedHit(e, def.damage[l], c.sauceBits);
            if (e.active && w.level >= 3) c.applyBurn(e, 1.2, def.damage[l] * 0.8);
          }
          w.cooldown = def.interval[l] * c.rateMult;
          break;
        }
      }
    }
    this.pulseFlash = Math.max(0, this.pulseFlash - dt * 2.5);
    // ---- 封路栅 / 凝霜墙（W14/W26）：拦截 z 方向穿越的追兵，次数耗尽碎裂。 ----
    for (let i = 0; i < this.blockers.capacity; i++) {
      const wall = this.blockers.items[i]; if (!wall.active) continue;
      wall.life -= dt;
      if (wall.life <= 0 || wall.z < p.progress - 450) { this.blockers.release(wall); continue; }
      for (let j = 0; j < c.enemies.capacity; j++) {
        const e = c.enemies.items[j];
        if (!e.active || e.kind === 3) continue;
        if (e.pz < wall.z && e.z >= wall.z && Math.abs(e.x - wall.x) < 52) {
          e.z = wall.z - 26; // 钉在接触距离之外：挡住而不是顶着喂碰撞
          c.seasonedHit(e, wall.dmg, c.sauceBits);
          if (e.active) {
            if (wall.frost) {
              e.slow = Math.min(e.slow, (wall.meta & 2) !== 0 ? 0.6 : 0.75);
              e.slowTime = 1.4;
            }
            wall.hp--;
            if (wall.hp <= 0) {
              c.blast(wall.x, wall.z);
              for (let k = 0; k < c.enemies.capacity; k++) {
                const victim = c.enemies.items[k];
                if (!victim.active) continue;
                const dx = victim.x - wall.x, dz = victim.z - wall.z;
                if (dx * dx + dz * dz <= 80 * 80) {
                  c.hit(victim, wall.dmg * 0.6);
                  if (victim.active && wall.frost) { victim.slow = Math.min(victim.slow, 0.6); victim.slowTime = 1.2; }
                }
              }
              this.blockers.release(wall);
              break;
            }
          } else { this.blockers.release(wall); break; }
        }
      }
    }
    // ---- 苹果派折叠弹匣（W29）：定时展开，向左右各射一扇弹片。 ----
    for (let i = 0; i < this.pieboxes.capacity; i++) {
      const box = this.pieboxes.items[i]; if (!box.active) continue;
      box.fuse -= dt;
      if (box.fuse > 0) continue;
      for (let side = -1; side <= 1; side += 2) {
        for (let n = 0; n < box.cols; n++) {
          const b = c.bullets.acquire(); if (!b) break;
          const a = side * (0.75 + n * 0.22);
          b.x = b.px = box.x; b.z = b.pz = box.z;
          b.vx = Math.sin(a) * 700; b.vz = Math.cos(a) * 700;
          b.damage = box.dmg; b.life = 0.8; b.kind = 6; b.level = 1;
          b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
          b.tex = 'food-heal-pie'; b.traits = c.sauceBits; b.meta = 0;
          b.leg = 0; b.hits = 0; b.age = 0;
          c.prepareBullet(b);
        }
      }
      c.shots++;
      this.pieboxes.release(box);
    }
    // ---- 菠萝熔心（W30）：被沾染的敌人沿自己的轨迹拖出酸浆伤害带。 ----
    const acid = this.slots[0];
    if (acid && acid.weaponId === 'W30') {
      const adef = weaponById('W30');
      const al = Math.max(0, Math.min(4, acid.level - 1));
      this.acidTick += dt;
      if (this.acidTick >= 0.25) {
        this.acidTick -= 0.25;
        const dps = adef.damage[al] * 0.3 * ((acid.branch === 'a' && acid.level >= 3) ? 1.5 : 1);
        for (let j = 0; j < c.enemies.capacity; j++) {
          const e = c.enemies.items[j];
          if (!e.active || e.acidTime <= 0) continue;
          const seg = this.trails.acquire();
          if (!seg) break;
          seg.x = e.x; seg.z = e.z; seg.life = 2.2; seg.dps = dps; seg.kind = 1;
        }
      }
    }
    // ---- 麦乐鸡雷阵（W17）：接触引爆；连环分支引相邻雷；黏附分支掷向重型目标。 ----
    for (let i = 0; i < this.mines.capacity; i++) {
      const m = this.mines.items[i]; if (!m.active) continue;
      m.life -= dt;
      if (m.life <= 0 || m.z < p.progress - 450) { this.mines.release(m); continue; }
      const l = Math.max(0, Math.min(4, m.level - 1));
      const mdef = weaponById('W17');
      const chain = (m.meta & 1) !== 0 && m.level >= 3;
      const sticky = (m.meta & 2) !== 0 && m.level >= 3;
      if (sticky && m.chainDepth === 0) {
        // 黏附重雷：重型目标（购物车）进入近后方区域，最近一枚雷掷向它。
        let heavy: Enemy | null = null, heavyD = 170 * 170;
        for (let j = 0; j < c.enemies.capacity; j++) {
          const e = c.enemies.items[j];
          if (!e.active || e.kind !== 1 || e.z >= p.progress) continue;
          const dz = e.z - p.progress, d2 = dz * dz;
          if (d2 < heavyD) { heavy = e; heavyD = d2; }
        }
        if (heavy) {
          m.x = heavy.x; m.z = heavy.z;
          this.explodeMine(m, mdef, p, 0, 1.4);
          continue;
        }
      }
      for (let j = 0; j < c.enemies.capacity; j++) {
        const e = c.enemies.items[j];
        // 36px 接触圈：突进后贴在车尾的骑手（-30px）也必然踩到刚放下的雷。
        if (!e.active || Math.hypot(e.x - m.x, e.z - m.z) > 36) continue;
        this.explodeMine(m, mdef, p, 0, 1);
        break;
      }
      void chain; void l;
    }
    // ---- 薯饼后置圆锯（W13）：留在道路坐标持续切割，到期消失。 ----
    for (let i = 0; i < this.saws.capacity; i++) {
      const saw = this.saws.items[i]; if (!saw.active) continue;
      saw.life -= dt; saw.spin += dt * 3;
      if (saw.life <= 0 || saw.z < p.progress - 450) { this.saws.release(saw); continue; }
      for (let j = 0; j < c.enemies.capacity; j++) {
        const e = c.enemies.items[j]; if (!e.active) continue;
        const dx = e.x - saw.x, dz = e.z - saw.z;
        if (dx * dx + dz * dz <= saw.radius * saw.radius) c.hit(e, saw.dps * dt);
      }
    }
    // ---- 火带 / 酸浆带结算：持续伤害；火带灼烧取最强来源，酸浆带可沾染传播。 ----
    for (let i = 0; i < this.trails.capacity; i++) {
      const seg = this.trails.items[i]; if (!seg.active) continue;
      seg.life -= dt;
      if (seg.life <= 0 || seg.z < p.progress - 450) { this.trails.release(seg); continue; }
      const seconds = seg.kind === 1 ? 1.2 : 1.6 * (hasSauce(c.sauceBits, 'chili') ? SAUCE.nativeBurnBoost : 1);
      for (let j = 0; j < c.enemies.capacity; j++) {
        const e = c.enemies.items[j]; if (!e.active) continue;
        const dx = e.x - seg.x, dz = e.z - seg.z;
        if (dx * dx + dz * dz <= TRAIL_RADIUS * TRAIL_RADIUS) {
          c.hit(e, seg.dps * dt);
          if (seg.kind === 0) c.applyBurn(e, seconds, seg.dps);
          else if (e.active && e.acidTime <= 0 && (this.slots[0]?.branch === 'b')) e.acidTime = 1.2;
        }
      }
    }
  }
  clear(): void {
    this.trails.clear(); this.mines.clear(); this.saws.clear();
    this.driftCharge = 0;
    this.bumperClock = this.pumpClock = this.pumpTick = 0;
    this.cremaCd = this.trailTick = 0;
    this.overheat = this.hotTime = this.hotBoost = 0;
    this.catchStreak = this.catchFlag = 0;
    this.lockSlot = -1; this.lockTime = 0; this.lockGrace = 0;
    this.altSide = 1; this.volleyRows = 0; this.volleyTick = 0;
    this.freezeSlot = -1; this.sawSide = 1;
    this.spiralAngle = this.spiralPhase = this.spiralX = this.spiralZ = this.spiralR = 0;
    this.pulseFlash = 0;
    this.railCharge = this.railProgress = 0; this.railAngle = 0;
    this.laserSlot = -1; this.laserHeat = 0; this.laserOn = false; this.laserOverheat = 0;
    this.waveRadius = this.waveRadius2 = -1;
    this.wireLife = 0; this.wireAx = this.wireAz = this.wireBx = this.wireBz = 0;
    this.vortexTimer = 0; this.vortexX = this.vortexZ = 0; this.vortexPulling = false;
    this.sideSide = 1; this.acidTick = 0;
    this.pillarSlot = -1; this.pillarStacks = 0; this.pillarX = this.pillarZ = 0;
  }
}
