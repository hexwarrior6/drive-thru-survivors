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
/** meta 位：bit0 分支a · bit1 分支b · bit2 Lv5 · bit3 甜酸弹墙兼容（发射时判定）。 */
const META_BRANCH_A = 1;
const META_BRANCH_B = 2;
const META_LV5 = 4;
const META_WALL = 8;

interface TrailSeg { active: boolean; slot: number; x: number; z: number; life: number; dps: number }

/** 五槽语义（§4.1）：[0] 前武器 · [1] 后武器 · [2..4] 车辆模块；酱料独立收藏。 */
export class WeaponSystem {
  readonly trails = new ObjectPool<TrailSeg>(24, slot => ({ active: false, slot, x: 0, z: 0, life: 0, dps: 0 }));
  /** 漂移增压器蓄能层数；有效漂移释放 +1，下一次齐射消耗一层。 */
  driftCharge = 0;
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
          b.tex = ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
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
            b.tex = ''; b.traits = c.sauceBits; b.meta = this.metaFor(w, def);
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
    this.trails.clear();
    this.driftCharge = 0;
    this.bumperClock = this.pumpClock = this.pumpTick = 0;
    this.cremaCd = this.trailTick = 0;
    this.overheat = this.hotTime = this.hotBoost = 0;
    this.catchStreak = this.catchFlag = 0;
  }
}
