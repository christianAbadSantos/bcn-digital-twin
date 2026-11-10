// Balizas V16 conectadas (DGT 3.0) en tiempo real.
// La DGT publica en abierto todas las incidencias de tráfico en DATEX II v3.7 (Punto de Acceso
// Nacional, NAP). Cada baliza V16 encendida aparece como un registro cuya referencia empieza por
// "V16_" (causa: vehículo detenido), con su posición, carretera, punto kilométrico y municipio.
// Se usa igual en el backend (functions/api/v16.js) y en el navegador (modo local con el proxy /dgt).

export const DGT_SITUATIONS = 'https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml'

// Cataluña (aprox.): el feed es de toda España
const BBOX = { w: 0.15, e: 3.35, s: 40.5, n: 42.9 }

const tag = (s, name) => {
  const i = s.indexOf(`<${name}>`)
  if (i < 0) return null
  const j = s.indexOf(`</${name}>`, i)
  return j < 0 ? null : s.slice(i + name.length + 2, j)
}

// Recorre el XML buscando solo los registros V16 (indexOf es nativo y rápido: el feed pesa ~7 MB
// y en Cloudflare cada petición tiene muy poco tiempo de CPU)
export function parseV16(xml, bbox = BBOX) {
  const out = []
  let total = 0
  let from = 0
  for (;;) {
    const k = xml.indexOf('>V16_', from)
    if (k < 0) break
    const start = xml.lastIndexOf('<sit:situationRecord ', k)
    const end = xml.indexOf('</sit:situationRecord>', k)
    from = end < 0 ? k + 5 : end
    if (start < 0 || end < 0) continue
    const r = xml.slice(start, end)
    total++
    const lat = Number(tag(r, 'loc:latitude'))
    const lon = Number(tag(r, 'loc:longitude'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (lon < bbox.w || lon > bbox.e || lat < bbox.s || lat > bbox.n) continue
    if (tag(r, 'com:validityStatus') === 'suspended') continue
    const ref = tag(r, 'sit:situationRecordCreationReference') || ''
    const km = Number(tag(r, 'lse:kilometerPoint'))
    out.push({
      id: ref.replace(/^V16_/, '').slice(0, 12), // id anónimo de la activación (no identifica al vehículo)
      lat,
      lon,
      road: tag(r, 'loc:roadName') || '',
      km: Number.isFinite(km) ? Math.round(km * 10) / 10 : null,
      municipality: tag(r, 'lse:municipality') || '',
      province: tag(r, 'lse:province') || '',
      direction: tag(r, 'loc:tpegDirection') || '',
      since: Date.parse(tag(r, 'sit:situationRecordCreationTime') || '') || null,
    })
  }
  return { ts: Date.now(), totalSpain: total, beacons: out }
}
