export interface PoolItem { active: boolean; slot: number }
/** Fixed capacity, O(1) acquire/release. Factories run only during construction. */
export class ObjectPool<T extends PoolItem> {
  readonly items: T[];
  private readonly free: Int32Array;
  private available: number;
  activeCount = 0;
  dropped = 0;
  constructor(readonly capacity: number, factory: (slot: number) => T) {
    this.items = new Array<T>(capacity);
    this.free = new Int32Array(capacity);
    this.available = capacity;
    for (let i = 0; i < capacity; i++) { this.items[i] = factory(i); this.free[i] = capacity - 1 - i; }
  }
  acquire(): T | null {
    if (this.available === 0) { this.dropped++; return null; }
    const item = this.items[this.free[--this.available]];
    item.active = true; this.activeCount++;
    return item;
  }
  release(item: T): void {
    if (!item.active) return;
    item.active = false; this.free[this.available++] = item.slot; this.activeCount--;
  }
  clear(): void { for (let i = 0; i < this.capacity; i++) this.release(this.items[i]); }
}
