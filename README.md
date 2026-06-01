# AnimeDB Backend

Backend Node.js **puro** (sin frameworks) para la app Expo AnimeDB.  
Conecta directamente con **Supabase** (PostgreSQL + Storage).

---

## Estructura

```
anime-backend/
├── .env
├── package.json
└── src/
    ├── server.js              ← Punto de entrada, router HTTP
    ├── db/
    │   └── supabase.js        ← Cliente Supabase (service-role)
    ├── middleware/
    │   ├── auth.js            ← JWT verify / sign
    │   └── cors.js            ← CORS headers
    ├── routes/
    │   ├── auth.js            ← POST /api/auth/login
    │   ├── series.js          ← GET /api/series · POST /api/admin/series
    │   ├── characters.js      ← GET /api/:slug · POST /api/admin/characters
    │   └── swagger.js         ← Documentación OpenAPI 3.0
    └── utils/
        └── helpers.js         ← send(), readJSON(), readMultipart(), toSlug()
```

---

## Instalación

```bash
npm install
```

---

## Variables de entorno (`.env`)

| Variable              | Descripción                                     |
|-----------------------|-------------------------------------------------|
| `SUPABASE_URL`        | URL del proyecto Supabase                       |
| `SUPABASE_SERVICE_KEY`| Service Role Key (nunca el anon key)            |
| `PORT`                | Puerto HTTP (default `3000`)                    |
| `JWT_SECRET`          | Secreto para firmar tokens JWT                  |
| `ALLOWED_ORIGINS`     | Orígenes CORS (`*` para todos)                  |
| `SUPABASE_BUCKET`     | Nombre del bucket de imágenes                   |

---

## Arrancar

```bash
# Producción
npm start

# Desarrollo (recarga automática, Node ≥ 18)
npm run dev
```

---

## Endpoints

### Públicos

| Método | Ruta                        | Descripción                              |
|--------|-----------------------------|------------------------------------------|
| GET    | `/`                         | Health check                             |
| GET    | `/health`                   | Health check                             |
| POST   | `/api/auth/login`           | Login → JWT                              |
| GET    | `/api/series`               | Lista todas las series                   |
| GET    | `/api/:slug?name=<nombre>`  | Busca personaje en la serie `slug`       |
| GET    | `/api/saint-seiya?name=...` | Alias estático de la ruta dinámica       |
| GET    | `/api/hunter-x-hunter?name=`| Alias estático                           |
| GET    | `/api/one-piece?name=...`   | Alias estático                           |
| GET    | `/api/docs`                 | Swagger UI (HTML)                        |
| GET    | `/api/docs/openapi.json`    | Spec OpenAPI 3.0 (JSON)                  |

### Admin (requieren `Authorization: Bearer <token>`)

| Método | Ruta                              | Descripción                              |
|--------|-----------------------------------|------------------------------------------|
| POST   | `/api/admin/series`               | Crear nueva serie de anime               |
| POST   | `/api/admin/characters`           | Crear personaje + subir imágenes         |
| GET    | `/api/admin/characters/recent`    | Último personaje por serie               |

---

## Crear usuario administrador

Ejecuta este SQL en Supabase → SQL Editor:

```sql
INSERT INTO users (username, password_hash, role)
VALUES (
  'admin',
  -- hash de 'tu_contraseña' generado con bcrypt rounds=10
  '$2b$10$CAMBIA_ESTE_HASH_POR_UNO_REAL',
  'admin'
);
```

Para generar el hash en Node:

```js
const bcrypt = require('bcryptjs');
console.log(await bcrypt.hash('tu_contraseña', 10));
```

---

## Subida de imágenes

Las imágenes desde el dispositivo se suben al bucket `character-images` de Supabase Storage.  
Asegúrate de que el bucket existe y tiene la política **pública de lectura** activa:

```sql
-- En Supabase Storage → Policies
CREATE POLICY "Public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'character-images');
```

---

## Vista requerida en Supabase

El endpoint de búsqueda usa la vista `v_characters_with_images`. Crea o verifica que existe:

```sql
CREATE OR REPLACE VIEW v_characters_with_images AS
SELECT
  c.id,
  s.slug  AS series_slug,
  s.name  AS series_name,
  c.name,
  c.age,
  c.category,
  c.power,
  c.technique,
  c.description,
  json_agg(
    json_build_object('url', ci.url, 'sort_order', ci.sort_order)
    ORDER BY ci.sort_order
  ) FILTER (WHERE ci.id IS NOT NULL) AS images
FROM characters c
JOIN anime_series s ON s.id = c.series_id
LEFT JOIN character_images ci ON ci.character_id = c.id
GROUP BY c.id, s.slug, s.name;
```
