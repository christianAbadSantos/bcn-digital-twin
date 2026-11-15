// Genera public/data/drenaje.json para el módulo de agua y lluvia:
//   - Límites reales de los 10 distritos (Open Data BCN, "Districtes i barris", CC BY 4.0) y su superficie.
//   - Reparto del suelo de cada distrito según la calificación urbanística real (public/data/urbanisme.json,
//     Mapa Urbanístic de Catalunya): qué parte es parque o espacio libre (permeable) y qué parte está urbanizada.
//     Con eso se estima el coeficiente de escorrentía de cada distrito.
// Uso (después de build-urbanisme.mjs):
//   node scripts/build-drenaje.mjs
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('public/data/drenaje.json')
const URL_DISTRICTES = 'https://opendata-ajuntament.barcelona.cat/data/dataset/808daafa-d9ce-48c0-925a-fa5afdb1ed41/resource/576bc645-9481-4bc4-b8bf-f5972c20df3f/download'
const UA = 'bcn-digital-twin/0.5 (+https://bcn-digital-twin.pages.dev)'

// ---- CSV con comillas
function parseCsv(t) {
  const rows = []
  let row = [], f = '', q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"' && t[i + 1] === '"') { f += '"'; i++ } else if (c === '"') q = false
      else f += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(f); f = ''
      if (row.length > 1) rows.push(row)
      row = []
    } else f += c
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  return rows
}
// WKT POLYGON / MULTIPOLYGON → coordenadas GeoJSON
function wkt(s) {
  const nums = (r) => r.trim().split(',').map((p) => p.trim().split(/\s+/).map(Number))
  const polys = (body) => body.split(/\)\s*\)\s*,\s*\(\s*\(/).map((p) => p.replace(/^\(+|\)+$/g, '').split(/\)\s*,\s*\(/).map(nums))
  if (s.startsWith('MULTIPOLYGON')) return { type: 'MultiPolygon', coordinates: polys(s.slice(s.indexOf('(') + 1, s.lastIndexOf(')'))) }
  if (s.startsWith('POLYGON')) return { type: 'Polygon', coordinates: polys(s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')))[0] }
  throw new Error('WKT no soportado: ' + s.slice(0, 20))
}
const r5 = (n) => Math.round(n * 1e5) / 1e5
const roundGeom = (g) => ({ ...g, coordinates: g.type === 'Polygon' ? g.coordinates.map((r) => r.map((p) => [r5(p[0]), r5(p[1])])) : g.coordinates.map((pl) => pl.map((r) => r.map((p) => [r5(p[0]), r5(p[1])]))) })

function inRing(p, r) {
  let ok = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ok = !ok
  }
  return ok
}
const inPoly = (p, poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h))
const inGeom = (p, g) => (g.type === 'Polygon' ? inPoly(p, g.coordinates) : g.coordinates.some((c) => inPoly(p, c)))
function bbox(g) {
  const b = [Infinity, Infinity, -Infinity, -Infinity]
  const pts = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates.flatMap((p) => p[0])
  for (const [x, y] of pts) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y) }
  return b
}

// ---- distritos
const csv = await (await fetch(URL_DISTRICTES, { headers: { 'user-agent': UA } })).text()
const [head, ...rows] = parseCsv(csv)
const iCodi = head.indexOf('Codi_Districte'), iNom = head.indexOf('nom_districte'), iGeo = head.indexOf('geometria_wgs84')
const districtes = rows.map((r) => ({ codi: r[iCodi], nom: r[iNom], geometry: wkt(r[iGeo]) }))
console.log('distritos:', districtes.length)

// ---- calificación urbanística: muestreo en malla de ~100 m
const urb = JSON.parse(fs.readFileSync('public/data/urbanisme.json', 'utf8'))
const VERD = new Set(['SV', 'SS', 'N1', 'N2', 'N3', 'N4']) // parques, espacios libres y suelo no urbanizable
const zones = urb.features.map((f) => ({ q: f.properties.q, g: f.geometry, b: bbox(f.geometry) }))
const STEP_LAT = 0.0009, STEP_LON = 0.0012 // ≈ 100 m
const KM2_PUNT = (STEP_LAT * 111.32) * (STEP_LON * 111.32 * Math.cos((41.39 * Math.PI) / 180))

const out = []
for (const d of districtes) {
  const b = bbox(d.geometry)
  let total = 0, verd = 0, viari = 0
  for (let y = b[1]; y <= b[3]; y += STEP_LAT) {
    for (let x = b[0]; x <= b[2]; x += STEP_LON) {
      const p = [x, y]
      if (!inGeom(p, d.geometry)) continue
      total++
      let q = null
      for (const z of zones) {
        if (p[0] < z.b[0] || p[0] > z.b[2] || p[1] < z.b[1] || p[1] > z.b[3]) continue
        if (inGeom(p, z.g)) { q = z.q; if (!q.startsWith('SX')) break } // el viario solo si no hay otra calificación
      }
      if (q && VERD.has(q)) verd++
      else if (q && q.startsWith('SX')) viari++
    }
  }
  const sb = bbox(d.geometry)
  out.push({
    type: 'Feature',
    properties: {
      codi: d.codi,
      nom: d.nom,
      km2: Math.round(total * KM2_PUNT * 100) / 100,
      verd: Math.round((verd / total) * 1000) / 1000, // fracción de suelo permeable (parques, Collserola…)
      viari: Math.round((viari / total) * 1000) / 1000,
      centre: [r5((sb[0] + sb[2]) / 2), r5((sb[1] + sb[3]) / 2)],
    },
    geometry: roundGeom(d.geometry),
  })
  console.log(d.nom.padEnd(22), 'km²', (total * KM2_PUNT).toFixed(1), 'verde', ((verd / total) * 100).toFixed(1) + ' %')
}

fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', fuente: 'Districtes: Open Data BCN (CC BY 4.0) · suelo: Mapa Urbanístic de Catalunya', features: out }))
console.log('escrito', OUT, (fs.statSync(OUT).size / 1e3).toFixed(0), 'kB')
