import type { Product } from './snapshot.js';
export function normalizeProductName(name: string): string { return name.normalize('NFKC').replace(/\s+/g, '').toLowerCase(); }
/** Presence comes from complete candidate menu lists, before the quote selection limit. */
export function discoveryScore(p: Product): number {
  const presence = p.menuPresence;
  const difference = presence && presence.compared > 1 ? 1 - presence.stores / presence.compared : 0;
  return difference + (/限定|新品|季节|期间|限时/.test(p.name) ? 2 : /风味|龙焰|枫糖|爆爆珠|扭扭|芝士条/.test(p.name) ? .25 : 0);
}
export function productHighlight(p: Product): string {
  if (/限定|新品|季节|期间|限时/.test(p.name)) return '名称含新品 / 限定标记';
  const presence = p.menuPresence;
  if (presence && presence.compared > 1 && presence.stores < presence.compared) return `菜单差异 · ${presence.stores}/${presence.compared} 家`;
  if (/风味|龙焰|枫糖|爆爆珠|扭扭|芝士条/.test(p.name)) return '风味餐品优先';
  return '';
}
