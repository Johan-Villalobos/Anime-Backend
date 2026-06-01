// src/db/seed.js
// Inserta las 3 series estáticas en anime_series si no existen todavía.
// Inserta un usuario admin por defecto si no existe.
// Se ejecuta automáticamente al arrancar el servidor.

'use strict';

const bcrypt = require('bcryptjs');
const { supabase } = require('./supabase');

const STATIC_SERIES = [
  {
    slug: 'saint-seiya',
    name: 'Saint Seiya',
    description: 'Los Caballeros del Zodiaco',
    accent_color: '#FFD700',
    icon: '⚡',
  },
  {
    slug: 'hunter-x-hunter',
    name: 'Hunter x Hunter',
    description: 'El mundo de los Hunters',
    accent_color: '#00E5FF',
    icon: '🎯',
  },
  {
    slug: 'one-piece',
    name: 'One Piece',
    description: 'El Gran Tesoro',
    accent_color: '#FF6B00',
    icon: '☠️',
  },
];

async function seedStaticSeries() {
  console.log('[Seed] Verificando series estáticas en la BD…');

  for (const serie of STATIC_SERIES) {
    // Verificar si ya existe (por slug)
    const { data: existing } = await supabase
      .from('anime_series')
      .select('id, slug')
      .eq('slug', serie.slug)
      .maybeSingle();

    if (existing) {
      console.log(`[Seed]  ✓ "${serie.slug}" ya existe (id=${existing.id})`);
      continue;
    }

    // Insertar
    const { data, error } = await supabase
      .from('anime_series')
      .insert(serie)
      .select('id, slug')
      .single();

    if (error) {
      console.error(`[Seed]  ✗ Error insertando "${serie.slug}":`, error.message);
    } else {
      console.log(`[Seed]  ✚ "${serie.slug}" insertada (id=${data.id})`);
    }
  }

  console.log('[Seed] Listo.\n');
}

/* ── Seed: usuario admin ──────────────────────────────────────────────────── */

async function seedAdminUser() {
  console.log('[Seed] Verificando usuario admin…');

  const { data: existing } = await supabase
    .from('users')
    .select('id, username')
    .eq('username', 'admin')
    .maybeSingle();

  if (existing) {
    console.log(`[Seed]  ✓ Usuario "admin" ya existe (id=${existing.id})`);
    return;
  }

  const password_hash = await bcrypt.hash('anime2025', 10);

  const { data, error } = await supabase
    .from('users')
    .insert({
      username: 'admin',
      password_hash,
      role: 'admin',
      is_active: true,
    })
    .select('id, username')
    .single();

  if (error) {
    console.error('[Seed]  ✗ Error creando usuario admin:', error.message);
  } else {
    console.log(`[Seed]  ✚ Usuario "admin" creado (id=${data.id})`);
  }
}

/* ── Exports ──────────────────────────────────────────────────────────────── */

module.exports = { seedStaticSeries, seedAdminUser };
