import Phaser from 'phaser';
import { ROAD_LEFT, ROAD_RIGHT, WIDTH } from '../config';
import { C } from '../data/colors';
import { TrackRoute } from './TrackRoute';
import { pitDividerVisible } from './PitStopLayout';
import { TrackProjection } from './TrackProjection';

const HALF = (ROAD_RIGHT - ROAD_LEFT) / 2;
const COLUMNS = [-HALF - 18, -HALF - 3, -HALF, -HALF + 7, -HALF + 10, -54, -50, 50, 54, HALF - 10, HALF - 7, HALF, HALF + 3, HALF + 18];
const ROWS = 128;
const STEP = 28;

export class TrackGenerator {
  readonly route = new TrackRoute();
  readonly projection = new TrackProjection(this.route);
  private graphics: Phaser.GameObjects.Graphics;
  private scenery: Phaser.GameObjects.Image[] = [];
  private points = new Float32Array(ROWS * COLUMNS.length * 2);
  offset = 0;
  previousOffset = 0;
  constructor(private scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(0);
    for (let i = 0; i < 36; i++) {
      const key = i % 5 === 1 ? 'building' : 'tree';
      this.scenery.push(scene.add.image(0, 0, key).setOrigin(0.5, 0.8));
    }
  }
  step(scroll: number): void { this.previousOffset = this.offset; this.offset += scroll; }
  setProgress(previous: number, current: number): void { this.previousOffset = previous; this.offset = current; }
  private band(row: number, left: number, right: number, color: number): void {
    const stride = COLUMNS.length * 2;
    const a = row * stride + left * 2, b = row * stride + right * 2;
    const c = a + stride, d = b + stride;
    const p = this.points, g = this.graphics;
    g.fillStyle(color);
    g.fillTriangle(p[a], p[a + 1], p[b], p[b + 1], p[c], p[c + 1]);
    g.fillTriangle(p[c], p[c + 1], p[b], p[b + 1], p[d], p[d + 1]);
  }
  draw(alpha: number, carY = this.scene.scale.height * 0.68, cameraSide = 0, pitProgress = NaN): void {
    const height = this.scene.scale.height;
    const offset = this.previousOffset + (this.offset - this.previousOffset) * alpha;
    const projection = this.projection;
    projection.configure(offset, height, carY, cameraSide);
    const g = this.graphics;
    g.clear(); g.fillStyle(C.grass); g.fillRect(-30, -30, WIDTH + 60, height + 60);
    // A subdued horizon keeps the perspective legible, with no external assets.
    g.fillStyle(0xd8ebaf); g.fillRect(-30, -30, WIDTH + 60, 115);
    g.fillStyle(0xd0e2a2); g.fillEllipse(65, 85, 300, 110); g.fillEllipse(370, 85, 330, 110);
    const base = Math.floor((offset - 420) / STEP) * STEP;
    for (let row = 0; row < ROWS; row++) {
      const progress = base + row * STEP;
      projection.setSection(progress);
      for (let col = 0; col < COLUMNS.length; col++) {
        projection.projectLateral(COLUMNS[col]);
        const index = (row * COLUMNS.length + col) * 2;
        this.points[index] = projection.x; this.points[index + 1] = projection.y;
      }
    }
    for (let row = ROWS - 2; row >= 0; row--) {
      const s = base + row * STEP;
      const curb = Math.floor(s / 56) % 2 === 0 ? C.car : C.panel;
      this.band(row, 0, 13, 0x91b170);
      this.band(row, 2, 11, Math.floor(s / 112) % 2 === 0 ? C.road : 0x596260);
      this.band(row, 0, 1, curb); this.band(row, 12, 13, curb);
      this.band(row, 1, 2, C.border); this.band(row, 11, 12, C.border);
      this.band(row, 3, 4, C.lane); this.band(row, 9, 10, C.lane);
      if (Math.floor(s / STEP) % 3 === 0) {
        this.band(row, 5, 6, C.lane);
        if (!pitDividerVisible(s - pitProgress)) this.band(row, 7, 8, C.lane);
      }
    }
    const period = 18 * 180;
    for (let i = 0; i < this.scenery.length; i++) {
      const relative = ((Math.floor(i / 2) * 180 - offset + 420) % period + period) % period - 420;
      const side = i % 2 === 0 ? -1 : 1;
      projection.project(offset + relative, side * (HALF + 57 + i % 3 * 16));
      const image = this.scenery[i], scale = projection.scale * 0.86;
      image.setPosition(projection.x, projection.y).setScale(scale)
        .setAlpha(Math.min(1, 0.65 + projection.scale * 0.4))
        .setDepth(10 + projection.y / 100)
        .setVisible(projection.x > -130 && projection.x < WIDTH + 130 && projection.y > 60 && projection.y < height + 150
          && !(side > 0 && Number.isFinite(pitProgress) && offset + relative > pitProgress - 800 && offset + relative < pitProgress + 480));
    }
  }
}
