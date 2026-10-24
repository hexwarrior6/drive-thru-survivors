import { WIDTH } from '../config';
import type { TrackRoute } from './TrackRoute';

/** One projection for road, car and effects; collision stays in road coordinates. */
export class TrackProjection {
  x = 0;
  y = 0;
  scale = 1;
  viewHeight = 800;
  carY = 544;
  private cameraX = 0;
  private cameraZ = 0;
  private cameraSide = 0;
  private cos = 1;
  private sin = 0;
  private sectionX = 0;
  private sectionZ = 0;
  private sectionCos = 1;
  private sectionSin = 0;
  constructor(readonly route: TrackRoute) {}
  configure(progress: number, height: number, carY: number, cameraSide = 0): void {
    this.viewHeight = height; this.carY = carY; this.cameraSide = cameraSide;
    this.route.sample(progress);
    this.cameraX = this.route.x; this.cameraZ = this.route.z;
    this.cos = Math.cos(this.route.heading); this.sin = Math.sin(this.route.heading);
  }
  setSection(progress: number): void {
    this.route.sample(progress);
    this.sectionX = this.route.x; this.sectionZ = this.route.z;
    this.sectionCos = Math.cos(this.route.heading); this.sectionSin = Math.sin(this.route.heading);
  }
  projectLateral(lateral: number): void {
    const dx = this.sectionX + this.sectionCos * lateral - this.cameraX;
    const dz = this.sectionZ - this.sectionSin * lateral - this.cameraZ;
    const side = dx * this.cos - dz * this.sin - this.cameraSide;
    const forward = dx * this.sin + dz * this.cos;
    this.scale = 1100 / Math.max(260, 1100 + forward);
    this.x = WIDTH / 2 + side * this.scale;
    this.y = this.carY - forward * 0.85 * this.scale;
  }
  project(progress: number, lateral: number): void { this.setSection(progress); this.projectLateral(lateral); }
}
