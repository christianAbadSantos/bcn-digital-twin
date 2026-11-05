// GET /api/ifc?f=APBCN-...._LOD1.ifc
// Sirve modelos de la Biblioteca IFC del Port de Barcelona (CC BY 4.0). Su servidor no permite CORS,
// así que se piden desde aquí. Con un bucket R2 enlazado como BUCKET, cada IFC se descarga del Port
// UNA sola vez y después se sirve desde R2 (gratis hasta 10 GB y sin coste de salida).
import { USER_AGENT } from '../_lib/ua.js'

const SRC = 'https://serveis.portdebarcelona.cat/cataleg_bim_planol/IFC/'
const NAME = /^APBCN-[A-Za-z0-9_ñÑçÇ-]+_LOD[1-3](_red)?\.ifc$/

export async function onRequestGet({ request, env, waitUntil }) {
  const f = new URL(request.url).searchParams.get('f') || ''
  if (!NAME.test(f)) return new Response('nombre de fichero no válido', { status: 400 })
  const headers = { 'content-type': 'application/octet-stream', 'cache-control': 'public, max-age=86400', 'x-source': 'port' }

  if (env.BUCKET) {
    const obj = await env.BUCKET.get(`ifc/${f}`)
    if (obj) return new Response(obj.body, { headers: { ...headers, 'x-source': 'r2' } })
  }
  const r = await fetch(SRC + encodeURIComponent(f), { headers: { 'user-agent': USER_AGENT }, cf: { cacheTtl: 86400, cacheEverything: true } })
  if (!r.ok) return new Response(`el Port respondió ${r.status}`, { status: 502 })
  if (!env.BUCKET) return new Response(r.body, { headers })
  const len = Number(r.headers.get('content-length'))
  if (!len) return new Response(r.body, { headers }) // R2 necesita conocer el tamaño de un stream
  const [a, b] = r.body.tee()
  const { readable, writable } = new FixedLengthStream(len)
  waitUntil(b.pipeTo(writable).catch(() => {}))
  waitUntil(env.BUCKET.put(`ifc/${f}`, readable, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { source: SRC + f, license: 'CC BY 4.0 · Port de Barcelona' } }))
  return new Response(a, { headers })
}
