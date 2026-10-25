import Phaser from 'phaser';
import type { WeaponSystem } from './WeaponSystem';
import type { DriftPhysics } from '../systems/DriftPhysics';
import type { TrackProjection } from '../systems/TrackProjection';
import { weaponById } from './weaponCatalog';
/** One reusable Graphics surface for deployables, beams and module visuals. */
export class WeaponView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly mineImages: Phaser.GameObjects.Image[] = [];
  constructor(scene: Phaser.Scene, private readonly model: WeaponSystem, private readonly projection: TrackProjection) {
    this.graphics = scene.add.graphics().setDepth(19);
    for (let i = 0; i < model.mines.capacity; i++) {
      this.mineImages.push(scene.add.image(0, 0, 'food-mine-box').setOrigin(0.5, 0.8).setVisible(false).setDepth(18));
    }
  }
  draw(p: DriftPhysics, time: number): void {
    const g = this.graphics, projection = this.projection, combat = this.model.combat;
    g.clear();
    projection.project(p.progress, p.x - 225);
    const x = projection.x, y = projection.y, scale = projection.scale;
    // 尾焰火带 / 酸浆带：真正的有效区域、存在时间与方向（§11 视觉反馈）。
    for (let i = 0; i < this.model.trails.capacity; i++) {
      const seg = this.model.trails.items[i]; if (!seg.active) continue;
      projection.project(seg.z, seg.x);
      if (projection.x <= -60 || projection.x > 510) continue;
      const fade = Math.min(1, seg.life / 0.5);
      const r = projection.scale * 42;
      if (seg.kind === 1) {
        g.fillStyle(0x8bbf57, 0.24 * fade);
        g.fillEllipse(projection.x, projection.y, r * 1.5, r);
      } else {
        g.fillStyle(0xe75239, 0.22 * fade);
        g.fillEllipse(projection.x, projection.y, r * 2, r * 1.3);
        g.fillStyle(0xffa13f, 0.16 * fade);
        g.fillEllipse(projection.x, projection.y, r * 1.4, r * 0.9);
      }
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
    // 麦乐鸡雷阵：掉在路面的雷用食物美术，倒计时闪动提示可触发。
    for (let i = 0; i < this.model.mines.capacity; i++) {
      const m = this.model.mines.items[i], image = this.mineImages[i];
      if (!m.active) { image.setVisible(false); continue; }
      projection.project(m.z, m.x);
      if (projection.x <= -60 || projection.x > 510) { image.setVisible(false); continue; }
      image.setPosition(projection.x, projection.y).setScale(projection.scale)
        .setAlpha(0.78 + Math.sin(time * Math.PI * 4) * 0.22).setVisible(true);
    }
    // 薯饼后置圆锯：旋转的切割盘，半径就是真实有效范围。
    for (let i = 0; i < this.model.saws.capacity; i++) {
      const saw = this.model.saws.items[i]; if (!saw.active) continue;
      projection.project(saw.z, saw.x);
      if (projection.x <= -60 || projection.x > 510) continue;
      const r = saw.radius * projection.scale;
      const fade = Math.min(1, saw.life / 0.5);
      g.fillStyle(0xd9a24b, 0.5 * fade);
      g.fillCircle(projection.x, projection.y, r);
      g.lineStyle(2.5, 0x754329, 0.8 * fade);
      g.strokeCircle(projection.x, projection.y, r);
      g.lineStyle(3, 0xfff5e0, 0.85 * fade);
      for (let blade = 0; blade < 3; blade++) {
        const a = saw.spin + blade * Math.PI * 2 / 3;
        g.lineBetween(projection.x, projection.y, projection.x + Math.cos(a) * r, projection.y + Math.sin(a) * r);
      }
    }
    // 麦旋风螺旋刃：外扩回收的轨道 + 刃点，空档清晰可见。
    if (this.model.spiralR > 0) {
      const w = this.model.slots[1];
      if (w && w.weaponId === 'W31') {
        projection.project(p.progress - 30, p.x - 225);
        const far = this.model.spiralR * 1.15 * scale;
        g.lineStyle(1.5, 0xbfe0ea, 0.25);
        g.strokeEllipse(projection.x, projection.y, far * 1.6, far);
        projection.project(this.model.spiralZ, this.model.spiralX);
        const br = 9 * scale;
        g.fillStyle(0xbfe0ea, 0.9);
        g.fillCircle(projection.x, projection.y, br);
        g.lineStyle(2, 0x754329, 0.9);
        g.strokeCircle(projection.x, projection.y, br);
      }
    }
    // 前武器 / 后武器的指向性反馈：锁定进度与寒意积累。
    for (let i = 0; i < 2; i++) {
      const w = this.model.slots[i]; if (!w) continue;
      const def = weaponById(w.weaponId);
      if (def.behavior === 'rocket' && this.model.lockSlot >= 0) {
        const target = combat.enemies.items[this.model.lockSlot];
        if (target && target.active) {
          projection.project(target.z, target.x);
          const progress = Math.min(1, this.model.lockTime / this.model.lockNeed);
          g.lineStyle(2, 0xd9553f, 0.35 + progress * 0.5);
          g.lineBetween(x, y - 20, projection.x, projection.y);
          g.fillStyle(0xffcf52, 0.9);
          g.strokeCircle(projection.x, projection.y, 26 * scale * (1 - progress * 0.4));
        }
      }
      if (def.behavior === 'freeze' && this.model.combat.enemies.activeCount > 0) {
        const slot = this.model.freezeSlot;
        if (slot >= 0) {
          const target = combat.enemies.items[slot];
          if (target && target.active && target.chill > 0) {
            projection.project(target.z, target.x);
            g.lineStyle(3, 0x80c6c3, 0.3 + (target.chill / 100) * 0.55);
            g.strokeCircle(projection.x, projection.y, (target.frozen ? 30 : 22) * scale);
          }
        }
      }
    }
    // 可乐高压脉冲炮：压力环爆发时的一圈扩散。
    if (this.model.pulseFlash > 0) {
      const rear = this.model.slots[1];
      if (rear && rear.weaponId === 'W21') {
        const def = weaponById('W21');
        const r = def.range[rear.level - 1] * (rear.branch === 'a' && rear.level >= 3 ? 1.4 : 1)
          * (1.15 - this.model.pulseFlash * 0.15) * scale;
        g.lineStyle(3, 0x59b368, this.model.pulseFlash * 0.55);
        g.strokeEllipse(x, y, r * 2, r * 1.5);
      }
    }
    // 封路栅 / 凝霜墙：真正的拦截带（宽度 52px）与剩余次数。
    for (let i = 0; i < this.model.blockers.capacity; i++) {
      const wall = this.model.blockers.items[i]; if (!wall.active) continue;
      projection.project(wall.z, wall.x);
      if (projection.x <= -60 || projection.x > 510) continue;
      const fade = Math.min(1, wall.life / 0.5);
      const wHalf = 52 * projection.scale;
      const color = wall.frost ? 0x80c6c3 : 0xd9a24b;
      g.fillStyle(color, 0.4 * fade);
      g.fillRect(projection.x - wHalf, projection.y - 5 * projection.scale, wHalf * 2, 10 * projection.scale);
      g.lineStyle(2, 0x754329, 0.8 * fade);
      g.strokeRect(projection.x - wHalf, projection.y - 5 * projection.scale, wHalf * 2, 10 * projection.scale);
      g.fillStyle(0xfff5e0, 0.9 * fade);
      for (let notch = 0; notch < wall.hp; notch++) {
        g.fillCircle(projection.x - wHalf + (notch + 0.5) * (wHalf * 2 / Math.max(1, wall.hp)), projection.y, 2.2 * projection.scale);
      }
    }
    // 苹果派折叠弹匣：投在路面的派盒与引信闪动。
    for (let i = 0; i < this.model.pieboxes.capacity; i++) {
      const box = this.model.pieboxes.items[i]; if (!box.active) continue;
      projection.project(box.z, box.x);
      if (projection.x <= -60 || projection.x > 510) continue;
      const blink = box.fuse < 0.6 ? (Math.sin(time * 30) > 0 ? 0.9 : 0.4) : 0.85;
      g.fillStyle(0xdba24a, blink);
      g.fillRoundedRect(projection.x - 11 * projection.scale, projection.y - 9 * projection.scale, 22 * projection.scale, 15 * projection.scale, 4 * projection.scale);
      g.lineStyle(2, 0x754329, 0.9);
      g.strokeRoundedRect(projection.x - 11 * projection.scale, projection.y - 9 * projection.scale, 22 * projection.scale, 15 * projection.scale, 4 * projection.scale);
    }
    // 果汁扩散波：双层扩张环，波前最亮。
    for (let ring = 0; ring < 2; ring++) {
      const r = ring === 0 ? this.model.waveRadius : this.model.waveRadius2;
      if (r < 0) continue;
      const front = r < 90 ? 0.5 : 0.26;
      g.lineStyle(3, 0xffa13f, front);
      g.strokeEllipse(x, y + r * 0.35 * scale, r * 2 * scale, r * 1.4 * scale);
    }
    // 拿铁涡流：聚拢阶段的旋涡与脉冲爆发。
    if (this.model.vortexPulling && this.model.vortexTimer > 0) {
      projection.project(this.model.vortexZ, this.model.vortexX);
      const vr = 46 * projection.scale;
      g.lineStyle(2.5, 0xc9a77c, 0.55);
      g.strokeCircle(projection.x, projection.y, vr);
      for (let arm = 0; arm < 3; arm++) {
        const a = time * 4 + arm * Math.PI * 2 / 3;
        g.lineStyle(2, 0xc9a77c, 0.4);
        g.lineBetween(projection.x + Math.cos(a) * vr, projection.y + Math.sin(a) * vr * 0.7,
          projection.x + Math.cos(a + 0.8) * vr * 0.45, projection.y + Math.sin(a + 0.8) * vr * 0.32);
      }
    }
    // 鸡柳双索切割器：两条锚点之间的切割索。
    if (this.model.wireLife > 0) {
      const rear = this.model.slots[1];
      if (rear && rear.weaponId === 'W20') {
        projection.project(this.model.wireAz, this.model.wireAx);
        const ax = projection.x, ay = projection.y;
        projection.project(this.model.wireBz, this.model.wireBx);
        g.lineStyle(2.5, 0xffcf52, 0.75);
        g.lineBetween(ax, ay, projection.x, projection.y);
        g.fillStyle(0xfff5e0, 0.95);
        g.fillCircle(ax, ay, 4 * projection.scale);
        g.fillCircle(projection.x, projection.y, 4 * projection.scale);
      }
    }
    // 前武器指向性反馈：轨道炮瞄线 / 激光光束 / 圣代光柱。
    const front = this.model.slots[0];
    if (front) {
      const fdef = weaponById(front.weaponId);
      if (fdef.behavior === 'rail' && this.model.railProgress > 0.03) {
        projection.project(p.progress + Math.cos(this.model.railAngle) * 620, p.x - 225 + Math.sin(this.model.railAngle) * 620);
        g.lineStyle(1.5 + this.model.railProgress * 2, 0xffcf52, 0.25 + this.model.railProgress * 0.5);
        g.lineBetween(x, y - 16, projection.x, projection.y);
      }
      if (fdef.behavior === 'laser' && this.model.laserOn && this.model.laserSlot >= 0) {
        const target = this.model.combat.enemies.items[this.model.laserSlot];
        if (target && target.active) {
          projection.project(target.z, target.x);
          g.lineStyle(3 + this.model.laserHeat, 0xe75239, 0.55 + Math.min(0.35, this.model.laserHeat * 0.1));
          g.lineBetween(x, y - 16, projection.x, projection.y);
          g.fillStyle(0xffcf52, 0.8);
          g.fillCircle(projection.x, projection.y, 5 * projection.scale);
        }
      }
      if (fdef.behavior === 'pillar' && this.model.pillarStacks > 0 && this.model.pillarSlot >= 0) {
        const target = this.model.combat.enemies.items[this.model.pillarSlot];
        if (target && target.active) {
          projection.project(target.z, target.x);
          const w = (5 + this.model.pillarStacks * 3) * projection.scale;
          g.fillStyle(0xff9db0, 0.4);
          g.fillRect(projection.x - w, y - 30, w * 2, projection.y - y + 30);
          g.fillStyle(0xfff5e0, 0.75);
          g.fillRect(projection.x - w * 0.4, y - 30, w * 0.8, projection.y - y + 30);
        }
      }
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
  }
}
