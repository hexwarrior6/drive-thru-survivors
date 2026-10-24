import Phaser from 'phaser';
import { WIDTH, HEIGHT } from './config';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { SelectScene } from './scenes/SelectScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';
import { installRaceLayout } from './ui/RaceLayout';

export const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: WIDTH, height: HEIGHT,
  backgroundColor: '#fcf3d9', banner: false, antialias: true,
  // Native synthesis owns audio, so Phaser does not create a second AudioContext.
  audio: { noAudio: true }, input: { activePointers: 4 },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, SelectScene, GameScene, ResultScene],
});
const disposeLayout = installRaceLayout(game);
if (import.meta.hot) import.meta.hot.dispose(() => { disposeLayout(); game.destroy(true); });
// Development-only handle for scene-manager QA and test-harness injection; never shipped.
if (import.meta.env.DEV) Object.defineProperty(window, '__game', { configurable: true, get: () => game });
// A read-only development probe supports physics/renderer QA without shipping a game-control API.
if (import.meta.env.DEV) Object.defineProperty(window, '__driveThru', { configurable: true, get: () => {
  const scene = game.scene.getScene('Game') as GameScene | undefined;
  const p = scene?.player?.physics;
  return { renderer: game.renderer?.type === Phaser.WEBGL ? 'WebGL' : 'Canvas',
    viewHeight: game.scale.height, carY: scene?.player?.baseY,
    scene: game.scene.isActive('Game') ? 'Game' : game.scene.isActive('Select') ? 'Select' : game.scene.isActive('Result') ? 'Result' : 'Title',
    paused: scene?.paused, waveState: scene?.wave?.state,
    progress: p?.progress, curvature: scene?.routeCurvature,
    x: p?.x, heading: p?.heading, vx: p?.vx, vy: p?.vy, speed: p?.speed, charge: p?.charge,
    tier: p?.tier, drifting: p?.drifting, nitro: p?.nitro, nitroTime: p?.nitroTime,
    driftCount: p?.driftCount, purpleCount: p?.purpleCount, wallHits: p?.wallHits,
    combat: scene?.combat ? { wave: scene.wave.number, remaining: scene.wave.remaining, state: scene.wave.state,
      pursuers: scene.combat.pursuers, targetDistance: scene.combat.targetDistance, pellets: scene.combat.pelletsFired,
      aimX: scene.combat.aimX, aimZ: scene.combat.aimZ, targetSlot: scene.combat.targetSlot,
      health: scene.combat.health, money: scene.combat.money, kills: scene.combat.kills, shots: scene.combat.shots, hits: scene.combat.hits,
      combo: scene.combat.combo, maxCombo: scene.combat.maxCombo,
      boss: scene.combat.bossSlot >= 0 ? { hp: scene.combat.enemies.items[scene.combat.bossSlot].hp, max: scene.combat.bossMaxHp, phase: scene.combat.enemies.items[scene.combat.bossSlot].phase } : null,
      enemies: scene.combat.enemies.activeCount, bullets: scene.combat.bullets.activeCount, coins: scene.combat.coins.activeCount,
      visibleEnemies: scene.combatView.visibleEnemies, visibleBullets: scene.combatView.visibleBullets,
      visibleParticles: scene.particles.visibleCount, damageNumbers: scene.combat.damage.activeCount, ramDamage: scene.combat.lastRamDamage,
      droppedBullets: scene.combat.bullets.dropped, droppedEnemies: scene.combat.enemies.dropped } : undefined,
    weapons: scene?.shop?.slots.map(w => w ? { name: w.name, type: w.type, level: w.level } : null),
    toys: scene?.weapons?.toyCount ?? 0,
    audio: scene?.audio?.diagnostics, particles: scene?.particles?.activeCount, fps: game.loop.actualFps };
} });
