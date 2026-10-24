/** Vercel glue: adapt serverless requests to the Fastify-free gateway core (server/serverless.ts). */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServerless } from '../server/serverless.js';

const handle = createServerless(process.env.MCDONALDS_MCP_TOKEN ?? '');

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const isGet = (req.method ?? 'GET').toUpperCase() === 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');
  const { status, body } = isGet ? await handle(url.pathname, url.searchParams) : { status: 404, body: { error: 'Not Found' } };
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}
