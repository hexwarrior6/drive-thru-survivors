import Phaser from 'phaser';
import type { WeaponSystem } from './WeaponSystem';
import type { DriftPhysics } from '../systems/DriftPhysics';
import type { TrackProjection } from '../systems/TrackProjection';
/** One reusable Graphics surface for continuous auras, beams and pooled mines. */
export class WeaponView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene, private readonly model: WeaponSystem, private readonly projection: TrackProjection) { this.graphics = scene.add.graphics().setDepth(19); }
  draw(p: DriftPhysics, time: number): void {
    const g = this.graphics, projection = this.projection;
    g.clear(); projection.project(p.progress, p.x - 225);
    const x = projection.x, y = projection.y, scale = projection.scale;
    for (let i = 0; i < 6; i++) {
      const w = this.model.slots[i]; if (!w) continue;
      const l = w.level - 1;
      if (w.type === 'cola' || w.type === 'heal' || w.type === 'shield') {
        const radius = (w.type === 'cola' ? 60 + l * 20 : 42) * scale;
        const color = w.type === 'cola' ? (l === 2 ? 0xffcf52 : 0x754329) : w.type === 'heal' ? 0xffcf52 : 0xfff9e8;
        g.lineStyle(w.level === 3 ? 3 : 2, color, .45); g.strokeEllipse(x, y, radius * 2, radius * 1.5);
        for (let j = 0; j < 8; j++) {
          const a = time * 2 + j * Math.PI / 4;
          g.fillStyle(color, .55); g.fillCircle(x + Math.cos(a) * radius, y + Math.sin(a) * radius * .75, (w.level === 3 ? 5 : 3) * scale);
        }
        if (w.type === 'shield' && this.model.combat.shields) { g.lineStyle(5, color, .85); g.strokeCircle(x, y, 38 * scale); }
      }
      if (w.type === 'flame') {
        g.fillStyle(w.level === 3 ? 0x80c6c3 : 0xe75239, .3);
        g.fillTriangle(x - 8, y + 18, x - (40 + l * 15) * scale, y + (80 + l * 40) * scale, x + (40 + l * 15) * scale, y + (80 + l * 40) * scale);
      }
      if (w.type === 'ice' && w.cooldown > .1) {
        let best = 120 + l * 40, target = -1;
        for (let j = 0; j < this.model.combat.enemies.capacity; j++) {
          const e = this.model.combat.enemies.items[j]; if (!e.active || e.z <= p.progress) continue;
          const distance = Math.hypot(e.x - p.x + 225, e.z - p.progress);
          if (distance < best) { target = j; best = distance; }
        }
        if (target >= 0) { const e = this.model.combat.enemies.items[target]; projection.project(e.z, e.x); g.lineStyle(4 + l, 0x80c6c3, .6); g.lineBetween(x, y - 24, projection.x, projection.y); }
      }
    }
    for (let i = 0; i < this.model.mines.capacity; i++) {
      const m = this.model.mines.items[i]; if (!m.active) continue;
      projection.project(m.z, m.x); const r = projection.scale * (m.exploded ? 40 + (m.level - 1) * 20 : 9);
      g.fillStyle(m.exploded ? 0xffcf52 : Math.sin(time * Math.PI * 4) > 0 ? 0xe75239 : 0xffcf52, m.exploded ? .2 : 1);
      g.fillEllipse(projection.x, projection.y, r * 2, r * 1.4);
    }
  }
}
