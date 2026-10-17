import Phaser from 'phaser';
import './style.css';
import { WIDTH, HEIGHT } from './config';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { installRaceLayout } from './ui/RaceLayout';

const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: WIDTH, height: HEIGHT,
  backgroundColor: '#fcf3d9', banner: false, antialias: true,
  // Native synthesis owns audio, so Phaser does not create a second AudioContext.
  audio: { noAudio: true }, input: { activePointers: 4 },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, GameScene],
});
const disposeLayout = installRaceLayout(game);
if (import.meta.hot) import.meta.hot.dispose(() => { disposeLayout(); game.destroy(true); });
// A read-only development probe supports physics/renderer QA without shipping a game-control API.
if (import.meta.env.DEV) Object.defineProperty(window, '__driveThru', { configurable: true, get: () => {
  const scene = game.scene.getScene('Game') as GameScene | undefined;
  const p = scene?.player?.physics;
  return { renderer: game.renderer?.type === Phaser.WEBGL ? 'WebGL' : 'Canvas',
    viewHeight: game.scale.height, carY: scene?.player?.baseY,
    scene: game.scene.isActive('Game') ? 'Game' : 'Title', paused: scene?.paused,
    x: p?.x, heading: p?.heading, vx: p?.vx, vy: p?.vy, speed: p?.speed, charge: p?.charge,
    tier: p?.tier, drifting: p?.drifting, nitro: p?.nitro, nitroTime: p?.nitroTime,
    driftCount: p?.driftCount, purpleCount: p?.purpleCount, wallHits: p?.wallHits,
    audio: scene?.audio?.diagnostics, particles: scene?.particles?.activeCount, fps: game.loop.actualFps };
} });
