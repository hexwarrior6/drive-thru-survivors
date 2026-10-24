import Phaser from 'phaser';
import { WIDTH } from '../config';
import type { TrackProjection } from '../systems/TrackProjection';

interface Particle {
  image: Phaser.GameObjects.Image;
  lateral: number; progress: number; vx: number; vz: number;
  life: number; maxLife: number; size: number; smoke: boolean;
}
/** Particles live in road coordinates; all 512 sprites are allocated at boot. */
export class ParticleManager {
  private pool: Particle[] = [];
  private cursor = 0;
  activeCount = 0;
  visibleCount = 0;
  constructor(scene: Phaser.Scene, private projection: TrackProjection) {
    for (let i = 0; i < 512; i++) this.pool.push({
      image: scene.add.image(0, 0, 'particle').setVisible(false).setDepth(30),
      lateral: 0, progress: 0, vx: 0, vz: 0, life: 0, maxLife: 0, size: 0, smoke: false,
    });
  }
  explode(x: number, z: number, kind: number): void {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 45 + Math.random() * 160;
      this.emit(x, z, i % 3 === 0 ? 0xffcf52 : kind === 0 ? 0xffa13f : 0xfff2cb,
        Math.cos(angle) * speed, Math.sin(angle) * speed, 0.35 + Math.random() * 0.25, 3 + Math.random() * 6);
    }
  }
  emit(lateral: number, progress: number, color: number, vx: number, vz: number, life: number, size: number, smoke = false): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.cursor = (this.cursor + 1) % this.pool.length;
      const p = this.pool[this.cursor];
      if (p.life > 0) continue;
      p.lateral = lateral; p.progress = progress; p.vx = vx; p.vz = vz;
      p.life = p.maxLife = life; p.size = size; p.smoke = smoke;
      p.image.setTint(color);
      return;
    }
  }
  update(dt: number): void {
    this.activeCount = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]; if (p.life <= 0) continue;
      p.life -= dt; p.lateral += p.vx * dt; p.progress += p.vz * dt;
      if (p.life <= 0) { p.life = 0; p.image.setVisible(false); continue; }
      this.activeCount++;
    }
  }
  draw(): void {
    this.visibleCount = 0;
    const projection = this.projection;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]; if (p.life <= 0) continue;
      projection.project(p.progress, p.lateral);
      const ratio = p.life / p.maxLife;
      p.image.setPosition(projection.x, projection.y - (p.smoke ? (1 - ratio) * 9 : 2));
      p.image.setVisible(projection.y > 0 && projection.y < projection.viewHeight + 30 && projection.x > -30 && projection.x < WIDTH + 30);
      if (p.image.visible) this.visibleCount++;
      p.image.setAlpha(ratio * (p.smoke ? 0.38 : 0.95));
      p.image.setScale(p.size / 16 * projection.scale * (p.smoke ? 2 - ratio : ratio));
    }
  }
}
