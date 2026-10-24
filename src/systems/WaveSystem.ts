import type { DriftPhysics } from './DriftPhysics';
import type { CombatSystem } from '../combat/CombatSystem';
export type WaveState = 'combat' | 'entering' | 'pit' | 'disabled';
/** Combat freezes at the time limit; the last 1.5 seconds are an automatic pit entry. */
export class WaveSystem {
  number = 1;
  remaining = 45;
  duration = 45;
  state: WaveState = 'combat';
  transition = 0;
  private spawnTime = 0.4;
  private spawned = 0;
  private pursuitTime = 2.5;
  private packs = 0;
  private entryX = 225;
  private entrySpeed = 0;
  private entryHeading = 0;
  step(p: DriftPhysics, combat: CombatSystem, dt: number): void {
    if (this.state === 'entering') {
      p.previousX = p.x; p.previousProgress = p.progress; p.previousHeading = p.heading;
      this.transition = Math.min(1.5, this.transition + dt);
      const t = this.transition / 1.5, ease = t * t * (3 - 2 * t);
      p.x = this.entryX + (325 - this.entryX) * ease;
      p.heading = this.entryHeading * (1 - ease) + Math.sin(t * Math.PI * 2) * 0.15;
      p.speed = this.entrySpeed * (1 - ease); p.vx = 0; p.vy = -p.speed;
      p.progress += p.speed * dt; p.distance += p.speed * 0.52 / 3.6 * dt;
      p.released = 0; p.hitWall = 0; p.didBoost = false;
      p.drifting = false; p.tier = 0; p.charge = 0; p.nitroTime = p.pulseTime = 0;
      if (t >= 1) { this.state = 'pit'; p.previousProgress = p.progress; p.previousX = p.x; p.previousHeading = p.heading = 0; }
      return;
    }
    if (this.state !== 'combat') return;
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining < 0.00001) {
      this.remaining = 0; this.state = 'entering'; this.entryX = p.x; this.entrySpeed = p.speed; this.entryHeading = p.heading;
      this.transition = 0; combat.money += 10 + this.number * 2; combat.clear(); return;
    }
    this.spawnTime -= dt;
    if (this.spawnTime <= 0) {
      // Single-lane hazards always leave a route to dodge; carts cross between lanes.
      this.spawnTime += Math.max(0.75, 1.3 - this.number * 0.05);
      const index = this.spawned++, kind = index % 4 === 3 ? 1 : 0;
      const x = kind === 1 ? (Math.floor(index / 4) % 2 === 0 ? -138 : 138) : ((index * 2) % 3 - 1) * 96;
      combat.spawn(kind, x, p.progress + 680);
    }
    this.pursuitTime -= dt;
    if (this.pursuitTime <= 0) {
      const elapsed = this.duration - this.remaining;
      const count = elapsed < 15 ? 2 : 3;
      this.pursuitTime += elapsed < 15 ? 4.8 : Math.max(3.2, 4.2 - this.number * 0.15);
      for (let i = 0; i < count; i++) {
        const lane = (this.packs + i) % 3;
        combat.spawn(2, (lane - 1) * 96, p.progress - 180 - i * 20);
      }
      this.packs++;
    }
  }

  next(combat: CombatSystem): void {
    if (this.state !== 'pit') return;
    this.number++; this.duration = Math.min(60, 45 + (this.number - 1) * 3);
    this.remaining = this.duration; this.state = 'combat'; this.spawnTime = 0.4; this.pursuitTime = 2.5;
    combat.clear();
  }
}
