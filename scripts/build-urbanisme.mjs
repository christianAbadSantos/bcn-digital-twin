// Genera public/data/urbanisme.json: la calificación urbanística de Barcelona (polígonos reales)
// sacada del Mapa Urbanístic de Catalunya (MUC, Departament de Territori de la Generalitat),
// publicado como servicio ArcGIS por la Diputació de Barcelona. Licencia: datos abiertos de la Generalitat.
// El servidor no permite CORS, por eso se descarga aquí y se sirve como fichero estático. Uso:
//   node scripts/build-urbanisme.mjs
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('public/data/urbanisme.json')
const URL_MUC = 'https://gissrv.diba.cat/arcgis/rest/services/CARTOBASE/MUC/MapServer/1/query'
const UA = 'bcn-digital-twin/0.5 (+https://bcn-digital-twin.pages.dev)'
const PAGE = 1000

const r5 = (n) => Math.round(n * 1e5) / 1e5
// quita vértices repetidos tras redondear (ahorra bastante peso)
function ring(coords) {
  const out = []
  for (const c of coords) {
    const p = [r5(c[0]), r5(c[1])]
    const l = out[out.length - 1]
    if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p)
  }
  return out.length >= 4 ? out : null
}
function geom(g) {
  if (!g) return null
  if (g.type === 'Polygon') {
    const rs = g.coordinates.map(ring).filter(Boolean)
    return rs.length ? { type: 'Polygon', coordinates: rs } : null
  }
  if (g.type === 'MultiPolygon') {
    const ps = g.coordinates.map((p) => p.map(ring).filter(Boolean)).filter((p) => p.length)
    return ps.length ? { type: 'MultiPolygon', coordinates: ps } : null
  }
  return null
}

const features = []
for (let off = 0; ; off += PAGE) {
  const q = new URLSearchParams({
    where: "CODI_INE='08019'", // Barcelona
    outFields: 'C_QUAL_MUC,D_QUAL_AJT',
    outSR: '4326',
    geometryPrecision: '6',
    maxAllowableOffset: '0.000004', // ~0,4 m: simplifica sin que se note
    orderByFields: 'OBJECTID',
    resultOffset: String(off),
    resultRecordCount: String(PAGE),
    f: 'geojson',
  })
  let j
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${URL_MUC}?${q}`, { headers: { 'user-agent': UA } })
      if (!r.ok) throw new Error(String(r.status))
      j = await r.json()
      break
    } catch (e) {
      console.log('reintento', off, e.message)
      await new Promise((s) => setTimeout(s, 3000 * (i + 1)))
    }
  }
  if (!j) throw new Error('El servicio del MUC no responde')
  for (const f of j.features) {
    const g = geom(f.geometry)
    if (!g) continue
    features.push({ type: 'Feature', properties: { q: f.properties.C_QUAL_MUC, d: (f.properties.D_QUAL_AJT || '').replace(/\s+/g, ' ').trim() }, geometry: g })
  }
  console.log('polígonos:', features.length)
  if (j.features.length < PAGE) break
}

fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', fuente: 'Mapa Urbanístic de Catalunya (Generalitat), gener 2023', features }))
console.log('escrito', OUT, (fs.statSync(OUT).size / 1e6).toFixed(1), 'MB')
