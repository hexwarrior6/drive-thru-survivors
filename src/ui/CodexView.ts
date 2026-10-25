import { WEAPONS, weaponStats, MOUNT_NAMES, type WeaponDef } from '../combat/weaponCatalog';
import { SAUCES } from '../combat/sauces';
import { FOOD_DATA_URLS } from '../data/foodArt';
import { statIcon } from './icons';

/** 弹丸/展示图：专属武器用固定美术 key，通用条目用 starter 兜底。 */
function artFor(def: WeaponDef): string {
  const key = def.artKey ?? 'food-starter';
  const url = FOOD_DATA_URLS[key];
  return url ? `<img src="${url}" alt="" draggable="false">` : '<span class="codex-art-fallback"></span>';
}

/**
 * 武器图鉴（§13 第三阶段）：全部 32 件目录武器的单独页——行为与弱点、
 * 分支、逐级数值与酱料兼容规格，与实际开火读取同一份定义。
 */
export class CodexView {
  private open_ = false;
  constructor() {
    const panel = document.getElementById('codex-panel');
    const button = document.getElementById('codex-open');
    if (!panel || !button) return;
    button.classList.remove('hidden');
    button.addEventListener('click', () => this.setOpen(true));
    const close = document.getElementById('codex-close');
    close?.addEventListener('click', () => this.setOpen(false));
  }
  private setOpen(open: boolean): void {
    this.open_ = open;
    document.getElementById('codex-panel')!.classList.toggle('hidden', !open);
  }
  get isOpen(): boolean { return this.open_; }
  /** 渲染整本图鉴；每次打开重建（条目静态，代价可忽略）。 */
  render(): void {
    const list = document.getElementById('codex-list')!;
    list.replaceChildren();
    const compat = new Map<string, string[]>();
    for (const sauce of SAUCES) compat.set(sauce.key, sauce.targets.split(' · '));
    for (const def of WEAPONS) {
      if (def.family === '服务' || def.family === '通用') continue;
      const card = document.createElement('article');
      card.className = 'codex-card';
      const compatKeys = SAUCES.filter(s => {
        if (s.key === 'crema' || s.key === 'chili') return true;
        if (s.key === 'ketchup') return ['scatter', 'W01', 'W02', 'W03', 'W04', 'W05', 'W08', 'W09', 'W10', 'W11', 'W15', 'W18', 'W23', 'W30'].includes(def.id);
        if (s.key === 'sweetSour') return def.wall === true;
        return false;
      }).map(s => s.label);
      const branches = def.branches
        ? `<div class="codex-branches">${def.branches.map(b => `<span><b>${b.name}</b>${b.note}</span>`).join('')}</div>`
        : '';
      const stats = [1, 3, 5].map(level => {
        const lines = weaponStats(def.id, level, 'a').map(l => `<span class="stat">${statIcon(l.icon)}${l.text}</span>`).join('');
        return `<div class="codex-level"><i>Lv.${level}</i>${lines}</div>`;
      }).join('');
      card.innerHTML = `
        <div class="codex-art">${artFor(def)}</div>
        <div class="codex-body">
          <h3><i class="mount-badge">${def.id} · ${MOUNT_NAMES[def.mount]}</i>${def.name}<small>${def.family}家族</small></h3>
          <p class="weapon-blurb">${def.blurb}</p>
          ${branches}
          <div class="codex-stats">${stats}</div>
          <p class="codex-compat">酱料兼容：${compatKeys.join(' · ') || '仅调味类（辣椒 / 奶油咖啡）'}</p>
        </div>`;
      list.append(card);
    }
  }
}
