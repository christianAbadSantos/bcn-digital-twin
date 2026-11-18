// Genera public/data/flota.json: base logística, puntos de entrega y matriz de distancias y tiempos
// por carretera entre todos ellos (OSRM sobre OpenStreetMap, una sola petición "table").
// La empresa, los clientes y los pedidos son SIMULADOS; las distancias y tiempos son reales.
//   node scripts/build-flota.mjs
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('public/data/flota.json')
const UA = 'bcn-digital-twin/0.5 (+https://bcn-digital-twin.pages.dev)'

const DEPOT = { id: 'BASE', nom: 'Base ZAL · Puerto de Barcelona', lon: 2.1432, lat: 41.344 }

// puntos de entrega (ubicación aproximada de zonas comerciales e industriales reales; clientes inventados)
const SITES = [
  ['MERCA', 'Mercabarna', 'mayorista', 2.1285, 41.3427],
  ['SANTS', 'Sants · c/ de Sants', 'tienda', 2.135, 41.3755],
  ['CORTS', 'Les Corts · Travessera', 'supermercado', 2.13, 41.385],
  ['SARRI', 'Sarrià', 'supermercado', 2.1215, 41.4],
  ['GRACI', 'Gràcia · Pl. del Sol', 'tienda', 2.1575, 41.4005],
  ['SJOAN', 'Eixample · Pg. de Sant Joan', 'restaurante', 2.1735, 41.396],
  ['SAGFA', 'Sagrada Família', 'supermercado', 2.1745, 41.4036],
  ['HORTA', 'Horta', 'tienda', 2.16, 41.4295],
  ['NBARR', 'Nou Barris · Via Júlia', 'supermercado', 2.177, 41.439],
  ['SANDR', 'Sant Andreu', 'tienda', 2.189, 41.4355],
  ['SAGRE', 'La Sagrera', 'almacén', 2.191, 41.42],
  ['PBNOU', 'Poblenou · Rambla', 'restaurante', 2.1995, 41.4],
  ['DMAR', 'Diagonal Mar', 'centro comercial', 2.2165, 41.4105],
  ['BARCE', 'Barceloneta', 'restaurante', 2.189, 41.38],
  ['BORN', 'Ciutat Vella · Born', 'tienda', 2.182, 41.385],
  ['RAVAL', 'Raval', 'tienda', 2.169, 41.38],
  ['PSEC', 'Poble-sec', 'restaurante', 2.16, 41.374],
  ['SGERV', 'Sant Gervasi', 'farmacia', 2.14, 41.401],
  ['UNIV', 'Zona Universitària', 'cafetería', 2.1135, 41.3848],
  ['LHOSP', "L'Hospitalet · Gran Via", 'centro comercial', 2.1146, 41.3587],
  ['CORNE', 'Cornellà', 'almacén', 2.0745, 41.356],
  ['SBOI', 'Sant Boi de Llobregat', 'almacén', 2.04, 41.343],
  ['PRAT', 'El Prat de Llobregat', 'supermercado', 2.095, 41.326],
  ['ESPLU', 'Esplugues de Llobregat', 'supermercado', 2.088, 41.377],
  ['SFELI', 'Sant Feliu de Llobregat', 'almacén', 2.045, 41.382],
  ['SCUGA', 'Sant Cugat del Vallès', 'supermercado', 2.0844, 41.4727],
  ['BADAL', 'Badalona centro', 'supermercado', 2.2445, 41.4475],
  ['SCOLO', 'Santa Coloma de Gramenet', 'tienda', 2.208, 41.451],
  ['MONTC', 'Montcada i Reixac', 'almacén', 2.18, 41.485],
  ['CERDA', 'Cerdanyola del Vallès', 'almacén', 2.14, 41.49],
  ['SADRI', 'Sant Adrià de Besòs', 'almacén', 2.219, 41.43],
  ['VILAD', 'Viladecans', 'centro comercial', 2.014, 41.315],
  ['CASTE', 'Castelldefels', 'supermercado', 1.976, 41.28],
  ['RUBI', 'Rubí', 'almacén', 2.03, 41.493],
  ['MOLLE', 'Mollet del Vallès', 'almacén', 2.213, 41.54],
  ['BADPO', 'Badalona · polígono', 'almacén', 2.228, 41.457],
].map(([id, nom, tipo, lon, lat]) => ({ id, nom, tipo, lon, lat }))

const all = [DEPOT, ...SITES]
const coords = all.map((p) => `${p.lon},${p.lat}`).join(';')
const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`
const r = await fetch(url, { headers: { 'user-agent': UA } })
const j = await r.json()
if (j.code !== 'Ok') throw new Error(`OSRM: ${j.code} ${j.message || ''}`)

// puntos ajustados a la calle más cercana (lo que devuelve OSRM)
const snapped = j.sources.map((s) => s.location.map((v) => Math.round(v * 1e5) / 1e5))
const km = j.distances.map((row) => row.map((d) => Math.round(d / 10) / 100))
const min = j.durations.map((row) => row.map((d) => Math.round(d / 6) / 10))

const out = {
  source: 'Distancias y tiempos por carretera: OSRM (router.project-osrm.org) sobre OpenStreetMap. Empresa, clientes y pedidos: simulados.',
  depot: { ...DEPOT, lon: snapped[0][0], lat: snapped[0][1] },
  sites: SITES.map((s, i) => ({ ...s, lon: snapped[i + 1][0], lat: snapped[i + 1][1] })),
  ids: all.map((p) => p.id),
  km,
  min,
}
fs.writeFileSync(OUT, JSON.stringify(out))
console.log('escrito', OUT, (fs.statSync(OUT).size / 1024).toFixed(1), 'KB', `${all.length} puntos`)
