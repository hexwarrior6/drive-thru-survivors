import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app';
test('gateway exposes health/status without credentials or arbitrary MCP access', async () => {
  const app = createApp(true);
  try {
    assert.deepEqual((await app.inject('/api/health')).json(), { ok: true, stage: 1 });
    assert.deepEqual((await app.inject('/api/status')).json(), { configured: true, readonly: true, integration: 'pending-stage-3' });
    assert.equal((await app.inject('/api/snapshot')).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/api/mcp' })).statusCode, 404);
    for (let i = 0; i < 30; i++) await app.inject('/api/health');
    assert.equal((await app.inject('/api/health')).statusCode, 429);
  } finally { await app.close(); }
});
