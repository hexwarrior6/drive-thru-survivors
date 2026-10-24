/** Fastify-free request core for serverless hosting; mirrors server/app.ts routes
 *  (validation, demo fallback, 15min cache, coalescing, per-instance rate limits)
 *  and shares the server/mcp.ts pipeline. Local dev keeps the Fastify gateway. */
import { z } from 'zod';
import { DataError, withMcp, buildSnapshot, type McpCall } from './mcp.js';
import { demoSnapshot, type Snapshot } from '../src/data/snapshot.js';

export interface ServerlessResponse { status: number; body: unknown }

const querySchema = z.object({ city: z.string().trim().min(1).max(20).default('上海'), area: z.string().trim().max(40).default('') });

function limiter(max: number) {
  const hits: number[] = [];
  return () => { const now = Date.now(); while (hits.length && hits[0]! <= now - 60000) hits.shift(); if (hits.length >= max) return false; hits.push(now); return true; };
}

export function createServerless(token = '', testCall?: McpCall) {
  const allow = limiter(30); const allowSnapshot = limiter(6);
  const cache = new Map<string, { expires: number; data: Snapshot }>(); const pending = new Map<string, Promise<Snapshot>>();
  async function snapshot(params: URLSearchParams): Promise<ServerlessResponse> {
    if (!allowSnapshot()) return { status: 429, body: { error: '请求过于频繁，请一分钟后重试。' } };
    const query = querySchema.safeParse({ city: params.get('city') ?? undefined, area: params.get('area') ?? undefined });
    if (!query.success) return { status: 400, body: { error: '请输入 1–20 字的城市名；区域名称最多 40 字。' } };
    if (!token && !testCall) return { status: 200, body: demoSnapshot(query.data.city) };
    const key = `${query.data.city}:${query.data.area}`;
    const hit = cache.get(key); if (hit && hit.expires > Date.now()) { cache.delete(key); cache.set(key, hit); return { status: 200, body: hit.data }; }
    try {
      let promise = pending.get(key);
      if (!promise) { promise = testCall ? buildSnapshot(testCall, query.data.city, query.data.area) : withMcp(token, call => buildSnapshot(call, query.data.city, query.data.area)); pending.set(key, promise); }
      const data = await promise; cache.set(key, { expires: Date.now() + 15 * 60 * 1000, data }); if (cache.size > 20) cache.delete(cache.keys().next().value!);
      return { status: 200, body: data };
    } catch (error) {
      if (error instanceof DataError) return { status: error.status, body: { error: error.message } };
      return { status: 502, body: { error: 'MCP 连接失败或查询超时。请检查服务端配置、稍后重试，或选择示例试玩。' } };
    } finally { pending.delete(key); }
  }
  return async function handle(path: string, params: URLSearchParams): Promise<ServerlessResponse> {
    if (!allow()) return { status: 429, body: { error: '请求过于频繁，请一分钟后重试。' } };
    if (path === '/api/health') return { status: 200, body: { ok: true } };
    if (path === '/api/status') return { status: 200, body: { configured: !!token, source: '麦当劳官方 MCP', readonly: true } };
    if (path === '/api/snapshot') return snapshot(params);
    return { status: 404, body: { error: 'Not Found' } };
  };
}
