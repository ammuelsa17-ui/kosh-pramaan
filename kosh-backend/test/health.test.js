import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Socket } from 'node:net';
import { app } from '../server.js';

test('GET /api/health returns HTTP 200 with UP status and CORS headers', async () => {
  const socket = new Socket();
  const req = new http.IncomingMessage(socket);
  req.url = '/api/health';
  req.method = 'GET';
  req.headers = { host: 'localhost:5001', origin: 'http://localhost:5173' };

  const res = new http.ServerResponse(req);
  let body = '';

  const responseFinished = new Promise((resolve) => {
    res.write = (chunk) => {
      body += chunk;
      return true;
    };
    res.end = (chunk) => {
      if (chunk) body += chunk;
      resolve();
    };
  });

  app.handle(req, res);
  await responseFinished;

  assert.equal(res.statusCode, 200, 'HTTP status must be 200');
  assert.equal(res.getHeader('access-control-allow-origin'), 'http://localhost:5173', 'CORS origin must match Vite dev port');
  assert.equal(res.getHeader('content-type'), 'application/json; charset=utf-8', 'Content type must be JSON');

  const payload = JSON.parse(body);
  assert.equal(payload.status, 'UP', 'Status must be UP');
  assert.equal(payload.service, 'kosh-backend', 'Service name must be kosh-backend');
  assert.ok(payload.timestamp, 'Timestamp must be present');
});
