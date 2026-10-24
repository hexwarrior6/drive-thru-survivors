/** Shared validated wire format and self-contained demo, adapted from McPitstop. */
import { z } from 'zod';

export const categories = ['main', 'side', 'drink'] as const;
export type Category = (typeof categories)[number];
export const categoryNames: Record<Category, string> = {
  main: '主食',
  side: '配餐',
  drink: '饮品',
};
export const categoryIcons: Record<Category, string> = { main: '🍔', side: '🍟', drink: '🥤' };
export const productSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.enum(categories),
  price: z.number().int().positive(),
  image: z.string().optional(),
  menuPresence: z.object({ stores: z.number().int().positive(), compared: z.number().int().positive() }).optional(),
});
export const storeSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  driveThru: z.literal(true),
  products: z.array(productSchema).min(1),
  source: z.string(),
  referenceTime: z.string().optional(),
});
export const snapshotSchema = z.object({
  mode: z.enum(['demo', 'live']),
  city: z.string(),
  fetchedAt: z.string().datetime(),
  stores: z.array(storeSchema).min(1).max(5),
  campaign: z.string(),
  notes: z.array(z.string()),
  coupons: z.array(z.object({ title: z.string(), description: z.string() })).default([]),
});
export type Product = z.infer<typeof productSchema>;
export type Store = z.infer<typeof storeSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export const money = (cents: number) => `¥${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
export function demoSnapshot(city = '上海', seed = 1): Snapshot {
  const districts = ['梧桐街', '滨江公园', '星光大道', '中央车站'];
  const names = ['巨无霸', '麦辣鸡腿堡', '中薯条', '麦乐鸡', '可口可乐', '柠檬红茶', '鲜煮咖啡', '苹果派', '甜筒', '浓缩咖啡'];
  return {
    mode: 'demo',
    city,
    fetchedAt: new Date().toISOString(),
    campaign: '金秋出游补给季 · 示例主题',
    notes: ['全部门店、餐品、价格和优惠均为游戏示例。', '道路为虚构棋盘；所有购买只扣除虚拟预算。'],
    coupons: [],
    stores: districts.map((d, i) => ({
      id: `demo-${i}`,
      name: `${d}得来速`,
      address: `${city} · ${d}（虚构门店）`,
      driveThru: true as const,
      source: '游戏示例数据',
      products: names
        .map((name, j) => ({
          id: `demo-${i}-${j}`,
          name,
          category: (['main', 'main', 'side', 'side', 'drink', 'drink', 'drink', 'side', 'side', 'drink'] as const)[j]!,
          price:
            [2200, 2500, 1300, 1600, 900, 1200, 1000, 900, 700, 1200][j]! +
            (((i + seed) % 3) - 1) * 200 +
            (i === 0 ? 300 : 0),
        }))
        .filter(
          (p) =>
            i === 0 ||
            (i === 1 && p.category !== 'side') ||
            (i === 2 && p.category !== 'main') ||
            (i === 3 && p.category !== 'drink'),
        ),
    })),
  };
}
