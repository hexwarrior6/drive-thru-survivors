import Phaser from 'phaser';
import { CAR_Y } from '../config';
import type { CarId } from '../data/cars';
import { DriftPhysics } from '../systems/DriftPhysics';
import type { TrackProjection } from '../systems/TrackProjection';

export class Player {
  baseY = CAR_Y;
  readonly physics = new DriftPhysics();
  readonly sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  constructor(scene: Phaser.Scene, model: CarId = 'flash') {
    this.shadow = scene.add.ellipse(225, CAR_Y + 10, 58, 58, 0x263c32, 0.24);
    this.sprite = scene.add.image(225, CAR_Y, 'car-' + model);
  }
  /** Swap the kart painting for car selection previews. */
  setModel(model: CarId): void { this.sprite.setTexture('car-' + model); }
  render(alpha: number, kick: number, projection: TrackProjection): void {
    const p = this.physics;
    const x = p.previousX + (p.x - p.previousX) * alpha;
    const heading = p.previousHeading + (p.heading - p.previousHeading) * alpha;
    const progress = p.previousProgress + (p.progress - p.previousProgress) * alpha;
    projection.project(progress, x - 225);
    const angle = Math.atan2(Math.sin(heading), Math.cos(heading) * 0.85);
    const scale = projection.scale, depth = 10 + projection.y / 100;
    this.sprite.setPosition(projection.x, projection.y - 5 + kick).setRotation(angle)
      .setScale(scale, scale * 0.85).setDepth(depth + 0.02);
    this.shadow.setPosition(projection.x + 5, projection.y + 10).setRotation(angle)
      .setScale(scale).setDepth(depth);
  }
}
