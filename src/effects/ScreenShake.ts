import type Phaser from 'phaser';
/** Camera-only shake; amplitudes are expressed in world pixels, decay to zero. */
export class ScreenShake {
  private life = 0;
  private duration = 0;
  private amplitude = 0;
  private vertical = false;
  trigger(amplitude: number, duration: number, vertical = false): void {
    this.life = this.duration = duration; this.amplitude = amplitude; this.vertical = vertical;
  }
  update(camera: Phaser.Cameras.Scene2D.Camera, dt: number): void {
    this.life = Math.max(0, this.life - dt);
    const strength = this.duration > 0 ? this.amplitude * this.life / this.duration : 0;
    camera.setScroll(this.vertical ? 0 : Math.sin(this.life * 240) * strength, Math.cos(this.life * 270) * strength);
  }
}
