import { discoveryScore } from '../data/menuDiscovery';
import type { Product, Snapshot, Store } from '../data/snapshot';
import { mapProductToWeapon, mountOf, LATE_GAME_TYPES, MAX_WEAPON_LEVEL, type WeaponType } from '../combat/weaponMapper';
import { variantKeyFor } from '../data/foodArt';
import { repairCost as repairCostAt, upgradeCostMultiplier, WAVES_PER_ROUND } from './balance';
export interface EquippedWeapon { name: string; type: WeaponType; level: number; cooldown: number; variant?: string }
export interface Wallet { money: number; health: number }
/** Fixed mounts: [0] front gun, [1] rear gun, [2..4] aux passives. The stock scatter
 *  gun is built into the car and never occupies a slot. */
export const SLOT_FRONT = 0;
export const SLOT_REAR = 1;
export const AUX_SLOTS = [2, 3, 4];
export class ShopSystem {
  readonly slots: (EquippedWeapon | null)[] = [null, null, null, null, null];
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
    products.sort((a, b) => discoveryScore(b) - discoveryScore(a));
    // Boss-killer tools (missiles, escort toys) surface in the top cards only from
    // round two; round one keeps the menu focused on core guns. The full store
    // menu still lists everything — this only curates the three featured cards.
    if (wave <= WAVES_PER_ROUND) products.sort((a, b) => Number(LATE_GAME_TYPES.has(mapProductToWeapon(a))) - Number(LATE_GAME_TYPES.has(mapProductToWeapon(b))));
    else products.sort((a, b) => Number(LATE_GAME_TYPES.has(mapProductToWeapon(b))) - Number(LATE_GAME_TYPES.has(mapProductToWeapon(a))));
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
  equipped(p: Product): EquippedWeapon | undefined { return this.slots.find(w => w?.name === p.name) ?? undefined; }
  /** The mounts a weapon type may occupy, in fill order. */
  mountsFor(type: WeaponType): number[] {
    const mount = mountOf(type);
    return mount === 'front' ? [SLOT_FRONT] : mount === 'rear' ? [SLOT_REAR] : AUX_SLOTS;
  }
  buy(index: number, wallet: Wallet, replacement = -1): 'bought' | 'replace' | 'unavailable' {
    const p = this.offers[index];
    const same = this.equipped(p);
    if (!p || this.sold.has(index) || wallet.money < this.price(p, same?.level ?? 0)) return 'unavailable';
    if (same && same.level >= MAX_WEAPON_LEVEL) return 'unavailable';
    const mounts = this.mountsFor(mapProductToWeapon(p));
    let slot = mounts.find(i => this.slots[i] === null);
    // The free scatter gun is a real mount occupant: displacing it is a deliberate
    // replacement decision, same as swapping any other installed gun.
    if (slot === undefined && !same) {
      if (replacement < 0 || !mounts.includes(replacement)) { this.pending = index; return 'replace'; }
      slot = replacement;
    }
    wallet.money -= this.price(p, same?.level ?? 0);
    if (same) same.level++;
    else {
      const type = mapProductToWeapon(p);
      this.slots[slot!] = { name: p.name, type, level: 1, cooldown: 0, variant: variantKeyFor(type, p.name) };
    }
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
