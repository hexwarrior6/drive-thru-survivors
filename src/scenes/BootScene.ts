import Phaser from 'phaser';
import { createPitTextures } from '../data/createPitTextures';
import { CARS } from '../data/cars';
import { C } from '../data/colors';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    // Original raceCar motif, rotated to face up and redrawn for a 50 × 70 kart.
    // One painting per starter car: chassis and hood take that car's livery.
    const drawCar = (body: number, hood: number): void => {
      g.fillStyle(0x293e37);
      for (const x of [3, 43]) for (const y of [13, 49]) g.fillRoundedRect(x, y, 9, 16, 3);
      g.fillStyle(body); g.lineStyle(2.5, C.border);
      g.fillRoundedRect(9, 3, 38, 65, 12); g.strokeRoundedRect(9, 3, 38, 65, 12);
      g.fillStyle(hood); g.fillRoundedRect(13, 6, 30, 24, 8);
      g.fillStyle(C.panel); g.fillRect(23, 5, 8, 59);
      g.fillStyle(0x3c717a); g.fillRoundedRect(14, 23, 28, 23, 6);
      g.fillStyle(C.mint); g.fillRoundedRect(17, 25, 22, 12, 4);
      g.fillStyle(C.panel, 0.7); g.fillRect(18, 26, 4, 10);
      g.fillStyle(C.gold); g.fillRoundedRect(13, 7, 7, 5, 2); g.fillRoundedRect(36, 7, 7, 5, 2);
      g.fillStyle(C.border); g.fillRoundedRect(10, 59, 36, 5, 2);
      g.fillStyle(C.gold); g.fillRect(14, 64, 6, 3); g.fillRect(36, 64, 6, 3);
    };
    for (const car of CARS) {
      drawCar(car.body, car.hood);
      g.generateTexture('car-' + car.id, 56, 74); g.clear();
    }
    g.fillStyle(C.border); g.fillCircle(12, 23, 10);
    g.fillStyle(C.gold); g.fillCircle(12, 23, 7);
    g.fillStyle(C.border); g.fillRoundedRect(7, 0, 10, 24, 3);
    g.fillStyle(0x80c6c3); g.fillRoundedRect(9, 2, 6, 20, 2);
    g.fillStyle(C.panel); g.fillRect(10, 2, 2, 9);
    g.generateTexture('turret', 24, 34); g.clear();
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
    g.clear();
    g.fillStyle(C.border); g.fillRoundedRect(2, 29, 36, 10, 3);
    g.fillStyle(C.orange); g.fillTriangle(20, 1, 5, 33, 35, 33);
    g.fillStyle(C.panel); g.fillRect(13, 15, 14, 5);
    g.lineStyle(2, C.border); g.strokeTriangle(20, 1, 5, 33, 35, 33);
    g.generateTexture('cone', 40, 40); g.clear();
    g.fillStyle(C.border); g.fillCircle(12, 38, 5); g.fillCircle(35, 38, 5);
    g.fillStyle(0xc5d3cf); g.fillRoundedRect(7, 7, 35, 25, 4);
    g.lineStyle(3, C.border); g.strokeRoundedRect(7, 7, 35, 25, 4);
    g.lineBetween(3, 2, 7, 7); g.lineBetween(14, 12, 14, 27); g.lineBetween(24, 12, 24, 27); g.lineBetween(34, 12, 34, 27);
    g.lineBetween(9, 20, 40, 20); g.generateTexture('cart', 48, 46); g.clear();
    g.fillStyle(C.border); g.fillRoundedRect(15, 0, 10, 55, 4);
    g.fillStyle(0xad3945); g.fillRoundedRect(7, 12, 26, 30, 8);
    g.fillStyle(C.gold); g.fillRoundedRect(10, 6, 20, 15, 6);
    g.fillStyle(0x3c717a); g.fillRoundedRect(12, 8, 16, 6, 3);
    g.lineStyle(3, C.border); g.lineBetween(1, 20, 39, 20);
    g.generateTexture('rider', 40, 56); g.clear();
    // Tyrant truck seen from behind: a wide box rig with golden arches and brake lights.
    g.fillStyle(0x354e3c, 0.18); g.fillEllipse(80, 104, 140, 18);
    g.fillStyle(C.border); g.fillRoundedRect(6, 6, 148, 84, 10);
    g.fillStyle(0xb9702e); g.fillRoundedRect(11, 11, 138, 70, 8);
    g.fillStyle(0xd98d44); g.fillRoundedRect(17, 17, 126, 44, 6);
    g.lineStyle(4, C.gold); g.beginPath(); g.moveTo(48, 52);
    g.lineTo(52, 30); g.lineTo(60, 26); g.lineTo(68, 52); g.lineTo(76, 26); g.lineTo(84, 30); g.lineTo(88, 52); g.strokePath();
    g.fillStyle(0x3c717a); g.fillRect(24, 21, 22, 12);
    g.fillStyle(C.panel); g.fillRect(30, 23, 10, 8);
    g.fillStyle(0xad3945); g.fillRoundedRect(14, 66, 26, 12, 3); g.fillRoundedRect(120, 66, 26, 12, 3);
    g.fillStyle(0xff7a5c); g.fillRect(18, 69, 18, 6); g.fillRect(124, 69, 18, 6);
    g.fillStyle(0x293e37);
    g.fillRoundedRect(18, 88, 26, 14, 4); g.fillRoundedRect(64, 88, 32, 14, 4); g.fillRoundedRect(116, 88, 26, 14, 4);
    g.generateTexture('truck', 160, 110); g.clear();
    g.fillStyle(0xffcf52); g.fillRoundedRect(1, 1, 8, 9, 2);
    g.fillStyle(C.border); g.fillRect(3, 8, 2, 2);
    g.generateTexture('toy-bullet', 10, 11); g.clear();
    g.fillStyle(0xad3945); g.fillRoundedRect(2, 0, 8, 16, 3);
    g.fillStyle(0xfff2cb); g.fillRoundedRect(2, 3, 8, 4, 2);
    g.fillStyle(C.border); g.fillTriangle(2, 16, 6, 11, 10, 16); g.fillTriangle(0, 20, 4, 15, 8, 20);
    g.generateTexture('missile-bullet', 12, 22); g.clear();
    g.fillStyle(0xad3945); g.fillTriangle(10, 0, 2, 12, 18, 12);
    g.fillStyle(0xfff2cb); g.fillCircle(10, 6, 3.4);
    g.generateTexture('hat', 20, 14); g.clear();
    g.fillStyle(C.orange); g.fillRoundedRect(0, 0, 10, 22, 5);
    g.fillStyle(C.panel); g.fillRoundedRect(3, 2, 4, 14, 2);
    g.generateTexture('bullet', 10, 22); g.clear();
    g.lineStyle(1.5, C.gold); g.fillStyle(0xad713a); g.fillCircle(8, 8, 6); g.strokeCircle(8,8,6);
    g.fillStyle(C.leaf); g.fillRect(2,7,12,3); g.fillStyle(0xedb355); g.fillEllipse(8,4,11,5);
    g.generateTexture('burger-bullet',16,16); g.clear();
    g.fillStyle(C.gold); g.fillRect(0,0,3,12); g.generateTexture('fries-bullet',3,12); g.clear();
    g.fillStyle(C.border); g.fillCircle(10, 10, 9);
    g.fillStyle(C.gold); g.fillCircle(10, 10, 7);
    g.fillStyle(0xffedaa); g.fillRect(8, 5, 3, 9);
    g.generateTexture('coin', 20, 20); g.destroy();
    // Cache digit bitmaps at boot; combat never updates Text or rasterizes a canvas.
    const digit = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#fff2cb', stroke: '#754329', strokeThickness: 3 });
    for (let i = 0; i < 10; i++) {
      digit.setText(String(i));
      const texture = this.textures.createCanvas('digit' + i, 18, 26)!;
      texture.context.drawImage(digit.canvas, 0, 0); texture.refresh();
    }
    digit.destroy();
    for (const key of ['cone', 'cart', 'rider', 'truck']) {
      const source = this.textures.get(key).getSourceImage() as HTMLCanvasElement;
      const hit = this.textures.createCanvas(key + '-hit', source.width, source.height)!;
      hit.context.drawImage(source, 0, 0); hit.context.globalCompositeOperation = 'source-in';
      hit.context.fillStyle = '#ffffff'; hit.context.fillRect(0, 0, source.width, source.height); hit.refresh();
    }
    createPitTextures(this);
    this.scene.start('Title');
  }
}
