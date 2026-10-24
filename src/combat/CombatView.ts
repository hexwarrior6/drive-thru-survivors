import Phaser from 'phaser';
import type { DriftPhysics } from '../systems/DriftPhysics';
import type { CombatSystem } from './CombatSystem';
import type { TrackProjection } from '../systems/TrackProjection';
import type { Theme } from '../systems/Theme';
import type { WeaponType } from './weaponMapper';
const ENEMY_TEXTURES = ['cone', 'cart', 'rider', 'truck'];
const HIT_TEXTURES = ['cone-hit', 'cart-hit', 'rider-hit', 'truck-hit'];
const BULLET_TEXTURES = ['bullet', 'burger-bullet', 'fries-bullet', 'toy-bullet', 'missile-bullet'];
/** Mount barrel tints per installed gun so the car shows what is actually bolted on. */
const REAR_TINTS: Record<string, number> = { starter: 0xffffff, flame: 0xe75239, mine: 0xffcf52, ice: 0x80c6c3 };
const FRONT_TINTS: Record<string, number> = { burger: 0xedb355, fries: 0xffcf52, missile: 0xff9d7a };
/** Sprites (including three cached digit sprites per damage number) are created once. */
export class CombatView {
  private readonly enemies: Phaser.GameObjects.Image[] = [];
  private readonly bullets: Phaser.GameObjects.Image[] = [];
  private readonly coins: Phaser.GameObjects.Image[] = [];
  private readonly digits: Phaser.GameObjects.Image[] = [];
  private readonly hats: Phaser.GameObjects.Image[] = [];
  visibleEnemies = 0;
  visibleBullets = 0;
  private readonly turret: Phaser.GameObjects.Image;
  private readonly frontGun: Phaser.GameObjects.Image;
  constructor(scene: Phaser.Scene, private readonly model: CombatSystem, private readonly projection: TrackProjection, private readonly theme?: Theme) {
    for (let i = 0; i < model.enemies.capacity; i++) this.enemies.push(scene.add.image(0, 0, 'cone').setVisible(false));
    for (let i = 0; i < model.bullets.capacity; i++) this.bullets.push(scene.add.image(0, 0, 'bullet').setVisible(false));
    for (let i = 0; i < model.coins.capacity; i++) this.coins.push(scene.add.image(0, 0, 'coin').setVisible(false));
    for (let i = 0; i < model.damage.capacity * 3; i++) this.digits.push(scene.add.image(0, 0, 'digit0').setVisible(false).setDepth(29));
    if (theme?.hat) for (let i = 0; i < model.enemies.capacity; i++) this.hats.push(scene.add.image(0, 0, 'hat').setVisible(false).setDepth(29));
    this.turret = scene.add.image(0, 0, 'turret').setOrigin(0.5, 0.68);
    this.frontGun = scene.add.image(0, 0, 'turret').setOrigin(0.5, 0.68).setVisible(false);
  }
  private place(image: Phaser.GameObjects.Image, x: number, z: number, scale: number): void {
    const p = this.projection; p.project(z, x);
    image.setVisible(p.x > -60 && p.x < 510 && p.y > 100 && p.y < p.viewHeight + 65)
      .setPosition(p.x, p.y).setScale(p.scale * scale).setDepth(10 + p.y / 100 + 0.03);
  }
  draw(alpha: number): void {
    const m = this.model;
    this.visibleEnemies = this.visibleBullets = 0;
    const campaignTint = this.theme?.tint ?? 0xffffff;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = m.enemies.items[i], image = this.enemies[i];
      if (!e.active) { image.setVisible(false); if (i < this.hats.length) this.hats[i].setVisible(false); continue; }
      const texture = e.flash > 0 ? HIT_TEXTURES[e.kind] : ENEMY_TEXTURES[e.kind]; if (image.texture.key !== texture) image.setTexture(texture);
      this.place(image, e.px + (e.x - e.px) * alpha, e.pz + (e.z - e.pz) * alpha, 1);
      if (image.visible) this.visibleEnemies++;
      image.setTint(e.slowTime > 0 ? 0x80c6c3 : e.kind === 3 ? 0xffffff : campaignTint);
      // Riders breaking off the chase turn their bike around and ride down-screen.
      image.setRotation(e.kind === 1 ? Math.sign(e.vx) * 0.22
        : e.kind === 2 ? (e.x - e.px) * 0.08 + (m.entering && e.vz < -30 ? Math.PI : 0) : 0);
      if (i < this.hats.length) {
        const hat = this.hats[i];
        if (e.kind === 2 && image.visible) {
          hat.setPosition(image.x, image.y - 26 * image.scaleY).setRotation(image.rotation)
            .setScale(image.scaleX * 0.9, image.scaleY * 0.9).setVisible(true);
        } else hat.setVisible(false);
      }
    }
    for (let i = 0; i < this.bullets.length; i++) {
      const b = m.bullets.items[i], image = this.bullets[i];
      if (!b.active) { image.setVisible(false); continue; }
      const texture = BULLET_TEXTURES[b.kind] ?? 'bullet';
      if (image.texture.key !== texture) image.setTexture(texture);
      this.place(image, b.px + (b.x - b.px) * alpha, b.pz + (b.z - b.pz) * alpha, 1);
      if (image.visible) this.visibleBullets++;
      image.setTint(b.kind === 1 ? (b.level >= 3 ? 0xffcf52 : 0xad713a) : b.kind === 2 ? 0xffcf52 : b.kind === 4 ? 0xff9d7a : 0xffffff);
      if (b.kind === 1 && b.level >= 3) image.setScale(image.scaleX * (b.level >= 5 ? 1.8 : 1.5), image.scaleY * (b.level >= 5 ? 1.8 : 1.5));
      image.setRotation(Math.atan2(b.vx, b.vz));
    }
    for (let i = 0; i < this.coins.length; i++) {
      const c = m.coins.items[i], image = this.coins[i];
      if (!c.active) { image.setVisible(false); continue; }
      this.place(image, c.px + (c.x - c.px) * alpha, c.pz + (c.z - c.pz) * alpha, 1);
      image.scaleX *= 0.65 + Math.abs(Math.sin(c.life * 7)) * 0.35;
    }
    for (let i = 0; i < m.damage.capacity; i++) {
      const d = m.damage.items[i];
      this.projection.project(d.z, d.x);
      const count = d.value >= 100 ? 3 : d.value >= 10 ? 2 : 1;
      for (let j = 0; j < 3; j++) {
        const image = this.digits[i * 3 + j];
        if (!d.active || j >= count) { image.setVisible(false); continue; }
        const digit = Math.floor(d.value / (10 ** (count - 1 - j))) % 10;
        const texture = DIGITS[digit]; if (image.texture.key !== texture) image.setTexture(texture);
        image.setVisible(this.projection.y > 100 && this.projection.y < this.projection.viewHeight + 40)
          .setPosition(this.projection.x + (j - (count - 1) / 2) * 11, this.projection.y - 30 - (0.65 - d.life) * 55)
          .setScale(1 + Math.sin(d.life / 0.65 * Math.PI) * 0.13).setAlpha(Math.min(1, d.life * 5));
      }
    }
  }
  drawTurret(p: DriftPhysics, alpha: number, kick: number, front: WeaponType | null, rear: WeaponType): void {
    const heading = p.previousHeading + (p.heading - p.previousHeading) * alpha;
    const x = p.previousX + (p.x - p.previousX) * alpha - 225;
    const z = p.previousProgress + (p.progress - p.previousProgress) * alpha;
    const projection = this.projection;
    // Rear mount trails the car and tracks the current aim; front mount points ahead.
    const rx = x - Math.sin(heading) * 24, rz = z - Math.cos(heading) * 24;
    projection.project(rz, rx);
    const sx = projection.x, sy = projection.y, scale = projection.scale;
    projection.project(rz + this.model.aimZ * 45, rx + this.model.aimX * 45);
    const angle = Math.atan2(projection.x - sx, sy - projection.y);
    this.turret.setPosition(sx, sy - 5 + kick).setRotation(angle).setScale(scale, scale * 0.85)
      .setVisible(true).setDepth(10 + sy / 100 + 0.05).setAlpha(this.model.muzzleFlash > 0 ? 0.7 : 1)
      .setTint(REAR_TINTS[rear] ?? 0xffffff);
    if (front) {
      const fx = x + Math.sin(heading) * 24, fz = z + Math.cos(heading) * 24;
      projection.project(fz, fx);
      const fsx = projection.x, fsy = projection.y;
      projection.project(fz + Math.cos(heading) * 45, fx + Math.sin(heading) * 45);
      const fangle = Math.atan2(projection.x - fsx, fsy - projection.y);
      this.frontGun.setPosition(fsx, fsy - 5 + kick).setRotation(fangle).setScale(scale, scale * 0.85)
        .setVisible(true).setDepth(10 + fsy / 100 + 0.05).setTint(FRONT_TINTS[front] ?? 0xffffff);
    } else this.frontGun.setVisible(false);
  }

}
const DIGITS = ['digit0', 'digit1', 'digit2', 'digit3', 'digit4', 'digit5', 'digit6', 'digit7', 'digit8', 'digit9'];
