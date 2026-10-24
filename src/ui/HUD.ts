import type { CombatSystem } from '../combat/CombatSystem';
import type { WaveSystem } from '../systems/WaveSystem';
import type { DriftPhysics } from '../systems/DriftPhysics';
import { statIcon } from './icons';
const get = (id: string) => document.getElementById(id)!;
const labels = ['保持转向蓄力', '蓝焰就绪 · 松手加速', '橙焰就绪 · 松手加速', '紫焰全开 · 松手加速'];
const colors = ['#70cfff', '#70cfff', '#ffa13f', '#b98be9'];

export class HUD {
  private speed = get('speed'); private distance = get('distance');
  private nitro = get('nitro'); private nitroFill = get('nitro-fill');
  private charge = get('charge-fill'); private label = get('drift-label'); private tier = get('tier');
  private chargeCard = document.querySelector<HTMLElement>('.charge-card')!;
  private drifts = get('drift-count'); private purples = get('purple-count');
  private boostButton = document.querySelector<HTMLButtonElement>('[data-drive="boost"]')!;
  private wave = get('wave-number'); private clock = get('wave-clock');
  private clockValue = get('wave-clock-value'); private clockUnit = get('wave-clock-unit');
  private progress = get('wave-progress');
  private progressTrack = document.querySelector<HTMLElement>('.journey-progress')!;
  private journey = document.querySelector<HTMLElement>('.journey-card')!;
  private money = get('coins'); private kills = get('kills'); private health = get('health');
  private pitHealth = get('pit-health'); private healthRow = get('health-row');
  private tactic = get('combat-tactic'); private healthFill = get('health-fill');
  constructor() {
    const money = get('eco-money');
    if (!money.querySelector('svg')) money.insertAdjacentHTML('afterbegin', statIcon('coin', 16));
  }
  updateCombat(c: CombatSystem, w: WaveSystem): void {
    this.wave.textContent = String(w.number).padStart(2, '0');
    const clock = w.state === 'combat' ? String(Math.ceil(w.remaining)) : w.state === 'entering' ? '进站中' : w.state === 'exiting' ? '出站中' : w.state === 'pit' ? '已停靠' : '已抛锚';
    this.clockValue.textContent = clock;
    this.clockUnit.hidden = w.state !== 'combat';
    this.clock.classList.toggle('as-text', w.state !== 'combat');
    const frac = w.state === 'combat' ? Math.max(0, Math.min(1, w.remaining / w.duration)) : 0;
    this.progress.style.transform = `scaleX(${frac})`;
    this.progressTrack.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    this.journey.classList.toggle('arriving', w.state === 'combat' && w.remaining <= 10);
    this.money.textContent = String(c.money); this.kills.textContent = String(c.kills);
    this.health.textContent = this.pitHealth.textContent = String(c.health);
    this.healthFill.style.width = `${c.health}%`;
    this.healthRow.classList.toggle('low', c.health <= 20);
    this.pitHealth.classList.toggle('low', c.health <= 20);
    // One shared alert slot; quiet driving needs no persistent instruction text.
    const danger = w.state === 'combat' && (c.health <= 20 || (c.targetDistance > 0 && c.targetDistance < 90));
    const alert = w.state === 'entering' ? '自动驶入得来速 · 即将补给'
      : w.state === 'exiting' ? '正在汇入主路 · 准备出发'
      : w.state !== 'combat' ? ''
      : c.health <= 20 ? '车况危险 · 避开撞击，到站维修'
      : c.targetDistance > 0 && c.targetDistance < 90 ? '追兵贴近 · 变道或冲刺脱身'
      : w.remaining <= 3 ? '准备进站 · 自动停靠补给' : '';
    if (this.tactic.textContent !== alert) this.tactic.textContent = alert;
    this.tactic.hidden = !alert;
    this.tactic.classList.toggle('danger', danger);
  }
  private notice = ''; private noticeTime = 0;
  showNotice(text: string, duration = 1): void { this.notice = text; this.noticeTime = duration; }
  update(p: DriftPhysics, dt: number): void {
    this.noticeTime = Math.max(0, this.noticeTime - dt);
    this.speed.textContent = String(Math.round(p.speed * 0.52));
    this.distance.textContent = `${(p.distance / 1000).toFixed(2)} km`;
    this.nitro.textContent = String(Math.floor(p.nitro)); this.nitroFill.style.width = `${p.nitro}%`;
    this.charge.style.width = `${Math.min(p.charge / 2, 1) * 100}%`;
    this.charge.style.backgroundColor = colors[p.tier];
    this.chargeCard.classList.toggle('active', p.drifting || p.nitroTime > 0 || this.noticeTime > 0);
    this.label.textContent = this.noticeTime > 0 ? this.notice : p.nitroTime > 0 ? '氮气冲刺中' : labels[p.tier];
    this.tier.textContent = p.drifting ? `${p.charge.toFixed(1)}s` : p.nitroTime > 0 ? '加速' : '漂移';
    this.tier.style.color = p.drifting && p.tier > 0 ? colors[p.tier] : '#354e3c';
    this.drifts.textContent = String(p.driftCount).padStart(2, '0');
    this.purples.textContent = String(p.purpleCount).padStart(2, '0');
    this.boostButton.disabled = p.nitro < 20 || p.nitroTime > 0;
    this.boostButton.classList.toggle('boosting', p.nitroTime > 0);
  }
}
