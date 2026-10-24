import type { CombatSystem } from '../combat/CombatSystem';
import type { WaveSystem } from '../systems/WaveSystem';
import type { DriftPhysics } from '../systems/DriftPhysics';
import { monoIcon, statIcon, type StatIcon } from './icons';
const get = (id: string) => document.getElementById(id)!;
const labels = ['准备好，把弯道点亮。', '蓝焰就绪 · 松手加速', '橙焰就绪 · 继续蓄力', '紫焰全开 · 松手起飞'];
const colors = ['#70cfff', '#70cfff', '#ffa13f', '#b98be9'];
/** Gauge ceiling in km/h; boost tops out around 300. */
const GAUGE_MAX = 320;
const RING = 2 * Math.PI * 19;
export class HUD {
  private speed = get('speed'); private speedFill = get('speed-fill'); private distance = get('distance');
  private nitro = get('nitro'); private nitroFill = get('nitro-fill');
  private charge = get('charge-fill'); private label = get('drift-label'); private tier = get('tier');
  private drifts = get('drift-count'); private purples = get('purple-count');
  private boostButton = document.querySelector<HTMLButtonElement>('[data-drive="boost"]')!;
  private road = get('road-name'); private turn = get('road-turn');
  private wave = get('wave-number'); private clock = get('wave-clock'); private ring = get('wave-ring');
  private money = get('coins'); private kills = get('kills'); private health = get('health');
  private healthRow = get('health-row');
  private tactic = get('combat-tactic');
  private healthFill = get('health-fill');
  constructor() {
    // One icon per row, injected once; scene restarts must not duplicate them.
    const inject = (rowId: string, icon: StatIcon, colored: boolean) => {
      const row = get(rowId);
      if (!row.querySelector('svg')) row.insertAdjacentHTML('afterbegin', (colored ? statIcon : monoIcon)(icon, 12));
    };
    inject('health-row', 'heart', false);
    inject('nitro-row', 'bolt', false);
    inject('eco-money', 'coin', true);
    inject('eco-kills', 'burst', true);
  }
  updateCombat(c: CombatSystem, w: WaveSystem): void {
    this.wave.textContent = String(w.number).padStart(2, '0');
    this.clock.textContent = w.state === 'combat' ? `${Math.ceil(w.remaining)}s` : w.state === 'entering' ? '进站中' : w.state === 'exiting' ? '出站中' : w.state === 'pit' ? '已停靠' : '已抛锚';
    this.clock.classList.toggle('as-text', w.state !== 'combat');
    const frac = w.state === 'combat' || w.state === 'entering' ? Math.max(0, Math.min(1, w.remaining / w.duration)) : 0;
    this.ring.style.strokeDashoffset = String(RING * (1 - frac));
    this.ring.style.stroke = w.state === 'combat' && w.remaining <= 10 ? '#e75239' : '#b75d36';
    this.money.textContent = String(c.money); this.kills.textContent = String(c.kills);
    this.health.textContent = String(c.health); this.healthFill.style.width = `${c.health}%`;
    this.healthFill.style.backgroundColor = c.health <= 20 ? '#e75239' : '#6b9d57';
    this.healthRow.classList.toggle('low', c.health <= 20);
    this.tactic.textContent = w.state === 'entering' ? '自动驶入右侧得来速' : w.state === 'exiting' ? '正在汇入主路 · 准备出发' : c.pursuers === 0 ? '前方避障 · 等待追兵' : c.targetDistance > 0 && c.targetDistance < 90 ? '追兵贴身 · 变道或冲刺脱身' : c.targetDistance > 0 && c.targetDistance < 175 ? '近距散弹 · 聚拢追兵一起打' : '远距牵制 · 冲刺可拉开距离';
    this.tactic.classList.toggle('danger', c.targetDistance > 0 && c.targetDistance < 90);
  }
  private notice = ''; private noticeTime = 0;
  showNotice(text: string, duration = 1): void { this.notice = text; this.noticeTime = duration; }
  update(p: DriftPhysics, dt: number, section = '起步直道', upcoming = 0): void {
    this.road.textContent = section;
    this.turn.textContent = upcoming > 0 ? '前方右弯 ↗' : upcoming < 0 ? '↖ 前方左弯' : '↑ 保持走线';
    this.noticeTime = Math.max(0, this.noticeTime - dt);
    const kmh = Math.round(p.speed * 0.52);
    this.speed.textContent = kmh.toString().padStart(3, '0');
    this.speedFill.style.width = `${Math.min(100, kmh / GAUGE_MAX * 100)}%`;
    this.distance.textContent = `${(p.distance / 1000).toFixed(2)} km`;
    this.nitro.textContent = Math.floor(p.nitro).toString(); this.nitroFill.style.width = `${p.nitro}%`;
    this.charge.style.width = `${Math.min(p.charge / 2, 1) * 100}%`;
    this.charge.style.backgroundColor = colors[p.tier];
    this.label.textContent = this.noticeTime > 0 ? this.notice : p.drifting ? p.tier === 0 ? '车尾在滑动 · 保持蓄力' : labels[p.tier] : labels[0];
    this.tier.textContent = p.drifting ? `${p.charge.toFixed(1)}s` : p.nitroTime > 0 ? 'NITRO!' : 'DRIFT';
    this.tier.style.color = p.drifting && p.tier > 0 ? colors[p.tier] : '#354e3c';
    this.drifts.textContent = p.driftCount.toString().padStart(2, '0');
    this.purples.textContent = p.purpleCount.toString().padStart(2, '0');
    this.boostButton.disabled = p.nitro < 20 || p.nitroTime > 0;
  }
}
