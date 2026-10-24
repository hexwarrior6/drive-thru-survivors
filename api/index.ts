/** Vercel glue: expose the Hono gateway (server/app.ts) via the Web-standard named-method signature. */
import { createApp } from '../server/app.js';

const app = createApp(process.env.MCDONALDS_MCP_TOKEN ?? '');

export const GET = (request: Request): Response | Promise<Response> => app.fetch(request);
