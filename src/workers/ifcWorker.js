// Worker IFC: abre un .ifc con web-ifc (WASM) y devuelve la geometría agrupada por color,
// ya transformada, en metros y con Y hacia arriba. Así el hilo principal no se bloquea.
import { IfcAPI } from 'web-ifc'
import wasmUrl from 'web-ifc/web-ifc.wasm?url'

let api = null
async function getApi() {
  if (api) return api
  const a = new IfcAPI()
  await a.Init(() => new URL(wasmUrl, self.location.href).href, true) // un solo hilo: no exige COOP/COEP
  api = a
  return api
}

self.onmessage = async (e) => {
  const { id, url } = e.data
  try {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const bytes = new Uint8Array(await r.arrayBuffer())
    const ifc = await getApi()
    const model = ifc.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true })
    const groups = new Map()
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    let tris = 0
    ifc.StreamAllMeshes(model, (mesh) => {
      const n = mesh.geometries.size()
      for (let gi = 0; gi < n; gi++) {
        const pg = mesh.geometries.get(gi)
        const geom = ifc.GetGeometry(model, pg.geometryExpressID)
        const v = ifc.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize())
        const ix = ifc.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize())
        const c = pg.color
        const key = `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)},${c.w.toFixed(2)}`
        let g = groups.get(key)
        if (!g) groups.set(key, (g = { color: [c.x, c.y, c.z, c.w], pos: [], nor: [], idx: [] }))
        const m = pg.flatTransformation
        const base = g.pos.length / 3
        for (let i = 0; i < v.length; i += 6) {
          const x = v[i], y = v[i + 1], z = v[i + 2]
          const px = m[0] * x + m[4] * y + m[8] * z + m[12]
          const py = m[1] * x + m[5] * y + m[9] * z + m[13]
          const pz = m[2] * x + m[6] * y + m[10] * z + m[14]
          g.pos.push(px, py, pz)
          const nx = v[i + 3], ny = v[i + 4], nz = v[i + 5]
          g.nor.push(m[0] * nx + m[4] * ny + m[8] * nz, m[1] * nx + m[5] * ny + m[9] * nz, m[2] * nx + m[6] * ny + m[10] * nz)
          if (px < min[0]) min[0] = px; if (py < min[1]) min[1] = py; if (pz < min[2]) min[2] = pz
          if (px > max[0]) max[0] = px; if (py > max[1]) max[1] = py; if (pz > max[2]) max[2] = pz
        }
        for (let i = 0; i < ix.length; i++) g.idx.push(base + ix[i])
        tris += ix.length / 3
        geom.delete()
      }
    })
    ifc.CloseModel(model)
    const out = [...groups.values()].map((g) => ({ color: g.color, position: new Float32Array(g.pos), normal: new Float32Array(g.nor), index: new Uint32Array(g.idx) }))
    self.postMessage({ id, ok: true, groups: out, min, max, tris, bytes: bytes.length }, out.flatMap((g) => [g.position.buffer, g.normal.buffer, g.index.buffer]))
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) })
  }
}
