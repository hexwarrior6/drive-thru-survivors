import Phaser from 'phaser';
import { CombatSystem } from '../combat/CombatSystem';
import { StressMeter } from '../combat/StressMeter';
import { CombatView } from '../combat/CombatView';
import { WaveSystem } from '../systems/WaveSystem';
import { BASE_SPEED, FIXED_DT, ROAD_LEFT, ROAD_RIGHT, WIDTH } from '../config';
import { C, TIER_COLORS } from '../data/colors';
import { Player } from '../entities/Player';
import { ParticleManager } from '../effects/ParticleManager';
import { AudioSynth } from '../effects/AudioSynth';
import { ScreenShake } from '../effects/ScreenShake';
import { TrackGenerator } from '../systems/TrackGenerator';
import { MobileControls } from '../ui/MobileControls';
import { updateSoundButton } from '../ui/UtilityControls';
import { HUD } from '../ui/HUD';
import { getCarY, updateCarY } from '../ui/RaceLayout';
import { clamp } from '../utils/math';

export class GameScene extends Phaser.Scene {
  player!: Player;
  audio!: AudioSynth;
  particles!: ParticleManager;
  paused = false;
  combat!: CombatSystem;
  wave!: WaveSystem;
  combatView!: CombatView;
  private pitPanel = document.getElementById('pit-panel')!;
  private disabledPanel = document.getElementById('disabled-panel')!;
  private stressFramesShown = 0;
  private stressSpawned = 0;
  private stressMeter = new StressMeter();
  private stressReadout = document.getElementById('stress-readout')!;
  private stress = import.meta.env.DEV && new URLSearchParams(location.search).has('stress');
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
  get routeCurvature(): number { return this.track?.route.curvatureAt(this.player?.physics.progress ?? 0) ?? 0; }
  constructor() { super('Game'); }
  create(): void {
    this.accumulator = this.elapsed = this.hudTick = this.kick = 0;
    this.paused = false;
    this.stressMeter = new StressMeter(); this.stressSpawned = this.stressFramesShown = 0;
    this.stressReadout.textContent = 'STRESS · 预热中';
    document.getElementById('pause')!.setAttribute('aria-label', '暂停游戏');
    document.getElementById('pause')!.setAttribute('aria-pressed', 'false');
    document.querySelector('.hud-actions')!.append(this.soundButton);
    this.stressReadout.classList.toggle('hidden', !this.stress);
    document.body.classList.add('is-driving');
    this.shake = new ScreenShake();
    this.cameras.main.setScroll(0, 0).setZoom(1);
    this.track = new TrackGenerator(this);
    this.skid = this.add.graphics().setDepth(2);
    this.lines = this.add.graphics().setDepth(6);
    this.particles = new ParticleManager(this, this.track.projection);
    this.player = new Player(this);
    this.combat = new CombatSystem(this.particles);
    this.wave = new WaveSystem();
    this.combatView = new CombatView(this, this.combat, this.track.projection);
    this.pitPanel.classList.add('hidden'); this.disabledPanel.classList.add('hidden');
    this.audio = new AudioSynth();
    this.audio.setMuted(this.registry.get('muted') === true);
    this.audio.unlock();
    this.hud = new HUD();
    this.inputControls = new MobileControls(() => this.audio.unlock(), () => this.togglePause(), () => this.restart(), () => this.toggleMute());
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    document.getElementById('pause')!.addEventListener('click', () => this.togglePause(), options);
    document.getElementById('resume')!.addEventListener('click', () => { this.audio.unlock(); this.togglePause(); }, options);
    document.getElementById('next-wave')!.addEventListener('click', () => {
      this.wave.next(this.combat); this.pitPanel.classList.add('hidden');
      this.inputControls.clear(); this.audio.setPaused(false);
      this.player.physics.nitro = Math.min(100, this.player.physics.nitro + 20);
      (document.activeElement as HTMLElement)?.blur();
    }, options);
    document.getElementById('retry')!.addEventListener('click', () => this.restart(), options);
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
    this.hud.updateCombat(this.combat, this.wave);
    this.events.once('shutdown', () => { this.abort.abort(); this.inputControls.destroy(); this.audio.destroy(); });
  }
  private toggleMute(): void {
    this.audio.unlock(); this.audio.setMuted(!this.audio.muted);
    this.registry.set('muted', this.audio.muted);
    updateSoundButton(this.soundButton, this.audio.muted);
  }
  private restart(): void { this.scene.restart(); (document.activeElement as HTMLElement)?.blur(); }
  private togglePause(): void {
    if (this.wave.state === 'pit' || this.wave.state === 'disabled') return;
    this.paused = !this.paused; this.accumulator = 0;
    this.inputControls.clear(); this.audio.setPaused(this.paused);
    document.getElementById('pause-panel')!.classList.toggle('hidden', !this.paused);
    document.getElementById('drive-ui')!.classList.toggle('hidden', this.paused);
    document.getElementById('pause')!.setAttribute('aria-label', this.paused ? '继续游戏' : '暂停游戏');
    document.getElementById('pause')!.setAttribute('aria-pressed', String(this.paused));
    updateCarY(this.scale.height);
    (document.activeElement as HTMLElement)?.blur();
  }
  private fixedUpdate(): void {
    const p = this.player.physics;
    if (this.wave.state === 'combat') {
      p.step(this.inputControls.sample(), FIXED_DT, this.track.route.curvatureAt(p.progress));
      this.combat.step(p, FIXED_DT);
      if (this.combat.impact && !this.reducedMotion) this.shake.trigger(3, 0.1);
      if (this.stress) { this.combat.health = 100; this.fillStress(); }
      if (this.combat.health <= 0) {
        this.wave.state = 'disabled'; this.disabledPanel.classList.remove('hidden');
        this.audio.setPaused(true); this.hud.updateCombat(this.combat, this.wave); return;
      }
    }
    const before = this.wave.state;
    if (!this.stress) this.wave.step(p, this.combat, FIXED_DT);
    if (before !== this.wave.state) {
      if (this.wave.state === 'entering') this.hud.showNotice('波次完成 · 正在驶入得来速', 3);
      if (this.wave.state === 'pit') { this.pitPanel.classList.remove('hidden'); this.inputControls.clear(); this.audio.setPaused(true); }
      this.hud.updateCombat(this.combat, this.wave);
    }
    this.elapsed += FIXED_DT;
    this.track.setProgress(p.previousProgress, p.progress);
    this.particles.update(FIXED_DT);
    this.kick *= 0.84;
    if (p.released > 0 || p.didBoost) {
      this.kick = p.didBoost ? 9 : 4 + p.released * 2;
      if (!this.reducedMotion) this.shake.trigger(p.released === 3 ? 3 : 2, 0.08, true);
      this.audio.impact(true);
      this.hud.showNotice(p.didBoost ? '氮气推进 · 2 秒全速' : RELEASE_NOTICES[p.released], 1.1);
    }
    if (p.hitWall !== 0) {
      if (!this.reducedMotion) this.shake.trigger(4, 0.1);
      this.audio.impact(); this.hud.showNotice('擦到护栏了 · 反打方向试试');
      const x = p.hitWall < 0 ? ROAD_LEFT : ROAD_RIGHT;
      for (let i = 0; i < 18; i++) this.particles.emit(x - 225, p.progress + (Math.random() - 0.5) * 30, C.gold, -p.hitWall * (40 + Math.random() * 150), (Math.random() - 0.5) * 200, 0.3, 3 + Math.random() * 3);
    }
    if (p.drifting) {
      const cos = Math.cos(p.heading), sin = Math.sin(p.heading);
      for (let side = -1; side <= 1; side += 2) {
        const x = p.x - 225 + side * 22 * cos - 24 * sin;
        const y = p.progress - 24 * cos - side * 22 * sin;
        this.particles.emit(x, y, 0xd9ddd0, -p.vx * 0.15 + (Math.random() - 0.5) * 35, 20, 0.5, 7 + Math.random() * 5, true);
        if (p.tier > 0) this.particles.emit(x, y, TIER_COLORS[p.tier], (Math.random() - 0.5) * 130, -40 - Math.random() * 95, 0.2, 2 + Math.random() * 3);
      }
    }
    if (p.nitroTime > 0 || p.pulseTime > 0) {
      for (let i = 0; i < 3; i++) this.particles.emit(p.x - 225 - Math.sin(p.heading) * 31 + (Math.random() - 0.5) * 17, p.progress - Math.cos(p.heading) * 32, i === 0 ? C.blue : C.orange, -p.vx * 0.2, -100 - Math.random() * 120, 0.3, 5 + Math.random() * 8);
    }
    this.audio.update(p.speed, p.lateralSpeed, p.drifting);
    this.hudTick += FIXED_DT;
    if (this.hudTick >= 0.08) { this.hud.update(p, this.hudTick, this.track.route.sectionAt(p.progress).name, this.track.route.sectionAt(p.progress + 450).turn); this.hud.updateCombat(this.combat, this.wave); this.hudTick = 0; }
  }
  update(_time: number, delta: number): void {
    this.player.baseY = getCarY();
    if (this.paused || this.wave.state === 'pit' || this.wave.state === 'disabled') return;
    // Bound catch-up work after stalls: never spiral or charge a background drift.
    this.accumulator += Math.min(delta / 1000, 0.1);
    while (this.accumulator >= FIXED_DT) { this.fixedUpdate(); this.accumulator -= FIXED_DT; }
    const alpha = this.accumulator / FIXED_DT;
    this.track.draw(alpha, this.player.baseY);
    this.player.render(alpha, this.reducedMotion ? 0 : this.kick, this.track.projection);
    this.combatView.draw(alpha);
    this.combatView.drawTurret(this.player.physics, alpha, this.reducedMotion ? 0 : this.kick);
    this.combatView.drawPit(this.player.physics.progress, this.wave.remaining <= 3 || this.wave.state === 'entering', this.elapsed);
    this.particles.draw();
    this.player.sprite.setAlpha(this.combat.impact ? 0.55 : 1);
    this.shake.update(this.cameras.main, delta / 1000);
    const zoomTarget = !this.reducedMotion && this.player.physics.nitroTime > 0 ? 0.97 : 1;
    this.cameras.main.zoom += (zoomTarget - this.cameras.main.zoom) * 0.06;
    this.drawEffects();
    if (this.stress) {
      const m = this.stressMeter;
      m.record(this.game.loop.rawDelta, this.combatView.visibleEnemies, this.combatView.visibleBullets, this.particles.visibleCount);
      if (m.frames > this.stressFramesShown && m.frames % 30 === 0) {
        this.stressFramesShown = m.frames;
        this.stressReadout.textContent = `STRESS ${m.frames}/600 · ${m.fps.toFixed(2)} FPS · P95 <${m.p95}ms · >25ms ${m.slow} · 可见 ${m.minEnemies}/${m.minBullets}/${m.minParticles}`;
      }
    }
  }
  /** Development-only reproducible density workload; no runtime pool growth. */
  private fillStress(): void {
    const p = this.player.physics;
    for (let i = 0; i < this.combat.enemies.capacity; i++) {
      const e = this.combat.enemies.items[i];
      if (e.active && (e.z < p.progress + 60 || e.z > p.progress + 510)) this.combat.enemies.release(e);
    }
    while (this.combat.enemies.activeCount < 48) {
      const i = this.stressSpawned++ % 48;
      this.combat.spawn(i % 3, (i % 6 - 2.5) * 44, p.progress + 90 + Math.floor(i / 6) * 60);
    }
    for (let i = 0; i < this.combat.bullets.capacity; i++) {
      const b = this.combat.bullets.items[i];
      if (b.active && b.z > p.progress + 540) this.combat.bullets.release(b);
    }
    while (this.combat.bullets.activeCount < 96) {
      const b = this.combat.bullets.acquire(); if (!b) break;
      b.x = b.px = (b.slot % 8 - 3.5) * 34; b.z = b.pz = p.progress + 80 + (b.slot % 12) * 33;
      b.vx = 0; b.vz = 850 + p.speed * 0.3; b.life = 0.8; b.damage = 12;
    }
    for (let i = 0; i < 8; i++) this.particles.emit((Math.random() - 0.5) * 280, p.progress + Math.random() * 600, C.gold, 40, -30, 0.6, 5);
  }
  private drawEffects(): void {
    const p = this.player.physics;
    this.lines.clear(); this.skid.clear();
    if (p.drifting) {
      this.skid.lineStyle(3, 0x2d3934, 0.25);
      for (let side = -1; side <= 1; side += 2) {
        const projection = this.track.projection;
        projection.project(p.progress - 24, p.x - 225 + side * 20);
        const x = projection.x, y = projection.y;
        projection.project(p.progress - 80, p.x - 225 + side * 20 - p.lateralSpeed * 0.12);
        this.skid.lineBetween(x, y, projection.x, projection.y);
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

const RELEASE_NOTICES = ['', '蓝焰释放 · +15% 推力', '橙焰释放 · +25% 推力', '紫焰释放 · +40% 推力'];
