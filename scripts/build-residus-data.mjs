// Genera public/data/residus.json con datos REALES de residuos y limpieza de Barcelona:
//   - Puntos de contenedores (OpenStreetMap, amenity=recycling + recycling_type=container) con sus
//     fracciones: resto, envases, papel, vidrio y orgánica. Cada punto es una "isla" de contenedores.
//   - Puntos verdes de zona y de barrio (Open Data BCN).
//   - Puntos críticos de limpieza con su último estado (Open Data BCN, campaña 2017-2018).
// La API .NET (fcc-residus-api) y el gemelo usan este mismo fichero. Uso:
//   node scripts/build-residus-data.mjs
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('public/data/residus.json')
const UA = 'bcn-digital-twin/0.5 (+https://bcn-digital-twin.pages.dev)'
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
// Barcelona ciudad (aprox.)
const BBOX = [41.317, 2.052, 41.469, 2.229]

// fracción del gemelo ← etiquetas recycling:* de OSM
const FRACCIONS = {
  rebuig: ['waste'],
  envasos: ['plastic', 'plastic_packaging', 'plastic_bottles', 'cans', 'beverage_cartons', 'PET', 'plastic_bags', 'scrap_metal'],
  paper: ['paper', 'paper_packaging', 'cardboard', 'magazines', 'newspaper', 'cartons'],
  vidre: ['glass_bottles', 'glass'],
  organica: ['organic', 'food_waste', 'green_waste'],
}
const ORDER = Object.keys(FRACCIONS) // bit 0 = rebuig, 1 = envasos, 2 = paper, 3 = vidre, 4 = organica

async function get(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'user-agent': UA, ...(opts.headers || {}) } })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r
}

async function overpass(q) {
  for (let i = 0; i < 6; i++) {
    for (const ep of OVERPASS) {
      try {
        const r = await get(ep, { method: 'POST', body: new URLSearchParams({ data: q }) })
        const t = await r.text()
        if (t.trim().startsWith('{')) return JSON.parse(t)
      } catch (e) { console.log('overpass', ep, e.message) }
    }
    await new Promise((r) => setTimeout(r, 5000 * 2 ** i))
  }
  throw new Error('Overpass no responde')
}

// --- contenedores (OSM)
const osm = await overpass(`[out:json][timeout:120];node(${BBOX.join(',')})["amenity"="recycling"]["recycling_type"="container"];out;`)
const punts = []
for (const e of osm.elements) {
  let mask = 0
  ORDER.forEach((f, i) => { if (FRACCIONS[f].some((k) => e.tags[`recycling:${k}`] === 'yes')) mask |= 1 << i })
  if (!mask) continue
  // [id OSM, lon, lat, fracciones (bits), soterrado]
  punts.push([e.id, Math.round(e.lon * 1e5) / 1e5, Math.round(e.lat * 1e5) / 1e5, mask, e.tags.location === 'underground' ? 1 : 0])
}
console.log('puntos de contenedores:', punts.length, 'contenedores:', punts.reduce((s, p) => s + ORDER.filter((_, i) => p[3] & (1 << i)).length, 0))

// --- puntos verdes (Open Data BCN)
const PV = {
  zona: 'https://opendata-ajuntament.barcelona.cat/data/dataset/909d9d08-4d70-436f-81fc-b4e317d172f5/resource/01b09ae3-c361-4dfd-a048-36c16134e21d/download',
  barri: 'https://opendata-ajuntament.barcelona.cat/data/dataset/14e9f5c9-8c98-47d5-84b6-99214de13336/resource/523e4bd0-88db-42fe-8d27-a49864377023/download',
}
const puntsVerds = []
for (const [tipus, url] of Object.entries(PV)) {
  const j = JSON.parse((await (await get(url)).text()).replace(/^﻿/, ''))
  for (const x of j) {
    const g = x.geo_epgs_4326_latlon
    if (!g?.lat) continue
    puntsVerds.push({ nom: x.name, tipus, barri: x.addresses?.[0]?.neighborhood_name || '', lon: Math.round(g.lon * 1e5) / 1e5, lat: Math.round(g.lat * 1e5) / 1e5 })
  }
}
console.log('puntos verdes:', puntsVerds.length)

// --- puntos críticos de limpieza (Open Data BCN, diciembre 2018: el último publicado)
const PC = 'https://opendata-ajuntament.barcelona.cat/data/dataset/a7b28432-d27b-4c7c-ba9f-b8936a3d8f6f/resource/b2829697-092d-46df-a852-58dd2d9da107/download/5.-dadesoddesembre.csv'
const csv = (await (await get(PC)).text()).replace(/^﻿/, '').trim().split(/\r?\n/)
const head = csv[0].split(',')
const col = (n) => head.findIndex((h) => h === n)
const estatCols = head.map((h, i) => [h, i]).filter(([h]) => /^Estat_/.test(h)).map(([, i]) => i)
const puntsCritics = csv.slice(1).map((l) => l.split(',')).filter((c) => Number(c[col('Latitud')])).map((c) => {
  const estats = estatCols.map((i) => Number(c[i])).filter((v) => Number.isFinite(v))
  return {
    id: Number(c[col('Número_punt_crític')]),
    districte: c[col('Nom_Districte')],
    barri: c[col('Nom_Barri')],
    carrer: `${c[col('Nom_Carrer')]} ${c[col('Número')] || ''}`.trim(),
    motiu: c[col('Motiu')],
    lon: Number(c[col('Longitud')]),
    lat: Number(c[col('Latitud')]),
    estat: estats[estats.length - 1] ?? null, // índice de suciedad de la última visita (más alto = peor)
    tendencia: estats.length > 1 ? Math.round((estats[estats.length - 1] - estats[0]) * 10) / 10 : 0,
  }
})
console.log('puntos críticos de limpieza:', puntsCritics.length)

fs.writeFileSync(OUT, JSON.stringify({
  generat: new Date().toISOString(),
  fonts: {
    contenidors: 'OpenStreetMap (ODbL) · amenity=recycling, recycling_type=container',
    puntsVerds: 'Open Data BCN · Punts verds de zona i de barri (CC BY 4.0)',
    puntsCritics: 'Open Data BCN · Estat dels punts crítics en neteja, desembre 2018 (CC BY 4.0)',
  },
  fraccions: ORDER,
  punts,
  puntsVerds,
  puntsCritics,
}))
console.log('escrito', OUT, (fs.statSync(OUT).size / 1024).toFixed(0), 'KB')
