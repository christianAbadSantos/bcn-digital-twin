// Motor de urgencias del gemelo: ambulancias (simuladas) que recorren rutas reales, cálculo de la hora
// de llegada (ETA) con tráfico y balizas V16 reales, y asignación de bahía en el muelle del hospital,
// como la asignación de puestos de estacionamiento (stands) a los aviones en un aeropuerto.
// Funciones puras: se pueden probar sin navegador.

export const DWELL_MIN = { SVA: 18, SVB: 12 } // minutos que una ambulancia ocupa la bahía (transferencia del paciente)
export const V16_RADIUS_M = 120 // una baliza a menos de esta distancia de la ruta pendiente la afecta
export const V16_DELAY_MIN = 4 // retraso estimado por baliza en la ruta (carril ocupado, frenazos)

const R = 6371000
const rad = (d) => (d * Math.PI) / 180
export function distM(a, b) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0])
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
// distancia de un punto a un segmento (aprox. plana, válida a escala de ciudad)
function distToSeg(p, a, b) {
  const kx = Math.cos(rad(p[1])) * 111320, ky = 110540
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky
  const dx = bx - ax, dy = by - ay
  const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}

// prepara una ruta: tiempos acumulados por vértice (s) a partir de la duración de cada tramo de OSRM
export function prepareRoute(r) {
  const cumT = [0], cumD = [0]
  for (let i = 0; i < r.coords.length - 1; i++) {
    cumT.push(cumT[i] + (r.segDur[i] ?? 0))
    cumD.push(cumD[i] + (r.segLen[i] ?? distM(r.coords[i], r.coords[i + 1])))
  }
  return { ...r, cumT, cumD, total: cumT[cumT.length - 1], length: cumD[cumD.length - 1] }
}

// posición tras t segundos de "tiempo de ruta" (el que marca OSRM)
export function positionAt(rt, t) {
  const T = Math.max(0, Math.min(t, rt.total))
  let lo = 0, hi = rt.cumT.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rt.cumT[m] <= T) lo = m; else hi = m }
  const seg = rt.cumT[hi] - rt.cumT[lo] || 1
  const f = (T - rt.cumT[lo]) / seg
  const a = rt.coords[lo], b = rt.coords[hi]
  const pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
  const heading = (Math.atan2((b[0] - a[0]) * Math.cos(rad(a[1])), b[1] - a[1]) * 180) / Math.PI
  const speed = (rt.segLen[lo] ?? 0) / ((rt.segDur[lo] ?? 1) || 1) // m/s según OSRM en ese tramo
  return { pos, idx: lo, heading: (heading + 360) % 360, speedMs: speed, distLeft: rt.length - (rt.cumD[lo] + (rt.cumD[hi] - rt.cumD[lo]) * f) }
}

// tramo pendiente de la ruta (para dibujarlo y para buscar balizas en él)
export const remainingPath = (rt, idx, pos) => [pos, ...rt.coords.slice(idx + 1)]

// balizas V16 sobre el tramo pendiente
export function beaconsOnPath(path, beacons, radius = V16_RADIUS_M) {
  const hits = []
  for (const b of beacons) {
    const p = [b.lon, b.lat]
    for (let i = 0; i < path.length - 1; i++) {
      // descarte rápido por caja (~300 m)
      const a = path[i], c = path[i + 1]
      if (p[0] < Math.min(a[0], c[0]) - 0.004 || p[0] > Math.max(a[0], c[0]) + 0.004 || p[1] < Math.min(a[1], c[1]) - 0.003 || p[1] > Math.max(a[1], c[1]) + 0.003) continue
      if (distToSeg(p, a, c) <= radius) { hits.push(b); break }
    }
  }
  return hits
}

// factor de tráfico en el tramo pendiente: velocidad actual / habitual de los sensores cercanos (≤ 600 m).
// Con sirenas la ambulancia sufre solo la mitad de la congestión.
export function trafficFactor(path, zones) {
  if (!zones?.length) return 1
  const near = zones.filter((z) => path.some((p, i) => i % 8 === 0 && distM(p, [z.lon, z.lat]) < 600))
  if (!near.length) return 1
  const ratio = near.reduce((s, z) => s + Math.min(1, z.ratio), 0) / near.length
  return 1 + (1 / Math.max(0.35, ratio) - 1) * 0.5
}

// Compatibilidad unidad → tipo de bahía, en orden de preferencia. Las bahías SVA (más anchas y con
// acceso directo al box de críticos) quedan reservadas para soporte vital avanzado.
const PREF = { SVA: ['SVA', 'POLIVALENTE'], SVB: ['SVB', 'POLIVALENTE'] }

// Asigna bahía a cada llegada, en orden de ETA, como un planificador de stands:
//   arrivals: [{ id, tipo, etaMs, prevBay }]   bays: [{ code, tipo, prioridad, freeAt }]
// Devuelve { [id]: { bay, startMs, waitMin } }. Mantiene la bahía anterior si no empeora más de 1 min.
export function assignBays(arrivals, bays, nowMs) {
  const free = new Map(bays.map((b) => [b.code, Math.max(nowMs, b.freeAt || 0)]))
  const out = {}
  for (const a of [...arrivals].sort((x, y) => x.etaMs - y.etaMs)) {
    const prefs = PREF[a.tipo] || PREF.SVB
    const opts = bays
      .filter((b) => prefs.includes(b.tipo))
      .map((b) => ({ b, start: Math.max(a.etaMs, free.get(b.code)), rank: prefs.indexOf(b.tipo) * 10 + (b.prioridad || 0) }))
      .sort((x, y) => x.start - y.start || x.rank - y.rank)
    if (!opts.length) continue
    let pick = opts[0]
    const prev = a.prevBay && opts.find((o) => o.b.code === a.prevBay)
    if (prev && prev.start - pick.start <= 60000) pick = prev
    const dwell = (DWELL_MIN[a.tipo] || 12) * 60000
    free.set(pick.b.code, pick.start + dwell)
    out[a.id] = { bay: pick.b.code, startMs: pick.start, waitMin: Math.max(0, Math.round((pick.start - a.etaMs) / 60000)) }
  }
  return out
}

// Uplink LoRaWAN tal como lo entrega The Things Stack (v3) — formato de los mensajes simulados
export function lorawanUplink(amb, fCnt, gateway) {
  return {
    end_device_ids: { device_id: amb.id.toLowerCase(), dev_eui: amb.devEui },
    received_at: new Date().toISOString(),
    uplink_message: {
      f_port: 2,
      f_cnt: fCnt,
      decoded_payload: { lat: +amb.pos[1].toFixed(5), lon: +amb.pos[0].toFixed(5), speed_kmh: Math.round(amb.speedKmh), heading: Math.round(amb.heading), estado: amb.phase },
      rx_metadata: gateway ? [{ gateway_ids: { gateway_id: gateway.id }, rssi: gateway.rssi, snr: gateway.snr }] : [],
      settings: { data_rate: { lora: { spreading_factor: gateway?.sf || 9, bandwidth: 125000 } }, frequency: '868100000' },
    },
  }
}
