import Phaser from 'phaser';
import { CAR_Y } from '../config';
import { DriftPhysics } from '../systems/DriftPhysics';

export class Player {
  baseY = CAR_Y;
  readonly physics = new DriftPhysics();
  readonly sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  constructor(scene: Phaser.Scene) {
    this.shadow = scene.add.ellipse(225, CAR_Y + 8, 56, 74, 0x263c32, 0.23).setDepth(3);
    this.sprite = scene.add.image(225, CAR_Y, 'car').setDepth(5);
  }
  render(alpha: number, kick: number): void {
    const p = this.physics;
    const x = p.previousX + (p.x - p.previousX) * alpha;
    const heading = p.previousHeading + (p.heading - p.previousHeading) * alpha;
    this.sprite.setPosition(x, this.baseY + kick).setRotation(heading);
    this.shadow.setPosition(x + 4, this.baseY + 8).setRotation(heading);
  }
}
