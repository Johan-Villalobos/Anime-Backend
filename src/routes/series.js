// src/routes/series.js
// GET  /api/series               — lista todas las series (público)
// POST /api/admin/series         — crea una nueva serie (admin)
'use strict';

const { supabase } = require('../db/supabase');
const { send, readJSON, toSlug } = require('../utils/helpers');

/* ── GET /api/series ──────────────────────────────────────────────────────── */
async function listSeries(req, res) {
  const { data, error } = await supabase
    .from('anime_series')
    .select('id, slug, name, description, accent_color, icon, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[Series] list error:', error);
    return send(res, 500, { success: false, error: 'Error al obtener series.' });
  }

  return send(res, 200, { success: true, data });
}

/* ── POST /api/admin/series ───────────────────────────────────────────────── */
async function createSeries(req, res) {
  let body;
  try { body = await readJSON(req); }
  catch { return send(res, 400, { success: false, error: 'Body JSON inválido.' }); }

  const { name, slug: rawSlug, description, accent_color, icon } = body;
  if (!name) return send(res, 400, { success: false, error: 'name es requerido.' });

  const slug = rawSlug ? toSlug(rawSlug) : toSlug(name);
  if (!slug) return send(res, 400, { success: false, error: 'El slug generado es inválido.' });

  // Verificar duplicado
  const { data: exists } = await supabase
    .from('anime_series')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (exists) {
    return send(res, 409, { success: false, error: `Ya existe una serie con el slug "${slug}".` });
  }

  const { data, error } = await supabase
    .from('anime_series')
    .insert({
      slug,
      name: name.trim(),
      description: description?.trim() || null,
      accent_color: accent_color || '#A78BFA',
      icon: icon || '📺',
    })
    .select()
    .single();

  if (error) {
    console.error('[Series] insert error:', error);
    return send(res, 500, { success: false, error: 'Error al crear la serie.', details: error.message });
  }

  return send(res, 201, { success: true, data });
}

module.exports = { listSeries, createSeries };
