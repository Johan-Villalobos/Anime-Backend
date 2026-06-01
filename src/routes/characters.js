// src/routes/characters.js
//
// GET  /api/:slug?name=<name>         — busca un personaje por nombre en una serie
// POST /api/admin/characters          — crea personaje + sube imágenes (multipart)
// GET  /api/admin/characters/recent   — últimos personajes buscados (todos los animes)

'use strict';

const { supabase } = require('../db/supabase');
const { send, readJSON, readMultipart } = require('../utils/helpers');

const BUCKET = process.env.SUPABASE_BUCKET || 'character-images';

/* ── GET /api/:slug?name=<name> ───────────────────────────────────────────── */
async function searchCharacter(req, res, slug) {
  // Parsear query string manualmente
  const urlObj = new URL(req.url, `http://localhost`);
  const name = urlObj.searchParams.get('name')?.trim();

  if (!name) {
    return send(res, 400, { success: false, error: 'El parámetro name es requerido.' });
  }

  // Buscar la serie por slug (soporta guiones y guiones bajos)
  let { data: series, error: seriesErr } = await supabase
    .from('anime_series')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle();

  if (!series && !seriesErr && slug.includes('_')) {
    const altSlug = slug.replace(/_/g, '-');
    const { data: alt } = await supabase
      .from('anime_series')
      .select('id, name')
      .eq('slug', altSlug)
      .maybeSingle();
    series = alt;
  }

  if (seriesErr) {
    return send(res, 500, { success: false, error: 'Error del servidor.' });
  }
  if (!series) {
    return send(res, 404, { success: false, error: `Serie "${slug}" no encontrada.` });
  }

  // Buscar personaje (case-insensitive con ilike)
  const { data: chars, error: charErr } = await supabase
    .from('v_characters_with_images')
    .select('id, name, age, category, power, technique, description, images')
    .eq('series_slug', slug)
    .ilike('name', `%${name}%`)
    .limit(1);

  if (charErr) {
    console.error('[Character] search error:', charErr);
    return send(res, 500, { success: false, error: 'Error al buscar personaje.' });
  }

  if (!chars || chars.length === 0) {
    return send(res, 404, {
      success: false,
      error: `Personaje "${name}" no encontrado en ${series.name}.`,
    });
  }

  const char = chars[0];
  // Normalizar imágenes: la vista devuelve JSON array de {url}
  const images = Array.isArray(char.images)
    ? char.images.map((img) => (typeof img === 'string' ? img : img.url)).filter(Boolean)
    : [];

  return send(res, 200, {
    success: true,
    data: {
      id: char.id,
      name: char.name,
      age: char.age,
      category: char.category,
      power: char.power,
      technique: char.technique,
      description: char.description,
      images,
    },
  });
}

/* ── POST /api/admin/characters ───────────────────────────────────────────── */
async function createCharacter(req, res) {
  const contentType = req.headers['content-type'] || '';

  let body;
  let isJson = false;
  let uploadedFiles = [];

  if (contentType.startsWith('multipart/form-data')) {
    try {
      const parsed = await readMultipart(req);
      body = parsed.fields;
      uploadedFiles = parsed.files['images'] || [];
      console.log(`[Character] Multipart recibido: ${Object.keys(body).length} campos, ${uploadedFiles.length} archivo(s)`);
    } catch (e) {
      return send(res, 400, { success: false, error: 'Error al parsear el formulario.', details: e.message });
    }
  } else {
    try {
      body = await readJSON(req);
      isJson = true;
    } catch (e) {
      return send(res, 400, { success: false, error: 'Body JSON inválido.' });
    }
  }

  // Normalizar campos: aceptar camelCase (frontend) y snake_case (backtesting)
  const series_slug = body.seriesSlug || body.series_slug;
  const name = body.name;
  const description = body.description;
  const age = body.age;
  const category = body.category;
  const power = body.power;
  const technique = body.technique;

  if (!series_slug || !name) {
    return send(res, 400, { success: false, error: 'series_slug y name son requeridos.' });
  }

  // Resolver series_id con soporte para guiones/guiones bajos
  let { data: series } = await supabase
    .from('anime_series')
    .select('id')
    .eq('slug', series_slug)
    .maybeSingle();

  if (!series && series_slug.includes('_')) {
    const altSlug = series_slug.replace(/_/g, '-');
    const { data: alt } = await supabase
      .from('anime_series')
      .select('id')
      .eq('slug', altSlug)
      .maybeSingle();
    series = alt;
  }

  if (!series) {
    return send(res, 404, { success: false, error: `Serie "${series_slug}" no encontrada.` });
  }

  // Insertar personaje
  const { data: character, error: charErr } = await supabase
    .from('characters')
    .insert({
      series_id: series.id,
      name: (name || '').trim(),
      description: (description || '').trim() || null,
      age: (age || '').trim() || null,
      category: (category || '').trim() || null,
      power: (power || '').trim() || null,
      technique: (technique || '').trim() || null,
    })
    .select()
    .single();

  if (charErr) {
    console.error('[Character] insert error:', charErr);
    return send(res, 500, { success: false, error: 'Error al crear el personaje.', details: charErr.message });
  }

  const warnings = [];
  let sortOrder = 0;

  // ── Procesar imágenes desde URLs ─────────────────────────────────────────
  let imageUrls = [];

  if (isJson) {
    const arr = body.images;
    if (Array.isArray(arr)) {
      imageUrls = arr.filter((u) => u && typeof u === 'string' && u.trim());
    }
  } else {
    const image_url = body.image_url;
    if (image_url && image_url.trim()) {
      imageUrls = image_url.split(',').map((u) => u.trim()).filter(Boolean);
    }
  }

  for (const url of imageUrls) {
    const { error: imgErr } = await supabase
      .from('character_images')
      .insert({ character_id: character.id, url, sort_order: sortOrder++ });
    if (imgErr) warnings.push(`URL "${url}" no guardada: ${imgErr.message}`);
  }

  // ── Procesar archivos subidos (solo multipart) ───────────────────────────
  for (const file of uploadedFiles) {
    if (!file.buffer || file.buffer.length === 0) {
      warnings.push(`Archivo vacío ignorado: ${file.filename}`);
      continue;
    }

    const ext = file.filename.split('.').pop() || 'jpg';
    const storagePath = `Nuevos_Animes/${series_slug}/${Date.now()}_${sortOrder}.${ext}`;

    console.log(`[Character] Subiendo a storage: ${BUCKET}/${storagePath} (${file.buffer.length} bytes, tipo: ${file.mimetype})`);

    // Intentar subida; si falla por bucket inexistente, crearlo y reintentar
    let uploadErr;
    let retried = false;

    while (true) {
      const result = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file.buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false });

      uploadErr = result.error;

      if (!uploadErr) break;

      // Si el bucket no existe, intentar crearlo y reintentar una vez
      const msg = (uploadErr.message || '').toLowerCase();
      if (!retried && (msg.includes('bucket') || msg.includes('not found') || msg.includes('no such bucket'))) {
        console.log(`[Character] Bucket "${BUCKET}" no encontrado. Intentando crearlo...`);
        const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
        if (createErr) {
          warnings.push(`No se pudo crear bucket "${BUCKET}": ${createErr.message}`);
          break;
        }
        console.log(`[Character] Bucket "${BUCKET}" creado. Reintentando subida...`);
        retried = true;
        continue;
      }

      break;
    }

    if (uploadErr) {
      console.error(`[Character] Error subiendo "${file.filename}":`, uploadErr.message);
      warnings.push(`${file.filename}: ${uploadErr.message}`);
      continue;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const publicUrl = urlData?.publicUrl;

    if (!publicUrl) {
      warnings.push(`No se pudo obtener URL pública de "${storagePath}"`);
      continue;
    }

    console.log(`[Character] Imagen subida correctamente: ${publicUrl}`);

    const { error: imgErr } = await supabase
      .from('character_images')
      .insert({ character_id: character.id, url: publicUrl, storage_path: storagePath, sort_order: sortOrder++ });

    if (imgErr) warnings.push(`Imagen guardada en storage pero no en BD: ${imgErr.message}`);
  }

  return send(res, 201, { success: true, data: character, warnings });
}

/* ── GET /api/admin/characters/recent ────────────────────────────────────── */
async function recentCharacters(req, res) {
  // Devuelve el último personaje consultado por anime
  // Usamos created_at de la tabla characters como proxy (no hay tabla de búsquedas)
  const { data, error } = await supabase
    .from('v_characters_with_images')
    .select('id, series_slug, series_name, name, age, category, power, technique, description, images')
    .order('id', { ascending: false })
    .limit(50);

  if (error) {
    return send(res, 500, { success: false, error: 'Error al obtener personajes recientes.' });
  }

  // Agrupar: 1 por serie (el más reciente)
  const seen = new Set();
  const result = [];
  for (const char of data || []) {
    if (!seen.has(char.series_slug)) {
      seen.add(char.series_slug);
      const images = Array.isArray(char.images)
        ? char.images.map((img) => (typeof img === 'string' ? img : img.url)).filter(Boolean)
        : [];
      result.push({ ...char, images });
    }
  }

  return send(res, 200, { success: true, data: result });
}

module.exports = { searchCharacter, createCharacter, recentCharacters };
