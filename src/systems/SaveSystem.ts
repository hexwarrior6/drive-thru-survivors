import type { CarId } from '../data/cars';
import type { Snapshot, Store } from '../data/snapshot';
import type { ShopStopState } from './ShopSystem';
import { identityForName } from '../combat/foodIdentity';
import { weaponById } from '../combat/weaponCatalog';

const RUN_KEY = 'dts.run.v6';
const LEGACY_KEY = 'dts.run.v5';
const RECORDS_KEY = 'dts.records.v1';

export interface SavedSlot { weaponId: string; name: string; level: number; branch?: 'a' | 'b'; invested: number }
/** v6 slots: [front weapon, rear weapon, module ×3]. v5 saves are migrated once. */
export interface RunSave {
  v: 6;
  car: CarId;
  city: string;
  wave: number;
  duration: number;
  atPit: boolean;
  health: number;
  money: number;
  kills: number;
  maxCombo: number;
  distance: number;
  nitro: number;
  slots: (SavedSlot | null)[];
  /** Sauce packets owned (§7); at most four. */
  sauces?: string[];
  /** Reward waves whose sauce was already picked or skipped. */
  sauceWaves?: number[];
  /** 本局独立种子（§7.1）：酱料候选由种子、波号与持有集合确定，恢复不重抽。 */
  runSeed?: number;
  route: Store[];
  bagIds: string[];
  snapshot: Snapshot;
  /** 进站中的菜单/已购/重投状态；离站或旧存档可省略。 */
  stop?: ShopStopState;
  savedAt: string;
}
export interface HallEntry {
  car: CarId;
  build: string[];
  wave: number;
  distance: number;
  kills: number;
  maxCombo: number;
  victory: boolean;
  at: string;
}
export interface Records {
  bestDistance: number;
  bestKills: number;
  bestCombo: number;
  bestWave: number;
  hall: HallEntry[];
}
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
/** localStorage in browsers; an in-memory stand-in keeps node tests and SSR honest. */
const store: StorageLike = (() => {
  const memory = new Map<string, string>();
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* Sandboxed contexts reject access; fall through. */ }
  return { getItem: k => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: k => void memory.delete(k) };
})();

/** v5 → v6 迁移（§12.3）：按商品名推导基础原型；旧辅助位被动随模块层退役；
 * 不替玩家选择分支（留空，下一次进站时补选）；投入未知按零处理（不可抵扣）。 */
export function migrateV5Slots(run: { slots?: ({ name: string; type: string; level: number } | null)[] }): (SavedSlot | null)[] | null {
  const slots: (SavedSlot | null)[] = [null, null, null, null, null];
  const old = run.slots;
  if (!Array.isArray(old) || old.length < 2) return null;
  const front = old[0], rear = old[1];
  if (front) {
    const identity = identityForName(front.name);
    const target = weaponById(identity.weaponId);
    slots[0] = { weaponId: target.ready ? target.id : 'generic-front', name: front.name, level: Math.min(5, Math.max(1, front.level)), invested: 0 };
  }
  if (rear && rear.type !== 'starter') {
    const identity = identityForName(rear.name);
    const target = weaponById(identity.weaponId);
    slots[1] = { weaponId: target.ready ? target.id : 'generic-rear', name: rear.name, level: Math.min(5, Math.max(1, rear.level)), invested: 0 };
  } else {
    slots[1] = { weaponId: 'scatter', name: '初始散弹炮', level: 1, invested: 0 };
  }
  return slots;
}

export function loadRun(): RunSave | null {
  try {
    const raw = store.getItem(RUN_KEY);
    if (raw) {
      const run = JSON.parse(raw) as RunSave;
      if (run?.v === 6 && run.snapshot && Array.isArray(run.slots) && Array.isArray(run.route)) return run;
      return null;
    }
    const legacy = store.getItem(LEGACY_KEY);
    if (!legacy) return null;
    const old = JSON.parse(legacy) as { v?: number } & Record<string, unknown>;
    if (old?.v !== 5 || !old.snapshot || !Array.isArray(old.route)) return null;
    const slots = migrateV5Slots(old as never);
    if (!slots) return null;
    // v5 原档保留为副本（§12.3 不直接覆盖）；迁移档在下次进站时落盘为 v6。
    return { ...(old as unknown as Omit<RunSave, 'v' | 'slots'>), v: 6, slots, runSeed: undefined, sauces: [], sauceWaves: [] };
  } catch { return null; }
}
export function saveRun(run: RunSave): void {
  try { store.setItem(RUN_KEY, JSON.stringify(run)); } catch { /* Quota or privacy mode never blocks driving. */ }
}
export function clearRun(): void {
  try { store.removeItem(RUN_KEY); } catch { /* Ignore. */ }
}
export function loadRecords(): Records {
  try {
    const raw = store.getItem(RECORDS_KEY);
    if (raw) {
      const records = JSON.parse(raw) as Records;
      if (records && Array.isArray(records.hall)) return { bestDistance: records.bestDistance ?? 0, bestKills: records.bestKills ?? 0, bestCombo: records.bestCombo ?? 0, bestWave: records.bestWave ?? 0, hall: records.hall.slice(0, 3) };
    }
  } catch { /* Corrupt records reset silently. */ }
  return { bestDistance: 0, bestKills: 0, bestCombo: 0, bestWave: 0, hall: [] };
}
/** Merge one finished run into the records; returns which bests it set. */
export function recordRun(entry: HallEntry): { records: Records; newDistance: boolean; newKills: boolean; newCombo: boolean; newWave: boolean } {
  const records = loadRecords();
  const newDistance = entry.distance > records.bestDistance;
  const newKills = entry.kills > records.bestKills;
  const newCombo = entry.maxCombo > records.bestCombo;
  const newWave = entry.wave > records.bestWave;
  if (newDistance) records.bestDistance = entry.distance;
  if (newKills) records.bestKills = entry.kills;
  if (newCombo) records.bestCombo = entry.maxCombo;
  if (newWave) records.bestWave = entry.wave;
  records.hall = [entry, ...records.hall].slice(0, 3);
  try { store.setItem(RECORDS_KEY, JSON.stringify(records)); } catch { /* Ignore. */ }
  return { records, newDistance, newKills, newCombo, newWave };
}
