import Phaser from 'phaser';
import { carById, type CarId } from '../data/cars';
import { demoSnapshot } from '../data/snapshot';
import { themeFor } from '../systems/Theme';
import { clearRun } from '../systems/SaveSystem';
import { Player } from '../entities/Player';
import { TrackGenerator } from '../systems/TrackGenerator';

/** Pick one of three karts; the choice is saved with the run for resumes. */
export class SelectScene extends Phaser.Scene {
  private track!: TrackGenerator;
  private car!: Player;
  private abort?: AbortController;
  private selected: CarId = 'flash';
  constructor() { super('Select'); }
  create(): void {
    document.body.classList.remove('is-driving');
    this.track = new TrackGenerator(this);
    this.car = new Player(this);
    const panel = document.getElementById('select-panel')!;
    panel.classList.remove('hidden');
    document.getElementById('title')!.classList.add('hidden');
    document.getElementById('result-panel')!.classList.add('hidden');
    document.getElementById('hud')!.classList.add('hidden');
    const snapshot = this.registry.get('snapshot') ?? demoSnapshot();
    const theme = themeFor(snapshot.campaign);
    document.getElementById('select-city')!.textContent = snapshot.city;
    document.getElementById('select-campaign')!.textContent = `${snapshot.campaign}${theme.note ? ` · ${theme.note}` : ''}`;
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    const cards = document.querySelectorAll<HTMLButtonElement>('.car-card');
    const confirm = document.getElementById('confirm-car') as HTMLButtonElement;
    confirm.disabled = false;
    const applySelection = () => {
      for (const card of cards) card.classList.toggle('selected', card.dataset.car === this.selected);
      const def = carById(this.selected);
      this.car.chassisTint(def.tint);
      confirm.textContent = `驾驶 ${def.name} 出发 ↗`;
    };
    for (const card of cards) {
      card.disabled = false;
      card.addEventListener('click', () => { this.selected = (card.dataset.car ?? 'flash') as CarId; applySelection(); }, options);
    }
    applySelection();
    confirm.addEventListener('click', () => {
      if (confirm.disabled) return;
      confirm.disabled = true;
      clearRun();
      this.registry.set('car', this.selected);
      this.registry.set('resumeData', undefined);
      panel.classList.add('hidden');
      (document.activeElement as HTMLElement)?.blur();
      this.scene.start('Game');
    }, options);
    document.getElementById('select-back')!.addEventListener('click', () => {
      panel.classList.add('hidden');
      this.scene.start('Title');
    }, options);
    this.events.once('shutdown', () => this.abort?.abort());
  }
  update(time: number, delta: number): void {
    this.track.step(Math.min(delta, 50) / 1000 * 100);
    this.track.draw(1, this.scale.height * 0.7);
    this.car.physics.progress = this.car.physics.previousProgress = this.track.offset;
    this.car.physics.heading = this.car.physics.previousHeading = Math.sin(time / 1000) * 0.045;
    this.car.render(1, 0, this.track.projection);
  }
}
