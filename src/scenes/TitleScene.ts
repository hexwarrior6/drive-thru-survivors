import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { TrackGenerator } from '../systems/TrackGenerator';

export class TitleScene extends Phaser.Scene {
  private track!: TrackGenerator;
  private car!: Player;
  private abort?: AbortController;
  constructor() { super('Title'); }
  create(): void {
    document.body.classList.remove('is-driving');
    this.track = new TrackGenerator(this);
    this.car = new Player(this);
    document.getElementById('title')!.classList.remove('hidden');
    this.abort = new AbortController();
    document.getElementById('start')!.addEventListener('click', () => {
      document.getElementById('title')!.classList.add('hidden');
      (document.activeElement as HTMLElement)?.blur();
      this.scene.start('Game');
    }, { signal: this.abort.signal });
    const sound = document.getElementById('sound')!;
    sound.addEventListener('click', () => {
      const muted = this.registry.get('muted') !== true;
      this.registry.set('muted', muted);
      sound.innerHTML = muted ? '声音 OFF <span>♪</span>' : '声音 ON <span>♪</span>';
      sound.setAttribute('aria-pressed', String(muted));
    }, { signal: this.abort.signal });
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
