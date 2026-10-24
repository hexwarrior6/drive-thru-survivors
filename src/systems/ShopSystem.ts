import { discoveryScore } from '../data/menuDiscovery';
import type { Product, Snapshot, Store } from '../data/snapshot';
import { mapProductToWeapon, type WeaponType } from '../combat/weaponMapper';
export interface EquippedWeapon { name: string; type: WeaponType; level: number; cooldown: number }
export interface Wallet { money: number; health: number }
export class ShopSystem {
  readonly slots: (EquippedWeapon | null)[] = [{ name: '后置散弹炮', type: 'starter', level: 1, cooldown: 0 }, null, null, null, null, null];
  offers: Product[] = [];
  sold = new Set<number>();
  pending = -1;
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
    this.offers = products.sort((a,b) => discoveryScore(b) - discoveryScore(a)); this.sold.clear(); this.pending = this.selected = -1;
    const coupon = this.snapshot.coupons[0];
    if (coupon) { this.discount = 0.9; this.couponTitle = coupon.title; }
    else { this.discount = 1; this.couponTitle = ''; }
  }
  basePrice(p: Product): number { return Math.max(1, Math.ceil(p.price / 100)); }
  price(p: Product): number { return Math.max(1, Math.ceil(this.basePrice(p) * this.discount)); }
  repairCost(): number { return 10 + (this.wave - 1) * 2; }
  equipped(p: Product): EquippedWeapon | undefined { return this.slots.find(w => w?.name === p.name) ?? undefined; }
  buy(index: number, wallet: Wallet, replacement = -1): 'bought' | 'replace' | 'unavailable' {
    const p = this.offers[index];
    if (!p || this.sold.has(index) || wallet.money < this.price(p)) return 'unavailable';
    const same = this.equipped(p);
    if (same?.level === 3) return 'unavailable';
    let slot = this.slots.indexOf(null);
    if (!same && slot < 0) {
      if (replacement < 0 || replacement > 5) { this.pending = index; return 'replace'; }
      slot = replacement;
    }
    wallet.money -= this.price(p);
    if (same) same.level++;
    else this.slots[slot] = { name: p.name, type: mapProductToWeapon(p), level: 1, cooldown: 0 };
    this.sold.add(index); this.pending = this.selected = -1; return 'bought';
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
