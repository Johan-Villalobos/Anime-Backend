// src/routes/swagger.js
// Sirve la documentación OpenAPI 3.0 en JSON y la UI HTML integrada.
'use strict';

const { send } = require('../utils/helpers');

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'AnimeDB API',
    version: '1.0.0',
    description:
      'API REST para la aplicación AnimeDB (Expo/React Native). ' +
      'Gestiona series de anime, personajes e imágenes contra Supabase. ' +
      'Las rutas `/api/admin/*` requieren autenticación JWT.',
    contact: { name: 'AnimeDB' },
  },
  servers: [{ url: `http://localhost:${process.env.PORT || 3000}`, description: 'Local' }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Obtén el token con POST /api/auth/login y pégalo aquí.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
        },
      },
      AnimeSeries: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          slug: { type: 'string', example: 'dragon-ball' },
          name: { type: 'string', example: 'Dragon Ball' },
          description: { type: 'string', nullable: true },
          accent_color: { type: 'string', example: '#FFD700' },
          icon: { type: 'string', example: '🐉' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Character: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          age: { type: 'string', nullable: true },
          category: { type: 'string', nullable: true },
          power: { type: 'string', nullable: true },
          technique: { type: 'string', nullable: true },
          description: { type: 'string', nullable: true },
          images: { type: 'array', items: { type: 'string', format: 'uri' } },
        },
      },
    },
  },
  paths: {
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesión',
        description: 'Valida credenciales contra la tabla `users` de Supabase y devuelve un JWT válido por 8 horas.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'admin' },
                  password: { type: 'string', example: 'supersecret' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login exitoso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    token: { type: 'string' },
                    username: { type: 'string' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
          401: { description: 'Credenciales inválidas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/api/series': {
      get: {
        tags: ['Series'],
        summary: 'Listar todas las series',
        description: 'Retorna todas las series de anime registradas (públicas + dinámicas).',
        responses: {
          200: {
            description: 'Lista de series',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/AnimeSeries' } },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/api/{slug}': {
      get: {
        tags: ['Personajes'],
        summary: 'Buscar personaje por nombre',
        description: 'Busca un personaje (case-insensitive, búsqueda parcial) dentro de la serie identificada por `slug`. Compatible con las rutas estáticas (`saint-seiya`, `hunter-x-hunter`, `one-piece`) y las dinámicas.',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'saint-seiya',
            description: 'Slug de la serie (e.g. saint-seiya, one-piece)',
          },
          {
            name: 'name',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            example: 'Seiya',
            description: 'Nombre o parte del nombre del personaje',
          },
        ],
        responses: {
          200: {
            description: 'Personaje encontrado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/Character' },
                  },
                },
              },
            },
          },
          404: { description: 'Personaje o serie no encontrados', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // Rutas estáticas explícitas para mejor DX en Swagger
    '/api/saint-seiya': { get: { tags: ['Personajes — Estáticos'], summary: 'Buscar en Saint Seiya', description: 'Alias de /api/{slug} con slug=saint-seiya', parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' }, example: 'Seiya' }], responses: { 200: { description: 'OK' }, 404: { description: 'No encontrado' } } } },
    '/api/hunter-x-hunter': { get: { tags: ['Personajes — Estáticos'], summary: 'Buscar en Hunter x Hunter', parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' }, example: 'Gon' }], responses: { 200: { description: 'OK' }, 404: { description: 'No encontrado' } } } },
    '/api/one-piece': { get: { tags: ['Personajes — Estáticos'], summary: 'Buscar en One Piece', parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' }, example: 'Luffy' }], responses: { 200: { description: 'OK' }, 404: { description: 'No encontrado' } } } },

    '/api/admin/series': {
      post: {
        tags: ['Admin — Series'],
        summary: 'Crear nueva serie de anime',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Dragon Ball' },
                  slug: { type: 'string', example: 'dragon-ball', description: 'Si se omite se genera desde name' },
                  description: { type: 'string', nullable: true },
                  accent_color: { type: 'string', example: '#FFD700', default: '#A78BFA' },
                  icon: { type: 'string', example: '🐉', default: '📺' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Serie creada',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/AnimeSeries' } } } } },
          },
          409: { description: 'Ya existe una serie con ese slug', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'No autenticado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/api/admin/characters': {
      post: {
        tags: ['Admin — Personajes'],
        summary: 'Crear personaje con imágenes',
        description: 'Crea un personaje y sube sus imágenes al bucket de Supabase Storage. Acepta **multipart/form-data**. Las imágenes del dispositivo van en el campo `images` (puede repetirse). También se puede pasar `image_url` como URLs separadas por comas.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['series_slug', 'name'],
                properties: {
                  series_slug: { type: 'string', example: 'saint-seiya' },
                  name: { type: 'string', example: 'Seiya de Pegaso' },
                  description: { type: 'string' },
                  age: { type: 'string', example: '13' },
                  category: { type: 'string', example: 'Caballero de Bronce' },
                  power: { type: 'string', example: 'Cosmo de Pegaso' },
                  technique: { type: 'string', example: 'Meteoro de Pegaso' },
                  image_url: { type: 'string', description: 'URLs de imagen separadas por comas (opcional)' },
                  images: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'Archivos de imagen desde el dispositivo (máx 10 × 10 MB)' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Personaje creado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/Character' },
                    warnings: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          400: { description: 'Faltan campos requeridos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'No autenticado' },
          404: { description: 'Serie no encontrada' },
        },
      },
    },

    '/api/admin/characters/recent': {
      get: {
        tags: ['Admin — Personajes'],
        summary: 'Últimos personajes por serie',
        description: 'Devuelve el personaje más reciente de cada serie (usado en la pantalla Resumen).',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Lista de personajes recientes (uno por serie)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'array',
                      items: {
                        allOf: [
                          { $ref: '#/components/schemas/Character' },
                          {
                            type: 'object',
                            properties: {
                              series_slug: { type: 'string' },
                              series_name: { type: 'string' },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

/* ── HTML UI usando Swagger UI CDN ───────────────────────────────────────── */
function swaggerHtml(baseUrl) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>AnimeDB API — Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
  <style>
    body { margin: 0; background: #080810; }
    .swagger-ui .topbar { background: #0D0D14; border-bottom: 1px solid #ffffff10; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${baseUrl}/api/docs/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      deepLinking: true,
      persistAuthorization: true,
    });
  </script>
</body>
</html>`;
}

function handleDocsJson(req, res) {
  const payload = JSON.stringify(spec, null, 2);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function handleDocsHtml(req, res, baseUrl) {
  const html = swaggerHtml(baseUrl);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

module.exports = { handleDocsJson, handleDocsHtml, spec };
