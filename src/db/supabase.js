// src/db/supabase.js
// Conexión única al cliente Supabase (service-role para operaciones admin)

'use strict';

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('[DB] Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el .env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

/**
 * Verifica que el bucket de storage exista y lo crea si no.
 * Se llama al arrancar el servidor para evitar errores de subida.
 * Si listBuckets falla (ej. falta de permisos), intenta crear directamente.
 */
async function ensureBucket() {
  const bucketName = process.env.SUPABASE_BUCKET || 'Animes';

  // 1. Intentar listar buckets
  try {
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (!listErr && buckets) {
      if (buckets.some((b) => b.name === bucketName)) {
        console.log(`[Storage] Bucket "${bucketName}" ya existe.`);
        return;
      }
    } else if (listErr) {
      console.warn(`[Storage] No se pudieron listar buckets: ${listErr.message}. Intentando crear directamente...`);
    }
  } catch (e) {
    console.warn(`[Storage] Error al listar buckets: ${e.message}. Intentando crear directamente...`);
  }

  // 2. Intentar crear el bucket directamente (si ya existe, el error se ignora)
  try {
    const { error: createErr } = await supabase.storage.createBucket(bucketName, {
      public: true,
    });

    if (!createErr) {
      console.log(`[Storage] Bucket "${bucketName}" creado correctamente.`);
    } else if (createErr.message?.includes('already exists')) {
      console.log(`[Storage] Bucket "${bucketName}" ya existe (confirmado al crear).`);
    } else {
      console.error(`[Storage] No se pudo crear bucket "${bucketName}": ${createErr.message}`);
    }
  } catch (e) {
    console.error(`[Storage] Excepción al crear bucket "${bucketName}": ${e.message}`);
  }
}

module.exports = { supabase, ensureBucket };
