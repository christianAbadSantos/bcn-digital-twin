#!/usr/bin/env node
// Convierte el CSV de arbolado viario de Open Data BCN en dos ficheros pequeños:
//   public/data/trees.bin   posiciones (Int32 lon/lat en microgrados) + grupo (Uint8)
//   public/data/trees.json  metadatos, informe de calidad y especies más frecuentes
// Uso: node scripts/build-trees.mjs ruta/al/arbrat-viari.csv [salida=public/data]
import fs from 'node:fs'
import path from 'node:path'

const [, , input, outDir = 'public/data'] = process.argv
if (!input) {
  console.error('Uso: node scripts/build-trees.mjs ruta/al/archivo.csv [carpeta_salida]')
  process.exit(1)
}

const BBOX = { lon: [2.05, 2.25], lat: [41.32, 41.47] } // Barcelona con margen
const PALM = /^(phoenix|washingtonia|chamaerops|trachycarpus|livistona|butia|syagrus|jubaea|brahea|howea|archontophoenix|cocos|sabal|trithrinax|rhapis|chamaedorea|arecastrum|roystonea)\b/i
const CONIF = /^(pinus|cupressus|cedrus|araucaria|abies|picea|taxus|juniperus|thuja|chamaecyparis|sequoia|sequoiadendron|cupressocyparis|x cuprocyparis|cuprocyparis|metasequoia|taxodium|podocarpus|cryptomeria|calocedrus|platycladus)\b/i
// 0 = frondosa, 1 = palmera, 2 = conífera
const groupOf = (sci, tipus) => {
  if (/palm/i.test(tipus) || PALM.test(sci)) return 1
  if (CONIF.test(sci)) return 2
  return 0
}

// Lector CSV en streaming (comillas, "" escapadas, saltos de línea dentro de campos, BOM)
async function* rows(file) {
  const stream = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 })
  let field = '', row = [], inQ = false, first = true, pendingQuote = false
  for await (let chunk of stream) {
    if (first) { chunk = chunk.replace(/^﻿/, ''); first = false }
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i]
      if (pendingQuote) {
        pendingQuote = false
        if (c === '"') { field += '"'; continue }
        inQ = false // la comilla anterior cerraba el campo; sigue el procesado normal de c
      }
      if (inQ) {
        if (c === '"') pendingQuote = true
        else field += c
      } else if (c === '"') inQ = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') {
        row.push(field); field = ''
        if (row.length > 1 || row[0] !== '') yield row
        row = []
      } else if (c !== '\r') field += c
    }
  }
  if (pendingQuote) inQ = false
  if (field !== '' || row.length) { row.push(field); yield row }
}

const t0 = Date.now()
let header = null, idx = null
const lon = [], lat = [], grp = []
const seen = new Set()
const q = { filas: 0, validos: 0, sinCoordenadas: 0, fueraDeBarcelona: 0, duplicados: 0, columnasIncorrectas: 0, sinEspecie: 0 }
const tipos = {}, especies = {}, barrios = {}

for await (const r of rows(input)) {
  if (!header) {
    header = r.map((h) => h.trim().toLowerCase())
    idx = Object.fromEntries(header.map((h, i) => [h, i]))
    for (const need of ['latitud', 'longitud', 'nom_cientific']) {
      if (!(need in idx)) { console.error(`Falta la columna "${need}". Cabecera encontrada: ${header.join(', ')}`); process.exit(1) }
    }
    continue
  }
  q.filas++
  if (r.length !== header.length) { q.columnasIncorrectas++; continue }
  const la = parseFloat(r[idx.latitud]), lo = parseFloat(r[idx.longitud])
  if (!Number.isFinite(la) || !Number.isFinite(lo)) { q.sinCoordenadas++; continue }
  if (lo < BBOX.lon[0] || lo > BBOX.lon[1] || la < BBOX.lat[0] || la > BBOX.lat[1]) { q.fueraDeBarcelona++; continue }
  const code = idx.codi != null ? r[idx.codi] : null
  if (code) { if (seen.has(code)) { q.duplicados++; continue } seen.add(code) }
  const sci = (r[idx.nom_cientific] || '').trim()
  const tipus = idx.tipus_element != null ? r[idx.tipus_element] : ''
  if (!sci || sci === '-') q.sinEspecie++
  const g = groupOf(sci, tipus)
  lon.push(Math.round(lo * 1e6)); lat.push(Math.round(la * 1e6)); grp.push(g)
  q.validos++
  tipos[tipus || '(vacío)'] = (tipos[tipus || '(vacío)'] || 0) + 1
  const sp = sci && sci !== '-' ? sci : '(sin especie)'
  especies[sp] = (especies[sp] || 0) + 1
  if (idx.nom_barri != null) barrios[r[idx.nom_barri]] = (barrios[r[idx.nom_barri]] || 0) + 1
}

const n = grp.length
if (n === 0) { console.error('No se ha podido leer ningún árbol válido. Revisa el archivo y el informe:', q); process.exit(1) }

const buf = Buffer.alloc(n * 9)
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
for (let i = 0; i < n; i++) { dv.setInt32(i * 8, lon[i], true); dv.setInt32(i * 8 + 4, lat[i], true) }
for (let i = 0; i < n; i++) buf[n * 8 + i] = grp[i]

const top = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k)
const grupos = [0, 1, 2].map((g) => grp.filter((x) => x === g).length)
const meta = {
  n,
  formato: 'trees.bin = n × (Int32 lon·1e6, Int32 lat·1e6) little-endian, luego n × Uint8 grupo (0 frondosa, 1 palmera, 2 conífera)',
  grupos: { frondosa: grupos[0], palmera: grupos[1], conifera: grupos[2] },
  calidad: q,
  tiposDeElemento: tipos,
  especiesTop: top(especies, 15).map(([nombre, total]) => ({ nombre, total })),
  barriosTop: top(barrios, 5).map(([nombre, total]) => ({ nombre, total })),
  fuente: 'Open Data BCN · Arbrat viari · Ajuntament de Barcelona',
  generado: new Date().toISOString().slice(0, 10),
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'trees.bin'), buf)
fs.writeFileSync(path.join(outDir, 'trees.json'), JSON.stringify(meta, null, 1))

console.log(`\nÁrboles válidos: ${n.toLocaleString('es')} de ${q.filas.toLocaleString('es')} filas (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
console.log('Descartados:', JSON.stringify({ ...q, filas: undefined, validos: undefined }))
console.log('Grupos:', JSON.stringify(meta.grupos))
console.log('Tipos de elemento:', JSON.stringify(tipos))
console.log('Especies más frecuentes:', meta.especiesTop.slice(0, 8).map((e) => `${e.nombre} (${e.total})`).join('; '))
console.log(`Escrito: ${path.join(outDir, 'trees.bin')} (${(buf.length / 1048576).toFixed(2)} MB) y trees.json`)
