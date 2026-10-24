/** Vercel glue: bridge serverless requests into the Fastify gateway (server/app.ts). */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app';

const app = createApp(process.env.MCDONALDS_MCP_TOKEN ?? '');

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await app.ready();
  app.server.emit('request', req, res);
}
