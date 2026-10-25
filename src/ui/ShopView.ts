import { productHighlight } from '../data/menuDiscovery';
import { FOOD_DATA_URLS, variantKeyFor } from '../data/foodArt';
import { weaponById, weaponStats, moduleById, MOUNT_NAMES, MODULES, type BranchId } from '../combat/weaponCatalog';
import { identityFor } from '../combat/foodIdentity';
import type { ShopSystem, Wallet } from '../systems/ShopSystem';
import { MAX_WEAPON_LEVEL } from '../systems/balance';
import { statIcon } from './icons';
/** Per-product art: the same baked variant texture the bullets use, as a data URL. */
function productArt(group: string, name: string): string {
  const key = variantKeyFor(group as never, name);
  const url = FOOD_DATA_URLS[key];
  return url ? `<img src="${url}" alt="" draggable="false">` : '';
}
function slotArt(art: string): string {
  const url = FOOD_DATA_URLS[art];
  return url ? `<img src="${url}" alt="" draggable="false">` : '<span class="slot-icon-empty"></span>';
}
function node(tag: string, text: string, className = ''): HTMLElement { const e = document.createElement(tag); e.textContent = text; e.className = className; return e; }
export class ShopView {
  private expandedMenu = false;
  constructor(private readonly shop: ShopSystem, private readonly wallet: Wallet, private readonly reason: string, private readonly changed: () => void) {}
  open(wave: number): void { this.shop.open(wave); this.expandedMenu = false; this.render(); }
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
    const menu = document.getElementById('menu-products')!; menu.replaceChildren();
    s.offers.forEach((p, i) => {
      const wid = s.weaponFor(p), def = weaponById(wid);
      const same = s.equipped(p), level = same?.level ?? 0;
      const next = s.sold.has(i) ? (same?.level ?? 1) : Math.min(MAX_WEAPON_LEVEL, level + 1);
      const cost = s.price(p, level);
      const identity = identityFor(p.name, p.category);
      const generic = def.family === '通用';
      const card = node('article', '', i < 3 ? 'food-card' : 'food-card menu-card');
      const art = node('div', '', 'food-art'); art.innerHTML = productArt(identity.artGroup, p.name); card.append(art);
      const highlight = productHighlight(p);
      if (highlight) card.append(node('span', highlight, 'product-highlight'));
      card.append(node('h3', p.name));
      // §9.3 第 1 行：真实餐品名与专属武器名并列，家族作次级标签。
      const title = node('b', ''); title.innerHTML = `<i class="mount-badge">${generic ? '通用改装' : `专属 · ${identity.label}`}</i>${p.name} → ${def.name}｜${MOUNT_NAMES[def.mount]}${next > 1 ? ` Lv.${next}` : ''}`;
      card.append(title);
      // §9.3 第 2 行：一句行为与弱点。
      card.append(node('p', def.blurb, 'weapon-blurb'));
      // §9.3 第 3 行：本次变化；Lv.3 需要显式选择互斥分支。
      const desc = node('p', '');
      const change = same ? `升阶 Lv.${level}→${next}` : '购买 · Lv.1';
      desc.innerHTML = `<span class="stat">${change}</span>` + weaponStats(wid, next, same?.branch).map(st => `<span class="stat">${statIcon(st.icon)}${st.text}</span>`).join('');
      card.append(desc);
      if (s.needsBranch(p) && !s.sold.has(i)) {
        const branches = node('div', '', 'branch-buttons');
        for (const b of def.branches ?? []) {
          const button = node('button', '') as HTMLButtonElement;
          button.type = 'button';
          button.innerHTML = `<b>${b.name}</b><small>${b.note}</small>`;
          button.disabled = w.money < cost;
          button.addEventListener('click', () => { s.buy(i, w, -1, b.id as BranchId); this.render(); this.changed(); });
          branches.append(button);
        }
        branches.append(node('small', 'Lv.3 二选一 · 进站选择，暂不可更改', 'branch-hint'));
        card.append(branches);
      } else {
        const button = node('button', '') as HTMLButtonElement;
        const discounted = s.discount < 1 && !s.sold.has(i) && level < MAX_WEAPON_LEVEL;
        if (s.sold.has(i)) button.textContent = '已购入';
        else if (level >= MAX_WEAPON_LEVEL) button.textContent = '已满阶';
        else button.innerHTML = `<span>${same ? `升阶 Lv.${level + 1}` : '购买'}</span><span class="price">${discounted ? `<s>${s.listPrice(p, level)}</s>` : ''}${statIcon('coin', 11)}${cost}</span>`;
        button.disabled = s.sold.has(i) || level >= MAX_WEAPON_LEVEL || w.money < cost;
        button.addEventListener('click', () => { s.buy(i, w); this.render(); this.changed(); }); card.append(button);
      }
      if (i < 3) cards.append(card); else menu.append(card);
    });
    const details = document.getElementById('store-menu') as HTMLDetailsElement;
    details.classList.toggle('hidden', s.offers.length <= 3); details.open = this.expandedMenu;
    details.ontoggle = () => { this.expandedMenu = details.open; };
    document.getElementById('menu-summary')!.textContent = `查看其他 ${Math.max(0, s.offers.length - 3)} 款餐品 · 共 ${s.offers.length} 款已核价`;
    // ---- 游戏改装服务（§9.1）：免费前炮、车辆模块、无材料时的升阶兜底。 ----
    const services = document.getElementById('shop-services')!; services.replaceChildren();
    services.append(node('span', '游戏改装服务 · 与门店餐品分开结算', 'service-heading'));
    if (s.freeFrontAvailable()) {
      const card = node('div', '', 'service-card');
      card.append(node('b', '基础前炮安装 · 免费'));
      card.append(node('p', '第一站统一补全前向火力；这是游戏服务，不是门店赠品，也不影响餐品标价。', 'service-note'));
      const button = node('button', '免费安装') as HTMLButtonElement;
      button.addEventListener('click', () => { s.installFrontService(); this.render(); this.changed(); });
      card.append(button); services.append(card);
    }
    for (const mod of MODULES) {
      const installed = s.moduleInstalled(mod.id);
      const card = node('div', '', 'service-card');
      card.append(node('b', `${mod.name} · 车辆模块`));
      card.append(node('p', mod.note, 'service-note'));
      const button = node('button', '') as HTMLButtonElement;
      if (installed) { button.textContent = '已安装'; button.disabled = true; }
      else {
        const cost = s.modulePrice(mod.id);
        button.innerHTML = `安装 · ${statIcon('coin', 11)}${cost}`;
        button.disabled = w.money < cost;
        button.addEventListener('click', () => { s.buyModule(mod.id, w); this.render(); this.changed(); });
      }
      card.append(button); services.append(card);
    }
    for (let i = 0; i < 2; i++) {
      const weapon = s.slots[i];
      if (!weapon || weapon.level >= MAX_WEAPON_LEVEL || !s.lacksMaterial(weapon)) continue;
      const def = weaponById(weapon.weaponId);
      if (def.family === '服务') continue;
      const card = node('div', '', 'service-card');
      card.append(node('b', `改装服务 · ${def.name} Lv.${weapon.level}→${weapon.level + 1}`));
      card.append(node('p', '本店没有能喂养这件武器的餐品；用改装服务直接升阶，价格单独列示。', 'service-note'));
      const cost = s.upgradeServiceCost(i);
      if (weapon.level + 1 === 3 && !weapon.branch && def.branches) {
        const branches = node('div', '', 'branch-buttons');
        for (const b of def.branches) {
          const button = node('button', '') as HTMLButtonElement;
          button.type = 'button';
          button.innerHTML = `<b>${b.name}</b><small>${b.note}</small>`;
          button.disabled = w.money < cost;
          button.addEventListener('click', () => { s.upgradeService(i, w, b.id as BranchId); this.render(); this.changed(); });
          branches.append(button);
        }
        card.append(branches);
      } else {
        const button = node('button', '') as HTMLButtonElement;
        button.innerHTML = `升阶 · ${statIcon('coin', 11)}${cost}`;
        button.disabled = w.money < cost;
        button.addEventListener('click', () => { s.upgradeService(i, w); this.render(); this.changed(); });
        card.append(button);
      }
      services.append(card);
    }
    services.classList.toggle('hidden', services.children.length <= 1);
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
          b.innerHTML = `<span class="slot-icon slot-icon-empty"></span><span class="slot-empty">${group.label} · 空</span>`;
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
  }
}
