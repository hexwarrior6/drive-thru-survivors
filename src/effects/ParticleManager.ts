import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../config';

interface Particle { image: Phaser.GameObjects.Image; vx: number; vy: number; life: number; maxLife: number; size: number; smoke: boolean }
/** Fixed capacity, preallocated sprites. Saturation drops new particles, never grows. */
export class ParticleManager {
  private pool: Particle[] = [];
  private cursor = 0;
  activeCount = 0;
  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < 512; i++) this.pool.push({
      image: scene.add.image(0, 0, 'particle').setVisible(false).setDepth(4),
      vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, smoke: false,
    });
  }
  emit(x: number, y: number, color: number, vx: number, vy: number, life: number, size: number, smoke = false): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.cursor = (this.cursor + 1) % this.pool.length;
      const p = this.pool[this.cursor];
      if (p.life > 0) continue;
      p.vx = vx; p.vy = vy; p.life = p.maxLife = life; p.size = size; p.smoke = smoke;
      p.image.setPosition(x, y).setTint(color).setAlpha(1).setScale(size / 16).setVisible(true);
      return;
    }
  }
  update(dt: number, scroll: number, height = HEIGHT): void {
    this.activeCount = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]; if (p.life <= 0) continue;
      p.life -= dt;
      p.image.x += p.vx * dt;
      p.image.y += (p.vy + scroll) * dt;
      if (p.life <= 0 || p.image.y > height + 30 || p.image.x < -30 || p.image.x > WIDTH + 30) {
        p.life = 0; p.image.setVisible(false); continue;
      }
      this.activeCount++;
      p.image.setAlpha((p.life / p.maxLife) * (p.smoke ? 0.38 : 0.95));
      p.image.setScale(p.size / 16 * (p.smoke ? 2 - p.life / p.maxLife : p.life / p.maxLife));
    }
  }
}
