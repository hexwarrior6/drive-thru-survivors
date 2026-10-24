/** Vercel glue: dispatch serverless requests into the Fastify gateway (server/app.ts). */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app.js';

const app = createApp(process.env.MCDONALDS_MCP_TOKEN ?? '');

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade']);

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await app.ready();
  const result = await app.inject({ method: (req.method ?? 'GET').toUpperCase(), url: req.url ?? '/', headers: req.headers });
  res.statusCode = result.statusCode;
  for (const [name, value] of Object.entries(result.headers)) {
    if (value === undefined || HOP_BY_HOP.has(name.toLowerCase())) continue;
    res.setHeader(name, value as string | number | string[]);
  }
  res.end(result.rawPayload);
}
