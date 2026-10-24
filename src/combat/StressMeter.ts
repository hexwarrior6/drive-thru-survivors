/** Development workload sampler. Fixed histogram, no sorting or per-frame allocation. */
export class StressMeter {
  frames = 0;
  warmup = 120;
  total = 0;
  slow = 0;
  worst = 0;
  minEnemies = 999;
  minBullets = 999;
  minParticles = 999;
  private readonly histogram = new Uint32Array(251);
  record(ms: number, enemies: number, bullets: number, particles: number): void {
    if (this.warmup > 0) { this.warmup--; return; }
    if (this.frames >= 600) return;
    this.frames++; this.total += ms; this.worst = Math.max(this.worst, ms);
    if (ms > 25) this.slow++;
    this.histogram[Math.min(250, Math.floor(ms))]++;
    this.minEnemies = Math.min(this.minEnemies, enemies);
    this.minBullets = Math.min(this.minBullets, bullets);
    this.minParticles = Math.min(this.minParticles, particles);
  }
  get fps(): number { return this.total > 0 ? this.frames * 1000 / this.total : 0; }
  get p95(): number {
    if (this.frames === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.histogram.length; i++) { sum += this.histogram[i]; if (sum >= this.frames * 0.95) return i + 1; }
    return 0;
  }
}
