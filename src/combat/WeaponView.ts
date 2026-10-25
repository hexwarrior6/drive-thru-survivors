import Phaser from 'phaser';
import type { WeaponSystem } from './WeaponSystem';
import type { DriftPhysics } from '../systems/DriftPhysics';
import type { TrackProjection } from '../systems/TrackProjection';
import { weaponById } from './weaponCatalog';
/** One reusable Graphics surface for continuous fire bands and the bumper shield. */
export class WeaponView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene, private readonly model: WeaponSystem, private readonly projection: TrackProjection) {
    this.graphics = scene.add.graphics().setDepth(19);
  }
  draw(p: DriftPhysics, time: number): void {
    const g = this.graphics, projection = this.projection, combat = this.model.combat;
    g.clear();
    projection.project(p.progress, p.x - 225);
    const x = projection.x, y = projection.y, scale = projection.scale;
    // 尾焰火带：真正的有效区域、存在时间与方向（§11 视觉反馈）。
    for (let i = 0; i < this.model.trails.capacity; i++) {
      const seg = this.model.trails.items[i]; if (!seg.active) continue;
      projection.project(seg.z, seg.x);
      if (projection.x <= -60 || projection.x > 510) continue;
      const fade = Math.min(1, seg.life / 0.5);
      const r = projection.scale * 42;
      g.fillStyle(0xe75239, 0.22 * fade);
      g.fillEllipse(projection.x, projection.y, r * 2, r * 1.3);
      g.fillStyle(0xffa13f, 0.16 * fade);
      g.fillEllipse(projection.x, projection.y, r * 1.4, r * 0.9);
    }
    // 尾喷武器的喷射锥：直喷与火带同源，方向朝车尾。
    for (let i = 0; i < 2; i++) {
      const w = this.model.slots[i]; if (!w || w.cooldown > 0.12) continue;
      const def = weaponById(w.weaponId);
      if (def.behavior !== 'exhaust' && def.behavior !== 'spray') continue;
      const l = w.level - 1;
      g.fillStyle(def.behavior === 'exhaust' ? 0xe75239 : 0xd9a24b, 0.28);
      g.fillTriangle(
        x - 10 * scale, y + 14 * scale,
        x - (26 + l * 8) * scale, y + (def.range[l] * 0.75 + 60) * scale,
        x + (26 + l * 8) * scale, y + (def.range[l] * 0.75 + 60) * scale,
      );
    }
    // 应急保险杠护盾：容错层可视化，不贡献常驻伤害。
    if (combat.shields > 0) {
      g.lineStyle(4, 0x70cfff, 0.8);
      g.strokeCircle(x, y, (34 + combat.shields * 3) * scale);
      if (combat.escapeTime > 0) {
        g.lineStyle(2, 0xffffff, Math.min(1, combat.escapeTime));
        g.strokeCircle(x, y, (40 + combat.shields * 3) * scale);
      }
    }
    // 漂移增压器蓄能层数：车头小灯逐层点亮。
    for (let i = 0; i < this.model.driftCharge; i++) {
      g.fillStyle(0xffcf52, 0.9);
      g.fillCircle(x - 10 + i * 10, y - 26 * scale - 6, 2.4 * scale);
    }
    void time;
  }
}
