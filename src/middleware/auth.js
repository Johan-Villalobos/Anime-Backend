// src/middleware/auth.js
// Verifica el token JWT en el header Authorization: Bearer <token>
// O la API key en el header x-admin-key.
'use strict';

const jwt = require('jsonwebtoken');
const { send } = require('../utils/helpers');

const SECRET = process.env.JWT_SECRET || 'change_this_in_production';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'dev-admin-key';

/**
 * Middleware de autenticación.
 * Acepta dos métodos:
 *   1. Header x-admin-key (API key pre-compartida)
 *   2. Authorization: Bearer <JWT>
 * Si alguno es válido, adjunta req.user y llama next().
 * Si no, responde 401.
 */
function requireAuth(req, res, next) {
  // 1. Validar x-admin-key (API key estática)
  const adminKey = req.headers['x-admin-key'];
  if (adminKey && adminKey === ADMIN_API_KEY) {
    req.user = { id: null, username: 'admin', role: 'admin' };
    return next();
  }

  // 2. Validar JWT Bearer token
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return send(res, 401, { success: false, error: 'Token o x-admin-key requerido.' });
  }

  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch {
    send(res, 401, { success: false, error: 'Token inválido o expirado.' });
  }
}

/**
 * Genera un JWT con duración de 8 horas.
 */
function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '8h' });
}

module.exports = { requireAuth, signToken };
