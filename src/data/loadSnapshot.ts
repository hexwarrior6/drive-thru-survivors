import { demoSnapshot, snapshotSchema, type Snapshot } from './snapshot';
export interface SnapshotResult { snapshot: Snapshot; reason: string; error?: string }
/** One bounded request per explicit destination search, never during combat or at pit stops. */
export async function loadSnapshot(city = '上海', area = ''): Promise<SnapshotResult> {
  try {
    const response = await fetch(`/api/snapshot?${new URLSearchParams(area ? { city, area } : { city })}`, { signal: AbortSignal.timeout(58000) });
    if (!response.ok) { const data = await response.json(); throw new Error(typeof data.error === 'string' ? data.error : '快照服务暂不可用'); }
    const snapshot = snapshotSchema.parse(await response.json());
    return { snapshot, reason: snapshot.mode === 'demo' ? '未配置 Token · 示例模式' : '麦当劳官方 MCP · 只读菜单快照' };
  } catch (error) {
    return { snapshot: demoSnapshot(city), reason: '连接不可用 · 离线示例模式（非实时菜单）', error: error instanceof Error ? error.message : '查询失败' };
  }
}
