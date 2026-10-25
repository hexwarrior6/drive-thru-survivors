import Phaser from 'phaser';
import { ShopSystem } from '../systems/ShopSystem';
import { ShopView } from '../ui/ShopView';
import { SauceView } from '../ui/SauceView';
import { sauceByKey } from '../combat/sauces';
import { WeaponSystem } from '../combat/WeaponSystem';
import { WeaponView } from '../combat/WeaponView';
import { demoSnapshot } from '../data/snapshot';
import { CombatSystem } from '../combat/CombatSystem';
import { StressMeter } from '../combat/StressMeter';
import { CombatView } from '../combat/CombatView';
import { PitStopView } from '../systems/PitStopView';
import { WaveSystem } from '../systems/WaveSystem';
import { PIT_CAMERA_SIDE, PIT_PLAYER_X } from '../systems/PitStopLayout';
import { BASE_SPEED, FIXED_DT, ROAD_LEFT, ROAD_RIGHT, WIDTH } from '../config';
import { C, TIER_COLORS, TIER_SMOKE } from '../data/colors';
import { resolveTrackPlan } from '../data/cityProfiles';
import { carById, type CarId } from '../data/cars';
import { themeFor } from '../systems/Theme';
import { bossBurstCount, bossReward, bossTierOf, enemyHpScale, SAUCE_REWARD_WAVES } from '../systems/balance';
import { resolveArt } from '../combat/foodIdentity';
import { clearRun, saveRun, type RunSave } from '../systems/SaveSystem';
import { Player } from '../entities/Player';
import { ParticleManager } from '../effects/ParticleManager';
import { SkidMarks } from '../effects/SkidMarks';
import { AudioSynth } from '../effects/AudioSynth';
import { ScreenShake } from '../effects/ScreenShake';
import { TrackGenerator } from '../systems/TrackGenerator';
import { MobileControls } from '../ui/MobileControls';
import { updateSoundButton } from '../ui/UtilityControls';
import { HUD } from '../ui/HUD';
import { getCarY, updateCarY } from '../ui/RaceLayout';
import { clamp } from '../utils/math';

export class GameScene extends Phaser.Scene {
  shop!: ShopSystem;
  weapons!: WeaponSystem;
  private shopView!: ShopView;
  private sauceView!: SauceView;
  /** Boss waves whose sauce reward was already picked or skipped. */
  private sauceClaimedWaves: number[] = [];
  private weaponView!: WeaponView;
  player!: Player;
  audio!: AudioSynth;
  particles!: ParticleManager;
  paused = false;
  combat!: CombatSystem;
  wave!: WaveSystem;
  combatView!: CombatView;
  private pitView!: PitStopView;
  private pitPanel = document.getElementById('pit-panel')!;
  private stressFramesShown = 0;
  private stressSpawned = 0;
  private stressMeter = new StressMeter();
  private stressReadout = document.getElementById('stress-readout')!;
  private stress = import.meta.env.DEV && new URLSearchParams(location.search).has('stress');
  private fast = import.meta.env.DEV && new URLSearchParams(location.search).has('fast');
  private track!: TrackGenerator;
  private inputControls!: MobileControls;
  private hud!: HUD;
  private lines!: Phaser.GameObjects.Graphics;
  private skid!: Phaser.GameObjects.Graphics;
  private skidMarks!: SkidMarks;
  private shake = new ScreenShake();
  private accumulator = 0;
  private elapsed = 0;
  private hudTick = 0;
  private kick = 0;
  private slowmo = 0;
  private flashAlpha = 0;
  private flashRect!: Phaser.GameObjects.Rectangle;
  private countdownText!: Phaser.GameObjects.Text;
  private countdownShown = -1;
  private bossCelebrated = false;
  private victoryTime = 0;
  private disabledTime = 0;
  private finished = false;
  private carId: CarId = 'flash';
  private theme = themeFor('');
  private abort!: AbortController;
  /** 本局独立种子：酱料候选与门店洗牌外的规则随机都从它派生（§7.1）。 */
  private runSeed = 0;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private soundButton = document.getElementById('sound')!;
  get routeCurvature(): number { return this.track?.route.curvatureAt(this.player?.physics.progress ?? 0) ?? 0; }
  constructor() { super('Game'); }
  create(): void {
    this.accumulator = this.elapsed = this.hudTick = this.kick = 0;
    this.slowmo = this.flashAlpha = this.victoryTime = this.disabledTime = 0;
    this.countdownShown = -1; this.bossCelebrated = this.finished = false;
    this.paused = false;
    this.stressMeter = new StressMeter(); this.stressSpawned = this.stressFramesShown = 0;
    this.sauceClaimedWaves = [];
    this.runSeed = (Math.random() * 0x7fffffff) | 0;
    this.stressReadout.textContent = 'STRESS · 预热中';
    document.getElementById('pause')!.setAttribute('aria-label', '暂停游戏');
    document.getElementById('pause')!.setAttribute('aria-pressed', 'false');
    document.querySelector('#pause .control-label')!.textContent = '暂停';
    document.querySelector('.hud-actions')!.append(this.soundButton);
    this.stressReadout.classList.toggle('hidden', !this.stress);
    document.body.classList.add('is-driving');
    document.body.classList.remove('low-health', 'is-pit');
    this.shake = new ScreenShake();
    this.cameras.main.setScroll(0, 0).setZoom(1);
    const carDef = carById(this.registry.get('car'));
    this.carId = carDef.id;
    const snapshot = this.registry.get('snapshot') ?? demoSnapshot();
    this.track = new TrackGenerator(this, resolveTrackPlan(snapshot.city));
    this.skid = this.add.graphics().setDepth(2);
    this.lines = this.add.graphics().setDepth(6);
    this.skidMarks = new SkidMarks(this.track.projection);
    this.particles = new ParticleManager(this, this.track.projection);
    this.player = new Player(this, carDef.id);
    this.combat = new CombatSystem(this.particles);
    this.wave = new WaveSystem();
    this.shop = new ShopSystem(snapshot);
    this.weapons = new WeaponSystem(this.shop.slots, this.combat);
    this.weaponView = new WeaponView(this, this.weapons, this.track.projection);
    this.shopView = new ShopView(this.shop, this.combat, this.registry.get('snapshotReason') ?? '本地示例', () => this.hud.updateCombat(this.combat, this.wave));
    this.sauceView = new SauceView(this.combat, () => this.hud.updateCombat(this.combat, this.wave));
    this.pitView = new PitStopView(this, this.track.projection);
    this.theme = themeFor(snapshot.campaign);
    // Kart passives and campaign theme apply for the whole run.
    const p = this.player.physics;
    p.carSpeedBonus = carDef.speedBonus; p.carNitroRegen = carDef.nitroRegen;
    this.combat.ramSlow = carDef.ramSlow;
    this.combat.baseMagnetRange = carDef.magnetRange;
    this.combat.coinMultiplier = (1 + carDef.coinBonus) * (1 + this.theme.coinBonus);
    const resume = this.registry.get('resumeData') as RunSave | undefined;
    this.registry.set('resumeData', undefined);
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'pit') {
      this.wave.remaining = 2.8;
      p.progress = p.previousProgress = this.track.route.length - 700;
      p.speed = BASE_SPEED; p.vy = -BASE_SPEED;
    }
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'boss') {
      this.wave.number = 5; this.wave.fast = this.fast;
      p.progress = p.previousProgress = this.track.route.length * 0.5;
    }
    this.combatView = new CombatView(this, this.combat, this.track.projection, this.theme);
    this.audio = new AudioSynth();
    this.audio.setMuted(this.registry.get('muted') === true);
    this.audio.unlock();
    this.hud = new HUD();
    this.hud.setCampaign(this.theme, snapshot.campaign);
    this.countdownText = this.add.text(WIDTH / 2, this.scale.height * 0.32, '3', {
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '72px', fontStyle: 'bold',
      color: '#e75239', stroke: '#754329', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(95).setVisible(false);
    this.flashRect = this.add.rectangle(WIDTH / 2, this.scale.height / 2, WIDTH + 60, this.scale.height + 60, 0xffffff)
      .setDepth(99).setAlpha(0).setVisible(false);
    this.inputControls = new MobileControls(() => this.audio.unlock(), () => this.togglePause(), () => this.abandon(), () => this.toggleMute());
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    document.getElementById('pause')!.addEventListener('click', () => this.togglePause(), options);
    document.getElementById('resume')!.addEventListener('click', () => { this.audio.unlock(); this.togglePause(); }, options);
    document.getElementById('next-wave')!.addEventListener('click', () => {
      if (this.wave.state !== 'pit') return;
      this.weapons.clear();
      this.updateDestination(this.wave.number + 1);
      this.wave.next(this.combat, this.player.physics);
      // 开出下一轮：赛道整体换上本轮天气（进站时切换，不在战斗中突变）。
      this.track.applyRound(this.wave.round);
      this.pitPanel.classList.add('hidden');
      document.body.classList.remove('is-pit');
      document.getElementById('drive-ui')!.classList.remove('hidden');
      this.inputControls.clear(); this.audio.setPaused(false);
      this.player.physics.nitro = Math.min(100, this.player.physics.nitro + 20);
      this.persistRun(false);
      (document.activeElement as HTMLElement)?.blur();
    }, options);
    this.soundButton.addEventListener('click', () => this.toggleMute(), options);
    document.getElementById('reset')!.addEventListener('click', () => this.abandon(), options);
    document.getElementById('restart-bottom')!.addEventListener('click', () => this.abandon(), options);
    window.addEventListener('blur', () => { if (!this.paused && this.wave.state !== 'pit' && this.wave.state !== 'disabled') this.togglePause(); }, options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.paused && this.wave.state !== 'pit' && this.wave.state !== 'disabled') this.togglePause();
    }, options);
    window.addEventListener('beforeunload', () => { if (!this.finished) this.persistRun(this.wave.state === 'pit'); }, options);
    document.getElementById('hud')!.classList.remove('hidden');
    document.getElementById('drive-ui')!.classList.remove('hidden');
    document.getElementById('pause-panel')!.classList.add('hidden');
    document.getElementById('sauce-reward')!.classList.add('hidden');
    this.pitPanel.classList.add('hidden');
    this.pitPanel.classList.remove('rewarding');
    updateCarY(this.scale.height);
    if (resume) this.restore(resume);
    else {
      this.wave.fast = this.fast;
      this.wave.beginCountdown(this.fast ? 1.2 : 3.2);
    }
    this.track.applyRound(this.wave.round);
    this.hud.update(p, 0);
    this.hud.updateCombat(this.combat, this.wave);
    this.updateDestination();
    this.events.once('shutdown', () => { this.abort.abort(); this.inputControls.destroy(); this.audio.destroy(); document.body.classList.remove('low-health'); });
  }
  /** Rebuild a saved run: same snapshot, route order, slots and wallet. */
  private restore(run: RunSave): void {
    this.carId = run.car;
    const carDef = carById(run.car);
    this.player.physics.carSpeedBonus = carDef.speedBonus;
    this.player.physics.carNitroRegen = carDef.nitroRegen;
    this.shop.restore(run.route, run.bagIds);
    for (let i = 0; i < 5; i++) this.shop.slots[i] = run.slots[i]
      ? { ...run.slots[i]!, cooldown: 0, art: resolveArt(run.slots[i]!.weaponId, run.slots[i]!.name) }
      : null;
    this.combat.health = run.health; this.combat.money = run.money;
    this.combat.kills = run.kills; this.combat.maxCombo = run.maxCombo;
    // Sauces and claimed boss rewards ride along; unknown keys from older saves drop out.
    for (const key of run.sauces ?? []) { const def = sauceByKey(key); if (def) this.combat.equipSauce(def.key); }
    this.sauceClaimedWaves = [...(run.sauceWaves ?? [])];
    this.player.physics.distance = run.distance;
    this.player.physics.nitro = run.nitro;
    this.wave.number = run.wave; this.wave.duration = run.duration;
    this.wave.fast = this.fast;
    this.combat.wave = run.wave;
    this.combat.hpScale = enemyHpScale(run.wave);
    this.runSeed = run.runSeed ?? (Math.random() * 0x7fffffff) | 0;
    if (run.atPit) {
      this.wave.state = 'pit';
      this.wave.pitProgress = this.player.physics.progress;
      this.wave.cameraSide = PIT_CAMERA_SIDE;
      this.player.physics.x = this.player.physics.previousX = PIT_PLAYER_X;
      this.openPit();
    } else {
      this.wave.state = 'combat';
      this.wave.remaining = run.duration;
    }
    this.player.physics.progress = this.player.physics.previousProgress = 0;
    this.player.physics.x = this.player.physics.previousX = 225;
  }
  private updateDestination(wave = this.wave.number): void {
    const stop = document.getElementById('next-stop')!;
    const name = this.shop.destination(wave).name;
    stop.textContent = `下一站 · ${name.replace(/得来速餐厅$/, '')}`;
    stop.title = name;
  }
  /** Open the pit panel; a boss-wave stop claims its sauce reward before the shop. */
  private openPit(): void {
    this.shopView.open(this.wave.number);
    this.pitPanel.classList.remove('hidden');
    document.body.classList.add('is-pit');
    document.getElementById('drive-ui')!.classList.add('hidden');
    this.inputControls.clear();
    this.audio.setPaused(true);
    this.sauceView.renderTray();
    // 调味奖励（§7.1）：第 2 波结束首抽，5/10/15 波 Boss 后各一次；最多 4 包。
    const rewardDue = (SAUCE_REWARD_WAVES as readonly number[]).includes(this.wave.number)
      && !this.sauceClaimedWaves.includes(this.wave.number)
      && this.combat.ownedSauces().length < 4;
    if (rewardDue) {
      this.sauceView.showReward(this.wave.number, this.runSeed, this.weapons.wallCapable(), () => {
        this.sauceClaimedWaves.push(this.wave.number);
        this.persistRun(true);
      });
    }
  }
  /** Persist the run at safe cut points: wave starts, pit stops and page exits. */
  private persistRun(atPit: boolean): void {
    if (this.finished || this.wave.state === 'disabled') { clearRun(); return; }
    const run: RunSave = {
      v: 6, runSeed: this.runSeed, car: this.carId, city: this.shop.snapshot.city,
      wave: this.wave.number, duration: this.wave.duration,
      atPit: atPit && this.wave.state === 'pit',
      health: this.combat.health, money: this.combat.money, kills: this.combat.kills,
      maxCombo: this.combat.maxCombo, distance: this.player.physics.distance,
      nitro: Math.max(atPit ? 100 : 40, this.player.physics.nitro),
      slots: this.shop.slots.map(w => w ? { weaponId: w.weaponId, name: w.name, level: w.level, branch: w.branch, invested: w.invested } : null),
      sauces: this.combat.ownedSauces(), sauceWaves: [...this.sauceClaimedWaves],
      route: this.shop.route, bagIds: this.shop.bag.map(s => s.id),
      snapshot: this.shop.snapshot, savedAt: new Date().toISOString(),
    };
    saveRun(run);
  }
  private toggleMute(): void {
    this.audio.unlock(); this.audio.setMuted(!this.audio.muted);
    this.registry.set('muted', this.audio.muted);
    updateSoundButton(this.soundButton, this.audio.muted);
  }
  private abandon(): void {
    clearRun(); this.finished = true;
    (document.activeElement as HTMLElement)?.blur();
    this.scene.start('Select');
  }
  private togglePause(): void {
    if (this.wave.state === 'pit' || this.wave.state === 'disabled' || this.wave.state === 'victory') return;
    this.paused = !this.paused; this.accumulator = 0;
    this.inputControls.clear(); this.audio.setPaused(this.paused);
    document.getElementById('pause-panel')!.classList.toggle('hidden', !this.paused);
    document.getElementById('drive-ui')!.classList.toggle('hidden', this.paused);
    document.getElementById('pause')!.setAttribute('aria-label', this.paused ? '继续游戏' : '暂停游戏');
    document.getElementById('pause')!.setAttribute('aria-pressed', String(this.paused));
    document.querySelector('#pause .control-label')!.textContent = this.paused ? '继续' : '暂停';
    updateCarY(this.scale.height);
    (document.activeElement as HTMLElement)?.blur();
  }
  /** Hand the finished run to the settlement screen. */
  private finishRun(victory: boolean): void {
    if (this.finished) return;
    this.finished = true;
    clearRun();
    this.registry.set('runSummary', {
      victory, car: this.carId, wave: this.wave.number,
      distance: this.player.physics.distance, kills: this.combat.kills,
      maxCombo: this.combat.maxCombo, money: this.combat.money,
      slots: this.shop.slots.map(w => w ? { weaponId: w.weaponId, name: w.name, level: w.level, branch: w.branch, invested: w.invested } : null),
      campaign: this.shop.snapshot.campaign, theme: this.theme.name,
    });
    this.scene.start('Result');
  }
  /** Boss fall: bullet time, white flash and a fountain of coins scaled by the round. */
  private celebrateBoss(): void {
    this.bossCelebrated = true;
    const tier = bossTierOf(this.wave.number);
    this.slowmo = 0.55;
    this.flashAlpha = 0.9;
    this.flashRect.setVisible(true);
    if (!this.reducedMotion) this.shake.trigger(8, 0.5);
    this.audio.victoryJingle();
    this.audio.impact(true);
    this.combat.burstCoins(this.combat.bossX, this.combat.bossZ, bossBurstCount(tier), bossReward(tier));
    this.wave.bossDown(2.4);
    this.hud.showNotice(this.wave.isFinalWave ? `${this.wave.bossTierName}击破 · 路线完成！` : `${this.wave.bossTierName}击破 · 进站补给`, 2.2);
  }
  private fixedUpdate(): void {
    const p = this.player.physics;
    if (this.wave.state === 'countdown') {
      this.weapons.configure(p);
      p.step(this.inputControls.sample(), FIXED_DT, this.track.route.curvatureAt(p.progress));
    }
    if (this.wave.state === 'combat' || this.wave.state === 'bossdown' || this.wave.state === 'victory') {
      this.weapons.configure(p);
      p.step(this.inputControls.sample(), FIXED_DT, this.track.route.curvatureAt(p.progress));
      this.combat.step(p, FIXED_DT);
      this.weapons.step(p, FIXED_DT);
      if (this.wave.state !== 'combat') {
        // Victory lap: bullets and coins keep flying, but nothing can kill the run anymore.
        this.combat.health = Math.max(this.combat.health, 60);
      }
      if (this.combat.impact && !this.reducedMotion) this.shake.trigger(3, 0.1);
      if (this.stress) { this.combat.health = 100; this.fillStress(); }
      if (this.combat.bossDefeated && !this.bossCelebrated) this.celebrateBoss();
      if (this.wave.state === 'combat' && this.combat.health <= 0) {
        this.wave.state = 'disabled'; this.disabledTime = 0;
        this.audio.setAlarm(false); document.body.classList.remove('low-health');
        this.hud.updateCombat(this.combat, this.wave); return;
      }
    }
    if (this.wave.state === 'disabled') {
      // The engine gives out: coast to a stop in a puff of smoke, then settle.
      this.disabledTime += FIXED_DT;
      p.vx *= Math.pow(0.2, FIXED_DT); p.vy *= Math.pow(0.3, FIXED_DT);
      p.x = clamp(p.x + p.vx * FIXED_DT, ROAD_LEFT + 30, ROAD_RIGHT - 30);
      p.progress += Math.max(0, -p.vy) * FIXED_DT;
      p.speed = Math.hypot(p.vx, p.vy);
      p.previousX = p.x; p.previousProgress = p.progress;
      if (Math.random() < 0.45) this.particles.emit(p.x - 225, p.progress, 0x9aa39a, (Math.random() - 0.5) * 40, 30 + Math.random() * 40, 0.7, 8 + Math.random() * 6, true);
      this.audio.update(p.speed, 0, false);
      this.track.setProgress(p.previousProgress, p.progress);
      this.particles.update(FIXED_DT);
      if (this.disabledTime > 1.7) this.finishRun(false);
      return;
    }
    const before = this.wave.state;
    if (this.wave.state === 'entering' || this.wave.state === 'exiting' || this.wave.state === 'pit') {
      // Guided pit driving keeps the world alive: riders break off, road hazards stay
      // on the tarmac and loose coins still find their way to the car.
      this.combat.step(p, FIXED_DT);
    }
    if (!this.stress) this.wave.step(p, this.combat, FIXED_DT);
    if (before !== this.wave.state) {
      this.hud.update(p, 0);
      if (this.wave.state === 'entering') { this.weapons.clear(); this.persistRun(true); }
      if (before === 'countdown' && this.wave.state === 'combat') this.persistRun(false);
      if (before === 'exiting' && this.wave.state === 'combat') this.bossCelebrated = false;
      if (this.wave.state === 'pit') this.openPit();
      if (this.wave.state === 'victory') this.victoryTime = 0;
      this.hud.updateCombat(this.combat, this.wave);
    }
    if (this.wave.state === 'victory') {
      this.victoryTime += FIXED_DT;
      if (this.victoryTime > 1.6) { this.finishRun(true); return; }
    }
    this.elapsed += FIXED_DT;
    this.track.setProgress(p.previousProgress, p.progress);
    this.particles.update(FIXED_DT);
    this.skidMarks.update(FIXED_DT);
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
      let leftX = 0, leftZ = 0, rightX = 0, rightZ = 0;
      for (let side = -1; side <= 1; side += 2) {
        const x = p.x - 225 + side * 22 * cos - 24 * sin;
        const y = p.progress - 24 * cos - side * 22 * sin;
        if (side < 0) { leftX = x; leftZ = y; } else { rightX = x; rightZ = y; }
        // The plume itself takes the stage tint; saturated puffs and sparks carry the exact color.
        this.particles.emit(x, y, TIER_SMOKE[p.tier], -p.vx * 0.15 + (Math.random() - 0.5) * 35, 20, 0.5, 7 + Math.random() * 5, true, p.tier > 0 ? 0.5 : 0);
        if (p.tier > 0) {
          const color = TIER_COLORS[p.tier];
          this.particles.emit(x, y, color, -p.vx * 0.1 + (Math.random() - 0.5) * 55, -15 - Math.random() * 55, 0.34 + Math.random() * 0.12, 5 + Math.random() * 4, true, 0.55);
          this.particles.emit(x, y, color, (Math.random() - 0.5) * 130, -40 - Math.random() * 95, 0.24, 3 + Math.random() * 3);
        }
      }
      this.skidMarks.record(leftX, leftZ, rightX, rightZ);
    } else this.skidMarks.breakTrail();
    if (p.nitroTime > 0 || p.pulseTime > 0) {
      for (let i = 0; i < 3; i++) this.particles.emit(p.x - 225 - Math.sin(p.heading) * 31 + (Math.random() - 0.5) * 17, p.progress - Math.cos(p.heading) * 32, i === 0 ? C.blue : C.orange, -p.vx * 0.2, -100 - Math.random() * 120, 0.3, 5 + Math.random() * 8);
    }
    this.audio.update(p.speed, p.lateralSpeed, p.drifting);
    this.hudTick += FIXED_DT;
    if (this.hudTick >= 0.08) {
      this.hud.update(p, this.hudTick); this.hud.updateCombat(this.combat, this.wave); this.hudTick = 0;
      const lowHealth = this.wave.state === 'combat' && this.combat.health <= 20;
      document.body.classList.toggle('low-health', lowHealth);
      this.audio.setAlarm(lowHealth);
    }
  }
  update(_time: number, delta: number): void {
    this.player.baseY = getCarY();
    if (this.paused) return;
    // Countdown numbers live outside the fixed simulation; refresh only on change.
    if (this.wave.state === 'countdown') {
      const value = Math.ceil(this.wave.intro);
      if (value !== this.countdownShown) {
        this.countdownShown = value;
        this.countdownText.setText(value > 0 ? String(value) : 'GO!').setVisible(true)
          .setScale(value > 0 ? 1 : 1.3);
        if (value > 0 && value <= 3) this.audio.countdownBeep(false);
        else if (value <= 0) this.audio.countdownBeep(true);
      }
    } else if (this.countdownShown !== -1) {
      this.countdownShown = -1;
      this.countdownText.setVisible(false);
    }
    const seconds = Math.min(delta / 1000, 0.1);
    this.slowmo = Math.max(0, this.slowmo - seconds);
    // Bound catch-up work after stalls: never spiral or charge a background drift.
    if (this.wave.state !== 'pit') {
      this.accumulator += seconds * (this.slowmo > 0 ? 0.22 : 1);
      while (this.accumulator >= FIXED_DT) { this.fixedUpdate(); this.accumulator -= FIXED_DT; }
    } else this.accumulator = 0;
    // Parked simulation stays frozen, but reprojection still responds to viewport changes.
    const alpha = this.wave.state === 'pit' ? 1 : this.accumulator / FIXED_DT;
    const pitVisible = Number.isFinite(this.wave.pitProgress) && this.player.physics.progress < this.wave.pitProgress + 1100;
    this.track.draw(alpha, this.player.baseY, this.wave.cameraSide, pitVisible ? this.wave.pitProgress : NaN);
    this.pitView.draw(this.wave.pitProgress, pitVisible, this.elapsed);
    this.player.render(alpha, this.reducedMotion ? 0 : this.kick, this.track.projection);
    this.combatView.draw(alpha);
    this.weaponView.draw(this.player.physics, this.elapsed);
    this.combatView.drawTurret(this.player.physics, alpha, this.reducedMotion ? 0 : this.kick, this.shop.slots[0]?.weaponId ?? null, this.shop.slots[1]?.weaponId ?? null);
    this.particles.draw();
    this.skidMarks.draw(this.skid);
    this.player.sprite.setAlpha(this.combat.impact ? 0.55 : 1);
    this.shake.update(this.cameras.main, delta / 1000);
    if (this.flashAlpha > 0.01) {
      this.flashRect.setAlpha(this.flashAlpha);
      this.flashAlpha *= Math.pow(0.004, seconds);
    } else if (this.flashRect.visible) { this.flashAlpha = 0; this.flashRect.setVisible(false).setAlpha(0); }
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
      b.tex = ''; b.traits = 0; b.meta = 0; b.leg = 0; b.hits = 0; b.age = 0;
    }
    for (let i = 0; i < 8; i++) this.particles.emit((Math.random() - 0.5) * 280, p.progress + Math.random() * 600, C.gold, 40, -30, 0.6, 5);
  }
  private drawEffects(): void {
    const p = this.player.physics;
    this.lines.clear();
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
    // 第四轮雨夜的轻量雨丝：与速度线共用一块 Graphics，约 36 条短斜线。
    if (this.track.rainy) {
      const height = this.scale.height;
      this.lines.lineStyle(1.5, 0xaebfd8, 0.3);
      for (let i = 0; i < 36; i++) {
        const x = (i * 53 + 17) % (WIDTH + 40) - 20;
        const y = (i * 97 + this.elapsed * 1500) % (height + 60) - 30;
        this.lines.lineBetween(x, y, x - 6, y + 22);
      }
    }
  }
}

const RELEASE_NOTICES = ['', '蓝焰释放 · +15% 推力', '橙焰释放 · +25% 推力', '紫焰释放 · +40% 推力'];
