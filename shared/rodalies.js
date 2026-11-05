// Trenes REALES de Rodalies (Cercanías Renfe) en tiempo real, a partir de los feeds GTFS-RT
// abiertos de Renfe (la misma fuente que usan webs como TrainTracker24):
//   https://gtfsrt.renfe.com/vehicle_positions.json  → posición de cada tren
//   https://gtfsrt.renfe.com/trip_updates.json       → retraso de cada viaje
// Se usa igual en el backend (functions/api/rodalies.js) y en el navegador (modo local).

export const RENFE_POSITIONS = 'https://gtfsrt.renfe.com/vehicle_positions.json'
export const RENFE_UPDATES = 'https://gtfsrt.renfe.com/trip_updates.json'

// zona de Rodalies de Catalunya (aprox.)
const BBOX = { w: 0.9, e: 3.3, s: 40.5, n: 42.5 }

// Colores oficiales aproximados de las líneas de Rodalies
export const LINE_COLORS = {
  R1: '#6ab2e0', R2: '#3aa142', R2N: '#3aa142', R2S: '#3aa142', R3: '#e6322e', R4: '#f6a21a',
  R7: '#b47fbb', R8: '#8a1b6e', R11: '#0d6eb3', R13: '#e7417e', R14: '#6b4a9c', R15: '#9b8a57',
  R16: '#bf1e2d', R17: '#f2a01e', RG1: '#0d6eb3', RT1: '#2bb3a8', RT2: '#e46e9e', RL3: '#9b8a57', RL4: '#ffdc00',
}

// "R2N-12345-PLATF.(2)" → "R2N"; tripId "5108J25696R1" → "R1"
function lineOf(label, tripId) {
  const m = /^([A-Z]+\d*[A-Z]?)-/.exec(label || '')
  if (m) return m[1]
  const t = /(R[GTL]?\d+[NS]?)$/.exec(tripId || '')
  return t ? t[1] : '?'
}

// Une posiciones y retrasos y deja solo los trenes de Rodalies de Catalunya
export function parseRodalies(positions, updates) {
  const delays = new Map()
  for (const e of updates?.entity || []) {
    const tu = e.tripUpdate
    if (!tu?.trip?.tripId) continue
    const d = tu.delay ?? tu.stopTimeUpdate?.[0]?.arrival?.delay ?? tu.stopTimeUpdate?.[0]?.departure?.delay
    if (d != null) delays.set(tu.trip.tripId, Number(d))
  }
  const trains = []
  for (const e of positions?.entity || []) {
    const v = e.vehicle
    const p = v?.position
    if (!p || p.longitude < BBOX.w || p.longitude > BBOX.e || p.latitude < BBOX.s || p.latitude > BBOX.n) continue
    const tripId = v.trip?.tripId
    const line = lineOf(v.vehicle?.label, tripId)
    const delay = delays.has(tripId) ? delays.get(tripId) : null
    trains.push({
      id: v.vehicle?.id || e.id,
      line,
      color: LINE_COLORS[line] || '#6b7280',
      lat: p.latitude,
      lon: p.longitude,
      status: v.currentStatus || null, // STOPPED_AT | IN_TRANSIT_TO | INCOMING_AT
      stopId: v.stopId || null,
      delayMin: delay == null ? null : Math.round(delay / 60),
      ts: Number(v.timestamp || positions?.header?.timestamp || 0) * 1000,
    })
  }
  return { ts: Number(positions?.header?.timestamp || 0) * 1000, trains }
}
