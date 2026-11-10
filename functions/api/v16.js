// GET /api/v16 → balizas V16 encendidas ahora mismo en Cataluña (DGT 3.0, datos abiertos DATEX II).
// La DGT no envía cabeceras CORS y el XML pesa ~7 MB: aquí se descarga comprimido, se extraen solo
// las balizas y se guarda el resultado 60 s en caché (todas las visitas comparten la misma lectura).
import { DGT_SITUATIONS, parseV16 } from '../../shared/v16.js'
import { USER_AGENT } from '../_lib/ua.js'

const TTL = 60

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url)
  const cache = caches.default
  const key = new Request(`${url.origin}/api/v16?b=${Math.floor(Date.now() / (TTL * 1000))}`)
  const hit = await cache.match(key)
  if (hit) return hit

  let body
  try {
    const r = await fetch(DGT_SITUATIONS, { headers: { 'user-agent': USER_AGENT, accept: 'application/xml', 'accept-encoding': 'gzip' } })
    if (!r.ok) throw new Error(`DGT ${r.status}`)
    body = { source: 'DGT 3.0 · NAP DATEX II v3.7 (datos abiertos)', ...parseV16(await r.text()) }
  } catch (e) {
    return new Response(JSON.stringify({ error: 'DGT no disponible', beacons: [] }), { status: 502, headers: { 'content-type': 'application/json' } })
  }
  const res = new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL}` } })
  waitUntil(cache.put(key, res.clone()))
  return res
}
