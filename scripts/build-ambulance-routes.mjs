// Genera public/data/ambulance-routes.json: rutas reales por carretera (OSRM sobre OpenStreetMap)
// desde varios puntos del área metropolitana hasta la entrada de urgencias del Hospital Clínic.
// Las ambulancias del gemelo son SIMULADAS y recorren estas rutas. Se ejecuta una sola vez:
//   node scripts/build-ambulance-routes.mjs
// (usa el servidor público de demostración de OSRM: pocas peticiones y espaciadas)
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('public/data/ambulance-routes.json')
const UA = 'bcn-digital-twin/0.5 (+https://bcn-digital-twin.pages.dev)'
const DEST = { lon: 2.152712, lat: 41.389827 } // entrada de urgencias del Clínic (OSM 7861380641)

const ORIGINS = [
  { id: 'AMB-01', tipo: 'SVA', origen: 'Plaça de les Glòries', lon: 2.1873, lat: 41.4036 },
  { id: 'AMB-02', tipo: 'SVB', origen: 'Estació de Sants', lon: 2.1406, lat: 41.379 },
  { id: 'AMB-03', tipo: 'SVA', origen: 'Badalona (B-10)', lon: 2.2425, lat: 41.4462 },
  { id: 'AMB-04', tipo: 'SVB', origen: "L'Hospitalet (Gran Via)", lon: 2.1146, lat: 41.3587 },
  { id: 'AMB-05', tipo: 'SVA', origen: 'Aeroport (C-31)', lon: 2.0785, lat: 41.2974 },
  { id: 'AMB-06', tipo: 'SVB', origen: 'Barceloneta', lon: 2.1893, lat: 41.3795 },
  { id: 'AMB-07', tipo: 'SVB', origen: 'Sant Cugat (C-16)', lon: 2.0844, lat: 41.4727 },
  { id: 'AMB-08', tipo: 'SVA', origen: 'Nou Barris (Ronda de Dalt)', lon: 2.1779, lat: 41.4372 },
  { id: 'AMB-09', tipo: 'SVB', origen: 'Zona Universitària', lon: 2.1135, lat: 41.3848 },
  { id: 'AMB-10', tipo: 'SVB', origen: 'Poblenou', lon: 2.2003, lat: 41.4006 },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = []
for (const o of ORIGINS) {
  const url = `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${DEST.lon},${DEST.lat}?overview=full&geometries=geojson&annotations=distance,duration`
  const r = await fetch(url, { headers: { 'user-agent': UA } })
  const j = await r.json()
  const rt = j.routes?.[0]
  if (!rt) { console.log('sin ruta', o.id, j.code); continue }
  const ann = rt.legs[0].annotation
  // coordenadas a 5 decimales (~1 m) y duración de cada tramo (s), para velocidades realistas por tramo
  out.push({
    ...o,
    km: Math.round(rt.distance / 100) / 10,
    min: Math.round(rt.duration / 6) / 10,
    coords: rt.geometry.coordinates.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]),
    segDur: ann.duration.map((d) => Math.round(d * 10) / 10),
    segLen: ann.distance.map((d) => Math.round(d * 10) / 10),
  })
  console.log(o.id, o.origen, `${(rt.distance / 1000).toFixed(1)} km`, `${(rt.duration / 60).toFixed(1)} min`, rt.geometry.coordinates.length, 'puntos')
  await sleep(1200)
}
fs.writeFileSync(OUT, JSON.stringify({ dest: DEST, source: 'OSRM (router.project-osrm.org) sobre OpenStreetMap', routes: out }))
console.log('escrito', OUT, (fs.statSync(OUT).size / 1024).toFixed(0), 'KB')
