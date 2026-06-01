// src/routes/auth.js
// POST /api/auth/login
'use strict';

const bcrypt = require('bcryptjs');
const { supabase } = require('../db/supabase');
const { send, readJSON } = require('../utils/helpers');
const { signToken } = require('../middleware/auth');

async function handleLogin(req, res) {
  let body;
  try { body = await readJSON(req); }
  catch { return send(res, 400, { success: false, error: 'Body JSON inválido.' }); }

  const { username, password } = body;
  if (!username || !password) {
    return send(res, 400, { success: false, error: 'username y password son requeridos.' });
  }

  // Buscar usuario en la BD
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, password_hash, role, is_active')
    .eq('username', username.trim())
    .limit(1);

  if (error) {
    console.error('[Auth] DB error:', error);
    return send(res, 500, { success: false, error: 'Error del servidor.' });
  }

  const user = users?.[0];
  if (!user || !user.is_active) {
    return send(res, 401, { success: false, error: 'Usuario o contraseña incorrectos.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return send(res, 401, { success: false, error: 'Usuario o contraseña incorrectos.' });
  }

  const token = signToken({ id: user.id, username: user.username, role: user.role });
  return send(res, 200, { success: true, token, username: user.username, role: user.role });
}

module.exports = { handleLogin };
