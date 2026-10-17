import { z } from 'zod';
import { createApp } from './app';
const env = z.object({ PORT: z.coerce.number().int().min(1).max(65535).default(3002), MCDONALDS_MCP_TOKEN: z.string().default('') }).parse(process.env);
const app = createApp(Boolean(env.MCDONALDS_MCP_TOKEN));
await app.listen({ port: env.PORT, host: '127.0.0.1' });
console.log(`Read-only gateway scaffold: http://127.0.0.1:${env.PORT}`);
