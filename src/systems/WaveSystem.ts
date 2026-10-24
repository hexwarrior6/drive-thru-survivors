import { BASE_SPEED } from '../config';
import {
  WAVES_PER_RUN, roundOf, bossTierOf, bossName, waveDuration, enemyHpScale,
  hazardInterval, pursuitInterval, pursuitPack, bossHazardInterval, bossPursuitInterval, bossPursuitPack,
  pitArrivalBonus, isBossWave as isBossWaveAt,
} from './balance';
import { PIT_CAMERA_SIDE, PIT_ENTRY_SECONDS, PIT_EXIT_SECONDS, PIT_EXIT_DISTANCE, pitLaneCenter, smoothPit } from './PitStopLayout';
import type { DriftPhysics } from './DriftPhysics';
import type { CombatSystem } from '../combat/CombatSystem';
export type WaveState = 'combat' | 'countdown' | 'entering' | 'exiting' | 'bossdown' | 'victory' | 'pit' | 'disabled';
/**
 * Fixed wave clock plus guided entry and departure along the service bay.
 * A run is four rounds of five waves: waves 5/10/15/20 field a boss, and only
 * the fourth one ends the run — the others roll into the next round's pit stop.
 */
export class WaveSystem {
  number = 1;
  remaining = 42;
  duration = 42;
  state: WaveState = 'combat';
  transition = 0;
  /** Dev fast mode shortens every wave for end-to-end testing. */
  fast = false;
  intro = 0;
  bossDownTime = 0;
  private bossSpawned = false;
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
  get isBossWave(): boolean { return isBossWaveAt(this.number); }
  get isFinalWave(): boolean { return this.number >= WAVES_PER_RUN; }
  get round(): number { return roundOf(this.number); }
  get bossTier(): number { return bossTierOf(this.number); }
  get bossTierName(): string { return bossName(this.bossTier); }
  /** Fresh runs open with a 3-2-1 launch; resumed runs skip straight to combat. */
  beginCountdown(seconds = 3.2): void {
    this.state = 'countdown'; this.intro = seconds;
    this.duration = this.plannedDuration(); this.remaining = this.duration;
    this.spawnTime = 0.4; this.pursuitTime = 2.5; this.spawned = 0; this.packs = 0;
    this.bossSpawned = false; this.approachScheduled = false; this.pitProgress = NaN;
  }
  private plannedDuration(): number {
    if (this.fast) return 8;
    return waveDuration(this.number);
  }
  /** Bullet-time window after the boss falls; the scene plays the celebration. */
  bossDown(seconds = 2.4): void {
    if (this.state !== 'combat' || !this.isBossWave) return;
    this.state = 'bossdown'; this.bossDownTime = seconds;
  }
  step(p: DriftPhysics, combat: CombatSystem, dt: number): void {
    if (this.state === 'countdown') {
      this.intro = Math.max(0, this.intro - dt);
      if (this.intro === 0) this.state = 'combat';
      return;
    }
    if (this.state === 'bossdown') {
      this.bossDownTime = Math.max(0, this.bossDownTime - dt);
      if (this.bossDownTime === 0) {
        if (this.isFinalWave) { this.state = 'victory'; return; }
        // Mid-run bosses roll straight into the pit stop that opens the next round.
        this.remaining = 0; this.approachScheduled = true;
        this.pitProgress = p.progress + 560;
        this.beginPitApproach(p, combat);
      }
      return;
    }
    if (this.state === 'victory') return;
    if (this.state === 'entering' || this.state === 'exiting') {
      if (this.state === 'entering') this.remaining = Math.max(0, this.remaining - dt);
      this.drivePit(p, dt, this.state === 'exiting'); return;
    }
    if (this.state !== 'combat') return;
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.isBossWave) {
      // The boss wave has no clock: it ends when the truck falls.
      if (!this.bossSpawned && this.duration - this.remaining > 1.2) {
        this.bossSpawned = true;
        combat.wave = this.number; combat.hpScale = enemyHpScale(this.number); combat.bossTier = this.bossTier;
        combat.spawn(3, Math.max(-90, Math.min(90, p.x - 225)), p.progress + 430);
      }
      const tier = this.bossTier;
      this.spawnTime -= dt;
      if (this.spawnTime <= 0) {
        this.spawnTime += bossHazardInterval(tier);
        const index = this.spawned++, kind = index % 4 === 3 ? 1 : 0;
        const x = kind === 1 ? (Math.floor(index / 4) % 2 === 0 ? -138 : 138) : ((index * 2) % 3 - 1) * 96;
        combat.spawn(kind, x, p.progress + 680);
      }
      this.pursuitTime -= dt;
      if (this.pursuitTime <= 0) {
        this.pursuitTime += bossPursuitInterval(tier);
        const count = bossPursuitPack(tier);
        for (let i = 0; i < count; i++) {
          const lane = (this.packs + i) % 3;
          combat.spawn(2, (lane - 1) * 96, p.progress - 180 - i * 20);
        }
        this.packs++;
      }
      return;
    }
    if (this.remaining <= 3 && !this.approachScheduled) {
      // Publish this location once. Braking, drifting or boosting must never move visible scenery.
      this.pitProgress = p.progress + Math.max(BASE_SPEED, p.speed) * this.remaining + 480;
      this.approachScheduled = true;
    }
    if (this.remaining < 0.00001 || (this.approachScheduled && this.pitProgress - p.progress <= 480)) {
      if (this.remaining < 0.00001) this.remaining = 0;
      this.beginPitApproach(p, combat); return;
    }
    this.spawnTime -= dt;
    if (this.spawnTime <= 0) {
      // Single-lane hazards always leave a route to dodge; carts cross between lanes.
      this.spawnTime += hazardInterval(this.number);
      const index = this.spawned++, kind = index % 4 === 3 ? 1 : 0;
      const x = kind === 1 ? (Math.floor(index / 4) % 2 === 0 ? -138 : 138) : ((index * 2) % 3 - 1) * 96;
      const z = p.progress + 680;
      // Once the station is published its drive-thru channel stays clear: the car
      // sweeps that lane on rails, so hazards may never land inside the approach.
      if (!this.approachScheduled || z <= this.pitProgress - 450) combat.spawn(kind, x, z);
    }
    this.pursuitTime -= dt;
    if (this.pursuitTime <= 0) {
      const elapsed = this.duration - this.remaining;
      const count = elapsed < 15 ? 2 : pursuitPack(this.number);
      this.pursuitTime += elapsed < 15 ? 4.8 : pursuitInterval(this.number);
      for (let i = 0; i < count; i++) {
        const lane = (this.packs + i) % 3;
        combat.spawn(2, (lane - 1) * 96, p.progress - 180 - i * 20);
      }
      this.packs++;
    }
  }

  /** Switch into the guided pit approach from wherever the car currently is. */
  private beginPitApproach(p: DriftPhysics, combat: CombatSystem): void {
    this.state = 'entering'; this.entryX = p.x; this.entryProgress = p.progress;
    if (!Number.isFinite(this.pitProgress)) this.pitProgress = p.progress + 480;
    this.endProgress = this.pitProgress;
    // A slow car can still be far from the published station. Extend its approach,
    // rather than dragging the station back or racing the car forward in a fixed duration.
    this.entryDuration = Math.max(PIT_ENTRY_SECONDS,
      2 * (this.endProgress - this.entryProgress) / Math.max(BASE_SPEED, -p.vy), this.remaining);
    // The road stays alive into the pit call: hazards remain, riders break off.
    this.transition = 0; combat.money += pitArrivalBonus(this.number); combat.entering = true;
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
    this.number++; this.duration = this.plannedDuration();
    // Every wave fields tougher enemies (see balance.ts); the round bosses escalate on top.
    combat.wave = this.number; combat.hpScale = enemyHpScale(this.number);
    this.remaining = this.duration; this.state = 'exiting'; this.spawnTime = 0.4; this.pursuitTime = 2.5;
    this.approachScheduled = false; this.transition = 0; this.bossSpawned = false;
    combat.entering = false;
    // The next round fields a fresh tyrant: clear the previous kill so the
    // scene's celebration glue can fire again.
    combat.bossDefeated = false;
    // Keep the station we just left: the exit merge runs past its divider end.
    if (!Number.isFinite(this.pitProgress)) this.pitProgress = p.progress;
    this.entryX = p.x; this.entryProgress = p.progress; this.endProgress = p.progress + PIT_EXIT_DISTANCE;
    combat.clear();
  }
}
