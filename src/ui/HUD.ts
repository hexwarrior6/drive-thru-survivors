import type { CombatSystem } from '../combat/CombatSystem';
import type { WaveSystem } from '../systems/WaveSystem';
import type { DriftPhysics } from '../systems/DriftPhysics';
import type { Theme } from '../systems/Theme';
import { statIcon } from './icons';
const get = (id: string) => document.getElementById(id)!;
const labels = ['保持转向蓄力', '蓝焰就绪 · 松手加速', '橙焰就绪 · 松手加速', '紫焰全开 · 松手加速'];
const colors = ['#70cfff', '#70cfff', '#ffa13f', '#b98be9'];
/** Seconds the combo badge lingers on screen after the chain breaks. */
const COMBO_LINGER_S = 3;

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
  private bossBar = get('boss-bar'); private bossFill = get('boss-fill');
  private combo = get('combo'); private comboCount = get('combo-count');
  private campaignTag = get('campaign-tag');
  private lastCombo = -1;
  constructor() {
    const money = get('eco-money');
    if (!money.querySelector('svg')) money.insertAdjacentHTML('afterbegin', statIcon('coin', 16));
  }
  setCampaign(theme: Theme, campaign: string): void {
    this.campaignTag.textContent = `${campaign.split('·')[0]!.trim()} · ${theme.name}${theme.note ? ` · ${theme.note}` : ''}`;
    this.campaignTag.hidden = false;
  }
  updateCombat(c: CombatSystem, w: WaveSystem): void {
    this.wave.textContent = String(w.number).padStart(2, '0');
    const clock = w.state === 'combat' ? (w.isBossWave ? 'BOSS' : String(Math.ceil(w.remaining)))
      : w.state === 'countdown' ? '准备' : w.state === 'entering' ? '进站中' : w.state === 'exiting' ? '出站中'
      : w.state === 'bossdown' ? '击破！' : w.state === 'victory' ? '胜利！' : w.state === 'pit' ? '已停靠' : '已抛锚';
    this.clockValue.textContent = clock;
    this.clockUnit.hidden = w.state !== 'combat' || w.isBossWave;
    this.clock.classList.toggle('as-text', w.state !== 'combat' || w.isBossWave);
    const frac = w.state === 'combat' && !w.isBossWave ? Math.max(0, Math.min(1, w.remaining / w.duration)) : 0;
    this.progress.style.transform = `scaleX(${frac})`;
    this.progressTrack.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    this.journey.classList.toggle('arriving', w.state === 'combat' && !w.isBossWave && w.remaining <= 10);
    this.money.textContent = String(c.money); this.kills.textContent = String(c.kills);
    this.health.textContent = this.pitHealth.textContent = String(c.health);
    this.healthFill.style.width = `${c.health}%`;
    this.healthRow.classList.toggle('low', c.health <= 20);
    this.pitHealth.classList.toggle('low', c.health <= 20);
    // Tyrant truck health bar lives above the road, only while it stands.
    const boss = c.bossSlot >= 0 ? c.enemies.items[c.bossSlot] : null;
    const bossActive = boss !== null && boss.active && c.bossMaxHp > 0;
    this.bossBar.classList.toggle('hidden', !bossActive);
    if (bossActive) this.bossFill.style.width = `${Math.max(0, boss.hp / c.bossMaxHp * 100)}%`;
    this.updateCombo(c);
    // One shared alert slot; quiet driving needs no persistent instruction text.
    const bossWindup = boss !== null && boss.active && boss.phase === 1;
    const danger = w.state === 'combat' && (c.health <= 20 || (c.targetDistance > 0 && c.targetDistance < 90) || bossWindup);
    const alert = w.state === 'countdown' ? '倒数出发 · 保持车道'
      : w.state === 'bossdown' ? '霸王卡车击破 · 战利品入账'
      : w.state === 'victory' ? '路线完成 · 正在生成战报'
      : w.state === 'entering' ? '自动驶入得来速 · 即将补给'
      : w.state === 'exiting' ? '正在汇入主路 · 准备出发'
      : w.state !== 'combat' ? ''
      : bossWindup ? '霸王卡车蓄力侧撞 · 立刻变线！'
      : c.health <= 20 ? '车况危险 · 避开撞击，到站维修'
      : c.targetDistance > 0 && c.targetDistance < 90 ? '追兵贴近 · 变道或冲刺脱身'
      : !w.isBossWave && w.remaining <= 3 ? '准备进站 · 自动停靠补给' : '';
    if (this.tactic.textContent !== alert) this.tactic.textContent = alert;
    this.tactic.hidden = !alert;
    this.tactic.classList.toggle('danger', danger);
  }
  private updateCombo(c: CombatSystem): void {
    if (c.combo === this.lastCombo) return;
    const changed = this.lastCombo >= 0 && c.combo > this.lastCombo;
    this.lastCombo = c.combo;
    if (c.combo >= 2) {
      this.comboLinger = 0;
      this.combo.classList.remove('hidden');
      this.comboCount.textContent = String(c.combo);
      if (changed) {
        this.combo.classList.remove('pop');
        void this.combo.offsetWidth;
        this.combo.classList.add('pop');
      }
    } else if (this.comboLinger === 0 && !this.combo.classList.contains('hidden')) {
      this.comboLinger = COMBO_LINGER_S;
    }
  }
  private notice = ''; private noticeTime = 0;
  private comboLinger = 0;
  showNotice(text: string, duration = 1): void { this.notice = text; this.noticeTime = duration; }
  update(p: DriftPhysics, dt: number): void {
    this.noticeTime = Math.max(0, this.noticeTime - dt);
    if (this.comboLinger > 0) {
      this.comboLinger = Math.max(0, this.comboLinger - dt);
      if (this.comboLinger === 0) this.combo.classList.add('hidden');
    }
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
