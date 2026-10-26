import { productHighlight } from '../data/menuDiscovery';
import { FOOD_DATA_URLS, variantKeyFor } from '../data/foodArt';
import { weaponById, weaponStats, moduleById, MOUNT_NAMES, MODULES, type BranchId } from '../combat/weaponCatalog';
import { identityFor } from '../combat/foodIdentity';
import type { ShopSystem, Wallet } from '../systems/ShopSystem';
import { MAX_WEAPON_LEVEL } from '../systems/balance';
import { statIcon } from './icons';
/** Per-product art: the same baked variant texture the bullets use, as a data URL. */
function productArt(group: string, name: string): string {
  const url = FOOD_DATA_URLS[variantKeyFor(group as never, name)];
  return url ? `<img src="${url}" alt="" draggable="false">` : '';
}
/** 武器固定美术（详情弹层头图）；无 artKey 时回落餐品图。 */
function weaponArt(artKey: string | undefined, group: string, name: string): string {
  const url = (artKey && FOOD_DATA_URLS[artKey]) || FOOD_DATA_URLS[variantKeyFor(group as never, name)];
  return url ? `<img src="${url}" alt="" draggable="false">` : '';
}
function slotArt(art: string): string {
  const url = FOOD_DATA_URLS[art];
  return url ? `<img src="${url}" alt="" draggable="false">` : '<span class="slot-icon-empty"></span>';
}
function node(tag: string, text: string, className = ''): HTMLElement { const e = document.createElement(tag); e.textContent = text; e.className = className; return e; }
export class ShopView {
  private detail: { wid: string; productName: string; identityLabel: string; next: number; branch?: BranchId } | null = null;
  constructor(private readonly shop: ShopSystem, private readonly wallet: Wallet, private readonly reason: string, private readonly changed: () => void) {
    const close = document.getElementById('shop-detail-close');
    if (close) close.onclick = () => { this.detail = null; this.renderDetail(); };
    const detailPanel = document.getElementById('shop-detail');
    if (detailPanel) detailPanel.onclick = e => {
      if (e.target === detailPanel) { this.detail = null; this.renderDetail(); }
    };
    const reroll = document.getElementById('shop-reroll') as HTMLButtonElement | null;
    if (reroll) reroll.onclick = () => {
      if (this.shop.reroll(this.wallet) !== 'rolled') return;
      this.detail = null;
      this.render();
      this.changed();
    };
  }
  open(wave: number): void { this.shop.open(wave); this.detail = null; this.render(); }
  private render(): void {
    const s = this.shop, w = this.wallet;
    document.getElementById('shop-source')!.textContent = this.reason + (s.store.referenceTime ? ' · 预约菜单参考 ' + s.store.referenceTime : '');
    document.getElementById('pit-heading')!.textContent = s.store.name;
    document.getElementById('shop-address')!.textContent = s.store.address;
    const coupon = document.getElementById('shop-coupon')!;
    coupon.classList.toggle('hidden', s.discount >= 1);
    if (s.discount < 1) coupon.textContent = `🎫 ${s.couponTitle} · 本站特惠 ${Math.round(s.discount * 10)} 折，划线价为原价`;
    const campaign = document.getElementById('pit-campaign')!;
    campaign.textContent = s.snapshot.campaign;
    campaign.hidden = !s.snapshot.campaign;
    const cards = document.getElementById('shop-cards')!; cards.replaceChildren();
    // 三张推荐卡只要有一张带推荐标签，就统一预留标签行，避免标题高低不齐。
    const featuredHighlight = s.offers.slice(0, 3).some(productHighlight);
    s.offers.forEach((p, i) => {
      const wid = s.weaponFor(p), def = weaponById(wid);
      const same = s.equipped(p), level = same?.level ?? 0;
      const next = s.sold.has(i) ? (same?.level ?? 1) : Math.min(MAX_WEAPON_LEVEL, level + 1);
      const cost = s.price(p, level);
      const identity = identityFor(p.name, p.category);
      const generic = def.family === '通用';
      const card = node('article', '', 'food-card');
      // 行式卡片：头图 | 餐品名+武器行 | 详情；规格全部收进弹层。
      const cardRow = node('div', '', 'food-card-row');
      const art = node('div', '', 'food-art'); art.innerHTML = productArt(identity.artGroup, p.name); cardRow.append(art);
      const cardMain = node('div', '', 'food-card-main');
      const highlight = productHighlight(p);
      if (highlight || (i < 3 && featuredHighlight)) cardMain.append(node('span', highlight, 'product-highlight'));
      cardMain.append(node('h3', p.name));
      // 卡面只留 武器名 · 挂载；专属身份在详情弹层交代（窄卡上是冗余噪声）。
      const title = node('b', ''); title.innerHTML = `${generic ? '通用改装' : ''}${def.name} · ${MOUNT_NAMES[def.mount]}${next > 1 ? ` · Lv.${next}` : ''}`;
      cardMain.append(title);
      // 基础数值直接上卡面（首要一行）；完整规格与描述在详情弹层。
      const stats = node('div', '', 'food-card-stats');
      stats.innerHTML = weaponStats(wid, next, same?.branch).slice(0, 1).map(st => `<span class="stat">${statIcon(st.icon)}${st.text}</span>`).join('');
      cardMain.append(stats);
      const detailButton = node('button', '详情', 'card-detail-button') as HTMLButtonElement;
      detailButton.type = 'button';
      detailButton.setAttribute('aria-label', `查看 ${p.name} 详情`);
      detailButton.addEventListener('click', () => { this.detail = { wid, productName: p.name, identityLabel: identity.label, next, branch: same?.branch }; this.renderDetail(); });
      cardMain.append(detailButton);
      cardRow.append(cardMain);
      card.append(cardRow);
      // 卡片脚部只放一个主操作：购买或分支二选一，按钮宽度齐平。
      const foot = node('div', '', 'food-card-foot');
      if (s.needsBranch(p) && !s.sold.has(i)) {
        const branches = node('div', '', 'branch-buttons');
        for (const b of def.branches ?? []) {
          const button = node('button', '') as HTMLButtonElement;
          button.type = 'button';
          button.innerHTML = `<b>${b.name}</b>`;
          button.disabled = w.money < cost;
          button.addEventListener('click', () => { s.buy(i, w, -1, b.id as BranchId); this.render(); this.changed(); });
          branches.append(button);
        }
        foot.append(branches);
      } else {
        const button = node('button', '', 'buy-button') as HTMLButtonElement;
        const discounted = s.discount < 1 && !s.sold.has(i) && level < MAX_WEAPON_LEVEL;
        if (s.sold.has(i)) button.textContent = '已购入';
        else if (level >= MAX_WEAPON_LEVEL) button.textContent = '已满阶';
        else button.innerHTML = `<span>${same ? '升阶' : '购买'}</span><span class="price">${discounted ? `<s>${s.listPrice(p, level)}</s>` : ''}${statIcon('coin', 11)}${cost}</span>`;
        button.disabled = s.sold.has(i) || level >= MAX_WEAPON_LEVEL || w.money < cost;
        button.addEventListener('click', () => { s.buy(i, w); this.render(); this.changed(); });
        foot.append(button);
      }
      card.append(foot);
      cards.append(card);
    });
    const rerollCost = s.rerollPrice();
    const canReroll = s.canReroll();
    const reroll = document.getElementById('shop-reroll') as HTMLButtonElement;
    const affordable = w.money >= rerollCost;
    const rerollHint = document.getElementById('shop-reroll-hint')!;
    reroll.disabled = !canReroll || !affordable;
    if (!canReroll) rerollHint.textContent = '暂无可换餐品';
    else if (!affordable) rerollHint.innerHTML = `金币不足 · ${statIcon('coin', 11)}${rerollCost}`;
    else rerollHint.innerHTML = `换一批 · ${statIcon('coin', 11)}${rerollCost} ↻`;
    reroll.setAttribute('aria-label', canReroll
      ? `重投菜单，需要 ${rerollCost} 金币，换一批已核价餐品`
      : '重投菜单，暂无可换餐品');
    // ---- 游戏改装服务（§9.1）：免费前炮、车辆模块、无材料时的升阶兜底。 ----
    const services = document.getElementById('shop-services')!; services.replaceChildren();
    services.append(node('span', '改装服务', 'service-heading'));
    const grid = node('div', '', 'service-grid');
    // 免费前炮：第一站才有，作为网格首位。
    if (s.freeFrontAvailable()) {
      const cell = node('div', '', 'service-cell') as HTMLDivElement;
      cell.title = '第一站统一补全前向火力；游戏服务，不影响餐品标价。';
      cell.append(node('b', '基础前炮'));
      const button = node('button', '免费安装') as HTMLButtonElement;
      button.addEventListener('click', () => { s.installFrontService(); this.render(); this.changed(); });
      cell.append(button); grid.append(cell);
    }
    for (const mod of MODULES) {
      const installed = s.moduleInstalled(mod.id);
      const cell = node('div', '', 'service-cell') as HTMLDivElement;
      cell.title = mod.note;
      cell.append(node('b', mod.name));
      const button = node('button', '') as HTMLButtonElement;
      if (installed) { button.textContent = '已安装'; button.disabled = true; }
      else {
        const cost = s.modulePrice(mod.id);
        button.innerHTML = `${statIcon('coin', 11)}${cost}`;
        button.disabled = w.money < cost;
        button.addEventListener('click', () => { s.buyModule(mod.id, w); this.render(); this.changed(); });
      }
      cell.append(button); grid.append(cell);
    }
    // 无材料升阶兜底：同样以格子呈现（有分支选择时展开分支按钮行）。
    for (let i = 0; i < 2; i++) {
      const weapon = s.slots[i];
      if (!weapon || weapon.level >= MAX_WEAPON_LEVEL || !s.lacksMaterial(weapon)) continue;
      const def = weaponById(weapon.weaponId);
      if (def.family === '服务') continue;
      const cost = s.upgradeServiceCost(i);
      const cell = node('div', '', 'service-cell') as HTMLDivElement;
      cell.title = '本店没有能喂养这件武器的餐品；用改装服务直接升阶。';
      cell.append(node('b', `${def.name} Lv.${weapon.level + 1}`));
      if (weapon.level + 1 === 3 && !weapon.branch && def.branches) {
        cell.classList.add('expanded');
        const branches = node('div', '', 'branch-buttons');
        for (const b of def.branches) {
          const button = node('button', '') as HTMLButtonElement;
          button.type = 'button';
          button.innerHTML = `<b>${b.name}</b><small>${b.note}</small>`;
          button.disabled = w.money < cost;
          button.addEventListener('click', () => { s.upgradeService(i, w, b.id as BranchId); this.render(); this.changed(); });
          branches.append(button);
        }
        cell.append(branches);
      } else {
        const button = node('button', '') as HTMLButtonElement;
        button.innerHTML = `升阶 ${statIcon('coin', 11)}${cost}`;
        button.disabled = w.money < cost;
        button.addEventListener('click', () => { s.upgradeService(i, w); this.render(); this.changed(); });
        cell.append(button);
      }
      grid.append(cell);
    }
    services.append(grid);
    services.classList.toggle('hidden', grid.children.length === 0);
    // ---- 槽位：1 前 + 1 后 + 3 模块；替换时只允许选目标挂载。 ----
    const slots = document.getElementById('weapon-slots')!; slots.replaceChildren();
    const pendingMounts = s.pending >= 0 && s.offers[s.pending] ? s.mountsFor(s.weaponFor(s.offers[s.pending])) : [];
    const groups: { label: string; indexes: number[] }[] = [
      { label: '前武器', indexes: [0] },
      { label: '后武器', indexes: [1] },
      { label: '车辆模块', indexes: [2, 3, 4] },
    ];
    for (const group of groups) {
      const label = node('span', group.label, 'slot-group-label');
      label.style.gridColumn = `${group.indexes[0] + 1} / span ${group.indexes.length}`;
      label.style.gridRow = '1';
      slots.append(label);
      for (const i of group.indexes) {
        const weapon = s.slots[i];
        const eligible = pendingMounts.includes(i);
        const b = node('button', '', `weapon-slot${pendingMounts.length ? (eligible ? ' replaceable' : ' locked') : ''}${s.selected === i ? ' selected' : ''}`) as HTMLButtonElement;
        b.style.gridColumn = String(i + 1); b.style.gridRow = '2';
        if (weapon && i < 2) {
          const def = weaponById(weapon.weaponId);
          b.innerHTML = `<span class="slot-icon">${slotArt(weapon.art)}</span><span class="slot-name">${def.name}${weapon.branch ? ' · ' + (def.branches?.find(x => x.id === weapon.branch)?.name ?? '') : ''}</span><span class="slot-level">Lv.${weapon.level}</span>`;
        } else if (weapon) {
          b.innerHTML = `<span class="slot-icon">${slotArt('')}</span><span class="slot-name">${moduleById(weapon.weaponId)?.name ?? weapon.name}</span><span class="slot-level">已装</span>`;
        } else {
          b.innerHTML = `<span class="slot-icon slot-icon-empty"></span><span class="slot-empty">空</span>`;
        }
        b.disabled = pendingMounts.length === 0 || !eligible;
        b.addEventListener('click', () => { s.selected = i; this.render(); }); slots.append(b);
      }
    }
    // ---- 替换确认：净花费与损失提示（§9.2）。 ----
    const pending = document.getElementById('replacement')!; pending.classList.toggle('hidden', s.pending < 0);
    const confirm = document.getElementById('confirm-replace') as HTMLButtonElement;
    if (s.pending >= 0 && s.offers[s.pending]) {
      const p = s.offers[s.pending];
      const old = s.selected >= 0 ? s.slots[s.selected] : null;
      const credit = s.selected >= 0 ? s.replacementCredit(s.selected) : 0;
      const net = Math.max(1, s.price(p, s.equipped(p)?.level ?? 0) - credit);
      const oldDef = old ? weaponById(old.weaponId) : null;
      const losses: string[] = [];
      if (old && old.level > 1) losses.push(`损失 Lv.${old.level}`);
      if (old?.branch) losses.push(`损失分支「${oldDef?.branches?.find(b => b.id === old.branch)?.name ?? old.branch}」`);
      const note = document.getElementById('replacement-note')!;
      note.textContent = `替换 ${oldDef?.name ?? ''}：抵扣 ${credit} · 净花费 ${net}${losses.length ? ' · ' + losses.join(' · ') : ''}`;
      confirm.disabled = s.selected < 0 || w.money < net;
      confirm.onclick = () => { s.buy(s.pending, w, s.selected, s.pendingBranch); this.render(); this.changed(); };
    } else { confirm.disabled = true; }
    document.getElementById('cancel-replace')!.onclick = () => { s.pending = s.selected = -1; s.pendingBranch = undefined; this.render(); };
    const cost = s.repairCost();
    const repair = document.getElementById('repair') as HTMLButtonElement; repair.disabled = w.money < cost || w.health >= 100;
    repair.textContent = `维修 +30 车况 · ${cost} 金币`;
    repair.onclick = () => { s.repair(w); this.render(); this.changed(); };
    this.renderDetail();
  }
  /** 卡片详情弹层：完整行为弱点 / 逐级数值 / 酱料兼容（图鉴同源定义）。 */
  private renderDetail(): void {
    const panel = document.getElementById('shop-detail')!;
    if (!this.detail) { panel.classList.add('hidden'); return; }
    const { wid, productName, identityLabel, next, branch } = this.detail;
    const def = weaponById(wid);
    const lines = weaponStats(wid, next, branch).map(st => `<span class="stat">${statIcon(st.icon)}${st.text}</span>`).join('');
    const branches = def.branches
      ? `<div class="codex-branches">${def.branches.map(b => `<span><b>Lv.3 ${b.name}</b>${b.note}</span>`).join('')}</div>`
      : '';
    document.getElementById('shop-detail-body')!.innerHTML = `
      <div class="codex-detail-head">${weaponArt(def.artKey, identityFor(productName, 'main').artGroup, productName)}
        <div><h3>${productName}<small> → ${def.name}</small></h3>
        <p class="weapon-blurb">${def.blurb}</p></div>
      </div>${branches}
      <div class="shop-detail-stats"><i>Lv.${next}</i>${lines}</div>
      <p class="codex-compat">专属身份：${identityLabel} · ${def.family}家族 · ${MOUNT_NAMES[def.mount]}</p>`;
    panel.classList.remove('hidden');
  }
}
