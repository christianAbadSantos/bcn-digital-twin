// GET /api/fiware?path=/v2/entities?type=...  (o /ngsi-ld/v1/entities?...)
// Reenvía la consulta al Context Broker de FIWARE configurado en Cloudflare:
//   FIWARE_URL          p. ej. https://orion.midominio.org  (obligatoria; sin ella responde 501)
//   FIWARE_SERVICE      cabecera Fiware-Service (opcional, multi-tenant)
//   FIWARE_SERVICEPATH  cabecera Fiware-ServicePath (opcional)
//   FIWARE_TOKEN        token (X-Auth-Token, p. ej. Keyrock/Wilma) (opcional, secreto)
// Así el token no llega al navegador y el broker no necesita CORS.
// Si hay un bucket R2 enlazado como BUCKET, guarda una instantánea por minuto (histórico barato).
const ALLOWED = /^\/(v2\/entities|ngsi-ld\/v1\/entities)(\?|$)/
const LD_CONTEXT = 'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld'
const TTL = 10

export async function onRequestGet({ request, env, waitUntil }) {
  const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } })
  if (!env.FIWARE_URL) return json({ error: 'FIWARE_URL no configurada' }, 501)
  const path = new URL(request.url).searchParams.get('path') || ''
  if (!ALLOWED.test(path)) return json({ error: 'ruta no permitida' }, 400)

  const cache = caches.default
  const key = new Request(`https://fiware.cache${path}&b=${Math.floor(Date.now() / (TTL * 1000))}`)
  const hit = await cache.match(key)
  if (hit) return hit

  const headers = { accept: 'application/json' }
  if (env.FIWARE_SERVICE) headers['Fiware-Service'] = env.FIWARE_SERVICE
  if (env.FIWARE_SERVICEPATH) headers['Fiware-ServicePath'] = env.FIWARE_SERVICEPATH
  if (env.FIWARE_TOKEN) headers['X-Auth-Token'] = env.FIWARE_TOKEN
  if (path.startsWith('/ngsi-ld')) headers.Link = `<${LD_CONTEXT}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`

  let r
  try {
    r = await fetch(env.FIWARE_URL.replace(/\/$/, '') + path, { headers })
  } catch (e) {
    return json({ error: 'broker inaccesible' }, 502)
  }
  const body = await r.text()
  const res = new Response(body, { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL}` } })
  if (r.ok) {
    waitUntil(cache.put(key, res.clone()))
    if (env.BUCKET) {
      // una instantánea por minuto y tipo: fiware/AAAA-MM-DD/HH-MM/<tipo>.json
      const d = new Date()
      const type = new URLSearchParams(path.split('?')[1] || '').get('type') || 'all'
      const obj = `fiware/${d.toISOString().slice(0, 10)}/${d.toISOString().slice(11, 16).replace(':', '-')}/${type}.json`
      waitUntil(env.BUCKET.head(obj).then((h) => h || env.BUCKET.put(obj, body, { httpMetadata: { contentType: 'application/json' } })).catch(() => {}))
    }
  }
  return res
}
