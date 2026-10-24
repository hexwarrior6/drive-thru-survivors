import Phaser from 'phaser';
import { randomStartingCity } from '../data/cities';
import { CityCombobox } from '../ui/CityCombobox';
import { loadSnapshot } from '../data/loadSnapshot';
import { updateSoundButton } from '../ui/UtilityControls';
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
    const start = document.getElementById('start') as HTMLButtonElement;
    const city = document.getElementById('destination-city') as HTMLInputElement;
    const dice = document.getElementById('random-city') as HTMLButtonElement;
    const cityPicker = new CityCombobox(this.abort.signal);
    const status = document.getElementById('destination-status')!;
    start.disabled = city.disabled = dice.disabled = false;
    (document.getElementById('toggle-cities') as HTMLButtonElement).disabled = false; start.textContent = '发动引擎 ↗';
    status.textContent = '选个城市，沿途随机停靠真实得来速。';
    dice.addEventListener('click', () => { cityPicker.close(); city.value = randomStartingCity(city.value); status.textContent = `下一程，${city.value}。准备好就出发。`; }, { signal: this.abort.signal });
    document.getElementById('start')!.addEventListener('click', async () => {
      if (start.disabled) return;
      const cityName = city.value.trim();
      if (!cityName || cityName.length > 20) { status.textContent = '请输入城市名，或掷骰子选一座。'; city.focus(); return; }
      cityPicker.close();
      start.disabled = city.disabled = dice.disabled = true;
      (document.getElementById('toggle-cities') as HTMLButtonElement).disabled = true;
      start.textContent = '正在准备路线…'; status.textContent = '正在准备沿途餐品，首次出发可能需要约一分钟。';
      const data = await loadSnapshot(cityName);
      if (this.abort?.signal.aborted) return;
      this.registry.set('snapshot', data.snapshot);
      this.registry.set('snapshotReason', data.reason);
      document.getElementById('title')!.classList.add('hidden');
      (document.activeElement as HTMLElement)?.blur();
      this.scene.start('Game');
    }, { signal: this.abort.signal });
    const sound = document.getElementById('sound')!;
    document.querySelector('.masthead')!.append(sound);
    updateSoundButton(sound, this.registry.get('muted') === true);
    sound.addEventListener('click', () => {
      const muted = this.registry.get('muted') !== true;
      this.registry.set('muted', muted);
      updateSoundButton(sound, muted);
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
