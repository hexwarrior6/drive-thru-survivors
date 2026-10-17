import Phaser from 'phaser';
import { C } from '../data/colors';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    // Original raceCar motif, rotated to face up and redrawn for a 50 × 70 kart.
    g.fillStyle(0x293e37);
    for (const x of [3, 43]) for (const y of [13, 49]) g.fillRoundedRect(x, y, 9, 16, 3);
    g.fillStyle(C.car); g.lineStyle(2.5, C.border);
    g.fillRoundedRect(9, 3, 38, 65, 12); g.strokeRoundedRect(9, 3, 38, 65, 12);
    g.fillStyle(0xf4773e); g.fillRoundedRect(13, 6, 30, 24, 8);
    g.fillStyle(C.panel); g.fillRect(23, 5, 8, 59);
    g.fillStyle(0x3c717a); g.fillRoundedRect(14, 23, 28, 23, 6);
    g.fillStyle(C.mint); g.fillRoundedRect(17, 25, 22, 12, 4);
    g.fillStyle(C.panel, 0.7); g.fillRect(18, 26, 4, 10);
    g.fillStyle(C.gold); g.fillRoundedRect(13, 7, 7, 5, 2); g.fillRoundedRect(36, 7, 7, 5, 2);
    g.fillStyle(C.border); g.fillRoundedRect(10, 59, 36, 5, 2);
    g.fillStyle(C.gold); g.fillRect(14, 64, 6, 3); g.fillRect(36, 64, 6, 3);
    g.generateTexture('car', 56, 74); g.clear();
    // roundTree's layered crown and offset ground shadow from the reuse guide.
    g.fillStyle(0x354e3c, 0.15); g.fillEllipse(33, 53, 46, 17);
    g.fillStyle(C.border); g.fillRoundedRect(27, 27, 8, 29, 3);
    g.fillStyle(0x537b47); g.fillCircle(29, 26, 24); g.fillCircle(40, 31, 18);
    g.fillStyle(C.leaf); g.fillCircle(26, 23, 21); g.fillCircle(40, 27, 15);
    g.fillStyle(0x96bd71); g.fillEllipse(22, 14, 22, 12);
    g.generateTexture('tree', 64, 66); g.clear();
    g.fillStyle(0x354e3c, 0.15); g.fillEllipse(45, 80, 76, 19);
    g.fillStyle(0xb9aa8e); g.fillPoints([{x:7,y:25},{x:23,y:35},{x:23,y:83},{x:7,y:73}], true);
    g.fillStyle(0xdca16c); g.fillRect(23, 35, 52, 48);
    g.fillStyle(0xfff2cb); g.fillPoints([{x:7,y:25},{x:60,y:15},{x:75,y:35},{x:23,y:35}], true);
    g.fillStyle(C.mint); for (let y = 43; y < 76; y += 14) g.fillRect(31, y, 35, 6);
    g.lineStyle(2, C.border, 0.4); g.strokeRect(23, 35, 52, 48);
    g.generateTexture('building', 88, 96); g.clear();
    // cafe's red canopy, cream facade, mint windows and double golden arch.
    g.fillStyle(0x354e3c, 0.16); g.fillEllipse(54, 83, 96, 18);
    g.fillStyle(C.panel); g.lineStyle(2, C.border); g.fillRoundedRect(10, 34, 82, 47, 4); g.strokeRoundedRect(10, 34, 82, 47, 4);
    g.fillStyle(C.car); g.fillRoundedRect(4, 26, 96, 18, 4);
    g.fillStyle(C.gold); for (let x = 13; x < 99; x += 20) g.fillRect(x, 26, 8, 18);
    g.fillStyle(0x80c6c3); g.fillRect(19, 52, 28, 21); g.fillRect(57, 52, 25, 28);
    g.fillStyle(C.border); g.fillRect(75, 9, 4, 20);
    g.fillStyle(C.car); g.fillRoundedRect(58, 0, 37, 23, 5);
    g.lineStyle(3, C.gold); g.beginPath(); g.moveTo(65, 18);
    g.lineTo(67, 7); g.lineTo(72, 5); g.lineTo(77, 18); g.lineTo(82, 5); g.lineTo(87, 7); g.lineTo(89, 18); g.strokePath();
    g.generateTexture('cafe', 108, 96); g.clear();
    g.fillStyle(0xffffff); g.fillCircle(8, 8, 8); g.generateTexture('particle', 16, 16);
    g.destroy();
    this.scene.start('Title');
  }
}
