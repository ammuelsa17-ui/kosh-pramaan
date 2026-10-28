import app from '../kosh-backend/server.js';

export default function handler(req, res) {
  return app(req, res);
}
