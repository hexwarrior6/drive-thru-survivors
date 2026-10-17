import type { DriftPhysics } from '../systems/DriftPhysics';
const get = (id: string) => document.getElementById(id)!;
const labels = ['准备好，把弯道点亮。', '蓝焰就绪 · 松手加速', '橙焰就绪 · 继续蓄力', '紫焰全开 · 松手起飞'];
const colors = ['#70cfff', '#70cfff', '#ffa13f', '#b98be9'];
export class HUD {
  private speed = get('speed'); private distance = get('distance');
  private nitro = get('nitro'); private nitroFill = get('nitro-fill');
  private charge = get('charge-fill'); private label = get('drift-label'); private tier = get('tier');
  private drifts = get('drift-count'); private purples = get('purple-count');
  private boostButton = document.querySelector<HTMLButtonElement>('[data-drive="boost"]')!;
  private road = get('road-name'); private turn = get('road-turn');
  private notice = ''; private noticeTime = 0;
  showNotice(text: string, duration = 1): void { this.notice = text; this.noticeTime = duration; }
  update(p: DriftPhysics, dt: number, section = '起步直道', upcoming = 0): void {
    this.road.textContent = section;
    this.turn.textContent = upcoming > 0 ? '前方右弯 ↗' : upcoming < 0 ? '↖ 前方左弯' : '↑ 保持走线';
    this.noticeTime = Math.max(0, this.noticeTime - dt);
    this.speed.textContent = Math.round(p.speed * 0.52).toString().padStart(3, '0');
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
