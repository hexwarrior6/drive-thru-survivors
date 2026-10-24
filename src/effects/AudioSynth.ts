import { clamp } from '../utils/math';
/** Extends McPitstop sound.ts: gesture unlock, optional audio, ramped envelopes. */
export class AudioSynth {
  private ctx?: AudioContext;
  private master?: GainNode;
  private engine?: OscillatorNode;
  private engineGain?: GainNode;
  private noise?: AudioBufferSourceNode;
  private tireGain?: GainNode;
  private filter?: BiquadFilterNode;
  private impactOsc?: OscillatorNode;
  private impactGain?: GainNode;
  private alarmOsc?: OscillatorNode;
  private alarmGain?: GainNode;
  private alarmOn = false;
  private nextBeep = 0;
  muted = false;
  private paused = false;

  unlock(): void {
    try {
      if (!this.ctx) {
        const ctx = this.ctx = new AudioContext();
        const master = this.master = ctx.createGain();
        master.gain.value = 0.22;
        master.connect(ctx.destination);
        const engine = this.engine = ctx.createOscillator();
        const engineGain = this.engineGain = ctx.createGain();
        engine.type = 'sine'; engine.frequency.value = 80; engineGain.gain.value = 0;
        engine.connect(engineGain); engineGain.connect(master); engine.start();
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        const noise = this.noise = ctx.createBufferSource();
        noise.buffer = buffer; noise.loop = true;
        const filter = this.filter = ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 800;
        const tireGain = this.tireGain = ctx.createGain(); tireGain.gain.value = 0;
        noise.connect(filter); filter.connect(tireGain); tireGain.connect(master); noise.start();
        const impact = this.impactOsc = ctx.createOscillator();
        const gain = this.impactGain = ctx.createGain();
        impact.type = 'triangle'; gain.gain.value = 0;
        impact.connect(gain); gain.connect(master); impact.start();
        const alarm = this.alarmOsc = ctx.createOscillator();
        const alarmGain = this.alarmGain = ctx.createGain();
        alarm.type = 'square'; alarm.frequency.value = 660; alarmGain.gain.value = 0;
        alarm.connect(alarmGain); alarmGain.connect(master); alarm.start();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    } catch { /* Audio support never blocks driving. */ }
  }
  update(speed: number, slip: number, drifting: boolean): void {
    if (!this.ctx || !this.engine || !this.engineGain || !this.filter || !this.tireGain) return;
    const t = this.ctx.currentTime;
    const ratio = clamp(speed / 510, 0, 1);
    this.engine.frequency.setTargetAtTime(80 + ratio * 120, t, 0.07);
    this.engineGain.gain.setTargetAtTime(this.paused ? 0 : 0.28 + ratio * 0.12, t, 0.06);
    this.filter.frequency.setTargetAtTime(450 + Math.abs(slip) * 17, t, 0.05);
    this.tireGain.gain.setTargetAtTime(!this.paused && drifting ? 0.12 + Math.min(Math.abs(slip) / 180, 0.25) : 0, t, 0.04);
    // Low-health alarm pulses on its own clock so stalls cannot stack beeps.
    if (this.alarmGain) {
      if (this.alarmOn && !this.paused && t >= this.nextBeep) {
        this.nextBeep = t + 0.5;
        this.alarmGain.gain.setValueAtTime(0.055, t);
        this.alarmGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      }
      if (!this.alarmOn || this.paused) this.alarmGain.gain.setTargetAtTime(0, t, 0.02);
    }
  }
  impact(boost = false): void {
    if (!this.ctx || !this.impactGain || !this.impactOsc || this.paused) return;
    const t = this.ctx.currentTime;
    this.impactOsc.frequency.setValueAtTime(boost ? 160 : 90, t);
    this.impactOsc.frequency.exponentialRampToValueAtTime(boost ? 350 : 40, t + 0.16);
    this.impactGain.gain.cancelScheduledValues(t);
    this.impactGain.gain.setValueAtTime(0.45, t);
    this.impactGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  }
  /** Short launch beep; the final one lands a fifth higher. */
  countdownBeep(final = false): void {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = final ? 880 : 440;
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (final ? 0.5 : 0.18));
      osc.connect(gain); gain.connect(this.master!); osc.start(t); osc.stop(t + 0.55);
    } catch { /* Beeps are decorative. */ }
  }
  /** Three ascending notes when the tyrant truck falls. */
  victoryJingle(): void {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = [523, 659, 784][i]!;
        const start = t + i * 0.14;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
        osc.connect(gain); gain.connect(this.master!); osc.start(start); osc.stop(start + 0.45);
      }
    } catch { /* Jingles are decorative. */ }
  }
  setAlarm(active: boolean): void { this.alarmOn = active; if (!active) this.nextBeep = 0; }
  setMuted(value: boolean): void {
    this.muted = value;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(value ? 0 : 0.22, this.ctx.currentTime, 0.03);
  }
  setPaused(value: boolean): void { this.paused = value; this.update(0, 0, false); }
  get diagnostics() {
    return { state: this.ctx?.state ?? 'uninitialized', frequency: this.engine?.frequency.value,
      tireCutoff: this.filter?.frequency.value, tireLevel: this.tireGain?.gain.value,
      muted: this.muted, masterLevel: this.master?.gain.value };
  }
  destroy(): void {
    this.engine?.stop(); this.noise?.stop(); this.impactOsc?.stop(); this.alarmOsc?.stop();
    if (this.ctx) void this.ctx.close().catch(() => {});
  }
}
