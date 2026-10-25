import Phaser from 'phaser';
import type { WeaponSystem } from './WeaponSystem';
import type { DriftPhysics } from '../systems/DriftPhysics';
import type { TrackProjection } from '../systems/TrackProjection';
import { variantByKey } from '../data/foodArt';
/** One reusable Graphics surface for continuous auras and beams, plus a small
 *  image pool so dropped mines read as the actual food variant art. */
export class WeaponView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly mineImages: Phaser.GameObjects.Image[] = [];
  constructor(scene: Phaser.Scene, private readonly model: WeaponSystem, private readonly projection: TrackProjection) {
    this.graphics = scene.add.graphics().setDepth(19);
    for (let i = 0; i < model.mines.capacity; i++) {
      this.mineImages.push(scene.add.image(0, 0, 'food-mine-box').setOrigin(0.5, 0.8).setVisible(false).setDepth(18));
    }
  }
  /** 变体首选色；无变体或未定义 tint 的变体回落到传参默认色。 */
  private static variantTint(variant: string | undefined, fallback: number): number {
    return (variant ? variantByKey(variant)?.tint : undefined) ?? fallback;
  }
  draw(p: DriftPhysics, time: number): void {
    const g = this.graphics, projection = this.projection;
    g.clear(); projection.project(p.progress, p.x - 225);
    const x = projection.x, y = projection.y, scale = projection.scale;
    let shieldTint = 0xfff9e8;
    for (let i = 0; i < 6; i++) {
      const w = this.model.slots[i]; if (!w) continue;
      const l = w.level - 1;
      if (w.type === 'cola' || w.type === 'heal' || w.type === 'shield') {
        const radius = (w.type === 'cola' ? 60 + l * 20 : 42) * scale;
        const color = WeaponView.variantTint(w.variant, w.type === 'cola' ? (l === 2 ? 0xffcf52 : 0x754329) : w.type === 'heal' ? 0xffcf52 : 0xfff9e8);
        if (w.type === 'shield') shieldTint = color;
        g.lineStyle(w.level >= 3 ? 3 : 2, color, .45); g.strokeEllipse(x, y, radius * 2, radius * 1.5);
        for (let j = 0; j < 8; j++) {
          const a = time * 2 + j * Math.PI / 4;
          g.fillStyle(color, .55); g.fillCircle(x + Math.cos(a) * radius, y + Math.sin(a) * radius * .75, (w.level >= 3 ? 5 : 3) * scale);
        }
        if (w.type === 'shield' && this.model.combat.shields) { g.lineStyle(5, color, .85); g.strokeCircle(x, y, 38 * scale); }
      }
      if (w.type === 'flame') {
        g.fillStyle(w.level >= 3 ? 0x80c6c3 : 0xe75239, .3);
        g.fillTriangle(x - 8, y + 18, x - (40 + l * 15) * scale, y + (80 + l * 40) * scale, x + (40 + l * 15) * scale, y + (80 + l * 40) * scale);
      }
      if (w.type === 'ice' && w.cooldown > .1) {
        const beam = WeaponView.variantTint(w.variant, 0x80c6c3);
        let best = 120 + l * 40, target = -1;
        for (let j = 0; j < this.model.combat.enemies.capacity; j++) {
          const e = this.model.combat.enemies.items[j]; if (!e.active || e.z <= p.progress) continue;
          const distance = Math.hypot(e.x - p.x + 225, e.z - p.progress);
          if (distance < best) { target = j; best = distance; }
        }
        if (target >= 0) { const e = this.model.combat.enemies.items[target]; projection.project(e.z, e.x); g.lineStyle(4 + l, beam, .6); g.lineBetween(x, y - 24, projection.x, projection.y); }
      }
    }
    for (let i = 0; i < this.model.mines.capacity; i++) {
      const m = this.model.mines.items[i], image = this.mineImages[i];
      if (!m.active) { image.setVisible(false); continue; }
      projection.project(m.z, m.x);
      if (m.exploded) {
        // Blast ring stays on the Graphics surface; the dropped food fades out.
        image.setVisible(false);
        const r = projection.scale * (40 + (m.level - 1) * 20);
        g.fillStyle(0xffcf52, .2); g.fillEllipse(projection.x, projection.y, r * 2, r * 1.4);
      } else {
        const texture = m.variant || 'food-mine-box';
        if (image.texture.key !== texture) image.setTexture(texture);
        image.setPosition(projection.x, projection.y).setScale(projection.scale)
          .setAlpha(0.78 + Math.sin(time * Math.PI * 4) * 0.22)
          .setVisible(projection.x > -60 && projection.x < 510);
      }
    }
    // Happy-meal escorts: little gold karts bobbing at the flanks.
    for (let i = 0; i < this.model.toyCount; i++) {
      projection.project(this.model.toyZ[i], this.model.toyX[i]);
      const s = projection.scale, bob = Math.sin(time * 9 + i * 2.4) * 2;
      g.fillStyle(0x754329, 1); g.fillRoundedRect(projection.x - 12 * s, projection.y - 15 * s + bob, 24 * s, 22 * s, 6 * s);
      g.fillStyle(0xffcf52); g.fillRoundedRect(projection.x - 10 * s, projection.y - 13 * s + bob, 20 * s, 14 * s, 4 * s);
      g.fillStyle(0x354e3c); g.fillCircle(projection.x - 5 * s, projection.y - 7 * s + bob, 2.2 * s); g.fillCircle(projection.x + 5 * s, projection.y - 7 * s + bob, 2.2 * s);
      g.fillStyle(0x293e37); g.fillRect(projection.x - 9 * s, projection.y + 5 * s + bob, 5 * s, 4 * s); g.fillRect(projection.x + 4 * s, projection.y + 5 * s + bob, 5 * s, 4 * s);
    }
    // Orbiting sweet-cone shards for shield tiers two and three.
    for (let i = 0; i < this.model.orbCount; i++) {
      projection.project(this.model.orbZ[i], this.model.orbX[i]);
      const r = 7 * projection.scale;
      g.fillStyle(shieldTint, .95); g.fillCircle(projection.x, projection.y, r);
      g.lineStyle(2, 0x80c6c3, .9); g.strokeCircle(projection.x, projection.y, r);
    }
  }
}
