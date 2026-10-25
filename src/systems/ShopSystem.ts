import { discoveryScore } from '../data/menuDiscovery';
import type { Product, Snapshot, Store } from '../data/snapshot';
import { identityFor, resolveArt } from '../combat/foodIdentity';
import { weaponById, moduleById, type BranchId } from '../combat/weaponCatalog';
import {
  repairCost as repairCostAt, upgradeCostMultiplier, MAX_WEAPON_LEVEL,
  MODULE_PRICES, SERVICE_UPGRADE_BASE, REPLACE_CREDIT, FREE_FRONT_WAVE,
} from './balance';

/** 五槽语义（§4.1）：[0] 前武器 · [1] 后武器 · [2..4] 车辆模块；酱料独立收藏不占槽。 */
export interface EquippedWeapon { weaponId: string; name: string; level: number; cooldown: number; branch?: BranchId; invested: number; art: string }
export interface Wallet { money: number; health: number }
export const SLOT_FRONT = 0;
export const SLOT_REAR = 1;
export const MODULE_SLOTS = [2, 3, 4];

function scatterGun(): EquippedWeapon {
  return { weaponId: 'scatter', name: '初始散弹炮', level: 1, cooldown: 0, invested: 0, art: 'food-starter' };
}

export class ShopSystem {
  /** 开局后槽是可替换的初始散弹（§4.2）：获得任意后武器即整体替换，不再叠加。 */
  readonly slots: (EquippedWeapon | null)[] = [null, scatterGun(), null, null, null];
  offers: Product[] = [];
  sold = new Set<number>();
  pending = -1;
  /** 替换流程记忆的分支选择：Lv.3 替换购买时确认按钮沿用（§6）。 */
  pendingBranch?: BranchId;
  selected = -1;
  store!: Store;
  wave = 1;
  /** Store promotion derived from the snapshot's real coupon titles (game-side discount). */
  discount = 1;
  couponTitle = '';
  /** Deterministic stop order; readable for run saves. */
  readonly route: Store[] = [];
  readonly bag: Store[] = [];
  constructor(readonly snapshot: Snapshot, private random = Math.random) {}
  destination(wave: number): Store {
    while (this.route.length < wave) {
      if (!this.bag.length) {
        this.bag.push(...this.snapshot.stores);
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
        // Visit every loaded store before repeating, with no adjacent repeat at a bag boundary.
        const last = this.route[this.route.length - 1];
        const end = this.bag.length - 1;
        if (end > 0 && this.bag[end] === last) [this.bag[0], this.bag[end]] = [this.bag[end], this.bag[0]];
      }
      this.route.push(this.bag.pop()!);
    }
    return this.route[wave - 1];
  }
  open(wave: number): void {
    this.wave = wave; this.store = this.destination(wave);
    const products = [...this.store.products];
    for (let i = products.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [products[i], products[j]] = [products[j], products[i]]; }
    products.sort((a, b) => discoveryScore(b) - discoveryScore(a));
    // 三张推荐卡优先展示已实装的专属武器（§9.2）：机制覆盖与餐品发现度并重，
    // 同一家店全给汉堡也成立——各卡的攻击预览必须不同。
    const featured = (p: Product) => {
      const def = weaponById(this.weaponFor(p));
      return def.ready && def.family !== '通用' && def.family !== '服务' ? 0 : 1;
    };
    products.sort((a, b) => featured(a) - featured(b));
    this.offers = products; this.sold.clear(); this.pending = this.selected = -1;
    const coupon = this.snapshot.coupons[0];
    if (coupon) { this.discount = 0.9; this.couponTitle = coupon.title; }
    else { this.discount = 1; this.couponTitle = ''; }
  }
  basePrice(p: Product): number { return Math.max(1, Math.ceil(p.price / 100)); }
  /** Upgrade list price at the given current level, before any coupon. */
  listPrice(p: Product, level = 0): number { return Math.max(1, Math.ceil(this.basePrice(p) * upgradeCostMultiplier(level))); }
  /** What the wallet actually pays: list price after this stop's coupon. */
  price(p: Product, level = 0): number { return Math.max(1, Math.ceil(this.listPrice(p, level) * this.discount)); }
  repairCost(): number { return repairCostAt(this.wave); }
  /** 商品 → 目录武器：身份的目标武器未实装时，显式降级为同挂载的通用改装（§4.3）。 */
  weaponFor(p: Product): string {
    const target = identityFor(p.name, p.category).weaponId;
    const def = weaponById(target);
    if (def.ready) return target;
    return def.mount === 'rear' ? 'generic-rear' : 'generic-front';
  }
  /** 同一 weaponId 的商品互相喂养升阶；不同餐品的武器不能自动吞并（§4.3）。 */
  equipped(p: Product): EquippedWeapon | undefined {
    const wid = this.weaponFor(p);
    return this.slots.find(w => w && w.weaponId === wid) ?? undefined;
  }
  mountsFor(wid: string): number[] {
    const mount = weaponById(wid).mount;
    return mount === 'front' ? [SLOT_FRONT] : mount === 'rear' ? [SLOT_REAR] : MODULE_SLOTS;
  }
  /** Lv.3 的互斥分支必须显式选择（§6）：不提供分支就不成交。
   * 只有定义了分支的武器才要求选择（通用改装没有分支，直接升阶）。 */
  needsBranch(offer: Product): boolean {
    const same = this.equipped(offer);
    const wid = same?.weaponId ?? this.weaponFor(offer);
    return (same ? same.level + 1 : 1) === 3 && !same?.branch && !!weaponById(wid).branches;
  }
  /** 替换抵扣（§9.2）：旧武器累计实际投入的 50%；赠送装备投入为零，不可套现。 */
  replacementCredit(slotIndex: number): number {
    const old = this.slots[slotIndex];
    return old && old.invested > 0 ? Math.floor(old.invested * REPLACE_CREDIT) : 0;
  }
  buy(index: number, wallet: Wallet, replacement = -1, branch?: BranchId): 'bought' | 'replace' | 'unavailable' | 'branch' {
    const p = this.offers[index];
    if (!p || this.sold.has(index)) return 'unavailable';
    const wid = this.weaponFor(p);
    const same = this.equipped(p);
    const next = same ? same.level + 1 : 1;
    if (next > MAX_WEAPON_LEVEL) return 'unavailable';
    if (next === 3 && !branch && !same?.branch && weaponById(wid).branches) return 'branch';
    const gross = this.price(p, same?.level ?? 0);
    let slot: number;
    if (same) slot = this.slots.indexOf(same);
    else {
      const empty = this.mountsFor(wid).find(i => this.slots[i] === null);
      // 后槽的初始散弹是真实占位装备：替换它是明确的玩家决定（§4.2）。
      if (empty === undefined) {
        if (replacement < 0 || !this.mountsFor(wid).includes(replacement)) { this.pending = index; this.pendingBranch = branch; return 'replace'; }
        slot = replacement;
      } else slot = empty;
    }
    const credit = same ? 0 : this.replacementCredit(slot);
    const paid = Math.max(1, gross - credit);
    if (wallet.money < paid) return 'unavailable';
    wallet.money -= paid;
    if (same) {
      same.level++;
      same.invested += gross;
      if (branch) same.branch = branch;
    } else {
      this.slots[slot] = { weaponId: wid, name: p.name, level: 1, cooldown: 0, branch, invested: paid, art: resolveArt(wid, p.name) };
    }
    this.sold.add(index); this.pending = this.selected = -1; this.pendingBranch = undefined; return 'bought';
  }
  /** 改装服务升阶（§6 兜底）：材料不出现时的成长路径，价格单独列示。 */
  upgradeServiceCost(slotIndex: number): number {
    const w = this.slots[slotIndex];
    return w ? Math.max(1, Math.ceil(SERVICE_UPGRADE_BASE * upgradeCostMultiplier(w.level))) : 0;
  }
  /** 本店是否没有能喂养该武器的商品（决定是否展示改装服务卡）。 */
  lacksMaterial(w: EquippedWeapon): boolean {
    return !this.offers.some(p => this.equipped(p) === w);
  }
  upgradeService(slotIndex: number, wallet: Wallet, branch?: BranchId): 'bought' | 'unavailable' | 'branch' {
    const w = this.slots[slotIndex];
    // 初始散弹是可替换的入门装备（§4.2），固定 Lv1，不参与成长。
    if (!w || w.level >= MAX_WEAPON_LEVEL || w.weaponId === 'scatter') return 'unavailable';
    if (w.level + 1 === 3 && !branch && !w.branch && weaponById(w.weaponId).branches) return 'branch';
    const cost = this.upgradeServiceCost(slotIndex);
    if (wallet.money < cost) return 'unavailable';
    wallet.money -= cost;
    w.level++; w.invested += cost;
    if (branch) w.branch = branch;
    return 'bought';
  }
  /** 免费基础前炮安装（§4.2）：仅第一站、前武器为空时提供，明确是游戏服务。 */
  freeFrontAvailable(): boolean {
    return this.wave <= FREE_FRONT_WAVE && this.slots[SLOT_FRONT] === null;
  }
  installFrontService(): boolean {
    if (!this.freeFrontAvailable()) return false;
    this.slots[SLOT_FRONT] = { weaponId: 'service-front', name: '基础前炮', level: 1, cooldown: 0, invested: 0, art: 'food-starter' };
    return true;
  }
  moduleInstalled(id: string): boolean {
    return MODULE_SLOTS.some(i => this.slots[i]?.weaponId === id);
  }
  modulePrice(id: string): number { return MODULE_PRICES[id] ?? 0; }
  buyModule(id: string, wallet: Wallet): boolean {
    if (!moduleById(id) || this.moduleInstalled(id)) return false;
    const cost = this.modulePrice(id);
    if (wallet.money < cost) return false;
    const slot = MODULE_SLOTS.find(i => this.slots[i] === null);
    if (slot === undefined) return false;
    wallet.money -= cost;
    const def = moduleById(id)!;
    this.slots[slot] = { weaponId: id, name: def.name, level: 1, cooldown: 0, invested: cost, art: '' };
    return true;
  }
  repair(wallet: Wallet): boolean {
    const cost = this.repairCost();
    if (wallet.money < cost || wallet.health >= 100) return false;
    wallet.money -= cost; wallet.health = Math.min(100, wallet.health + 30); return true;
  }
  /** Restore the deterministic stop order of a saved run. */
  restore(route: Store[], bagIds: string[]): void {
    this.route.length = 0; this.bag.length = 0;
    for (const store of route) if (store) this.route.push(store);
    for (const id of bagIds) {
      const store = this.snapshot.stores.find(s => s.id === id);
      if (store) this.bag.push(store);
    }
  }
}
