// /api/reports — reportes ciudadanos con foto.
//   GET  → lista de reportes (Cloudinary Search API, caché 30 s)
//   POST → firma una subida a Cloudinary. Solo con sesión iniciada (token de Clerk verificado aquí).
// Secretos en Cloudflare Pages (Settings → Variables and Secrets): CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
// El navegador sube la foto directamente a Cloudinary con la firma; aquí no pasa la imagen.
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { CLERK_ISSUER, CLOUDINARY_CLOUD, REPORT_TAG, REPORT_FOLDER, REPORT_FORMATS, REPORT_TYPES, REPORT_BBOX } from '../../shared/reportsConfig.js'
import { USER_AGENT } from '../_lib/ua.js'

const JWKS = createRemoteJWKSet(new URL(`${CLERK_ISSUER}/.well-known/jwks.json`))
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } })
const clean = (s, max) => String(s || '').replace(/[|=\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

async function sha1hex(text) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return json({ enabled: false, reports: [] })
  const url = new URL(request.url)
  const cache = caches.default
  const key = new Request(`${url.origin}/api/reports?b=${Math.floor(Date.now() / 30000)}`)
  const hit = await cache.match(key)
  if (hit) return hit
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/resources/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Basic ' + btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`), 'user-agent': USER_AGENT },
    body: JSON.stringify({ expression: `tags=${REPORT_TAG}`, with_field: ['context'], sort_by: [{ created_at: 'desc' }], max_results: 100 }),
  })
  if (!r.ok) {
    // mensaje de Cloudinary (sin números, para no mostrar la API key) para saber qué clave falla
    const detail = await r.json().then((d) => String(d?.error?.message || '').replace(/\d{4,}/g, '…')).catch(() => '')
    return json({ enabled: true, reports: [], error: `Cloudinary ${r.status}`, detail }, 502)
  }
  const data = await r.json()
  const reports = (data.resources || [])
    .map((x) => {
      const c = x.context?.custom || x.context || {}
      const lat = Number(c.lat), lon = Number(c.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      return {
        id: x.public_id,
        lat, lon,
        tipo: REPORT_TYPES[c.tipo] ? c.tipo : 'otro',
        texto: c.texto || '',
        autor: c.autor || 'usuario',
        foto: x.secure_url.replace('/upload/', '/upload/c_fill,w_480,h_320,f_auto,q_auto/'),
        creado: x.created_at,
      }
    })
    .filter(Boolean)
  const res = json({ enabled: true, reports }, 200, { 'cache-control': 'public, max-age=30' })
  waitUntil(cache.put(key, res.clone()))
  return res
}

export async function onRequestPost({ request, env }) {
  if (!env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return json({ error: 'Reportes no configurados (faltan los secretos de Cloudinary)' }, 501)
  // 1) sesión de Clerk
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  let user
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: CLERK_ISSUER })
    user = payload.sub
  } catch {
    return json({ error: 'Inicia sesión para enviar un reporte' }, 401)
  }
  // 2) datos del reporte, validados aquí: el navegador solo puede subir lo que se firma
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'JSON no válido' }, 400)
  }
  const lat = Number(body.lat), lon = Number(body.lon)
  if (!(lat > REPORT_BBOX.s && lat < REPORT_BBOX.n && lon > REPORT_BBOX.w && lon < REPORT_BBOX.e)) return json({ error: 'El punto debe estar en Barcelona' }, 400)
  const tipo = REPORT_TYPES[body.tipo] ? body.tipo : 'otro'
  const texto = clean(body.texto, 280)
  const autor = clean(body.autor, 40) || 'usuario'
  const params = {
    allowed_formats: REPORT_FORMATS,
    context: `lat=${lat.toFixed(5)}|lon=${lon.toFixed(5)}|tipo=${tipo}|texto=${texto}|autor=${autor}|uid=${clean(user, 64)}`,
    folder: REPORT_FOLDER,
    tags: REPORT_TAG,
    timestamp: Math.floor(Date.now() / 1000),
  }
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&')
  const signature = await sha1hex(toSign + env.CLOUDINARY_API_SECRET)
  return json({ cloud: CLOUDINARY_CLOUD, api_key: env.CLOUDINARY_API_KEY, signature, params })
}
