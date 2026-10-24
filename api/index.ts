/** Vercel glue: expose the Hono gateway (server/app.ts) as a Web-standard function handler. */
import { createApp } from '../server/app.js';

const app = createApp(process.env.MCDONALDS_MCP_TOKEN ?? '');

export default (request: Request): Response | Promise<Response> => app.fetch(request);
