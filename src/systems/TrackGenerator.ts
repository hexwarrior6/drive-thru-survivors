import Phaser from 'phaser';
import { HEIGHT, ROAD_LEFT, ROAD_RIGHT, WIDTH } from '../config';
import { C } from '../data/colors';

export class TrackGenerator {
  private graphics: Phaser.GameObjects.Graphics;
  private scenery: Phaser.GameObjects.Image[] = [];
  offset = 0;
  previousOffset = 0;
  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(0);
    for (let i = 0; i < 12; i++) {
      const key = i % 6 === 3 ? 'cafe' : i % 3 === 1 ? 'building' : 'tree';
      const side = i % 2 === 0 ? 30 : 422;
      const image = scene.add.image(side, i * 92 - 140, key).setScale(key === 'cafe' ? 0.75 : 0.8).setDepth(1);
      this.scenery.push(image);
    }
  }
  step(scroll: number): void { this.previousOffset = this.offset; this.offset += scroll; }
  draw(alpha: number): void {
    const offset = this.previousOffset + (this.offset - this.previousOffset) * alpha;
    const g = this.graphics; g.clear();
    g.fillStyle(C.grass); g.fillRect(-30, -30, WIDTH + 60, HEIGHT + 60);
    g.fillStyle(0xd8ebaf); g.fillRect(0, 0, 48, HEIGHT); g.fillRect(402, 0, 48, HEIGHT);
    g.fillStyle(C.road); g.fillRect(ROAD_LEFT, -30, ROAD_RIGHT - ROAD_LEFT, HEIGHT + 60);
    g.fillStyle(0x535d5a, 0.5); g.fillRect(ROAD_LEFT + 10, 0, 18, HEIGHT); g.fillRect(ROAD_RIGHT - 28, 0, 18, HEIGHT);
    g.fillStyle(C.lane, 0.9); g.fillRect(ROAD_LEFT + 5, 0, 3, HEIGHT); g.fillRect(ROAD_RIGHT - 8, 0, 3, HEIGHT);
    const dashOffset = offset % 64;
    for (let y = dashOffset - 64; y < HEIGHT; y += 64) {
      g.fillStyle(C.lane, 0.75); g.fillRoundedRect(172, y, 3, 28, 1); g.fillRoundedRect(276, y, 3, 28, 1);
    }
    for (let y = offset % 32 - 32; y < HEIGHT; y += 32) {
      g.fillStyle(C.panel); g.fillRect(58, y, 10, 32); g.fillRect(382, y, 10, 32);
      g.fillStyle(C.car); g.fillRect(58, y, 10, 16); g.fillRect(382, y, 10, 16);
    }
    g.fillStyle(C.border); g.fillRect(54, 0, 3, HEIGHT); g.fillRect(393, 0, 3, HEIGHT);
    for (let i = 0; i < this.scenery.length; i++) {
      this.scenery[i].y = ((i * 92 + offset * 0.86) % 1104) - 145;
    }
    // Roadside route markers scroll with the road rather than with the HUD.
    for (let y = offset % 220 - 220; y < HEIGHT; y += 220) {
      g.fillStyle(C.panel); g.fillRoundedRect(39, y, 10, 20, 3);
      g.fillStyle(C.gold); g.fillRect(41, y + 3, 6, 5);
    }
  }
}
