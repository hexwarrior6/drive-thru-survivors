import type Phaser from 'phaser';
import { C } from './colors';

/** Original geometry and cached lettering. All rasterization happens once at boot. */
export function createPitTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 });
  // Compact service pavilion, with a side wall, striped awning and a visibly recessed window.
  g.fillStyle(0x354e3c, 0.17); g.fillEllipse(72, 112, 132, 15);
  g.fillStyle(0xb99870); g.fillPoints([{x:111,y:52},{x:134,y:39},{x:134,y:98},{x:111,y:112}], true);
  g.fillStyle(C.panel); g.lineStyle(2, C.border); g.fillRoundedRect(14, 48, 98, 64, 5); g.strokeRoundedRect(14, 48, 98, 64, 5);
  g.fillStyle(0xe5d6af); g.fillPoints([{x:15,y:48},{x:39,y:33},{x:134,y:39},{x:111,y:54}], true);
  g.fillStyle(0xad4931); g.fillRoundedRect(11, 40, 107, 25, 4);
  g.fillStyle(C.car); g.fillRoundedRect(5, 33, 111, 23, 4);
  g.fillStyle(C.gold); for (let x = 14; x < 109; x += 19) g.fillRect(x, 34, 8, 22);
  g.lineStyle(2, C.border); g.strokeRoundedRect(5, 33, 111, 23, 4);
  g.fillStyle(C.border); g.fillRoundedRect(24, 65, 56, 30, 3);
  g.fillStyle(0x3d7180); g.fillRect(27, 68, 50, 21);
  g.fillStyle(C.mint); g.fillRect(30, 70, 20, 16); g.fillStyle(0x80c6c3); g.fillRect(53, 70, 21, 16);
  g.fillStyle(C.panel, 0.6); g.fillRect(32, 71, 4, 11);
  g.fillStyle(C.gold); g.fillRoundedRect(20, 91, 65, 7, 2);
  g.fillStyle(C.ink); g.fillRoundedRect(90, 66, 15, 30, 2);
  g.fillStyle(C.gold); g.fillRect(93, 71, 9, 3); g.fillStyle(C.panel); g.fillRect(93, 77, 9, 2); g.fillRect(93, 83, 7, 2);
  g.fillStyle(C.car); g.fillRoundedRect(36, 8, 61, 22, 6); g.lineStyle(2, C.border); g.strokeRoundedRect(36, 8, 61, 22, 6);
  g.generateTexture('pit-pavilion', 142, 124); g.clear();
  stamp(scene, 'pit-pavilion', 'PIT STOP', 66, 23, 'bold 11px system-ui', '#fff9e8');

  // Wayfinding belongs beside the exit, rather than being another miniature restaurant.
  g.fillStyle(C.border); g.fillRoundedRect(46, 41, 7, 46, 2);
  g.fillStyle(0xb49061); g.fillRoundedRect(51, 41, 3, 43, 1);
  g.fillStyle(C.ink); g.lineStyle(2, C.border); g.fillRoundedRect(2, 3, 98, 52, 8); g.strokeRoundedRect(2, 3, 98, 52, 8);
  g.fillStyle(C.gold); g.fillRoundedRect(10, 34, 66, 12, 3);
  g.fillTriangle(73, 29, 93, 40, 73, 51);
  g.generateTexture('pit-direction', 104, 90); g.clear();
  stamp(scene, 'pit-direction', 'PIT ENTRY', 51, 24, 'bold 11px system-ui', '#fff9e8');

  g.fillStyle(C.gold); g.fillPoints([{x:16,y:2},{x:31,y:22},{x:23,y:22},{x:23,y:50},{x:9,y:50},{x:9,y:22},{x:1,y:22}], true);
  g.generateTexture('pit-arrow', 32, 54); g.clear();
  g.fillStyle(0x354e3c, 0.2); g.fillEllipse(9, 25, 16, 6);
  g.fillStyle(C.border); g.fillRoundedRect(4, 5, 9, 21, 3);
  g.fillStyle(C.gold); g.fillRoundedRect(5, 3, 7, 20, 3);
  g.fillStyle(C.panel); g.fillRect(5, 10, 7, 4);
  g.generateTexture('pit-bollard', 18, 30); g.clear();
  // A wall-mounted service sign, never spanning the driving lane.
  g.fillStyle(C.border); g.fillRoundedRect(2, 3, 39, 36, 5);
  g.fillStyle(C.car); g.fillRoundedRect(0, 0, 38, 34, 5);
  g.lineStyle(5, C.panel); g.lineBetween(11, 25, 25, 11);
  g.fillStyle(C.car); g.fillCircle(26, 10, 5);
  g.lineStyle(3, C.panel); g.beginPath(); g.arc(26, 10, 6, 0.2, Math.PI * 1.45); g.strokePath();
  g.generateTexture('pit-service', 44, 42); g.destroy();
}
function stamp(scene: Phaser.Scene, key: string, text: string, x: number, y: number, font: string, color: string): void {
  const texture = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  const ctx = texture.context;
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, x, y); texture.refresh();
}
