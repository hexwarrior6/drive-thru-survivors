import { BASE_SPEED } from '../config';
import { bossCones, bossCruiseRest, bossHpScale, bossRecover, bossSlamSpeed, bossTelegraph, bossThrowInterval, contactDamage } from '../systems/balance';
import { friesSlow } from './weaponMapper';
import type { DriftPhysics } from '../systems/DriftPhysics';
import { ObjectPool } from '../utils/ObjectPool';

export const ENEMY_HP = [24, 55, 80] as const;
export const ENEMY_RADIUS = [16, 21, 18, 52] as const;
export const BOSS_HP = 1050;
export const WEAPON_RANGE = 360;
export const SHOT_INTERVAL = 0.38;
export const PELLET_DAMAGE = 12;
export const PELLET_SPREAD = 0.24;
export const MAGNET_RANGE = 80;
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
  hp: number; flash: number; contact: number; vx: number; vz: number; slow: number; slowTime: number; burn: number; burnDamage: number; frozen: boolean;
  /** Boss state machine: 0 cruise, 1 telegraph, 2 slam dash, 3 recover. Riders reuse it: 0 hover, 1 lunge, 2 recover. */
  phase: number; timer: number; tx: number; throwCd: number;
}
export interface Bullet {
  active: boolean; slot: number; x: number; z: number; px: number; pz: number;
  vx: number; vz: number; life: number; damage: number; kind: number; level: number; pierce: number; targetSlot: number; hitMask: Uint8Array;
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
  readonly enemies = new ObjectPool<Enemy>(128, slot => ({ active: false, slot, kind: 0, x: 0, z: 0, px: 0, pz: 0, hp: 0, flash: 0, contact: 0, vx: 0, vz: 0, slow: 1, slowTime: 0, burn: 0, burnDamage: 0, frozen: false, phase: 0, timer: 0, tx: 0, throwCd: 0 }));
  readonly bullets = new ObjectPool<Bullet>(256, slot => ({ active: false, slot, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, life: 0, damage: PELLET_DAMAGE, kind: 0, level: 1, pierce: 1, targetSlot: -1, hitMask: new Uint8Array(128) }));
  readonly coins = new ObjectPool<Coin>(128, slot => ({ active: false, slot, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, life: 0, value: 0, magnet: false }));
  readonly damage = new ObjectPool<Damage>(64, slot => ({ active: false, slot, x: 0, z: 0, life: 0, value: 0 }));
  private readonly heads = new Int32Array(GRID_COLUMNS * GRID_ROWS);
  private readonly next = new Int32Array(128);
  private gridZ = 0;
  private cooldown = 0;
  private invincible = 0;
  private time = 0;
  starterEnabled = true;
  shields = 0;
  shieldLevel = 0;
  damageMultiplier = 1;
  magnetRange = MAGNET_RANGE;
  baseMagnetRange = MAGNET_RANGE;
  /** Difficulty scaling and run modifiers, set by the scene from car + theme + wave. */
  hpScale = 1;
  /** Current wave number, set by the wave system; drives the contact damage curve. */
  wave = 1;
  /** Boss tier for the current round (1-4); set before the boss spawns. */
  bossTier = 1;
  /** Ice-burst damage when a frozen enemy shatters; scaled by the ice weapon level. */
  iceBurstDamage = 12;
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
  constructor(private readonly effects: CombatEffects) {}

  spawn(kind: number, x: number, z: number): Enemy | null {
    const e = this.enemies.acquire(); if (!e) return null;
    e.kind = kind; e.x = e.px = x; e.z = e.pz = z;
    e.slow = 1; e.slowTime = e.burn = e.burnDamage = 0; e.frozen = false;
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
      if (e.slowTime === 0) { e.slow = 1; e.frozen = false; }
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
          const frozen = e.frozen && e.slow === 0;
          this.hit(e, this.lastRamDamage * (frozen ? 2 : 1));
          if (frozen && !e.active) this.iceBurst(e); this.impact = 1;
          // Guided pit entry plows through leftover hazards on rails without hurting the car.
          if (this.invincible === 0 && p.pulseTime === 0 && p.nitroTime === 0 && !this.entering) {
            this.hurt(contactDamage(e.kind, this.wave), e);
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
    this.cooldown = Math.max(0, this.cooldown - dt);
    const target = this.nearest(carX, p.progress);
    this.targetSlot = target?.slot ?? -1;
    this.targetDistance = target ? Math.hypot(target.x - carX, target.z - p.progress) : 0;
    if (target && this.starterEnabled) {
      const originX = carX - Math.sin(p.heading) * 24;
      const originZ = p.progress - Math.cos(p.heading) * 24;
      const speed = 780 + p.speed * 0.3;
      const dx = target.x - originX, dz = target.z - originZ;
      const lead = interceptTime(dx, dz, target.vx, target.vz, speed);
      const aimX = dx + target.vx * lead, aimZ = dz + target.vz * lead;
      const length = Math.max(1, Math.hypot(aimX, aimZ));
      this.aimX = aimX / length; this.aimZ = aimZ / length;
      if (this.cooldown === 0) {
        let fired = false;
        for (let pellet = -1; pellet <= 1; pellet++) {
          const b = this.bullets.acquire(); if (!b) break;
          const angle = pellet * PELLET_SPREAD, cos = Math.cos(angle), sin = Math.sin(angle);
          const vx = this.aimX * cos - this.aimZ * sin, vz = this.aimX * sin + this.aimZ * cos;
          b.x = b.px = originX + vx * 22; b.z = b.pz = originZ + vz * 22;
          b.vx = vx * speed; b.vz = vz * speed;
          b.life = 1.2; b.damage = PELLET_DAMAGE; b.kind = 0; b.level = 1; b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0); this.pelletsFired++; fired = true;
        }
        if (fired) { this.shots++; this.muzzleFlash = 0.08; }
        this.cooldown = SHOT_INTERVAL;
      }
    }

    for (let i = 0; i < this.bullets.capacity; i++) {
      const b = this.bullets.items[i]; if (!b.active) continue;
      if (b.kind === 4) {
        // Guided missiles steer toward their locked slot with a bounded turn rate.
        const locked = b.targetSlot >= 0 ? this.enemies.items[b.targetSlot] : null;
        if (locked && locked.active) {
          const wanted = Math.atan2(locked.x - b.x, locked.z - b.z);
          const current = Math.atan2(b.vx, b.vz);
          let diff = wanted - current;
          if (diff > Math.PI) diff -= Math.PI * 2; else if (diff < -Math.PI) diff += Math.PI * 2;
          const turn = Math.max(-4.4 * dt, Math.min(4.4 * dt, diff));
          const speed = Math.hypot(b.vx, b.vz);
          const angle = current + turn;
          b.vx = Math.sin(angle) * speed; b.vz = Math.cos(angle) * speed;
        }
      }
      b.px = b.x; b.pz = b.z; b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
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
        b.hitMask[target.slot] = 1; this.hit(target, b.damage);
        if (b.kind === 2 && b.level > 1) { target.slow = friesSlow(b.level); target.slowTime = 3; }
        if (--b.pierce <= 0) this.bullets.release(b);
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
  private iceBurst(origin: Enemy): void {
    for (let i = 0; i < this.enemies.capacity; i++) {
      const e = this.enemies.items[i];
      if (e.active && Math.hypot(e.x - origin.x, e.z - origin.z) <= 100) { e.slow = 0; e.slowTime = 2; e.frozen = true; this.hit(e, this.iceBurstDamage); }
    }
  }
  private hurt(amount: number, enemy?: Enemy): void {
    if (this.combo > 1) { this.combo = this.combo >> 1; this.comboTier = 0; this.comboTimer = 1.5; }
    if (this.shields > 0) {
      this.shields--;
      if (enemy && this.shieldLevel > 1 && enemy.active) this.hit(enemy, this.lastRamDamage);
      if (enemy && this.shieldLevel === 3) for (let i = 0; i < this.enemies.capacity; i++) {
        const other = this.enemies.items[i];
        if (other.active && Math.hypot(other.x - enemy.x, other.z - enemy.z) < 100) { other.x += other.x >= enemy.x ? 40 : -40; other.z -= 40; }
      }
    }
    else this.health = Math.max(0, this.health - amount * this.damageMultiplier);
    this.invincible = 0.5;
  }
  clear(): void {
    this.enemies.clear(); this.bullets.clear(); this.coins.clear(); this.damage.clear();
    this.cooldown = this.muzzleFlash = 0; this.targetSlot = -1; this.targetDistance = this.pursuers = 0; this.aimX = 0; this.aimZ = -1;
    this.combo = this.comboTimer = this.comboTier = 0; this.bossSlot = -1; this.bossMaxHp = 0;
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
