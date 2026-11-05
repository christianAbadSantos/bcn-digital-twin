// GET /api/rodalies → trenes reales de Rodalies de Catalunya (posición + retraso), desde los feeds
// GTFS-RT abiertos de Renfe. Renfe no envía cabeceras CORS, por eso se pide desde aquí.
// Caché de 20 s: muchas visitas comparten la misma lectura y no se carga el servicio de Renfe.
import { RENFE_POSITIONS, RENFE_UPDATES, parseRodalies } from '../../shared/rodalies.js'
import { USER_AGENT } from '../_lib/ua.js'

const TTL = 20

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url)
  const cache = caches.default
  const key = new Request(`${url.origin}/api/rodalies?b=${Math.floor(Date.now() / (TTL * 1000))}`)
  const hit = await cache.match(key)
  if (hit) return hit

  const get = (u) => fetch(u, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  let body
  try {
    const [pos, upd] = await Promise.all([get(RENFE_POSITIONS), get(RENFE_UPDATES).catch(() => null)])
    body = { source: 'Renfe GTFS-RT (datos abiertos)', ...parseRodalies(pos, upd) }
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Renfe no disponible', trains: [] }), { status: 502, headers: { 'content-type': 'application/json' } })
  }
  const res = new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL}` } })
  waitUntil(cache.put(key, res.clone()))
  return res
}
