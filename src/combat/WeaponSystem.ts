import { stats } from './weaponMapper';
import { interceptTime } from './CombatSystem';
import type { CombatSystem, Enemy } from './CombatSystem';
import type { DriftPhysics } from '../systems/DriftPhysics';
import type { EquippedWeapon } from '../systems/ShopSystem';
import { ObjectPool } from '../utils/ObjectPool';
interface Mine { active: boolean; slot: number; x: number; z: number; life: number; level: number; exploded: boolean }
/** Weapons share fixed entity pools; all cooldowns stop with the race simulation. */
export class WeaponSystem {
  readonly mines = new ObjectPool<Mine>(32, slot => ({ active: false, slot, x: 0, z: 0, life: 0, level: 1, exploded: false }));
  /** Happy-meal escort toys and shield orbit cones, two of each at most. */
  readonly toyX = new Float64Array(2);
  readonly toyZ = new Float64Array(2);
  readonly orbX = new Float64Array(2);
  readonly orbZ = new Float64Array(2);
  toyCount = 0;
  orbCount = 0;
  private toyReady = new Uint8Array(2);
  private toyCd = 0;
  private orbAngle = 0;
  private orbCd = 0;
  private healTime = 0;
  private shieldTime = 0;
  private lastKills = 0;
  private bubbleTick = 0;
  constructor(readonly slots: (EquippedWeapon | null)[], readonly combat: CombatSystem) {}
  configure(p: DriftPhysics): void {
    let coffee = 0, desperate = 0;
    p.speedBonus = p.chargeBonus = p.nitroRegen = 0;
    this.combat.starterEnabled = false; this.combat.damageMultiplier = 1;
    this.combat.magnetRange = this.combat.baseMagnetRange;
    for (let i = 0; i < 6; i++) {
      const w = this.slots[i]; if (!w) continue;
      const l = w.level;
      if (w.type === 'starter') this.combat.starterEnabled = true;
      if (w.type === 'coffee') { coffee = Math.max(coffee, l * .05); p.chargeBonus = l === 3 ? .3 : l === 2 ? .2 : 0; p.nitroRegen = l === 3 ? 1 : 0; }
      if (w.type === 'desperate' && this.combat.health < 20 + l * 10) { desperate = Math.max(desperate, .05 + l * .05); this.combat.damageMultiplier = 1.2 - l * .05; }
      if (w.type === 'heal' && l === 3) this.combat.magnetRange = Math.max(this.combat.magnetRange, 110);
    }
    p.speedBonus = Math.min(.25, coffee + desperate) + p.carSpeedBonus;
    p.nitroRegen += p.carNitroRegen;
  }
  private nearestTo(px: number, pz: number, range: number): Enemy | null {
    let target: Enemy | null = null, best = range * range;
    for (let i = 0; i < this.combat.enemies.capacity; i++) {
      const e = this.combat.enemies.items[i]; if (!e.active || e.z <= pz) continue;
      const dx = e.x - px, dz = e.z - pz, d = dx * dx + dz * dz;
      if (d < best) { target = e; best = d; }
    }
    return target;
  }
  private nearest(p: DriftPhysics, range: number): Enemy | null {
    return this.nearestTo(p.x - 225, p.progress, range);
  }
  step(p: DriftPhysics, dt: number): void {
    let heal = 0, shield = 0, wing = 0;
    const c = this.combat, x = p.x - 225;
    for (let i = 0; i < 6; i++) {
      const w = this.slots[i]; if (!w) continue;
      const l = w.level - 1;
      if (w.type === 'heal') { heal = Math.max(heal, w.level); continue; }
      if (w.type === 'shield') { shield = Math.max(shield, w.level); continue; }
      if (w.type === 'wingman') { wing = Math.max(wing, w.level); continue; }
      if (w.type === 'starter' || w.type === 'coffee' || w.type === 'desperate') continue;
      w.cooldown = Math.max(0, w.cooldown - dt); if (w.cooldown > 0) continue;
      const s = stats[w.type], range = s.range[l];
      if (w.type === 'burger' || w.type === 'fries') {
        const target = this.nearest(p, range); if (!target && w.type === 'burger') continue;
        const angle = w.type === 'burger' && target ? Math.atan2(target.x - x, target.z - p.progress) : 0;
        const count = s.count[l];
        for (let j = 0; j < count; j++) {
          const b = c.bullets.acquire(); if (!b) break;
          const a = angle + (count === 1 ? 0 : (j / (count - 1) - .5) * (Math.PI / 180) * (45 + l * 15));
          b.x = b.px = x; b.z = b.pz = p.progress + 30;
          b.vx = Math.sin(a) * 900; b.vz = Math.cos(a) * 900 + p.speed * .3;
          b.damage = s.damage[l]; b.life = range / 900; b.kind = w.type === 'burger' ? 1 : 2;
          b.level = w.level; b.pierce = w.type === 'burger' ? w.level : w.level === 3 ? 2 : 1; b.targetSlot = -1; b.hitMask.fill(0);
          c.shots++;
        }
      } else if (w.type === 'missile') {
        const target = this.nearest(p, range); if (!target) continue;
        const count = s.count[l];
        for (let j = 0; j < count; j++) {
          const b = c.bullets.acquire(); if (!b) break;
          const a = count === 2 ? (j === 0 ? -.14 : .14) : 0;
          b.x = b.px = x; b.z = b.pz = p.progress + 26;
          b.vx = Math.sin(a) * 760; b.vz = Math.cos(a) * 760 + p.speed * .3;
          b.damage = s.damage[l]; b.life = 2.6; b.kind = 4;
          b.level = w.level; b.pierce = 1; b.targetSlot = target.slot; b.hitMask.fill(0);
          c.shots++;
        }
      } else if (w.type === 'mine') {
        for (let j = 0; j < s.count[l]; j++) {
          const m = this.mines.acquire(); if (!m) break;
          m.x = x + (s.count[l] === 2 ? (j * 2 - 1) * 22 : 0); m.z = p.progress - 44; m.life = 8; m.level = w.level; m.exploded = false;
        }
      } else {
        const target = w.type === 'ice' ? this.nearest(p, range) : null;
        for (let j = 0; j < c.enemies.capacity; j++) {
          const e = c.enemies.items[j]; if (!e.active) continue;
          const dx = e.x - x, dz = e.z - p.progress, d = Math.hypot(dx, dz);
          if (d > range || (w.type === 'ice' && e !== target) || (w.type === 'flame' && (dz >= 0 || Math.abs(Math.atan2(dx, -dz)) > (w.level === 3 ? 80 : 60) * Math.PI / 180))) continue;
          c.hit(e, s.damage[l]);
          if (w.type === 'ice') {
            // The tyrant truck shrugs off half the chill and can never be frozen solid.
            const strength = w.level === 3 ? 0 : w.level === 2 ? .3 : .5;
            e.slow = Math.min(e.slow, e.kind === 3 ? 1 - (1 - strength) * .5 : strength);
            e.slowTime = w.level === 3 ? 2 : 3;
            e.frozen = w.level > 1 && e.kind !== 3;
          }
          if (w.type === 'flame' && w.level > 1) { e.burn = w.level === 3 ? 3 : 2; e.burnDamage = s.damage[l]; }
          if (w.type === 'cola') {
            e.x += dx / Math.max(1,d) * (6 + l * 5); e.z += dz / Math.max(1,d) * (6 + l * 5); e.slow = .7; e.slowTime = .5;
            if (w.level > 1) for (let k = j + 1; k < c.enemies.capacity; k++) {
              const other = c.enemies.items[k]; if (other.active && Math.hypot(other.x - e.x, other.z - e.z) < 38) { c.hit(other, s.damage[l]); if (e.active) c.hit(e, s.damage[l]); }
            }
            if (w.level === 3 && this.bubbleTick % 4 === 0) for (let k = 0; k < c.enemies.capacity; k++) {
              const victim = c.enemies.items[k]; if (victim.active && Math.hypot(victim.x - e.x, victim.z - e.z) < 32) c.hit(victim, 8);
            }
          }
        }
        this.bubbleTick++;
      }
      w.cooldown = s.interval[l];
    }
    // Escort toys trail the flanks and snipe whatever the turret ignores.
    if (wing) {
      const s = stats.wingman, l = wing - 1, want = s.count[l];
      this.toyCount = want;
      for (let i = 0; i < want; i++) {
        const side = i === 0 ? -54 : 54;
        const tx = x + side, tz = p.progress + 8;
        if (this.toyReady[i] === 0) { this.toyX[i] = tx; this.toyZ[i] = tz; this.toyReady[i] = 1; }
        else {
          const ease = 1 - Math.exp(-6 * dt);
          this.toyX[i] += (tx - this.toyX[i]) * ease; this.toyZ[i] += (tz - this.toyZ[i]) * ease;
        }
      }
      this.toyCd -= dt;
      if (this.toyCd <= 0) {
        let fired = false;
        const speed = 760 + p.speed * .2;
        for (let i = 0; i < want; i++) {
          const target = this.nearestTo(this.toyX[i], this.toyZ[i], s.range[l]);
          if (!target) continue;
          const dx = target.x - this.toyX[i], dz = target.z - this.toyZ[i];
          const lead = interceptTime(dx, dz, target.vx, target.vz, speed);
          const ax = dx + target.vx * lead, az = dz + target.vz * lead;
          const length = Math.max(1, Math.hypot(ax, az));
          const b = c.bullets.acquire(); if (!b) break;
          b.x = b.px = this.toyX[i]; b.z = b.pz = this.toyZ[i];
          b.vx = ax / length * speed; b.vz = az / length * speed;
          b.life = s.range[l] / speed; b.damage = s.damage[l]; b.kind = 3;
          b.level = 1; b.pierce = 1; b.targetSlot = -1; b.hitMask.fill(0);
          c.shots++; fired = true;
        }
        this.toyCd = fired ? s.interval[l] : 0.2;
      }
    } else this.toyCount = 0;
    // Sweet-cone orbit: higher shield tiers grind down anything that closes in.
    if (shield > 1) {
      this.orbCount = shield - 1;
      this.orbAngle += dt * (2.4 + (shield - 1) * .5);
      this.orbCd = Math.max(0, this.orbCd - dt);
      const damage = 10 + (shield - 1) * 6;
      for (let i = 0; i < this.orbCount; i++) {
        const angle = this.orbAngle + i * Math.PI;
        const ox = x + Math.cos(angle) * 52, oz = p.progress + Math.sin(angle) * 40;
        this.orbX[i] = ox; this.orbZ[i] = oz;
        if (this.orbCd > 0) continue;
        for (let j = 0; j < c.enemies.capacity; j++) {
          const e = c.enemies.items[j]; if (!e.active) continue;
          const dx = e.x - ox, dz = e.z - oz;
          if (dx * dx + dz * dz < 900) {
            c.hit(e, damage);
            if (e.active) e.x += dx >= 0 ? 9 : -9;
            this.orbCd = .22;
            break;
          }
        }
      }
    } else this.orbCount = 0;
    for (let i = 0; i < this.mines.capacity; i++) {
      const m = this.mines.items[i]; if (!m.active) continue;
      m.life -= dt;
      if (m.life <= 0 || m.z < p.progress - 450) { this.mines.release(m); continue; }
      for (let j = 0; j < c.enemies.capacity; j++) {
        const e = c.enemies.items[j]; if (!e.active) continue;
        const d = Math.hypot(e.x - m.x, e.z - m.z), l = m.level - 1;
        if (!m.exploded && d < 30) {
          m.exploded = true; m.life = m.level === 1 ? .1 : m.level;
          for (let k = 0; k < c.enemies.capacity; k++) {
            const victim = c.enemies.items[k];
            if (victim.active && Math.hypot(victim.x - m.x, victim.z - m.z) < stats.mine.range[l]) c.hit(victim, stats.mine.damage[l]);
          }
        }
        if (m.exploded && m.level > 1 && d < stats.mine.range[l]) { e.slow = .5; e.slowTime = .2; }
      }
    }
    if (heal) {
      this.healTime += dt;
      const interval = heal === 1 ? 10 : heal === 2 ? 8 : 6;
      if (this.healTime >= interval) { this.healTime -= interval; c.health = Math.min(100, c.health + (heal === 1 ? 2 : heal === 2 ? 3 : 5)); }
      c.health = Math.min(100, c.health + (c.kills - this.lastKills) * (heal - 1));
    }
    if (shield) {
      this.shieldTime = c.impact || p.hitWall ? 0 : this.shieldTime + dt;
      const interval = shield === 1 ? 15 : shield === 2 ? 12 : 10;
      if (this.shieldTime >= interval) { this.shieldTime = 0; c.shields = Math.min(shield === 3 ? 2 : 1, c.shields + 1); }
    } else c.shields = 0;
    c.shieldLevel = shield; this.lastKills = c.kills;
  }
  clear(): void {
    this.mines.clear();
    this.toyReady[0] = 0; this.toyReady[1] = 0;
    this.toyCd = 0; this.orbCd = 0; this.orbCount = 0;
  }
}
