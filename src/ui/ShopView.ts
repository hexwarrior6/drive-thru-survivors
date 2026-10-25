import { productHighlight } from '../data/menuDiscovery';
import { mapProductToWeapon, mountNames, mountOf, weaponNames, weaponStats, MAX_WEAPON_LEVEL, type WeaponType } from '../combat/weaponMapper';
import { FOOD_DATA_URLS, variantKeyFor } from '../data/foodArt';
import type { ShopSystem, Wallet } from '../systems/ShopSystem';
import { statIcon } from './icons';
const icons = {
 burger: '<path fill="#edb355" d="M10 30Q12 8 36 8T62 30Z"/><path stroke="#754329" stroke-width="9" d="M12 39h48"/><path stroke="#8bbf57" stroke-width="5" d="m10 32 15 4 12-4 12 4 13-4"/><path fill="#edb355" d="M10 45h52q0 12-12 12H22Q10 57 10 45"/>',
 fries: '<path stroke="#ffcf52" stroke-width="7" d="m20 34-2-24m13 24V5m11 29 2-26m8 29 8-21"/><path fill="#e75239" d="m11 28 8 32h36l8-32q-26 12-52 0"/><path stroke="#ffcf52" stroke-width="3" fill="none" d="M27 48q0-17 8-4 8-13 8 4"/>',
 dessert: '<path fill="#edb355" stroke="#754329" stroke-width="2" d="m10 29 26-18 27 18-8 29H18Z"/><path stroke="#fff9e8" stroke-width="4" d="m23 27 20 23m-3-27L24 49"/><path fill="#ad4931" d="m10 29 53 0-27 9Z"/>' ,
 drink: '<path fill="#80c6c3" stroke="#754329" stroke-width="2" d="m17 22 6 38h29l5-38Z"/><path stroke="#e75239" stroke-width="4" d="m38 26 5-20h13"/><path stroke="#754329" stroke-width="3" d="M14 22h46"/><circle fill="#fff9e8" cx="36" cy="42" r="8"/>',
};
/** Legacy per-category SVG, kept as the fallback when boot textures are absent (tests). */
function foodIcon(type: string): string { return `<svg viewBox="0 0 72 68" aria-hidden="true">${type === 'heal' || type === 'shield' || type === 'wingman' ? icons.dessert : type === 'burger' || type === 'flame' || type === 'starter' || type === 'missile' ? icons.burger : type === 'fries' || type === 'mine' ? icons.fries : icons.drink}</svg>`; }
/** Per-product art: the same baked variant texture the bullets use, as a data URL. */
function foodArt(type: WeaponType, name: string): string {
  const url = FOOD_DATA_URLS[variantKeyFor(type, name)];
  return url ? `<img src="${url}" alt="" draggable="false">` : foodIcon(type);
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
      const type = mapProductToWeapon(p), mount = mountOf(type), same = s.equipped(p), level = same?.level ?? 0;
      const next = s.sold.has(i) ? (same?.level ?? 1) : Math.min(MAX_WEAPON_LEVEL, level + 1);
      const cost = s.price(p, level);
      const card = node('article', '', i < 3 ? 'food-card' : 'food-card menu-card');
      const art = node('div', '', 'food-art'); art.innerHTML = foodArt(type, p.name); card.append(art);
      const highlight = productHighlight(p);
      if (highlight) card.append(node('span', highlight, 'product-highlight'));
      card.append(node('h3', p.name));
      const title = node('b', ''); title.innerHTML = `<i class="mount-badge">${mountNames[mount]}</i>${weaponNames[type]} Lv.${next}`;
      card.append(title);
      const desc = node('p', '');
      desc.innerHTML = weaponStats(type, next).map(s => `<span class="stat">${statIcon(s.icon)}${s.text}</span>`).join('');
      card.append(desc);
      const button = node('button', '') as HTMLButtonElement;
      const discounted = s.discount < 1 && !s.sold.has(i) && level < MAX_WEAPON_LEVEL;
      if (s.sold.has(i)) button.textContent = '已购入';
      else if (level >= MAX_WEAPON_LEVEL) button.textContent = '已满阶';
      else button.innerHTML = `<span>${same ? `升阶 Lv.${level + 1}` : '购买'}</span><span class="price">${discounted ? `<s>${s.listPrice(p, level)}</s>` : ''}${statIcon('coin', 11)}${cost}</span>`;
      button.disabled = s.sold.has(i) || level >= MAX_WEAPON_LEVEL || w.money < cost;
      button.addEventListener('click', () => { s.buy(i, w); this.render(); this.changed(); }); card.append(button); if (i < 3) cards.append(card); else menu.append(card);
    });
    const details = document.getElementById('store-menu') as HTMLDetailsElement;
    details.classList.toggle('hidden', s.offers.length <= 3); details.open = this.expandedMenu;
    details.ontoggle = () => { this.expandedMenu = details.open; };
    document.getElementById('menu-summary')!.textContent = `查看其他 ${Math.max(0,s.offers.length - 3)} 款餐品 · 共 ${s.offers.length} 款已核价`;
    const slots = document.getElementById('weapon-slots')!; slots.replaceChildren();
    // Grouped mounts: [0] front gun, [1] rear gun, [2..4] aux passives. Only slots
    // matching the pending offer's mount are selectable during a replacement.
    const pendingMounts = s.pending >= 0 && s.offers[s.pending] ? s.mountsFor(mapProductToWeapon(s.offers[s.pending])) : [];
    const groups: { label: string; column: string; indexes: number[] }[] = [
      { label: '前炮台', column: '1', indexes: [0] },
      { label: '后炮台', column: '2', indexes: [1] },
      { label: '辅助位', column: '3 / -1', indexes: [2, 3, 4] },
    ];
    for (const group of groups) {
      const label = node('span', group.label, 'slot-group-label');
      label.style.gridColumn = group.column; label.style.gridRow = '1';
      slots.append(label);
      for (const i of group.indexes) {
        const weapon = s.slots[i];
        const eligible = pendingMounts.includes(i);
        const b = node('button', '', `weapon-slot${pendingMounts.length ? (eligible ? ' replaceable' : ' locked') : ''}${s.selected === i ? ' selected' : ''}`) as HTMLButtonElement;
        b.style.gridColumn = String(i + 1); b.style.gridRow = '2';
        b.innerHTML = weapon
          ? `<span class="slot-icon">${foodArt(weapon.type, weapon.name)}</span><span class="slot-name">${weaponNames[weapon.type]}</span><span class="slot-level">Lv.${weapon.level}</span>`
          : `<span class="slot-icon slot-icon-empty"></span><span class="slot-empty">${group.label} · 空</span>`;
        b.disabled = pendingMounts.length === 0 || !eligible;
        b.addEventListener('click', () => { s.selected = i; this.render(); }); slots.append(b);
      }
    }
    const pending = document.getElementById('replacement')!; pending.classList.toggle('hidden', s.pending < 0);
    const confirm = document.getElementById('confirm-replace') as HTMLButtonElement;
    confirm.disabled = s.selected < 0;
    confirm.onclick = () => { s.buy(s.pending, w, s.selected); this.render(); this.changed(); };
    document.getElementById('cancel-replace')!.onclick = () => { s.pending = s.selected = -1; this.render(); };
    const cost = s.repairCost();
    const repair = document.getElementById('repair') as HTMLButtonElement; repair.disabled = w.money < cost || w.health >= 100;
    repair.textContent = `维修 +30 车况 · ${cost} 金币`;
    repair.onclick = () => { s.repair(w); this.render(); this.changed(); };
  }
}
