// src/server.js
// Servidor HTTP Node.js puro — sin frameworks.
// Carga .env, aplica CORS, enruta todas las peticiones.

'use strict';

// ── Cargar variables de entorno desde .env ─────────────────────────────────
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Imports ────────────────────────────────────────────────────────────────
const http = require('http');

const { cors } = require('./middleware/cors');
const { requireAuth } = require('./middleware/auth');
const { send } = require('./utils/helpers');

const { handleLogin } = require('./routes/auth');
const { listSeries, createSeries } = require('./routes/series');
const { searchCharacter, createCharacter, recentCharacters } = require('./routes/characters');
const { handleDocsJson, handleDocsHtml } = require('./routes/swagger');
const { seedStaticSeries, seedAdminUser } = require('./db/seed');
const { supabase, ensureBucket } = require('./db/supabase');

const PORT = Number(process.env.PORT || 3000);

// ── Router principal ───────────────────────────────────────────────────────

/**
 * Encadena middlewares de forma simple.
 * Cada middleware recibe (req, res, next) donde next() pasa al siguiente.
 */
function runMiddleware(middlewares, req, res) {
  let i = 0;
  function next() {
    const mw = middlewares[i++];
    if (mw) mw(req, res, next);
  }
  next();
}

async function router(req, res) {
  const method = req.method.toUpperCase();
  // Normalizar pathname (quitar query string)
  const rawUrl = req.url || '/';
  const pathname = rawUrl.split('?')[0].replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';

  // ── Swagger Docs ─────────────────────────────────────────────────────────
  if (pathname === '/api/docs' || pathname === '/api/docs/') {
    const baseUrl = `http://${req.headers.host || `localhost:${PORT}`}`;
    return handleDocsHtml(req, res, baseUrl);
  }
  if (pathname === '/api/docs/openapi.json') {
    return handleDocsJson(req, res);
  }

  // ── Health check ─────────────────────────────────────────────────────────
  if (pathname === '/' || pathname === '/health') {
    let bucketOk = false;
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      bucketOk = buckets.some((b) => b.name === (process.env.SUPABASE_BUCKET || 'Animes'));
    } catch {}
    return send(res, 200, { success: true, message: 'AnimeDB API running 🎌', version: '1.0.0', storage: { bucket: process.env.SUPABASE_BUCKET || 'Animes', ready: bucketOk } });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  if (pathname === '/api/auth/login' && method === 'POST') {
    return handleLogin(req, res);
  }

  // ── Series (público) ─────────────────────────────────────────────────────
  if (pathname === '/api/series' && method === 'GET') {
    return listSeries(req, res);
  }

  // ── Seed manual: POST /api/seed ──────────────────────────────────────────────
  if (pathname === '/api/seed' && method === 'POST') {
    try {
      await seedStaticSeries();
      return send(res, 200, { success: true, message: 'Seed ejecutado. Revisa la consola del servidor.' });
    } catch (e) {
      return send(res, 500, { success: false, error: e.message });
    }
  }

  // ── Debug: slugs reales en la BD (diagnóstico) ─────────────────────────────
  if (pathname === '/api/debug/slugs' && method === 'GET') {
    const { supabase } = require('./db/supabase');
    const { data, error } = await supabase
      .from('anime_series')
      .select('id, slug, name')
      .order('id');
    if (error) return send(res, 500, { success: false, error: error.message });
    return send(res, 200, { success: true, data });
  }

    // ── Admin routes (requieren JWT) ──────────────────────────────────────────
  if (pathname.startsWith('/api/admin/')) {
    // Aplicar auth middleware
    let authorized = false;
    await new Promise((resolve) => {
      requireAuth(req, res, () => { authorized = true; resolve(); });
      // Si requireAuth responde 401, la promise no llama a next, pero res ya fue cerrada
      // Necesitamos un mecanismo para salir limpiamente:
      res.on('finish', resolve);
    });
    if (!authorized) return; // requireAuth ya respondió

    // POST /api/admin/series
    if (pathname === '/api/admin/series' && method === 'POST') {
      return createSeries(req, res);
    }

    // GET /api/admin/characters/recent
    if (pathname === '/api/admin/characters/recent' && method === 'GET') {
      return recentCharacters(req, res);
    }

    // POST /api/admin/characters
    if (pathname === '/api/admin/characters' && method === 'POST') {
      return createCharacter(req, res);
    }

    return send(res, 404, { success: false, error: `Ruta admin no encontrada: ${method} ${pathname}` });
  }

  // ── Búsqueda de personajes por slug de serie ───────────────────────────────
  // Patrón: /api/<slug>   (acepta guiones y guiones bajos)
  const slugMatch = pathname.match(/^\/api\/([a-zA-Z0-9_-]+)$/);
  if (slugMatch && method === 'GET') {
    const slug = slugMatch[1];
    return searchCharacter(req, res, slug);
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  return send(res, 404, { success: false, error: `Ruta no encontrada: ${method} ${pathname}` });
}

// ── Servidor ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // Aplicar CORS primero, luego enrutar
  runMiddleware(
    [
      cors,
      (req, res, next) => {
        router(req, res).catch((err) => {
          console.error('[Server] Unhandled error:', err);
          if (!res.headersSent) {
            send(res, 500, { success: false, error: 'Error interno del servidor.' });
          }
        });
      },
    ],
    req,
    res,
  );
});

// Ejecutar seed al arrancar (inserta series estáticas + admin si no existen)
seedStaticSeries().catch((e) => console.error('[Seed] Error en series:', e));
seedAdminUser().catch((e) => console.error('[Seed] Error en admin:', e));
ensureBucket().catch((e) => console.error('[Storage] Error en ensureBucket:', e))

server.listen(PORT, () => {
  console.log(`\n🎌 AnimeDB API iniciada`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → Swagger UI: http://localhost:${PORT}/api/docs`);
  console.log(`   → Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`   → Bucket: ${process.env.SUPABASE_BUCKET}\n`);
});

server.on('error', (err) => {
  console.error('[Server] Error fatal:', err);
  process.exit(1);
});
