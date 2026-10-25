import Phaser from 'phaser';
import { ROAD_LEFT, ROAD_RIGHT, WIDTH } from '../config';
import { mulberry32, resolveTrackPlan, type TrackPalette, type TrackPlan } from '../data/cityProfiles';
import { applyWeather, isRainyRound } from './weather';
import { TrackRoute } from './TrackRoute';
import { pitDividerVisible } from './PitStopLayout';
import { TrackProjection } from './TrackProjection';

const HALF = (ROAD_RIGHT - ROAD_LEFT) / 2;
const COLUMNS = [-HALF - 18, -HALF - 3, -HALF, -HALF + 7, -HALF + 10, -54, -50, 50, 54, HALF - 10, HALF - 7, HALF, HALF + 3, HALF + 18];
const ROWS = 128;
const STEP = 28;
/** 装饰循环周期（世界单位）：36 张图 = 18 对位置 × 左右两侧。 */
const PERIOD = 18 * 180;
/** 每个 period 内地标的锚点位置（世界单位偏移，取 0..PERIOD）。 */
const LANDMARK_ANCHOR = 5 * 180 + 90;

export class TrackGenerator {
  readonly route = new TrackRoute();
  readonly projection = new TrackProjection(this.route);
  private graphics: Phaser.GameObjects.Graphics;
  private scenery: Phaser.GameObjects.Image[] = [];
  /** 每张装饰图的确定性纹理 key（含每周期一间金拱门店）。 */
  private sceneryKeys: string[] = [];
  private landmarks: Phaser.GameObjects.Image[] = [];
  /** metro 原型的楼群剪影高度序列（确定性，一次算好）。 */
  private skylineHeights: number[] = [];
  private points = new Float32Array(ROWS * COLUMNS.length * 2);
  private round = 1;
  private palette!: TrackPalette;
  offset = 0;
  previousOffset = 0;
  constructor(private scene: Phaser.Scene, private plan: TrackPlan = resolveTrackPlan('')) {
    this.graphics = scene.add.graphics().setDepth(0);
    this.buildSceneryPlan();
    this.palette = applyWeather(this.plan.palette, this.round);
    for (let i = 0; i < 36; i++) {
      this.scenery.push(scene.add.image(0, 0, this.sceneryKeys[i]).setOrigin(0.5, 0.8));
    }
    if (this.plan.landmark) {
      this.landmarks.push(scene.add.image(0, 0, this.plan.landmark).setOrigin(0.5, 0.92));
    }
  }
  /** 确定性的装饰序列：原型抽样池 + 城市哈希；同城市永远同貌。 */
  private buildSceneryPlan(): void {
    const rng = mulberry32(this.plan.seed);
    const props = this.plan.props;
    for (let i = 0; i < 36; i++) {
      // 门店取每周期第 7 对位置（i%18===7 命中左右各一间），其余按原型权重抽样。
      this.sceneryKeys.push(i % 18 === 7 ? 'cafe' : props[Math.floor(rng() * props.length)]);
    }
    this.skylineHeights = Array.from({ length: 18 }, () => 18 + rng() * 74);
  }
  /** 轮次天气：进站开启新一轮时整体替换生效色板，绘制循环无需感知。 */
  applyRound(round: number): void {
    this.round = round;
    this.palette = applyWeather(this.plan.palette, round);
  }
  get rainy(): boolean { return isRainyRound(this.round); }
  get cityPlan(): TrackPlan { return this.plan; }
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
  /** 地平线远景：按原型切换山丘 / 海面 / 楼群剪影 / 层峦，全部本帧 Graphics 静态形状。 */
  private drawHorizon(g: Phaser.GameObjects.Graphics): void {
    const p = this.palette;
    g.fillStyle(p.horizonBand); g.fillRect(-30, -30, WIDTH + 60, 115);
    switch (this.plan.horizon) {
      case 'sea':
        g.fillStyle(p.horizonHill); g.fillRect(-30, 54, WIDTH + 60, 44);
        g.fillStyle(p.horizonHillAlt); g.fillRect(-30, 50, WIDTH + 60, 5);
        g.fillEllipse(90, 78, 120, 8); g.fillEllipse(300, 90, 150, 9); g.fillEllipse(470, 72, 110, 7);
        break;
      case 'skyline': {
        g.fillStyle(p.horizonHill);
        for (let i = 0; i < this.skylineHeights.length; i++) {
          const h = this.skylineHeights[i], x = -24 + i * 33;
          g.fillRect(x, 115 - h, 26, h);
        }
        g.fillStyle(p.horizonHillAlt);
        for (let i = 0; i < this.skylineHeights.length; i += 5) {
          const h = this.skylineHeights[i] + 16, x = -14 + i * 33;
          g.fillRect(x, 115 - h, 14, h);
        }
        break;
      }
      case 'ridges':
        g.fillStyle(p.horizonHillAlt);
        g.fillPoints([{ x: -40, y: 115 }, { x: 120, y: 28 }, { x: 280, y: 115 }], true);
        g.fillPoints([{ x: 190, y: 115 }, { x: 340, y: 42 }, { x: 500, y: 115 }], true);
        g.fillStyle(p.horizonHill);
        g.fillPoints([{ x: 60, y: 115 }, { x: 230, y: 36 }, { x: 400, y: 115 }], true);
        g.fillPoints([{ x: 330, y: 115 }, { x: 480, y: 52 }, { x: 620, y: 115 }], true);
        break;
      default:
        g.fillStyle(p.horizonHillAlt); g.fillEllipse(230, 88, 280, 96);
        g.fillStyle(p.horizonHill); g.fillEllipse(65, 85, 300, 110); g.fillEllipse(370, 85, 330, 110);
    }
  }
  draw(alpha: number, carY = this.scene.scale.height * 0.68, cameraSide = 0, pitProgress = NaN): void {
    const height = this.scene.scale.height;
    const offset = this.previousOffset + (this.offset - this.previousOffset) * alpha;
    const projection = this.projection;
    projection.configure(offset, height, carY, cameraSide);
    const g = this.graphics;
    const p = this.palette;
    g.clear(); g.fillStyle(p.grass); g.fillRect(-30, -30, WIDTH + 60, height + 60);
    this.drawHorizon(g);
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
      const curb = Math.floor(s / 56) % 2 === 0 ? p.curb : p.curbAlt;
      this.band(row, 0, 13, p.shoulder);
      this.band(row, 2, 11, Math.floor(s / 112) % 2 === 0 ? p.road : p.roadAlt);
      this.band(row, 0, 1, curb); this.band(row, 12, 13, curb);
      this.band(row, 1, 2, p.border); this.band(row, 11, 12, p.border);
      this.band(row, 3, 4, p.lane); this.band(row, 9, 10, p.lane);
      if (Math.floor(s / STEP) % 3 === 0) {
        this.band(row, 5, 6, p.lane);
        if (!pitDividerVisible(s - pitProgress)) this.band(row, 7, 8, p.lane);
      }
    }
    for (let i = 0; i < this.scenery.length; i++) {
      const relative = ((Math.floor(i / 2) * 180 - offset + 420) % PERIOD + PERIOD) % PERIOD - 420;
      const side = i % 2 === 0 ? -1 : 1;
      projection.project(offset + relative, side * (HALF + 57 + i % 3 * 16));
      const image = this.scenery[i], scale = projection.scale * 0.86;
      image.setPosition(projection.x, projection.y).setScale(scale)
        .setAlpha(Math.min(1, 0.65 + projection.scale * 0.4))
        .setDepth(10 + projection.y / 100)
        .setVisible(projection.x > -130 && projection.x < WIDTH + 130 && projection.y > 60 && projection.y < height + 150
          && !(side > 0 && Number.isFinite(pitProgress) && offset + relative > pitProgress - 800 && offset + relative < pitProgress + 480));
    }
    // 地标：每周期一次，固定远侧（左侧），贴图本身即大尺度。
    for (const landmark of this.landmarks) {
      const relative = ((LANDMARK_ANCHOR - offset + 420) % PERIOD + PERIOD) % PERIOD - 420;
      projection.project(offset + relative, -(HALF + 76));
      const scale = projection.scale * 0.98;
      landmark.setPosition(projection.x, projection.y).setScale(scale)
        .setAlpha(Math.min(1, 0.7 + projection.scale * 0.35))
        .setDepth(10 + projection.y / 100 - 0.02)
        .setVisible(projection.x > -200 && projection.x < WIDTH + 200 && projection.y > 50 && projection.y < height + 220);
    }
  }
}
