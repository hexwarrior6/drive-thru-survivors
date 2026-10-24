import { z } from 'zod';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
const env = z.object({ PORT: z.coerce.number().int().min(1).max(65535).default(3002), MCDONALDS_MCP_TOKEN: z.string().default('') }).parse(process.env);
serve({ fetch: createApp(env.MCDONALDS_MCP_TOKEN).fetch, port: env.PORT, hostname: '127.0.0.1' });
console.log(`Read-only MCP gateway: http://127.0.0.1:${env.PORT}`);
