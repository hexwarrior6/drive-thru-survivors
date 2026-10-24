import { BASE_SPEED } from '../config';
import type { DriftPhysics } from '../systems/DriftPhysics';
import { ObjectPool } from '../utils/ObjectPool';

export const ENEMY_HP = [24, 55, 80] as const;
export const ENEMY_RADIUS = [16, 21, 18] as const;
export const WEAPON_RANGE = 360;
export const SHOT_INTERVAL = 0.38;
export const PELLET_DAMAGE = 12;
export const PELLET_SPREAD = 0.24;
export const MAGNET_RANGE = 80;
const GRID_COLUMNS = 10, GRID_ROWS = 36, CELL = 80, GRID_MIN_X = -400;
export interface Enemy {
  active: boolean; slot: number; kind: number; x: number; z: number; px: number; pz: number;
  hp: number; flash: number; contact: number; vx: number; vz: number; slow: number; slowTime: number; burn: number; burnDamage: number; frozen: boolean;
}
export interface Bullet {
  active: boolean; slot: number; x: number; z: number; px: number; pz: number;
  vx: number; vz: number; life: number; damage: number; kind: number; level: number; pierce: number; hitMask: Uint8Array;
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
  readonly enemies = new ObjectPool<Enemy>(128, slot => ({ active: false, slot, kind: 0, x: 0, z: 0, px: 0, pz: 0, hp: 0, flash: 0, contact: 0, vx: 0, vz: 0, slow: 1, slowTime: 0, burn: 0, burnDamage: 0, frozen: false }));
  readonly bullets = new ObjectPool<Bullet>(256, slot => ({ active: false, slot, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, life: 0, damage: PELLET_DAMAGE, kind: 0, level: 1, pierce: 1, hitMask: new Uint8Array(128) }));
  readonly coins = new ObjectPool<Coin>(128, slot => ({ active: false, slot, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, life: 0, value: 0, magnet: false }));
  readonly damage = new ObjectPool<Damage>(64, slot => ({ active: false, slot, x: 0, z: 0, life: 0, value: 0 }));
  private readonly heads = new Int32Array(GRID_COLUMNS * GRID_ROWS);
  private readonly next = new Int32Array(128);
  private gridZ = 0;
  private cooldown = 0;
  private invincible = 0;
  starterEnabled = true;
  shields = 0;
  shieldLevel = 0;
  damageMultiplier = 1;
  magnetRange = MAGNET_RANGE;
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
    e.hp = ENEMY_HP[kind]; e.flash = e.contact = 0;
    e.vx = kind === 1 ? (x < 0 ? 95 : -95) : 0;
    e.vz = kind === 2 ? BASE_SPEED * 1.16 : 0;
    return e;
  }
  nearest(x: number, z: number): Enemy | null {
    let target: Enemy | null = null, distance = WEAPON_RANGE * WEAPON_RANGE;
    for (let i = 0; i < this.enemies.capacity; i++) {
      const e = this.enemies.items[i]; if (!e.active || e.kind !== 2) continue;
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
    this.enemies.release(e); this.kills++;
    this.effects.explode(e.x, e.z, e.kind);
    const coin = this.coins.acquire();
    if (coin) {
      coin.x = coin.px = e.x; coin.z = coin.pz = e.z;
      coin.vx = (Math.random() - 0.5) * 95; coin.vz = -35;
      coin.life = 8; coin.value = e.kind + 1;
      // Pursuit rewards return automatically: the player cannot drive backwards to collect them.
      // Road drops still require entering the standard 80px pickup radius.
      coin.magnet = e.kind === 2;
    } else {
      // Full pickup pool merges value into an existing drop; no lost currency or allocation.
      const existing = this.coins.items[this.kills % this.coins.capacity]; existing.value += e.kind + 1;
    }
  }
  private cellX(x: number): number { return Math.max(0, Math.min(GRID_COLUMNS - 1, Math.floor((x - GRID_MIN_X) / CELL))); }
  private cellZ(z: number): number { return Math.max(0, Math.min(GRID_ROWS - 1, Math.floor((z - this.gridZ) / CELL))); }
  step(p: DriftPhysics, dt: number): void {
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
    this.impact = 0; this.invincible = Math.max(0, this.invincible - dt);
    this.gridZ = p.progress - 500; this.heads.fill(-1);
    const carX = p.x - 225; this.pursuers = 0;
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
        // riders have an absolute speed and never rubber-band up to boosted player speed.
        e.vx += (Math.max(-70, Math.min(70, (carX - e.x) * 1.3)) - e.vx) * Math.min(1, dt * 3);
        e.x += e.vx * dt * e.slow; e.z += e.vz * dt * e.slow;
      }
      if (e.z < p.progress - 450 || e.z > p.progress + 2000) { this.enemies.release(e); continue; }
      // Car OBB versus enemy circle, including both front and trailing contacts.
      const dx = e.x - carX, dz = e.z - p.progress;
      if (Math.abs(dx) < 90 && Math.abs(dz) < 90 && e.contact === 0) {
        const cos = Math.cos(p.heading), sin = Math.sin(p.heading);
        const side = dx * cos - dz * sin, forward = dx * sin + dz * cos;
        const cx = Math.max(Math.abs(side) - 24, 0), cz = Math.max(Math.abs(forward) - 34, 0);
        if (cx * cx + cz * cz <= ENEMY_RADIUS[e.kind] ** 2) {
          e.contact = 0.5; this.lastRamDamage = CombatSystem.ramDamage(p);
          const frozen = e.frozen && e.slow === 0;
          this.hit(e, this.lastRamDamage * (e.frozen ? 2 : 1));
          if (frozen && !e.active) this.iceBurst(e); this.impact = 1;
          if (this.invincible === 0 && p.pulseTime === 0 && p.nitroTime === 0) {
            this.hurt(e.kind === 0 ? 5 : 9, e);
          }
          if (e.active) { e.z += dz >= 0 ? 48 : -48; e.x += dx >= 0 ? 15 : -15; }
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
          b.life = 1.2; b.damage = PELLET_DAMAGE; b.kind = 0; b.level = 1; b.pierce = 1; b.hitMask.fill(0); this.pelletsFired++; fired = true;
        }
        if (fired) { this.shots++; this.muzzleFlash = 0.08; }
        this.cooldown = SHOT_INTERVAL;
      }
    }

    for (let i = 0; i < this.bullets.capacity; i++) {
      const b = this.bullets.items[i]; if (!b.active) continue;
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
        if (b.kind === 2 && b.level > 1) { target.slow = b.level === 2 ? 0.8 : 0.7; target.slowTime = 3; }
        if (--b.pierce <= 0) this.bullets.release(b);
      }
      else if (b.life <= 0 || b.z < p.progress - 450 || b.z > p.progress + 1600) this.bullets.release(b);
    }
    for (let i = 0; i < this.coins.capacity; i++) {
      const c = this.coins.items[i]; if (!c.active) continue;
      c.px = c.x; c.pz = c.z; c.life -= dt;
      const dx = carX - c.x, dz = p.progress - c.z, distance = Math.hypot(dx, dz * 0.85);
      // 80 logical pixels at the car plane, matching the road's vertical compression.
      if (distance <= this.magnetRange) c.magnet = true;
      if (c.magnet) {
        const ease = 1 - Math.exp(-14 * dt); c.x += dx * ease + p.vx * dt; c.z += dz * ease + Math.max(0, -p.vy) * dt;
        if (distance < 24) { this.money += c.value; this.coins.release(c); continue; }
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
      if (e.active && Math.hypot(e.x - origin.x, e.z - origin.z) <= 100) { e.slow = 0; e.slowTime = 2; e.frozen = true; this.hit(e, 12); }
    }
  }
  private hurt(amount: number, enemy?: Enemy): void {
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
  clear(): void { this.enemies.clear(); this.bullets.clear(); this.coins.clear(); this.damage.clear(); this.cooldown = this.muzzleFlash = 0; this.targetSlot = -1; this.targetDistance = this.pursuers = 0; this.aimX = 0; this.aimZ = -1; }
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
