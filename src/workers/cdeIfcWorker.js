// Worker del CDE: abre un IFC con web-ifc y devuelve CADA ELEMENTO por separado (geometría en metros,
// Y hacia arriba) con su GlobalId, clase, nombre, planta y conjuntos de propiedades. Así el visor puede
// seleccionar elementos, colorearlos y enlazarlos con decisiones de obra y órdenes de mantenimiento.
import * as W from 'web-ifc'
import wasmUrl from 'web-ifc/web-ifc.wasm?url'

let api = null
async function getApi() {
  if (api) return api
  const a = new W.IfcAPI()
  await a.Init(() => new URL(wasmUrl, self.location.href).href, true)
  api = a
  return a
}
const val = (v) => (v && typeof v === 'object' ? ('value' in v ? v.value : v) : v)
const txt = (t) => String(val(t) ?? '').replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, h) => h.match(/.{4}/g).map((x) => String.fromCharCode(parseInt(x, 16))).join(''))

// nombre legible de cada clase IFC que puede salir en un modelo de edificio
const CLASES = ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCSLAB', 'IFCCOLUMN', 'IFCBEAM', 'IFCDOOR', 'IFCWINDOW', 'IFCROOF', 'IFCSTAIR', 'IFCRAILING', 'IFCSPACE', 'IFCCOVERING', 'IFCFURNISHINGELEMENT', 'IFCUNITARYEQUIPMENT', 'IFCPUMP', 'IFCELECTRICDISTRIBUTIONBOARD', 'IFCSENSOR', 'IFCAIRTERMINAL', 'IFCDUCTSEGMENT', 'IFCPIPESEGMENT', 'IFCBUILDINGELEMENTPROXY', 'IFCPLATE', 'IFCMEMBER', 'IFCFOOTING']
const CODE = new Map(CLASES.filter((k) => W[k] != null).map((k) => [W[k], k]))

self.onmessage = async (e) => {
  const { id, url, file } = e.data
  try {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    const ifc = await getApi()
    const m = ifc.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false })

    // propiedades por elemento
    const psets = new Map()
    const rels = ifc.GetLineIDsWithType(m, W.IFCRELDEFINESBYPROPERTIES)
    for (let i = 0; i < rels.size(); i++) {
      const rel = ifc.GetLine(m, rels.get(i), true)
      const ps = rel.RelatingPropertyDefinition
      const kv = {}
      for (const p of ps?.HasProperties || []) kv[txt(p.Name)] = val(p.NominalValue)
      for (const o of rel.RelatedObjects || []) {
        const oid = o.expressID ?? val(o)
        psets.set(oid, { ...(psets.get(oid) || {}), [txt(ps?.Name)]: kv })
      }
    }
    // planta de cada elemento
    const planta = new Map()
    const cont = ifc.GetLineIDsWithType(m, W.IFCRELCONTAINEDINSPATIALSTRUCTURE)
    for (let i = 0; i < cont.size(); i++) {
      const rel = ifc.GetLine(m, cont.get(i), true)
      const nom = txt(rel.RelatingStructure?.Name)
      for (const o of rel.RelatedElements || []) planta.set(o.expressID ?? val(o), nom)
    }

    // geometría por elemento
    const els = new Map()
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    ifc.StreamAllMeshes(m, (mesh) => {
      const eid = mesh.expressID
      let el = els.get(eid)
      if (!el) els.set(eid, (el = { expressID: eid, pos: [], nor: [], idx: [], color: null }))
      for (let gi = 0; gi < mesh.geometries.size(); gi++) {
        const pg = mesh.geometries.get(gi)
        const geom = ifc.GetGeometry(m, pg.geometryExpressID)
        const v = ifc.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize())
        const ix = ifc.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize())
        if (!el.color) el.color = [pg.color.x, pg.color.y, pg.color.z, pg.color.w]
        const t = pg.flatTransformation
        const base = el.pos.length / 3
        for (let i = 0; i < v.length; i += 6) {
          const x = v[i], y = v[i + 1], z = v[i + 2]
          const px = t[0] * x + t[4] * y + t[8] * z + t[12], py = t[1] * x + t[5] * y + t[9] * z + t[13], pz = t[2] * x + t[6] * y + t[10] * z + t[14]
          el.pos.push(px, py, pz)
          el.nor.push(t[0] * v[i + 3] + t[4] * v[i + 4] + t[8] * v[i + 5], t[1] * v[i + 3] + t[5] * v[i + 4] + t[9] * v[i + 5], t[2] * v[i + 3] + t[6] * v[i + 4] + t[10] * v[i + 5])
          if (px < min[0]) min[0] = px; if (py < min[1]) min[1] = py; if (pz < min[2]) min[2] = pz
          if (px > max[0]) max[0] = px; if (py > max[1]) max[1] = py; if (pz > max[2]) max[2] = pz
        }
        for (let i = 0; i < ix.length; i++) el.idx.push(base + ix[i])
        geom.delete()
      }
    })

    // espacios: no tienen malla en web-ifc, pero sí datos que validar (IDS) y mostrar en el árbol
    const esp = ifc.GetLineIDsWithType(m, W.IFCSPACE)
    for (let i = 0; i < esp.size(); i++) if (!els.has(esp.get(i))) els.set(esp.get(i), { expressID: esp.get(i), pos: [], nor: [], idx: [], color: null })
    const out = []
    for (const el of els.values()) {
      // caja que envuelve el elemento (para colisiones y para encuadrar)
      const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < el.pos.length; i += 3) for (let k = 0; k < 3; k++) { if (el.pos[i + k] < bmin[k]) bmin[k] = el.pos[i + k]; if (el.pos[i + k] > bmax[k]) bmax[k] = el.pos[i + k] }
      const line = ifc.GetLine(m, el.expressID)
      out.push({
        expressID: el.expressID, guid: val(line.GlobalId), clase: CODE.get(line.type) || ifc.GetNameFromTypeCode?.(line.type) || String(line.type),
        nombre: txt(line.Name), descripcion: txt(line.Description), tag: txt(line.Tag), planta: planta.get(el.expressID) || '',
        psets: psets.get(el.expressID) || {}, color: el.color || [0.8, 0.8, 0.8, 1], bbox: el.pos.length ? [bmin, bmax] : null,
        position: new Float32Array(el.pos), normal: new Float32Array(el.nor), index: new Uint32Array(el.idx),
      })
    }
    ifc.CloseModel(m)
    self.postMessage({ id, ok: true, file, elementos: out, min, max, bytes: bytes.length }, out.flatMap((g) => [g.position.buffer, g.normal.buffer, g.index.buffer]))
  } catch (err) {
    self.postMessage({ id, ok: false, file, error: String(err?.message || err) })
  }
}
