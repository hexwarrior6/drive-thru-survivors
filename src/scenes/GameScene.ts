import Phaser from 'phaser';
import { BASE_SPEED, FIXED_DT, ROAD_LEFT, ROAD_RIGHT, WIDTH } from '../config';
import { C, TIER_COLORS } from '../data/colors';
import { Player } from '../entities/Player';
import { ParticleManager } from '../effects/ParticleManager';
import { AudioSynth } from '../effects/AudioSynth';
import { ScreenShake } from '../effects/ScreenShake';
import { TrackGenerator } from '../systems/TrackGenerator';
import { MobileControls } from '../ui/MobileControls';
import { HUD } from '../ui/HUD';
import { getCarY, updateCarY } from '../ui/RaceLayout';
import { clamp } from '../utils/math';

export class GameScene extends Phaser.Scene {
  player!: Player;
  audio!: AudioSynth;
  particles!: ParticleManager;
  paused = false;
  private track!: TrackGenerator;
  private inputControls!: MobileControls;
  private hud!: HUD;
  private lines!: Phaser.GameObjects.Graphics;
  private skid!: Phaser.GameObjects.Graphics;
  private shake = new ScreenShake();
  private accumulator = 0;
  private elapsed = 0;
  private hudTick = 0;
  private kick = 0;
  private abort!: AbortController;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private soundButton = document.getElementById('sound')!;
  constructor() { super('Game'); }
  create(): void {
    this.accumulator = this.elapsed = this.hudTick = this.kick = 0;
    this.paused = false;
    document.body.classList.add('is-driving');
    this.shake = new ScreenShake();
    this.cameras.main.setScroll(0, 0).setZoom(1);
    this.track = new TrackGenerator(this);
    this.skid = this.add.graphics().setDepth(2);
    this.lines = this.add.graphics().setDepth(6);
    this.particles = new ParticleManager(this);
    this.player = new Player(this);
    this.audio = new AudioSynth();
    this.audio.setMuted(this.registry.get('muted') === true);
    this.audio.unlock();
    this.hud = new HUD();
    this.inputControls = new MobileControls(() => this.audio.unlock(), () => this.togglePause(), () => this.restart(), () => this.toggleMute());
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    document.getElementById('pause')!.addEventListener('click', () => this.togglePause(), options);
    document.getElementById('resume')!.addEventListener('click', () => { this.audio.unlock(); this.togglePause(); }, options);
    document.getElementById('reset')!.addEventListener('click', () => this.restart(), options);
    document.getElementById('restart-bottom')!.addEventListener('click', () => this.restart(), options);
    this.soundButton.addEventListener('click', () => this.toggleMute(), options);
    window.addEventListener('blur', () => { if (!this.paused) this.togglePause(); }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden && !this.paused) this.togglePause(); }, options);
    document.getElementById('hud')!.classList.remove('hidden');
    document.getElementById('drive-ui')!.classList.remove('hidden');
    document.getElementById('pause-panel')!.classList.add('hidden');
    updateCarY(this.scale.height);
    this.hud.update(this.player.physics, 0);
    this.events.once('shutdown', () => { this.abort.abort(); this.inputControls.destroy(); this.audio.destroy(); });
  }
  private toggleMute(): void {
    this.audio.unlock(); this.audio.setMuted(!this.audio.muted);
    this.registry.set('muted', this.audio.muted);
    this.soundButton.innerHTML = this.audio.muted ? '声音 OFF <span>♪</span>' : '声音 ON <span>♪</span>';
    this.soundButton.setAttribute('aria-pressed', String(this.audio.muted));
  }
  private restart(): void { this.scene.restart(); (document.activeElement as HTMLElement)?.blur(); }
  private togglePause(): void {
    this.paused = !this.paused; this.accumulator = 0;
    this.inputControls.clear(); this.audio.setPaused(this.paused);
    document.getElementById('pause-panel')!.classList.toggle('hidden', !this.paused);
    document.getElementById('drive-ui')!.classList.toggle('hidden', this.paused);
    document.getElementById('pause')!.setAttribute('aria-label', this.paused ? '继续游戏' : '暂停游戏');
    updateCarY(this.scale.height);
    (document.activeElement as HTMLElement)?.blur();
  }
  private fixedUpdate(): void {
    const p = this.player.physics;
    p.step(this.inputControls.sample(), FIXED_DT);
    this.elapsed += FIXED_DT;
    this.track.step(Math.max(0, -p.vy) * FIXED_DT);
    this.particles.update(FIXED_DT, Math.max(0, -p.vy) * 0.55, this.scale.height);
    this.kick *= 0.84;
    if (p.released > 0 || p.didBoost) {
      this.kick = p.didBoost ? 9 : 4 + p.released * 2;
      if (!this.reducedMotion) this.shake.trigger(p.released === 3 ? 3 : 2, 0.08, true);
      this.audio.impact(true);
      this.hud.showNotice(p.didBoost ? '氮气推进 · 2 秒全速' : `${['', '蓝焰', '橙焰', '紫焰'][p.released]}释放 · +${[0, 15, 25, 40][p.released]}% 推力`, 1.1);
    }
    if (p.hitWall !== 0) {
      if (!this.reducedMotion) this.shake.trigger(4, 0.1);
      this.audio.impact(); this.hud.showNotice('擦到护栏了 · 反打方向试试');
      const x = p.hitWall < 0 ? ROAD_LEFT : ROAD_RIGHT;
      for (let i = 0; i < 18; i++) this.particles.emit(x, this.player.baseY + (Math.random() - 0.5) * 30, C.gold, -p.hitWall * (40 + Math.random() * 150), (Math.random() - 0.5) * 200, 0.3, 3 + Math.random() * 3);
    }
    if (p.drifting) {
      const cos = Math.cos(p.heading), sin = Math.sin(p.heading);
      for (let side = -1; side <= 1; side += 2) {
        const x = p.x + side * 22 * cos - 24 * sin;
        const y = this.player.baseY + 24 * cos + side * 22 * sin;
        this.particles.emit(x, y, 0xd9ddd0, -p.vx * 0.15 + (Math.random() - 0.5) * 35, 20, 0.5, 7 + Math.random() * 5, true);
        if (p.tier > 0) this.particles.emit(x, y, TIER_COLORS[p.tier], (Math.random() - 0.5) * 130, 40 + Math.random() * 95, 0.2, 2 + Math.random() * 3);
      }
    }
    if (p.nitroTime > 0 || p.pulseTime > 0) {
      for (let i = 0; i < 3; i++) this.particles.emit(p.x - Math.sin(p.heading) * 31 + (Math.random() - 0.5) * 17, this.player.baseY + Math.cos(p.heading) * 32, i === 0 ? C.blue : C.orange, -p.vx * 0.2, 100 + Math.random() * 120, 0.3, 5 + Math.random() * 8);
    }
    this.audio.update(p.speed, p.lateralSpeed, p.drifting);
    this.hudTick += FIXED_DT;
    if (this.hudTick >= 0.08) { this.hud.update(p, this.hudTick); this.hudTick = 0; }
  }
  update(_time: number, delta: number): void {
    this.player.baseY = getCarY();
    if (this.paused) return;
    // Bound catch-up work after stalls: never spiral or charge a background drift.
    this.accumulator += Math.min(delta / 1000, 0.1);
    while (this.accumulator >= FIXED_DT) { this.fixedUpdate(); this.accumulator -= FIXED_DT; }
    const alpha = this.accumulator / FIXED_DT;
    this.track.draw(alpha); this.player.render(alpha, this.reducedMotion ? 0 : this.kick);
    this.shake.update(this.cameras.main, delta / 1000);
    const zoomTarget = !this.reducedMotion && this.player.physics.nitroTime > 0 ? 0.97 : 1;
    this.cameras.main.zoom += (zoomTarget - this.cameras.main.zoom) * 0.06;
    this.drawEffects();
  }
  private drawEffects(): void {
    const p = this.player.physics;
    this.lines.clear(); this.skid.clear();
    if (p.drifting) {
      this.skid.lineStyle(3, 0x2d3934, 0.25);
      for (let side = -1; side <= 1; side += 2) {
        const x = p.x + side * 20;
        this.skid.lineBetween(x, this.player.baseY + 20, x - p.lateralSpeed * 0.12, this.player.baseY + 70);
      }
    }
    if (this.reducedMotion) return;
    const strength = clamp((p.speed / BASE_SPEED - 0.7) / 0.8, 0, 1);
    this.lines.lineStyle(1.4, C.panel, strength * 0.48);
    for (let i = 0; i < 24; i++) {
      const right = i % 2 === 0;
      const x = right ? WIDTH - 14 - (i % 5) * 5 : 14 + (i % 5) * 5;
      const y = (i * 83 + this.elapsed * p.speed * 1.6) % this.scale.height;
      const length = 16 + strength * 85;
      this.lines.lineBetween(x, y, x + (right ? -5 : 5), y - length);
    }
  }
}
