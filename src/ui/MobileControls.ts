import type { DriveInput } from '../systems/DriftPhysics';

export class MobileControls {
  readonly state: DriveInput = { steer: 0, throttle: true, brake: false, drift: false, boost: false };
  private keys = new Set<string>();
  private pointers = new Map<number, string>();
  private abort = new AbortController();
  private boostQueued = false;
  private cruise = document.querySelector<HTMLInputElement>('#cruise')!;
  private buttons = document.querySelectorAll<HTMLButtonElement>('[data-drive]');
  constructor(onGesture: () => void, onPause: () => void, onReset: () => void, onMute: () => void) {
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) {
        if (event.code === 'Space' || event.code === 'Enter') return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) event.preventDefault();
      onGesture();
      if (!event.repeat) {
        if (event.code === 'KeyP' || event.code === 'Escape') onPause();
        if (event.code === 'KeyR') onReset();
        if (event.code === 'KeyM') onMute();
        if (event.code === 'Space') this.boostQueued = true;
      }
      this.keys.add(event.code);
    }, options);
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.clear(), options);
    for (const button of this.buttons) {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault(); onGesture();
        button.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, button.dataset.drive!);
        button.classList.add('pressed');
        if (button.dataset.drive === 'boost') this.boostQueued = true;
      }, options);
      const release = (event: PointerEvent) => {
        this.pointers.delete(event.pointerId);
        if (!this.hasPointer(button.dataset.drive!)) button.classList.remove('pressed');
      };
      button.addEventListener('pointerup', release, options);
      button.addEventListener('pointercancel', release, options);
      button.addEventListener('lostpointercapture', release, options);
    }
  }
  private hasPointer(name: string): boolean {
    for (const value of this.pointers.values()) if (value === name) return true;
    return false;
  }
  sample(): DriveInput {
    this.state.steer = Number(this.keys.has('ArrowRight') || this.keys.has('KeyD') || this.hasPointer('right'))
      - Number(this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.hasPointer('left'));
    this.state.throttle = this.cruise.checked || this.keys.has('ArrowUp') || this.keys.has('KeyW');
    this.state.brake = this.keys.has('ArrowDown') || this.keys.has('KeyS');
    this.state.drift = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.hasPointer('drift');
    this.state.boost = this.boostQueued; this.boostQueued = false;
    return this.state;
  }
  clear(): void {
    this.keys.clear(); this.pointers.clear(); this.boostQueued = false;
    for (const button of this.buttons) button.classList.remove('pressed');
  }
  destroy(): void { this.clear(); this.abort.abort(); }
}
