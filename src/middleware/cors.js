// src/middleware/cors.js
'use strict';

const ALLOWED = process.env.ALLOWED_ORIGINS || '*';

function getOrigin(origin) {
  if (ALLOWED === '*') return origin || '*';
  const list = ALLOWED.split(',').map(s => s.trim());
  return list.includes(origin) ? origin : null;
}

function cors(req, res, next) {
  const origin = req.headers['origin'] || '';
  const allowOrigin = getOrigin(origin);

  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  next();
}

module.exports = { cors };
