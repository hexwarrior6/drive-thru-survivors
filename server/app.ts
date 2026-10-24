/** Read-only MCP gateway shared by local dev (@hono/node-server) and Vercel (hono/vercel). */
import { Hono } from 'hono';
import { z } from 'zod';
import { DataError, withMcp, buildSnapshot, type McpCall } from './mcp.js';
import { demoSnapshot, type Snapshot } from '../src/data/snapshot.js';

const querySchema = z.object({ city: z.string().trim().min(1).max(20).default('上海'), area: z.string().trim().max(40).default('') });

function limiter(max: number) {
  const hits: number[] = [];
  return () => { const now = Date.now(); while (hits.length && hits[0]! <= now - 60000) hits.shift(); if (hits.length >= max) return false; hits.push(now); return true; };
}

export function createApp(token = '', testCall?: McpCall) {
  const allow = limiter(30); const allowSnapshot = limiter(6);
  const cache = new Map<string, { expires: number; data: Snapshot }>(); const pending = new Map<string, Promise<Snapshot>>();
  const app = new Hono();
  app.use(async (c, next) => { if (!allow()) return c.json({ error: '请求过于频繁，请一分钟后重试。' }, 429); await next(); });
  app.get('/api/health', c => c.json({ ok: true }));
  app.get('/api/status', c => c.json({ configured: !!token, source: '麦当劳官方 MCP', readonly: true }));
  app.get('/api/snapshot', async c => {
    if (!allowSnapshot()) return c.json({ error: '请求过于频繁，请一分钟后重试。' }, 429);
    const query = querySchema.safeParse({ city: c.req.query('city') ?? undefined, area: c.req.query('area') ?? undefined });
    if (!query.success) return c.json({ error: '请输入 1–20 字的城市名；区域名称最多 40 字。' }, 400);
    if (!token && !testCall) return c.json(demoSnapshot(query.data.city));
    const key = `${query.data.city}:${query.data.area}`;
    const hit = cache.get(key); if (hit && hit.expires > Date.now()) { cache.delete(key); cache.set(key, hit); return c.json(hit.data); }
    try {
      let promise = pending.get(key);
      if (!promise) { promise = testCall ? buildSnapshot(testCall, query.data.city, query.data.area) : withMcp(token, call => buildSnapshot(call, query.data.city, query.data.area)); pending.set(key, promise); }
      const data = await promise; cache.set(key, { expires: Date.now() + 15 * 60 * 1000, data }); if (cache.size > 20) cache.delete(cache.keys().next().value!);
      return c.json(data);
    } catch (error) {
      if (error instanceof DataError) return c.json({ error: error.message }, error.status as 422 | 502);
      return c.json({ error: 'MCP 连接失败或查询超时。请检查服务端配置、稍后重试，或选择示例试玩。' }, 502);
    } finally { pending.delete(key); }
  });
  app.notFound(c => c.json({ error: 'Not Found' }, 404));
  return app;
}
