import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

/** Stage 0 gateway scaffold, adapted from McPitstop's createApp.
 * No tool passthrough or snapshots until the stage 3 read-only integration.
 */
export function createApp(configured = false) {
  const app = Fastify({ logger: false, bodyLimit: 4096 });
  app.register(rateLimit, { max: 30, timeWindow: '1 minute' });
  app.after(() => {
    app.get('/api/health', async () => ({ ok: true, stage: 1 }));
    app.get('/api/status', async () => ({ configured, readonly: true, integration: 'pending-stage-3' }));
  });
  return app;
}
