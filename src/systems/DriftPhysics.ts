import { BASE_SPEED, ROAD_LEFT, ROAD_RIGHT } from '../config';
import { clamp, lerp, slerpAngle } from '../utils/math';

export interface DriveInput { steer: number; throttle: boolean; brake: boolean; drift: boolean; boost: boolean }
export type DriftTier = 0 | 1 | 2 | 3;
export function tierForCharge(seconds: number): DriftTier {
  return seconds >= 2 ? 3 : seconds >= 1 ? 2 : seconds >= 0.5 ? 1 : 0;
}
const PULSES = [0, 0.15, 0.25, 0.4];
/** Pure fixed-step model. Heading H and world-space velocity V remain independent. */
export class DriftPhysics {
  progress = 0;
  previousProgress = 0;
  x = 225;
  previousX = 225;
  heading = 0;
  previousHeading = 0;
  vx = 0;
  vy = -180;
  speed = 180;
  lateralSpeed = 0;
  charge = 0;
  tier: DriftTier = 0;
  drifting = false;
  nitro = 100;
  nitroTime = 0;
  pulseTime = 0;
  pulseRatio = 0;
  distance = 0;
  driftCount = 0;
  purpleCount = 0;
  wallHits = 0;
  // One-step events consumed by presentation, no allocations in the hot path.
  released: DriftTier = 0;
  hitWall = 0;
  didBoost = false;
  private recovery = 0;
  private wallCooldown = 0;
  private driftSign = 1;

  step(input: DriveInput, dt: number, curvature = 0): void {
    this.previousProgress = this.progress;
    this.previousX = this.x;
    this.previousHeading = this.heading;
    this.released = 0;
    this.hitWall = 0;
    this.didBoost = false;
    this.wallCooldown = Math.max(0, this.wallCooldown - dt);
    this.nitroTime = Math.max(0, this.nitroTime - dt);
    this.pulseTime = Math.max(0, this.pulseTime - dt);
    this.recovery = Math.max(0, this.recovery - dt);
    if (input.boost && this.nitro >= 20 && this.nitroTime === 0) {
      this.nitro -= 20;
      this.nitroTime = 2;
      this.didBoost = true;
    }
    if (input.drift && !this.drifting && Math.abs(input.steer) > 0.1 && this.speed > 100) {
      this.drifting = true;
      this.driftSign = Math.sign(input.steer);
      this.charge = 0;
    }
    if (this.drifting && (!input.drift || input.brake || this.speed < 90)) {
      this.released = input.drift ? 0 : this.tier;
      if (this.released > 0) {
        this.pulseRatio = PULSES[this.released];
        this.pulseTime = 0.85 + this.released * 0.15;
        // Apply the exact earned velocity pulse at release, then ease back to cruise.
        this.vx *= 1 + this.pulseRatio;
        this.vy *= 1 + this.pulseRatio;
        this.driftCount++;
        if (this.released === 3) this.purpleCount++;
      }
      this.drifting = false;
      this.charge = 0;
      this.tier = 0;
      this.recovery = 0.4;
    }
    if (this.drifting) {
      this.charge += dt;
      this.tier = tierForCharge(this.charge);
    }
    // Rotate both vectors into the road's new tangent frame. This produces
    // outward drift on a bend without adding a second artificial lateral force.
    const advance = Math.max(0, -this.vy) * dt;
    const turn = curvature * advance;
    const roadCos = Math.cos(turn), roadSin = Math.sin(turn);
    const oldVX = this.vx;
    this.vx = oldVX * roadCos + this.vy * roadSin;
    this.vy = -oldVX * roadSin + this.vy * roadCos;
    this.heading -= turn;
    // Steering rotates the body first; lower lateral drag preserves the old V.
    const targetHeading = this.drifting
      ? input.steer * 0.52 + this.driftSign * 0.14
      : input.steer * 0.38;
    this.heading = lerp(this.heading, targetHeading, 1 - Math.exp(-(this.drifting ? 13 : 8) * dt));
    const hx = Math.sin(this.heading), hy = -Math.cos(this.heading);
    const sx = Math.cos(this.heading), sy = Math.sin(this.heading);
    let forward = this.vx * hx + this.vy * hy;
    let lateral = this.vx * sx + this.vy * sy;
    lateral *= Math.pow(this.drifting ? 0.98 : 0.88, dt * 60);
    const multiplier = Math.max(this.nitroTime > 0 ? 1.5 : 1, this.pulseTime > 0 ? 1 + this.pulseRatio : 1);
    const targetSpeed = input.brake ? 65 : input.throttle ? BASE_SPEED * multiplier : 0;
    forward = lerp(forward, targetSpeed, 1 - Math.exp(-(input.brake ? 3.8 : input.throttle ? 1.7 : 0.65) * dt));
    this.vx = hx * forward + sx * lateral;
    this.vy = hy * forward + sy * lateral;
    if (this.recovery > 0) {
      const magnitude = Math.hypot(this.vx, this.vy);
      const angle = slerpAngle(Math.atan2(this.vx, -this.vy), this.heading, 1 - Math.pow(0.85, dt * 60));
      this.vx = Math.sin(angle) * magnitude;
      this.vy = -Math.cos(angle) * magnitude;
    }
    this.speed = Math.hypot(this.vx, this.vy);
    this.lateralSpeed = this.vx * sx + this.vy * sy;
    this.x += this.vx * dt;
    // Rotated rectangle projection keeps every corner inside the rail.
    const halfWidth = Math.abs(Math.cos(this.heading)) * 24 + Math.abs(Math.sin(this.heading)) * 34;
    const min = ROAD_LEFT + halfWidth + 3, max = ROAD_RIGHT - halfWidth - 3;
    if (this.x < min || this.x > max) {
      const side = this.x < min ? -1 : 1;
      this.x = clamp(this.x, min, max);
      if (this.vx * side > 0) {
        this.vx = -side * Math.max(85, Math.abs(this.vx) * 0.65);
        this.vy *= 0.8;
        this.heading *= 0.4;
        if (this.wallCooldown === 0) {
          this.hitWall = side;
          this.wallHits++;
          this.wallCooldown = 0.25;
          this.drifting = false;
          this.charge = 0;
          this.tier = 0;
        }
      }
    }
    this.speed = Math.hypot(this.vx, this.vy);
    this.progress += Math.max(0, -this.vy) * dt;
    this.distance += Math.max(0, -this.vy) * 0.52 / 3.6 * dt;
  }
}
