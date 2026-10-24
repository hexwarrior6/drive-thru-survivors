import { BASE_SPEED } from '../config';
import { PIT_CAMERA_SIDE, PIT_ENTRY_SECONDS, PIT_EXIT_SECONDS, PIT_EXIT_DISTANCE, pitLaneCenter, smoothPit } from './PitStopLayout';
import type { DriftPhysics } from './DriftPhysics';
import type { CombatSystem } from '../combat/CombatSystem';
export type WaveState = 'combat' | 'entering' | 'exiting' | 'pit' | 'disabled';
/** Fixed wave clock plus guided entry and departure along the service bay. */
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
  pitProgress = NaN;
  cameraSide = 0;
  private approachScheduled = false;
  private entryDuration = PIT_ENTRY_SECONDS;
  private entryProgress = 0;
  private endProgress = 0;
  step(p: DriftPhysics, combat: CombatSystem, dt: number): void {
    if (this.state === 'entering' || this.state === 'exiting') {
      if (this.state === 'entering') this.remaining = Math.max(0, this.remaining - dt);
      this.drivePit(p, dt, this.state === 'exiting'); return;
    }
    if (this.state !== 'combat') return;
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining <= 3 && !this.approachScheduled) {
      // Publish this location once. Braking, drifting or boosting must never move visible scenery.
      this.pitProgress = p.progress + Math.max(BASE_SPEED, p.speed) * this.remaining + 480;
      this.approachScheduled = true;
    }
    if (this.remaining < 0.00001 || (this.approachScheduled && this.pitProgress - p.progress <= 480)) {
      if (this.remaining < 0.00001) this.remaining = 0;
      this.state = 'entering'; this.entryX = p.x; this.entryProgress = p.progress;
      if (!this.approachScheduled) this.pitProgress = p.progress + 480;
      this.endProgress = this.pitProgress;
      // A slow car can still be far from the published station. Extend its approach,
      // rather than dragging the station back or racing the car forward in a fixed duration.
      this.entryDuration = Math.max(PIT_ENTRY_SECONDS,
        2 * (this.endProgress - this.entryProgress) / Math.max(BASE_SPEED, -p.vy), this.remaining);
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

  private drivePit(p: DriftPhysics, dt: number, leaving: boolean): void {
    p.previousX = p.x; p.previousProgress = p.progress; p.previousHeading = p.heading;
    const duration = leaving ? PIT_EXIT_SECONDS : this.entryDuration;
    this.transition = Math.min(duration, this.transition + dt);
    if (duration - this.transition < 0.000001) this.transition = duration;
    const t = this.transition / duration;
    const forwardEase = leaving ? t * t : 1 - (1 - t) * (1 - t);
    p.progress = this.entryProgress + (this.endProgress - this.entryProgress) * forwardEase;
    const laneX = 225 + pitLaneCenter(p.progress - this.pitProgress);
    // Finish the lane change before the physical divider begins, from any starting lane.
    const entryBlend = smoothPit((p.progress - this.entryProgress) / Math.max(1, this.pitProgress - 250 - this.entryProgress));
    p.x = leaving ? laneX : this.entryX + (laneX - this.entryX) * entryBlend;
    p.vx = (p.x - p.previousX) / dt;
    const forward = (this.endProgress - this.entryProgress) * 2 * (leaving ? t : 1 - t) / duration;
    p.vy = -forward; p.speed = Math.hypot(p.vx, forward);
    const targetHeading = Math.max(-0.7, Math.min(0.7, Math.atan2(p.vx, Math.max(1, forward))));
    p.heading += (targetHeading - p.heading) * Math.min(1, dt * 12);
    p.distance += (p.progress - p.previousProgress) * 0.52 / 3.6;
    p.released = 0; p.hitWall = 0; p.didBoost = false;
    p.drifting = false; p.tier = 0; p.charge = 0; p.nitroTime = p.pulseTime = 0;
    this.cameraSide = PIT_CAMERA_SIDE * (leaving ? 1 - smoothPit(t) : smoothPit(t));
    if (t >= 1) {
      this.state = leaving ? 'combat' : 'pit'; p.heading = p.previousHeading = 0;
      if (!leaving) p.vx = p.vy = p.speed = 0;
      else { p.nitroTime = 2; p.didBoost = true; p.vy = -BASE_SPEED * 1.5; p.speed = BASE_SPEED * 1.5; }
      p.previousProgress = p.progress; p.previousX = p.x;
    }
  }
  next(combat: CombatSystem, p: DriftPhysics): void {
    if (this.state !== 'pit') return;
    this.number++; this.duration = Math.min(60, 45 + (this.number - 1) * 3);
    this.remaining = this.duration; this.state = 'exiting'; this.spawnTime = 0.4; this.pursuitTime = 2.5;
    this.approachScheduled = false; this.transition = 0;
    if (!Number.isFinite(this.pitProgress)) this.pitProgress = p.progress;
    this.entryX = p.x; this.entryProgress = p.progress; this.endProgress = p.progress + PIT_EXIT_DISTANCE;
    combat.clear();
  }
}
