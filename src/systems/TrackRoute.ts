/** A repeatable driving sample, expressed as connected road sections.
 * Progress is independent of rendering and can later stop at a pit entry.
 */
export const ROUTE_SECTIONS = [
  { length: 600, turn: 0, name: '起步直道' },
  { length: 1200, turn: 0.62, name: '长右弯' },
  { length: 360, turn: 0, name: '出弯直道' },
  { length: 1800, turn: -1.04, name: '长左弯' },
  { length: 360, turn: 0, name: '连接直道' },
  { length: 1200, turn: 0.42, name: '回转右弯' },
  { length: 600, turn: 0, name: '休整直道' },
] as const;
const SAMPLE_STEP = 12;

export class TrackRoute {
  readonly length = ROUTE_SECTIONS.reduce((sum, section) => sum + section.length, 0);
  private count = this.length / SAMPLE_STEP;
  private xs = new Float64Array(this.count + 1);
  private zs = new Float64Array(this.count + 1);
  private headings = new Float64Array(this.count + 1);
  x = 0;
  z = 0;
  heading = 0;

  constructor() {
    for (let i = 1; i <= this.count; i++) {
      const s = (i - 0.5) * SAMPLE_STEP;
      const turn = this.curvatureAt(s) * SAMPLE_STEP;
      const middle = this.headings[i - 1] + turn / 2;
      this.xs[i] = this.xs[i - 1] + Math.sin(middle) * SAMPLE_STEP;
      this.zs[i] = this.zs[i - 1] + Math.cos(middle) * SAMPLE_STEP;
      this.headings[i] = this.headings[i - 1] + turn;
    }
  }
  curvatureAt(progress: number): number {
    let local = ((progress % this.length) + this.length) % this.length;
    for (const section of ROUTE_SECTIONS) {
      if (local < section.length) {
        // Zero curvature at joins. The integral over this section equals turn.
        const ease = Math.sin(Math.PI * local / section.length);
        return 2 * section.turn / section.length * ease * ease;
      }
      local -= section.length;
    }
    return 0;
  }
  sample(progress: number): void {
    const cycle = Math.floor(progress / this.length);
    const local = progress - cycle * this.length;
    const point = local / SAMPLE_STEP;
    const index = Math.min(this.count - 1, Math.floor(point));
    const t = point - index;
    this.x = this.xs[index] + (this.xs[index + 1] - this.xs[index]) * t + cycle * this.xs[this.count];
    this.z = this.zs[index] + (this.zs[index + 1] - this.zs[index]) * t + cycle * this.zs[this.count];
    this.heading = this.headings[index] + (this.headings[index + 1] - this.headings[index]) * t;
  }
  sectionAt(progress: number): typeof ROUTE_SECTIONS[number] {
    let local = ((progress % this.length) + this.length) % this.length;
    for (const section of ROUTE_SECTIONS) {
      if (local < section.length) return section;
      local -= section.length;
    }
    return ROUTE_SECTIONS[0];
  }
}
