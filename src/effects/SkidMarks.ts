import type Phaser from 'phaser';
import type { TrackProjection } from '../systems/TrackProjection';

interface Mark { lateral: number; progress: number; age: number }

const MAX_AGE = 1.5;
const MIN_STEP = 6;
const MAX_GAP = 60;
const MAX_POINTS = 220;
const LINE_WIDTH = 3;
const COLOR = 0x2d3934;
const ALPHA = 0.35;

/** Rear-tire marks recorded in road coordinates; the oldest segments fade out first. */
export class SkidMarks {
  private sides: [Mark[], Mark[]] = [[], []];
  private last: [Mark | null, Mark | null] = [null, null];
  constructor(private projection: TrackProjection) {}
  record(leftLateral: number, leftProgress: number, rightLateral: number, rightProgress: number): void {
    this.push(0, leftLateral, leftProgress);
    this.push(1, rightLateral, rightProgress);
  }
  /** Ends the current mark so a later drift never draws a bridge across the gap. */
  breakTrail(): void { this.last = [null, null]; }
  update(dt: number): void {
    for (const marks of this.sides) {
      while (marks.length > 0 && marks[0].age > MAX_AGE) marks.shift();
      for (const mark of marks) mark.age += dt;
    }
  }
  draw(graphics: Phaser.GameObjects.Graphics): void {
    graphics.clear();
    const projection = this.projection;
    for (const marks of this.sides) {
      let previousX = 0, previousY = 0;
      for (let i = 0; i < marks.length; i++) {
        const mark = marks[i];
        projection.project(mark.progress, mark.lateral);
        const x = projection.x, y = projection.y;
        if (i > 0) {
          const span = Math.hypot(mark.lateral - marks[i - 1].lateral, mark.progress - marks[i - 1].progress);
          if (span < MAX_GAP) {
            const fade = 1 - (mark.age + marks[i - 1].age) / (2 * MAX_AGE);
            graphics.lineStyle(LINE_WIDTH, COLOR, ALPHA * fade);
            graphics.lineBetween(previousX, previousY, x, y);
          }
        }
        previousX = x; previousY = y;
      }
    }
  }
  private push(side: number, lateral: number, progress: number): void {
    const marks = this.sides[side];
    const previous = this.last[side];
    if (previous && Math.hypot(lateral - previous.lateral, progress - previous.progress) < MIN_STEP) return;
    const mark: Mark = { lateral, progress, age: 0 };
    marks.push(mark);
    this.last[side] = mark;
    if (marks.length > MAX_POINTS) marks.shift();
  }
}
