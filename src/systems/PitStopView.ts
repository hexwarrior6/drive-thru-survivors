import Phaser from 'phaser';
import { C } from '../data/colors';
import { MAIN_ROAD_HALF, PIT_DIVIDER_SIDE, PIT_SIDE, PIT_WALL_START, PIT_WALL_END, pitLaneCenter } from './PitStopLayout';
import type { TrackProjection } from './TrackProjection';

/** One preallocated roadside set, fixed in road coordinates for an entire stop. */
export class PitStopView {
  private readonly markings: Phaser.GameObjects.Graphics;
  private readonly service: Phaser.GameObjects.Image;
  private readonly pavilion: Phaser.GameObjects.Image;
  private readonly board: Phaser.GameObjects.Image;
  private readonly arrows: Phaser.GameObjects.Image[] = [];
  private readonly bollards: Phaser.GameObjects.Image[] = [];
  private readonly points = new Float32Array(8);
  constructor(scene: Phaser.Scene, private readonly projection: TrackProjection) {
    this.markings = scene.add.graphics().setDepth(1);
    this.service = scene.add.image(0, 0, 'pit-service').setOrigin(0.5, 0.95).setVisible(false);
    this.pavilion = scene.add.image(0, 0, 'pit-pavilion').setOrigin(0.5, 0.91).setVisible(false);
    this.board = scene.add.image(0, 0, 'pit-direction').setOrigin(0.5, 0.95).setVisible(false);
    for (let i = 0; i < 5; i++) this.arrows.push(scene.add.image(0, 0, 'pit-arrow').setVisible(false).setDepth(1.1));
    for (let i = 0; i < 6; i++) this.bollards.push(scene.add.image(0, 0, 'pit-bollard').setOrigin(0.5, 0.86).setVisible(false));
  }
  private quad(z1: number, left1: number, right1: number, z2: number, left2: number, right2: number, color: number): void {
    const p = this.projection, a = this.points;
    p.project(z1, left1); a[0] = p.x; a[1] = p.y;
    p.project(z1, right1); a[2] = p.x; a[3] = p.y;
    p.project(z2, left2); a[4] = p.x; a[5] = p.y;
    p.project(z2, right2); a[6] = p.x; a[7] = p.y;
    this.markings.fillStyle(color);
    this.markings.fillTriangle(a[0], a[1], a[2], a[3], a[4], a[5]);
    this.markings.fillTriangle(a[4], a[5], a[2], a[3], a[6], a[7]);
  }
  private place(image: Phaser.GameObjects.Image, z: number, side: number, size = 1): void {
    const p = this.projection; p.project(z, side);
    image.setPosition(p.x, p.y).setScale(p.scale * size).setDepth(10 + p.y / 100 + 0.04)
      .setVisible(p.x > -170 && p.x < 620 && p.y > 80 && p.y < p.viewHeight + 180);
  }
  draw(station: number, visible: boolean, time: number): void {
    this.markings.clear();
    if (!visible) {
      this.service.setVisible(false); this.pavilion.setVisible(false); this.board.setVisible(false);
      for (let i = 0; i < this.arrows.length; i++) this.arrows[i].setVisible(false);
      for (let i = 0; i < this.bollards.length; i++) this.bollards[i].setVisible(false);
      return;
    }
    // Original three lanes: two through lanes plus the right-hand service lane.
    // The pale apron belongs to the building, outside the normal road edge.
    this.quad(station - 78, MAIN_ROAD_HALF + 20, 270, station + 118, MAIN_ROAD_HALF + 20, 270, 0xdecfa8);
    this.quad(station - 72, MAIN_ROAD_HALF + 20, 265, station + 112, MAIN_ROAD_HALF + 20, 265, C.panel);
    for (let z = PIT_WALL_START; z < PIT_WALL_END; z += 25) {
      const end = Math.min(z + 25, PIT_WALL_END), side = PIT_DIVIDER_SIDE;
      this.quad(station + z, side - 3, side + 12, station + end, side - 3, side + 12, 0x39483e);
      this.quad(station + z, side - 5, side + 5, station + end - 1, side - 5, side + 5, 0xb9ac88);
      this.quad(station + z, side - 5, side + 1, station + end - 1, side - 5, side + 1, C.panel);
      if (z % 50 === 0) this.quad(station + z + 9, side - 3, side, station + z + 15, side - 3, side, C.gold);
    }
    // Shallow painted noses introduce and finish the divider, without widening the road.
    for (let i = 0; i < 7; i++) {
      const z = -330 + i * 17, half = 3 + i * 1.4;
      this.quad(station + z, PIT_DIVIDER_SIDE - half, PIT_DIVIDER_SIDE - half + 4,
        station + z + 11, PIT_DIVIDER_SIDE + half - 4, PIT_DIVIDER_SIDE + half, C.gold);
      const exit = 170 + i * 17, exitHalf = 12 - i * 1.4;
      this.quad(station + exit, PIT_DIVIDER_SIDE - exitHalf, PIT_DIVIDER_SIDE - exitHalf + 4,
        station + exit + 11, PIT_DIVIDER_SIDE + exitHalf - 4, PIT_DIVIDER_SIDE + exitHalf, C.gold);
    }
    // Stopping box and a restrained checker stripe identify the pit stall.
    this.quad(station + 15, PIT_SIDE - 31, PIT_SIDE + 31, station + 19, PIT_SIDE - 31, PIT_SIDE + 31, C.lane);
    this.quad(station - 36, PIT_SIDE - 34, PIT_SIDE - 31, station + 19, PIT_SIDE - 34, PIT_SIDE - 31, C.lane);
    this.quad(station - 36, PIT_SIDE + 31, PIT_SIDE + 34, station + 19, PIT_SIDE + 31, PIT_SIDE + 34, C.lane);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 8; col++) {
      const left = PIT_SIDE - 40 + col * 10, z = station + 40 + row * 10;
      this.quad(z, left, left + 10, z + 10, left, left + 10, (row + col) % 2 === 0 ? C.panel : C.ink);
    }
    const p = this.projection;
    for (let i = 0; i < this.arrows.length; i++) {
      const relative = i < 3 ? -390 + i * 72 : 220 + (i - 3) * 80, side = pitLaneCenter(relative);
      p.project(station + relative, side); const x = p.x, y = p.y, scale = p.scale;
      p.project(station + relative + 25, pitLaneCenter(relative + 25));
      this.arrows[i].setPosition(x, y).setScale(scale * 0.52, scale * 0.5)
        .setRotation(Math.atan2(p.x - x, y - p.y)).setAlpha(0.75 + Math.sin(time * 3 - i) * 0.1)
        .setVisible(y > 100 && y < p.viewHeight + 50 && x > -30 && x < 480);
    }
    this.place(this.service, station + 8, 174, 0.8);
    this.place(this.pavilion, station + 10, 225, 0.92);
    this.place(this.board, station - 410, MAIN_ROAD_HALF + 38, 0.68);
    this.board.setAlpha(0.72 + Math.sin(time * 8) * 0.28);
    for (let i = 0; i < this.bollards.length; i++) {
      const relative = -60 + i * 30;
      this.place(this.bollards[i], station + relative, MAIN_ROAD_HALF + 9, 0.55);
    }
  }
}
