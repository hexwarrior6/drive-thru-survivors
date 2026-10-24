import type { CarId } from '../data/cars';
import type { Snapshot, Store } from '../data/snapshot';
import type { WeaponType } from '../combat/weaponMapper';

const RUN_KEY = 'dts.run.v4';
const RECORDS_KEY = 'dts.records.v1';

export interface SavedSlot { name: string; type: WeaponType; level: number }
export interface RunSave {
  v: 4;
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
  route: Store[];
  bagIds: string[];
  snapshot: Snapshot;
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

export function loadRun(): RunSave | null {
  try {
    const raw = store.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunSave;
    if (run?.v !== 4 || !run.snapshot || !Array.isArray(run.slots) || !Array.isArray(run.route)) return null;
    return run;
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
