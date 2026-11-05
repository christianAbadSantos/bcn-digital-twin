// GET /api/assets/<ruta>  → sirve objetos del bucket R2 enlazado como BUCKET.
// Pensado para assets 3D grandes que no caben en Pages (máx. 25 MB por fichero): teselas 3D
// (tileset.json + .b3dm/.glb), modelos glTF/IFC propios, instantáneas FIWARE…
// Ejemplo: sube bcn3d/tileset.json y pon VITE_TILES3D_URL=/api/assets/bcn3d/tileset.json
// Admite peticiones parciales (Range), necesarias para algunos formatos.
const TYPES = { json: 'application/json', glb: 'model/gltf-binary', gltf: 'model/gltf+json', b3dm: 'application/octet-stream', i3dm: 'application/octet-stream', pnts: 'application/octet-stream', cmpt: 'application/octet-stream', ifc: 'application/octet-stream', bin: 'application/octet-stream', png: 'image/png', jpg: 'image/jpeg', ktx2: 'image/ktx2' }

export async function onRequestGet({ request, env, params }) {
  if (!env.BUCKET) return new Response('R2 no configurado (enlaza un bucket como BUCKET)', { status: 501 })
  const key = [].concat(params.path || []).join('/')
  if (!key || key.includes('..')) return new Response('ruta no válida', { status: 400 })
  const range = request.headers.get('range')
  const obj = await env.BUCKET.get(key, range ? { range: request.headers } : undefined)
  if (!obj) return new Response('no encontrado', { status: 404 })
  const ext = key.split('.').pop().toLowerCase()
  const headers = new Headers({ 'content-type': obj.httpMetadata?.contentType || TYPES[ext] || 'application/octet-stream', 'cache-control': 'public, max-age=86400', etag: obj.httpEtag, 'accept-ranges': 'bytes', 'access-control-allow-origin': '*' })
  if (range && obj.range) {
    const { offset = 0, length = obj.size - offset } = obj.range
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`)
    return new Response(obj.body, { status: 206, headers })
  }
  return new Response(obj.body, { headers })
}
