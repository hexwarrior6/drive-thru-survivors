import { WEAPONS, weaponStats, weaponById, MOUNT_NAMES, type WeaponDef } from '../combat/weaponCatalog';
import type { StatIcon } from './icons';
import { SAUCES } from '../combat/sauces';
import { FOOD_DATA_URLS } from '../data/foodArt';
import { statIcon } from './icons';

const FAMILIES = ['炮械', '薯类', '鸡肉', '饮品', '甜品'] as const;

/** 弹丸/展示图：专属武器用固定美术 key，通用条目用 starter 兜底。 */
function artFor(def: WeaponDef): string {
  const key = def.artKey ?? 'food-starter';
  const url = FOOD_DATA_URLS[key];
  return url ? `<img src="${url}" alt="" draggable="false">` : '<span class="codex-art-fallback"></span>';
}

function sauceCompat(def: WeaponDef): string {
  const keys = SAUCES.filter(s => {
    if (s.key === 'crema' || s.key === 'chili') return true;
    if (s.key === 'ketchup') return ['scatter', 'W01', 'W02', 'W03', 'W04', 'W05', 'W08', 'W09', 'W10', 'W11', 'W15', 'W18', 'W23', 'W30'].includes(def.id);
    if (s.key === 'sweetSour') return def.wall === true;
    return false;
  }).map(s => s.label);
  return keys.join(' · ') || '仅调味类（辣椒 / 奶油咖啡）';
}

/**
 * 武器图鉴（§13 第三阶段）：列表只留一行一件（名称 + 挂载 + 分支），
 * 完整规格（行为弱点 / 逐级数值 / 酱料兼容）收进二级详情弹层；
 * 列表与商店卡片、实际开火读取同一份 catalog 定义。
 */
export class CodexView {
  private static instance: CodexView | null = null;
  private open_ = false;
  private family = 'all';
  private detailIndex = -1;

  /** TitleScene is re-entered after runs; bind the shared DOM only once. */
  static mount(): void {
    if (!CodexView.instance) CodexView.instance = new CodexView();
    else CodexView.instance.setOpen(false);
  }

  private constructor() {
    const panel = document.getElementById('codex-panel');
    const button = document.getElementById('codex-open');
    if (!panel || !button) return;
    const count = WEAPONS.filter(w => w.family !== '服务' && w.family !== '通用').length;
    button.textContent = `武器图鉴 · ${count} 件 ↗`;
    button.classList.remove('hidden');
    button.addEventListener('click', () => this.setOpen(true));
    document.getElementById('codex-close')?.addEventListener('click', () => this.setOpen(false));
    document.getElementById('codex-detail-close')?.addEventListener('click', () => this.closeDetail());
    document.getElementById('codex-detail')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) this.closeDetail();
    });
    document.getElementById('codex-prev')?.addEventListener('click', () => this.stepDetail(-1));
    document.getElementById('codex-next')?.addEventListener('click', () => this.stepDetail(1));
    document.addEventListener('keydown', e => {
      if (!this.open_) return;
      if (!this.detailOpen()) { if (e.key === 'Escape') this.setOpen(false); return; }
      if (e.key === 'Escape') this.closeDetail();
      if (e.key === 'ArrowLeft') this.stepDetail(-1);
      if (e.key === 'ArrowRight') this.stepDetail(1);
    });
    this.renderFilters();
    this.renderList();
  }
  private setOpen(open: boolean): void {
    this.open_ = open;
    document.getElementById('codex-panel')!.classList.toggle('hidden', !open);
    if (open) { this.renderFilters(); this.renderList(); }
    else this.closeDetail();
  }
  private filtered(): WeaponDef[] {
    return WEAPONS.filter(w => w.family !== '服务' && w.family !== '通用' && (this.family === 'all' || w.family === this.family));
  }
  private detailOpen(): boolean {
    return !document.getElementById('codex-detail')?.classList.contains('hidden');
  }
  private closeDetail(): void {
    document.getElementById('codex-detail')?.classList.add('hidden');
    this.detailIndex = -1;
  }
  private stepDetail(delta: number): void {
    const list = this.filtered();
    if (!list.length) return;
    const next = (this.detailIndex + delta + list.length) % list.length;
    this.openDetail(list[next].id);
  }
  private renderFilters(): void {
    const filters = document.getElementById('codex-filters')!;
    filters.replaceChildren();
    const chips: { key: string; label: string }[] = [{ key: 'all', label: `全部 ${WEAPONS.filter(w => w.family !== '服务' && w.family !== '通用').length}` }];
    for (const family of FAMILIES) {
      chips.push({ key: family, label: `${family} ${WEAPONS.filter(w => w.family === family).length}` });
    }
    for (const chip of chips) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = chip.label;
      b.className = this.family === chip.key ? 'active' : '';
      b.addEventListener('click', () => { this.family = chip.key; this.renderFilters(); this.renderList(); });
      filters.append(b);
    }
  }
  /** 紧凑列表：一行一件，完整规格进详情弹层。 */
  private renderList(): void {
    const list = document.getElementById('codex-list')!;
    list.replaceChildren();
    for (const def of this.filtered()) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'codex-row';
      const branches = def.branches?.map(b => b.name).join(' / ') ?? '';
      row.innerHTML = `
        <span class="codex-row-art">${artFor(def)}</span>
        <span class="codex-row-main"><b>${def.id} ${def.name}</b><small>${MOUNT_NAMES[def.mount]} · ${def.family} · ${branches}</small></span>
        <span class="codex-row-go">详情 ›</span>`;
      row.addEventListener('click', () => this.openDetail(def.id));
      list.append(row);
    }
  }
  /** 二级详情弹层：行为弱点 / 分支 / 逐级数值 / 酱料兼容。 */
  private openDetail(id: string): void {
    const list = this.filtered();
    this.detailIndex = list.findIndex(w => w.id === id);
    const def = weaponById(id);
    const l = (icon: StatIcon, text: string) => `<span class="stat">${statIcon(icon)}${text}</span>`;
    // 每行一条等级；窄屏用可换行布局，分支带来的额外属性不会横向溢出。
    const rows = [1, 2, 3, 4, 5].map(level => ({ level, lines: weaponStats(def.id, level, 'a') }));
    const stats = rows.map(({ level, lines }) =>
      `<div class="codex-level"><i>Lv.${level}</i>${lines.map(s2 => l(s2.icon, s2.text)).join('')}</div>`).join('');
    const branches = def.branches
      ? `<div class="codex-branches">${def.branches.map(b => `<span><b>Lv.3 ${b.name}</b>${b.note}</span>`).join('')}</div>`
      : '';
    const branchNote = def.branches
      ? `<p class="codex-branch-note">Lv.3+ 数值按分支 A「${def.branches[0].name}」展示；分支 B「${def.branches[1].name}」的差异见上方。</p>`
      : '';
    document.getElementById('codex-detail-body')!.innerHTML = `
      <div class="codex-detail-head">${artFor(def)}
        <div><h3><i class="mount-badge">${def.id} · ${MOUNT_NAMES[def.mount]}</i>${def.name}<small>${def.family}家族</small></h3>
        <p class="weapon-blurb">${def.blurb}</p></div>
      </div>
      ${branches}
      <div class="codex-stats">${stats}</div>${branchNote}
      <p class="codex-compat">酱料兼容：${sauceCompat(def)}</p>`;
    document.getElementById('codex-pos')!.textContent = `${this.detailIndex + 1} / ${list.length}`;
    document.getElementById('codex-detail')?.classList.remove('hidden');
  }
}
