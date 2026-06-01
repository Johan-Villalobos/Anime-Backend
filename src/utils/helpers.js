// src/utils/helpers.js
'use strict';

/**
 * Envía una respuesta JSON estándar.
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {object} body
 */
function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.writeHead(status);
  res.end(payload);
}

/**
 * Lee el body JSON de una request.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<object>}
 */
function readJSON(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('Body JSON inválido')); }
    });
    req.on('error', reject);
  });
}

/**
 * Parsea multipart/form-data usando busboy.
 * Devuelve { fields, files } donde files[name] = { buffer, filename, mimetype }
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ fields: Record<string,string>, files: Record<string,{buffer:Buffer,filename:string,mimetype:string}[]> }>}
 */
function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const Busboy = require('busboy');
    let bb;
    try {
      bb = Busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB por archivo
    } catch (e) {
      return reject(e);
    }

    const fields = {};
    const files = {};

    bb.on('field', (name, val) => { fields[name] = val; });

    bb.on('file', (name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      stream.on('data', (d) => chunks.push(d));
      stream.on('end', () => {
        if (!files[name]) files[name] = [];
        files[name].push({ buffer: Buffer.concat(chunks), filename, mimetype: mimeType });
      });
    });

    bb.on('finish', () => resolve({ fields, files }));
    bb.on('error', reject);

    req.pipe(bb);
  });
}

/**
 * Convierte una URL a un slug válido.
 */
function toSlug(str) {
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

module.exports = { send, readJSON, readMultipart, toSlug };
