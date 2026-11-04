// GET /api/state?scenario=normal|lluvia|choque|viento
// Ejecuta los conectores simulados + reglas y devuelve el estado del gemelo.
import { buildSnapshot, SCENARIOS } from '../../shared/engine.js'
import { getWeather } from '../_lib/weather.js'
import { persist } from '../_lib/persist.js'

const TTL = 4 // segundos de caché: muchas visitas simultáneas comparten el mismo cálculo

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url)
  const asked = url.searchParams.get('scenario')
  const scenario = SCENARIOS[asked] ? asked : 'normal'

  const cache = caches.default
  const key = new Request(`${url.origin}/api/state?scenario=${scenario}&b=${Math.floor(Date.now() / (TTL * 1000))}`)
  const hit = await cache.match(key)
  if (hit) return hit

  const weather = await getWeather()
  const snap = buildSnapshot(Date.now(), weather, { scenario, db: Boolean(env.DB) })

  if (env.DB && scenario === 'normal') waitUntil(persist(env.DB, snap).catch(() => {}))

  const res = new Response(JSON.stringify({ backend: 'cloudflare-functions', db: Boolean(env.DB), ...snap }), {
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL}` },
  })
  waitUntil(cache.put(key, res.clone()))
  return res
}
