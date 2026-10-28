import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchBackendHealth } from './healthApi.js';

test('fetchBackendHealth returns ok=true when endpoint responds with 200', async () => {
  // Mock global fetch to test contract
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, 'http://localhost:5001/api/health');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'UP',
        service: 'kosh-backend',
        system: 'KOSH-PRAMAAN FDR Verification Engine'
      })
    };
  };

  try {
    const res = await fetchBackendHealth();
    assert.equal(res.ok, true);
    assert.equal(res.data.status, 'UP');
    assert.equal(res.data.service, 'kosh-backend');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBackendHealth returns ok=false with error message when endpoint is down', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:5001');
  };

  try {
    const res = await fetchBackendHealth();
    assert.equal(res.ok, false);
    assert.match(res.error, /ECONNREFUSED/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
