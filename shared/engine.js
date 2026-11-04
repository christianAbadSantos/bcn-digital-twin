// Motor del gemelo digital: conectores simulados, bus normalizado, reglas de alertas y rutas.
// Es JavaScript puro y sin dependencias: lo usan igual el backend (Cloudflare Functions)
// y el navegador (modo local cuando no hay backend).
//
// ⚠️ Todo lo "industrial" está SIMULADO: cada conector genera mensajes con la forma que tendría
// el protocolo real (topic MQTT, partición/offset Kafka, esclavo Profibus, frame Profinet),
// pero no abre sockets reales. Para producción se sustituye cada conector por un driver real
// (MQTT.js, kafkajs, pasarela OPC UA/Profinet…) y las reglas siguen funcionando igual.
// Solo el conector REST (Open-Meteo) trae datos reales.

import { HOTSPOTS, PLACES, RAIL_PATHS, toLocal, pingPong, CENTER } from '../src/geo.js'

const EPOCH = Date.UTC(2026, 10, 1)
const SLOT = 10 * 60 * 1000

// Las zonas son los puntos negros REALES de 2024 (ver geo.js). El tráfico que se simula sobre ellas no lo es.
export const ZONES = HOTSPOTS.map((h, i) => ({ id: `z${i}`, name: h.name, barri: h.barri, lon: h.lon, lat: h.lat, w: h.w, acc: h.acc }))

// ---------------------------------------------------------------- utilidades
function hash(n) {
  let x = (n | 0) ^ 0x9e3779b9
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}
const h2 = (a, b) => hash(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663))
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const r1 = (v) => Math.round(v * 10) / 10

// ruido suave: cambia gradualmente cada `period` ms
function vnoise(t, seed, period) {
  const x = t / period
  const i = Math.floor(x)
  const f = x - i
  const s = f * f * (3 - 2 * f)
  return h2(i, seed) * (1 - s) + h2(i + 1, seed) * s
}

const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Madrid' })
function madridHour(ms) {
  const p = hourFmt.formatToParts(new Date(ms))
  return Number(p.find((x) => x.type === 'hour').value) + Number(p.find((x) => x.type === 'minute').value) / 60
}

const TRAFFIC = [0.25, 0.18, 0.15, 0.15, 0.2, 0.4, 0.8, 1.3, 1.5, 1.1, 0.9, 0.95, 1.1, 1.1, 1.0, 1.0, 1.15, 1.45, 1.5, 1.2, 0.9, 0.65, 0.5, 0.35]
function trafficCurve(hr) {
  const a = Math.floor(hr) % 24
  const b = (a + 1) % 24
  const f = hr - Math.floor(hr)
  return TRAFFIC[a] * (1 - f) + TRAFFIC[b] * f
}

// ---------------------------------------------------------------- escenarios de demo
export const SCENARIOS = {
  normal: { label: 'Tiempo real + tráfico simulado' },
  lluvia: { label: 'Lluvia fuerte (6 mm/h)', rain: 6 },
  choque: { label: `Choque en ${ZONES[0].name} + lluvia`, rain: 3, inject: ['z0'] },
  viento: { label: 'Viento fuerte (65 km/h)', wind: 65 },
}

export function applyScenario(weather, scenario) {
  const s = SCENARIOS[scenario]
  if (!s || scenario === 'normal') return { weather, inject: [] }
  return {
    weather: { ...weather, rain: s.rain ?? weather.rain, wind: s.wind ?? weather.wind, scenario: true },
    inject: s.inject || [],
  }
}

// ---------------------------------------------------------------- estado simulado
function incidentsAt(now, rain, inject) {
  const out = []
  const k0 = Math.floor(now / SLOT)
  for (let k = k0 - 6; k <= k0; k++) {
    for (let i = 0; i < ZONES.length; i++) {
      const p = 0.012 * ZONES[i].w * (1 + 0.2 * Math.min(rain, 5))
      if (h2(k, i) < p) {
        const start = k * SLOT + Math.floor(h2(k, i + 100) * SLOT)
        const end = start + (15 + Math.floor(h2(k, i + 200) * 25)) * 60000
        if (start <= now) {
          const r = h2(k, i + 300)
          out.push({ id: `${k}-${i}`, zone: ZONES[i].id, name: ZONES[i].name, lon: ZONES[i].lon, lat: ZONES[i].lat, start, end, open: now < end, severity: r < 0.15 ? 'grave' : r < 0.5 ? 'moderado' : 'leve' })
        }
      }
    }
  }
  inject.forEach((zid) => {
    const z = ZONES.find((x) => x.id === zid)
    // el escenario sustituye a cualquier incidente natural abierto en esa zona
    for (let j = out.length - 1; j >= 0; j--) if (out[j].zone === zid && out[j].open) out.splice(j, 1)
    if (z) out.push({ id: `demo-${zid}`, zone: zid, name: z.name, lon: z.lon, lat: z.lat, start: now - 6 * 60000, end: now + 30 * 60000, open: true, severity: 'grave', demo: true })
  })
  return out
}

function zoneStates(now, rain, incidents) {
  const demand = trafficCurve(madridHour(now))
  return ZONES.map((z, i) => {
    const d = demand * (0.9 + (0.2 * z.w) / 1.4)
    const noise = vnoise(now, 10 + i, 45000)
    const baseline = 42 * (1 - 0.35 * clamp(d / 1.5, 0, 1))
    let speed = baseline * (1 - (0.3 * clamp(rain, 0, 6)) / 6) * (1 + (noise - 0.5) * 0.12)
    const inc = incidents.find((x) => x.zone === z.id && x.open)
    if (inc) speed *= inc.severity === 'grave' ? 0.3 : inc.severity === 'moderado' ? 0.45 : 0.6
    speed = Math.max(3, speed)
    return {
      id: z.id,
      name: z.name,
      lon: z.lon,
      lat: z.lat,
      speed: r1(speed),
      baseline: r1(baseline),
      ratio: Math.round((speed / baseline) * 100) / 100,
      occupancy: Math.round(clamp(100 - speed * 2.2, 5, 98)),
      incident: inc ? inc.id : null,
      demand: r1(d),
      acc2024: z.acc, // dato real: accidentes de 2024 a menos de 300 m
    }
  })
}

function metroState(now, rain) {
  const k = Math.floor(now / SLOT)
  const demand = trafficCurve(madridHour(now))
  const t = now / 1000
  return RAIL_PATHS.map((line, li) => {
    const delayed = h2(k, 500 + li) < 0.025 || (rain >= 5 && h2(k, 600 + li) < 0.3)
    const trains = [0, 1, 2].map((n) => {
      const p = pingPong(line.path, t, 22, (n * line.path.length * 2) / 3 + li * 500)
      return {
        id: `${line.id}-${n + 1}`,
        lon: +p.lon.toFixed(5),
        lat: +p.lat.toFixed(5),
        load: Math.round(clamp(25 + 65 * vnoise(now, 700 + li * 3 + n, 120000) * (0.4 + (demand / 1.5) * 0.6), 5, 100)),
        kmh: delayed ? 18 : 30,
      }
    })
    return { id: line.id, name: line.name, color: line.color, status: delayed ? 'retraso' : 'normal', trains }
  })
}

function portState(now, wind) {
  return [1, 2, 3, 4].map((n) => {
    const stopped = wind >= 55
    return { device: `STS-0${n}`, state: stopped ? 'STOPPED' : 'RUN', reason: stopped ? 'wind' : null, boxesPerHour: stopped ? 0 : Math.round(22 + 10 * vnoise(now, 800 + n, 60000)) }
  })
}

// Sensores de CO simulados. Cada túnel se asocia a la zona (punto negro) más cercana si hay una a < 1,2 km.
const TUNNEL_DEFS = [
  { slave: 3, name: 'Túnel Glòries', lon: 2.19, lat: 41.403 },
  { slave: 4, name: 'Túnel Ronda de Dalt (Vall d’Hebron)', lon: 2.1421, lat: 41.4242 },
  { slave: 5, name: 'Túnel Ronda Litoral', lon: 2.202, lat: 41.4 },
]
const TUNNELS = TUNNEL_DEFS.map((t) => {
  const near = ZONES.map((z) => ({ z, d: Math.hypot(...toLocal([z.lon, z.lat]).map((v, k) => v - toLocal([t.lon, t.lat])[k])) })).sort((a, b) => a.d - b.d)[0]
  return { ...t, zone: near && near.d < 1200 ? near.z.id : null }
})
function tunnelState(now, zones) {
  return TUNNELS.map((t, i) => {
    const z = zones.find((x) => x.id === t.zone)
    const dn = clamp((z?.demand ?? 0.5) / 1.5, 0, 1)
    let co = 14 + 26 * dn + 6 * (vnoise(now, 900 + i, 60000) - 0.5)
    if (z?.incident) co *= 1.7
    return { slave: t.slave, name: t.name, co: Math.round(co), zone: t.zone }
  })
}

// ---------------------------------------------------------------- reglas de alertas
export const RULES = [
  { id: 'R1', name: 'Choque + atasco', sev: 'crit', sources: ['kafka', 'mqtt', 'rest'], desc: 'Incidente abierto y velocidad < 60 % de la habitual en la misma zona. Activa la recomendación de rutas alternativas.' },
  { id: 'R2', name: 'Incidente abierto', sev: 'warn', sources: ['kafka'], desc: 'Incidente abierto sin atasco todavía.' },
  { id: 'R3', name: 'Atasco sin incidente', sev: 'warn', sources: ['mqtt'], desc: 'Velocidad < 60 % de la habitual sin incidente registrado.' },
  { id: 'R4', name: 'Calzada mojada', sev: 'info', sources: ['rest', 'mqtt', 'sql'], desc: 'Lluvia ≥ 1,5 mm/h y velocidad media por debajo de la línea base.' },
  { id: 'R5', name: 'Viento fuerte en el puerto', sev: 'crit', sources: ['rest', 'profinet'], desc: 'Viento ≥ 55 km/h: las grúas se detienen por seguridad.' },
  { id: 'R6', name: 'CO alto en túnel', sev: 'warn', sources: ['profibus', 'mqtt'], desc: 'CO ≥ 50 ppm en un túnel.' },
  { id: 'R7', name: 'Retraso de metro', sev: 'warn', sources: ['ws', 'rest'], desc: 'Línea con servicio degradado (más espera entre trenes).' },
]
const SEV_ORDER = { crit: 0, warn: 1, info: 2 }

export function evaluateRules(ctx) {
  const { now, weather, zones, incidents, metro, port, tunnels } = ctx
  const alerts = []
  const open = incidents.filter((i) => i.open)
  const rainTxt = weather.rain >= 1.5 ? ` · lluvia ${weather.rain} mm/h` : ''

  zones.forEach((z) => {
    const inc = open.find((i) => i.zone === z.id)
    const jam = z.ratio < 0.6
    const mins = inc ? Math.max(1, Math.round((now - inc.start) / 60000)) : 0
    if (inc && jam) {
      alerts.push({ id: `R1:${z.id}`, rule: 'R1', sev: 'crit', title: `Choque + atasco en ${z.name}`, detail: `Velocidad ${z.speed} km/h (habitual ${z.baseline}). Incidente ${inc.severity} abierto hace ${mins} min${rainTxt}.`, zone: z.id, lon: z.lon, lat: z.lat, sources: ['kafka', 'mqtt', ...(weather.rain >= 1.5 ? ['rest'] : [])] })
    } else if (inc) {
      alerts.push({ id: `R2:${z.id}`, rule: 'R2', sev: 'warn', title: `Incidente en ${z.name}`, detail: `Incidente ${inc.severity} abierto hace ${mins} min. Tráfico aún fluido (${z.speed} km/h).`, zone: z.id, lon: z.lon, lat: z.lat, sources: ['kafka'] })
    } else if (jam) {
      alerts.push({ id: `R3:${z.id}`, rule: 'R3', sev: 'warn', title: `Atasco en ${z.name}`, detail: `Velocidad ${z.speed} km/h frente a ${z.baseline} habitual.`, zone: z.id, lon: z.lon, lat: z.lat, sources: ['mqtt'] })
    }
  })

  if (weather.rain >= 1.5) {
    const calm = zones.filter((z) => !z.incident)
    const sp = calm.reduce((s, z) => s + z.speed, 0)
    const bl = calm.reduce((s, z) => s + z.baseline, 0)
    const drop = bl ? Math.round((1 - sp / bl) * 100) : 0
    if (drop >= 5) {
      alerts.push({ id: 'R4:city', rule: 'R4', sev: 'info', title: `Calzada mojada: velocidad media −${drop} %`, detail: `Lluvia ${weather.rain} mm/h. Comparado con la línea base de la base de datos.`, lon: CENTER.lon, lat: CENTER.lat, sources: ['rest', 'mqtt', 'sql'] })
    }
  }

  if (weather.wind >= 55 && port.some((c) => c.state === 'STOPPED')) {
    alerts.push({ id: 'R5:port', rule: 'R5', sev: 'crit', title: 'Viento fuerte: grúas del puerto detenidas', detail: `Viento ${weather.wind} km/h. ${port.length} grúas en STOPPED.`, lon: 2.172, lat: 41.345, sources: ['rest', 'profinet'] })
  }

  tunnels.forEach((t) => {
    if (t.co >= 50) {
      const z = zones.find((x) => x.id === t.zone)
      alerts.push({ id: `R6:${t.slave}`, rule: 'R6', sev: 'warn', title: `CO alto en ${t.name}`, detail: `${t.co} ppm (umbral 50). ${z?.incident ? 'Hay un incidente abierto en la zona.' : 'Tráfico denso.'}`, zone: t.zone, lon: z?.lon ?? CENTER.lon, lat: z?.lat ?? CENTER.lat, sources: ['profibus', 'mqtt'] })
    }
  })

  metro.forEach((l) => {
    if (l.status === 'retraso') {
      alerts.push({ id: `R7:${l.id}`, rule: 'R7', sev: 'warn', title: `Retraso en metro ${l.name}`, detail: `Servicio degradado: espera de ~8 min entre trenes.${weather.rain >= 5 ? ' Lluvia intensa.' : ''}`, lon: l.trains[0].lon, lat: l.trains[0].lat, sources: ['ws', ...(weather.rain >= 5 ? ['rest'] : [])] })
    }
  })

  return alerts.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev])
}

// ---------------------------------------------------------------- fuentes (estado de cada conector)
function buildSources(ctx, opts) {
  const { now, weather, zones, incidents, metro, port, tunnels } = ctx
  const open = incidents.filter((i) => i.open)
  const tick2 = Math.floor(now / 2000)
  const z = zones[tick2 % zones.length]
  const trainsFlat = metro.flatMap((l) => l.trains)
  const tr = trainsFlat[Math.floor(now / 1000) % trainsFlat.length]
  const crane = port[Math.floor(now / 500) % port.length]
  const tun = tunnels[Math.floor(now / 2000) % tunnels.length]
  const lastInc = incidents.length ? incidents.reduce((a, b) => (a.start > b.start ? a : b)) : null
  const degraded = h2(Math.floor(now / (7 * 60000)), 900) < 0.12
  const lat = (base, seed) => Math.round(base + 12 * vnoise(now, seed, 30000))

  return [
    { id: 'mqtt', protocol: 'MQTT', label: 'Sensores de tráfico (IoT)', endpoint: 'mqtt://broker.sim:1883', simulated: true, status: 'ok', msgPerMin: 240, latencyMs: lat(18, 1), lastTs: tick2 * 2000, sample: { topic: `bcn/traffic/${z.id}/speed`, qos: 1, payload: { kmh: z.speed, occupancy: z.occupancy } } },
    { id: 'kafka', protocol: 'Kafka', label: 'Incidentes Guàrdia Urbana', endpoint: 'kafka://cluster.sim:9092', simulated: true, status: 'ok', msgPerMin: 2 + open.length * 3, latencyMs: lat(35, 2), lastTs: lastInc ? lastInc.start : now, sample: lastInc ? { topic: 'bcn.incidents.v1', partition: Number(lastInc.zone.slice(1)) % 3, offset: 48210 + Math.floor((now - EPOCH) / 30000), value: { zone: lastInc.zone, severity: lastInc.severity, open: lastInc.open } } : { topic: 'bcn.incidents.v1', partition: 0, offset: 48210 + Math.floor((now - EPOCH) / 30000), value: { type: 'heartbeat' } } },
    { id: 'ws', protocol: 'WebSocket', label: 'Telemetría de metro', endpoint: 'wss://telemetry.metro.sim/trains', simulated: true, status: metro.some((l) => l.status === 'retraso') ? 'degraded' : 'ok', msgPerMin: 60, latencyMs: lat(25, 3), lastTs: Math.floor(now / 1000) * 1000, sample: { train: tr.id, load_pct: tr.load, speed_kmh: tr.kmh } },
    { id: 'profinet', protocol: 'PROFINET', label: 'PLC de grúas del puerto', endpoint: 'profinet://plc-port-01 (IO-Devices STS-01..04)', simulated: true, status: 'ok', msgPerMin: 120, latencyMs: lat(4, 4), lastTs: Math.floor(now / 500) * 500, sample: { device: crane.device, frame_counter: Math.floor((now - EPOCH) / 500), state: crane.state, boxes_per_h: crane.boxesPerHour } },
    { id: 'profibus', protocol: 'PROFIBUS DP', label: 'Ventilación de túneles (CO)', endpoint: 'profibus-dp://gw-tunnels (esclavos 3-5)', simulated: true, status: degraded ? 'degraded' : 'ok', msgPerMin: degraded ? 12 : 30, latencyMs: lat(degraded ? 140 : 22, 5), lastTs: tick2 * 2000, sample: { slave_addr: tun.slave, co_ppm: tun.co, diag: degraded ? 'EXT_DIAG' : 'OK' } },
    { id: 'rest', protocol: 'REST API', label: 'Open-Meteo (tiempo)', endpoint: 'https://api.open-meteo.com', simulated: weather.real === false, status: weather.real === false ? 'degraded' : 'ok', msgPerMin: 0.1, latencyMs: lat(90, 6), lastTs: weather.ts || now, sample: { rain_mm_h: weather.rain, wind_kmh: weather.wind, temp_c: weather.temp, origen: weather.real === false ? 'sintético (API no disponible)' : weather.scenario ? 'real + escenario de demo' : 'real' } },
    { id: 'sql', protocol: opts.db ? 'SQL · D1' : 'SQL · memoria', label: 'Histórico y línea base', endpoint: opts.db ? 'd1://bcn-twin' : 'sin D1 configurado (línea base en memoria)', simulated: !opts.db, status: opts.db ? 'ok' : 'idle', msgPerMin: opts.db ? 1 : 0, latencyMs: lat(opts.db ? 8 : 1, 7), lastTs: Math.floor(now / 60000) * 60000, sample: { query: 'SELECT COUNT(*) FROM accidents_2024 WHERE zona = ?', zona: zones[0].id, count: zones[0].acc2024, baseline_kmh: zones[0].baseline } },
  ]
}

// ---------------------------------------------------------------- snapshot completo
export function buildSnapshot(now, weatherIn, opts = {}) {
  const { weather, inject } = applyScenario(weatherIn, opts.scenario)
  const incidents = incidentsAt(now, weather.rain, inject)
  const zones = zoneStates(now, weather.rain, incidents)
  const metro = metroState(now, weather.rain)
  const port = portState(now, weather.wind)
  const tunnels = tunnelState(now, zones)
  const ctx = { now, weather, zones, incidents, metro, port, tunnels }
  return {
    ts: now,
    scenario: SCENARIOS[opts.scenario] ? opts.scenario : 'normal',
    weather,
    zones,
    incidents: incidents.filter((i) => i.open),
    metro,
    port,
    tunnels,
    alerts: evaluateRules(ctx),
    sources: buildSources(ctx, opts),
  }
}

// ---------------------------------------------------------------- recomendador de rutas A → B
const xy = (p) => toLocal([p.lon, p.lat])
function segDist(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy || 1
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1)
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

// Metro: Dijkstra sobre (estación, línea). Cambio de línea donde coinciden coordenadas.
function metroTrip(A, B, delayed) {
  const key = (c) => `${c[0].toFixed(4)},${c[1].toFixed(4)}`
  const st = []
  RAIL_PATHS.forEach((l) => l.coords.forEach((c, i) => st.push({ k: key(c), line: l.id, i, xy: toLocal(c), c })))
  const walkSec = (m) => (m * 1.2) / (5 / 3.6)
  const aXY = xy(A)
  const bXY = xy(B)
  const dist = new Map()
  const prev = new Map()
  const queue = []
  const push = (id, d, from) => {
    if (d < (dist.get(id) ?? Infinity)) {
      dist.set(id, d)
      prev.set(id, from)
      queue.push([d, id])
    }
  }
  st.forEach((s) => {
    const w = Math.hypot(s.xy[0] - aXY[0], s.xy[1] - aXY[1])
    if (w <= 1500) push(`${s.k}|${s.line}`, walkSec(w) + (delayed.has(s.line) ? 480 : 240), null)
  })
  const speed = 30 / 3.6
  while (queue.length) {
    queue.sort((x, y) => x[0] - y[0])
    const [d, id] = queue.shift()
    if (d > (dist.get(id) ?? Infinity)) continue
    const [k, line] = id.split('|')
    const L = RAIL_PATHS.find((x) => x.id === line)
    const here = st.find((s) => s.k === k && s.line === line)
    ;[here.i - 1, here.i + 1].forEach((j) => {
      if (j < 0 || j >= L.coords.length) return
      const o = st.find((s) => s.line === line && s.i === j)
      const seg = Math.hypot(o.xy[0] - here.xy[0], o.xy[1] - here.xy[1]) * 1.15
      push(`${o.k}|${line}`, d + seg / (delayed.has(line) ? speed * 0.6 : speed), id)
    })
    RAIL_PATHS.forEach((l2) => {
      if (l2.id !== line && l2.coords.some((c) => key(c) === k)) push(`${k}|${l2.id}`, d + 240 + (delayed.has(l2.id) ? 240 : 0), id)
    })
  }
  let best = null
  st.forEach((s) => {
    const id = `${s.k}|${s.line}`
    const d = dist.get(id)
    if (d == null) return
    const w = Math.hypot(s.xy[0] - bXY[0], s.xy[1] - bXY[1])
    if (w > 1500) return
    const total = d + walkSec(w)
    if (!best || total < best.total) best = { total, id, walk: w }
  })
  if (!best) return null
  const lines = []
  let id = best.id
  while (id) {
    const ln = id.split('|')[1]
    if (lines[lines.length - 1] !== ln) lines.push(ln)
    id = prev.get(id)
  }
  lines.reverse()
  return { minutes: best.total / 60, lines }
}

function evaluateOptions(from, to, snap, live) {
  const a = xy(from)
  const b = xy(to)
  const d = Math.hypot(a[0] - b[0], a[1] - b[1])
  const near = snap.zones
    .map((z) => ({ z, dist: segDist(xy(z), a, b) }))
    .filter((x) => x.dist <= 1500)
    .map((x) => ({ ...x, w: 1 / (1 + x.dist / 750) }))
  const wSum = near.reduce((s, x) => s + x.w, 0)
  const field = live ? 'speed' : 'baseline'
  const carSpeed = near.length ? wSum / near.reduce((s, x) => s + x.w / x.z[field], 0) : 30
  const incNear = live ? snap.incidents.filter((i) => segDist(xy(i), a, b) <= 1000) : []
  const rain = live ? snap.weather.rain : 0
  const wind = live ? snap.weather.wind : 0
  const delayed = new Set(live ? snap.metro.filter((l) => l.status === 'retraso').map((l) => l.id) : [])
  const opts = []

  // coche
  {
    const base = ((d * 1.3) / 1000 / carSpeed) * 60 + 5
    const extra = incNear.length * 6
    const reasons = [`${r1(carSpeed)} km/h de media en el trayecto`]
    if (incNear.length) reasons.push(`${incNear.length} incidente(s) cerca de la ruta (+${extra} min)`)
    if (rain >= 1.5) reasons.push(`lluvia ${rain} mm/h ya reflejada en la velocidad`)
    opts.push({ mode: 'coche', label: 'Coche', minutes: base + extra, score: base + extra, reasons })
  }
  // bus
  {
    const sp = clamp(carSpeed * 0.75, 8, 22)
    const extra = incNear.length ? 3 : 0
    const m = ((d * 1.35) / 1000 / sp) * 60 + 6 + extra
    opts.push({ mode: 'bus', label: 'Autobús', minutes: m, score: m, reasons: [`${r1(sp)} km/h, comparte calzada`, 'espera media 6 min', ...(extra ? ['incidente cerca (+3 min)'] : [])] })
  }
  // metro
  {
    const trip = metroTrip(from, to, delayed)
    if (trip) {
      const reasons = [`${trip.lines.join(' → ')}${trip.lines.length > 1 ? ` (${trip.lines.length - 1} cambio)` : ''}`, 'no depende del tráfico']
      const dl = trip.lines.filter((l) => delayed.has(l))
      if (dl.length) reasons.push(`retraso en ${dl.join(', ')} (+espera)`)
      opts.push({ mode: 'metro', label: 'Metro', minutes: trip.minutes, score: trip.minutes, reasons })
    } else {
      opts.push({ mode: 'metro', label: 'Metro', minutes: null, score: Infinity, reasons: ['sin estación a menos de 1,5 km en este esquema'] })
    }
  }
  // bici
  {
    let m = ((d * 1.25) / 1000 / 16) * 60
    const reasons = ['16 km/h, sin tráfico']
    let pen = 0
    if (rain >= 1) {
      m *= 1.25
      reasons.push(`lluvia ${rain} mm/h (+25 %)`)
    }
    if (wind >= 35) {
      m *= 1.15
      reasons.push(`viento ${wind} km/h (+15 %)`)
    }
    if (rain >= 4) {
      pen = 15
      reasons.push('no recomendado con esta lluvia')
    }
    opts.push({ mode: 'bici', label: 'Bici', minutes: m, score: m + pen, reasons })
  }
  // a pie
  if (d <= 3000) {
    const m = ((d * 1.2) / 1000 / 5) * 60
    opts.push({ mode: 'pie', label: 'A pie', minutes: m, score: m + (rain >= 1.5 ? 6 : 0), reasons: ['5 km/h', ...(rain >= 1.5 ? ['lluvia: incómodo'] : [])] })
  }
  return opts
    .map((o) => ({ ...o, minutes: o.minutes == null ? null : Math.round(o.minutes) }))
    .sort((x, y) => x.score - y.score)
}

export function recommendRoutes(fromId, toId, snap) {
  const from = PLACES.find((p) => p.id === fromId)
  const to = PLACES.find((p) => p.id === toId)
  if (!from || !to || from.id === to.id) return null
  const live = evaluateOptions(from, to, snap, true)
  const baseline = evaluateOptions(from, to, snap, false)
  return { from, to, live, baseline, best: live[0], baseBest: baseline[0], changed: live[0].mode !== baseline[0].mode }
}
