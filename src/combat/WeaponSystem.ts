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

interface TrailSeg { active: boolean; slot: number; x: number; z: number; life: number; dps: number }
interface MineSeg { active: boolean; slot: number; x: number; z: number; life: number; level: number; meta: number; chainDepth: number }
interface SawSeg { active: boolean; slot: number; x: number; z: number; life: number; radius: number; dps: number; spin: number }

/** 五槽语义（§4.1）：[0] 前武器 · [1] 后武器 · [2..4] 车辆模块；酱料独立收藏。 */
export class WeaponSystem {
  readonly trails = new ObjectPool<TrailSeg>(24, slot => ({ active: false, slot, x: 0, z: 0, life: 0, dps: 0 }));
  readonly mines = new ObjectPool<MineSeg>(12, slot => ({ active: false, slot, x: 0, z: 0, life: 0, level: 1, meta: 0, chainDepth: 0 }));
  readonly saws = new ObjectPool<SawSeg>(8, slot => ({ active: false, slot, x: 0, z: 0, life: 0, radius: 34, dps: 0, spin: 0 }));
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
    // ---- 火带结算：接触持续灼烧，取最强灼烧来源并刷新时间。 ----
    for (let i = 0; i < this.trails.capacity; i++) {
      const seg = this.trails.items[i]; if (!seg.active) continue;
      seg.life -= dt;
      if (seg.life <= 0 || seg.z < p.progress - 450) { this.trails.release(seg); continue; }
      const seconds = 1.6 * (hasSauce(c.sauceBits, 'chili') ? SAUCE.nativeBurnBoost : 1);
      for (let j = 0; j < c.enemies.capacity; j++) {
        const e = c.enemies.items[j]; if (!e.active) continue;
        const dx = e.x - seg.x, dz = e.z - seg.z;
        if (dx * dx + dz * dz <= TRAIL_RADIUS * TRAIL_RADIUS) {
          c.hit(e, seg.dps * dt);
          c.applyBurn(e, seconds, seg.dps);
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
  }
}
