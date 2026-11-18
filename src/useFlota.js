// Flota de camiones en el gemelo: planificación de rutas y seguimiento en vivo por LoRaWAN.
//   - Distancias y tiempos reales por carretera (matriz OSRM precalculada en public/data/flota.json).
//   - El trazado de cada ruta se pide a OSRM al planificar (si no responde, tramos rectos).
//   - Cada camión lleva un rastreador GPS LoRaWAN: manda 13 bytes cada 2 min (de simulación); se
//     decodifican con el mismo "payload formatter" que se pondría en The Things Stack.
//   - El tráfico de los sensores del gemelo y las balizas V16 (reales o simuladas) retrasan a los camiones.
// La empresa, los camiones y los pedidos son simulados.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CO2_KG_KM, DAY_START, TRUCK_FACTOR, etas, hhmm, initFleet, insertUrgent, makeCost, makeLeg, naivePlan, ordersForDay, planRoutes, resequence, stepTruck, straightLeg, svcMin, distM } from '../shared/flota.js'
import { encodeTracker, gatewayFor, minIntervalS, timeOnAirMs, toHex, ttnUplink } from '../shared/lorawan.js'

const DATA_URL = '/data/flota.json'
const OSRM = 'https://router.project-osrm.org/route/v1/driving/'
export const TRUCKS = [
  { id: 'CAM-01', color: '#184f95' },
  { id: 'CAM-02', color: '#c2410c' },
  { id: 'CAM-03', color: '#0f766e' },
  { id: 'CAM-04', color: '#6250d6' },
  { id: 'CAM-05', color: '#a21caf' },
].map((t, i) => ({ ...t, cap: 6000, devEui: `70B3D57ED00F${(0x1c0 + i).toString(16).toUpperCase().padStart(4, '0')}` }))
export const SPEEDS = [1, 10, 30, 60, 120]
const UPLINK_MIN = 2 // un mensaje cada 2 min de simulación por camión
const V16_RADIUS_M = 120, V16_DELAY_MIN = 4
const SIM_START = DAY_START - 5

const realMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 }
const dayKey = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` // fecha local, no UTC
}
const nodeOf = (p) => ({ lon: p.lon, lat: p.lat })

// trazado real de una ruta (varias paradas) con OSRM, partido en tramos
async function fetchLegs(points) {
  const url = `${OSRM}${points.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';')}?overview=full&geometries=geojson&annotations=duration,distance`
  const j = await fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`OSRM ${r.status}`))))
  const rt = j.routes?.[0]
  if (!rt) throw new Error(j.code || 'sin ruta')
  const all = rt.geometry.coordinates
  let off = 0
  return rt.legs.map((l) => {
    const n = l.annotation.duration.length
    const coords = all.slice(off, off + n + 1)
    off += n
    return makeLeg(coords, (l.duration / 60) * TRUCK_FACTOR, l.distance / 1000)
  })
}

// lentitud por el tráfico: velocidad actual / habitual de los sensores a menos de 800 m
function slowAt(pos, zones) {
  if (!pos || !zones?.length) return 1
  const near = zones.filter((z) => distM(pos, [z.lon, z.lat]) < 800)
  if (!near.length) return 1
  const ratio = near.reduce((s, z) => s + Math.min(1, z.ratio), 0) / near.length
  return 1 / Math.max(0.4, ratio)
}
// balizas a menos de 120 m del tramo que le queda por recorrer en el tramo actual
function beaconsAhead(tr, beacons) {
  if (!tr.leg || !beacons.length) return []
  const path = tr.leg.coords.slice(tr.legIdx ?? 0)
  return beacons.filter((b) => !tr.v16seen.includes(b.id) && path.some((p, i) => i % 2 === 0 && distM(p, [b.lon, b.lat]) < V16_RADIUS_M))
}

export function useFlota(enabled, zones, beaconsExt) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [geoState, setGeoState] = useState('idle') // idle | loading | ok | fallback
  const [speed, setSpeed] = useState(30)
  const [paused, setPaused] = useState(false)
  const [live, setLive] = useState(false) // reloj real (x1)
  const [tick, setTick] = useState(0)
  const [selId, setSelId] = useState(null)
  const [incidents, setIncidents] = useState([]) // atascos simulados (como balizas)
  const sim = useRef(null) // { day, now, orders, plan, naive, fleet, geo, events, urgent }
  const zonesRef = useRef(zones)
  zonesRef.current = zones
  const beaconsRef = useRef([])
  beaconsRef.current = [...(beaconsExt || []), ...incidents]
  const liveRef = useRef(live)
  liveRef.current = live
  const speedRef = useRef(speed)
  speedRef.current = live ? 1 : speed
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const cost = useMemo(() => (data ? makeCost(data) : null), [data])

  useEffect(() => {
    if (!enabled || data) return
    fetch(DATA_URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`flota.json ${r.status}`)))).then(setData).catch((e) => setErr(e.message))
  }, [enabled, data])

  const log = (txt, kind = 'info') => {
    const s = sim.current
    if (!s) return
    s.events.unshift({ t: s.now, txt, kind, id: `${s.now}-${s.events.length}` })
    s.events.length = Math.min(s.events.length, 40)
  }

  // tramo hacia la parada k (o hacia la base si k = nº de paradas)
  const getLeg = useCallback((tr, k) => {
    const s = sim.current
    const g = s?.geo[tr.id]
    if (g && k >= g.fromK && g.legs[k - g.fromK] && g.stopsKey === tr.stops.map((x) => x.id).join()) return { ...g.legs[k - g.fromK] }
    const to = k < tr.stops.length ? tr.stops[k] : s.data.depot
    // el tramo k sale de la parada anterior (o de la base); si se le ha desviado de vuelta, sale de donde está
    const from = k === 0 ? s.data.depot : tr.fromGps && k === tr.k ? { lon: tr.pos[0], lat: tr.pos[1], free: true } : tr.stops[k - 1]
    return straightLeg(from, to, cost)
  }, [cost])

  // pide a OSRM el trazado de lo que le queda a un camión (desde donde está ahora)
  const loadGeo = useCallback(async (tr) => {
    const s = sim.current
    const depot = s.data.depot
    const fromK = tr.phase === 'base' ? 0 : tr.k
    const fromPos = tr.phase === 'base' ? nodeOf(depot) : { lon: tr.pos[0], lat: tr.pos[1] }
    const pts = [fromPos, ...tr.stops.slice(fromK).map(nodeOf), nodeOf(depot)]
    if (pts.length < 2) return
    const stopsKey = tr.stops.map((x) => x.id).join()
    try {
      const legs = await fetchLegs(pts)
      if (sim.current !== s) return
      s.geo[tr.id] = { fromK, legs, stopsKey }
      // si va de camino, el tramo nuevo empieza donde está ahora
      if ((tr.phase === 'ruta' || tr.phase === 'vuelta') && tr.k === fromK && tr.stops.map((x) => x.id).join() === stopsKey) {
        tr.leg = { ...legs[0] }
        tr.legT = 0
      }
      setGeoState((g) => (g === 'fallback' ? g : 'ok'))
    } catch {
      setGeoState('fallback')
    }
  }, [])
  const loadAllGeo = useCallback(async (list) => {
    setGeoState('loading')
    for (const tr of list) {
      if (tr.phase === 'fin' && !tr.stops.length) continue
      await loadGeo(tr)
      await new Promise((r) => setTimeout(r, 350)) // el servidor de OSRM es de demostración: peticiones espaciadas
    }
  }, [loadGeo])

  // planifica un día
  const startDay = useCallback((offset, nowMin) => {
    if (!data || !cost) return
    const key = dayKey(offset)
    const orders = ordersForDay(data.sites, key)
    const t0 = performance.now()
    const plan = planRoutes(orders, TRUCKS, cost, data.depot)
    const ms = Math.round(performance.now() - t0)
    const naive = naivePlan(orders, TRUCKS, cost, data.depot)
    const fleet = initFleet(plan, TRUCKS, data.depot)
    sim.current = { data, offset, key, now: nowMin ?? SIM_START, orders, plan, naive, ms, fleet, geo: {}, events: [], urgent: 0 }
    log(`Plan del ${key.split('-').reverse().join('/')}: ${orders.length} pedidos en ${plan.trucksUsed} camiones · ${plan.km.toLocaleString('es-ES')} km (por orden de llegada serían ${naive.km.toLocaleString('es-ES')} km) · calculado en ${ms} ms`, 'plan')
    setIncidents([])
    loadAllGeo(fleet)
    setTick((t) => t + 1)
  }, [data, cost, loadAllGeo])

  useEffect(() => {
    if (enabled && data && cost && !sim.current) startDay(0)
  }, [enabled, data, cost, startDay])

  // un paso de simulación (dt en minutos)
  const advance = useCallback((dt) => {
    const s = sim.current
    if (!s) return
    const depot = s.data.depot
    let left = dt
    while (left > 1e-9) {
      const step = Math.min(0.5, left)
      left -= step
      s.now += step
      for (const tr of s.fleet) {
        const before = { phase: tr.phase, k: tr.k }
        if (tr.phase === 'ruta' || tr.phase === 'vuelta') {
          tr.slow = slowAt(tr.pos, zonesRef.current)
          for (const b of beaconsAhead(tr, beaconsRef.current)) {
            tr.v16seen.push(b.id)
            tr.leg.dur += V16_DELAY_MIN
            tr.delayMin += V16_DELAY_MIN
            log(`${tr.id}: ${b.sim ? 'atasco simulado' : `baliza V16 en ${b.road}`} en su ruta → +${V16_DELAY_MIN} min`, 'warn')
          }
        } else tr.slow = 1
        stepTruck(tr, s.now, step, depot, getLeg)
        // eventos
        if (before.phase === 'base' && tr.phase === 'ruta') log(`${tr.id} sale de la base con ${tr.stops.length} paradas y ${Math.round(tr.load).toLocaleString('es-ES')} kg`)
        if (tr.k > before.k) {
          const st = tr.stops[before.k]
          log(`${tr.id} ${st.kind === 'recogida' ? 'recoge' : 'entrega'} ${st.id} en ${st.nom}${st.late ? ` con ${st.late} min de retraso` : ' a tiempo'}`, st.late ? 'bad' : 'ok')
        }
        if (before.phase !== 'fin' && tr.phase === 'fin') log(`${tr.id} vuelve a la base · ${Math.round(tr.kmDone)} km`)
        // uplink LoRaWAN
        if (tr.phase !== 'base' && tr.phase !== 'fin' && s.now - tr.lastUp >= UPLINK_MIN) {
          tr.lastUp = s.now
          tr.fCnt++
          tr.battery = Math.max(5, tr.battery - 0.03)
          const moving = tr.phase === 'ruta' || tr.phase === 'vuelta'
          tr.speedKmh = moving && tr.leg ? Math.min(90, (tr.leg.km / tr.leg.dur) * 60 / tr.slow) : 0
          const bytes = encodeTracker({ lat: tr.pos[1], lon: tr.pos[0], speedKmh: tr.speedKmh, heading: tr.heading, loadPct: (tr.load / tr.cap) * 100, estado: tr.phase, battery: tr.battery })
          const gw = gatewayFor(tr.pos)
          tr.gw = gw
          tr.bytes = bytes
          tr.uplink = ttnUplink({ deviceId: tr.id.toLowerCase(), devEui: tr.devEui, fCnt: tr.fCnt, bytes, gateway: gw })
          s.msgs = (s.msgs || 0) + 1
        }
      }
    }
    // cuando todos han vuelto, a la media hora empieza el día siguiente
    const lastEnd = Math.max(...s.fleet.map((t) => (t.phase === 'fin' ? t.endedAt ?? 0 : Infinity)))
    // (en directo no: el día siguiente empieza cuando toque de verdad)
    if (Number.isFinite(lastEnd) && s.now > lastEnd + 30 && !liveRef.current) startDay(s.offset + 1)
  }, [getLeg, startDay])

  // reloj de la simulación
  useEffect(() => {
    if (!enabled || !data) return
    let last = performance.now()
    const id = setInterval(() => {
      const t = performance.now()
      const realDt = (t - last) / 1000
      last = t
      if (!sim.current || pausedRef.current || document.hidden) return
      advance((realDt * speedRef.current) / 60)
      setTick((x) => x + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [enabled, data, advance])

  // modo en directo: la simulación se pone a la hora real (avanzando el día hasta ahora)
  const goLive = useCallback(() => {
    if (!sim.current) return
    liveRef.current = true
    startDay(0)
    const target = realMin()
    if (target < sim.current.now) sim.current.now = target // de madrugada: los camiones esperan en la base
    else advance(target - sim.current.now)
    setLive(true)
    setPaused(false)
    setTick((x) => x + 1)
  }, [startDay, advance])
  const goSim = useCallback((v) => { liveRef.current = false; setLive(false); setSpeed(v); setPaused(false) }, [])

  const replan = useCallback(() => {
    const s = sim.current
    if (!s) return
    let n = 0
    for (const tr of s.fleet) {
      if (resequence(tr, s.now, cost, s.data.depot)) { n++; loadGeo(tr) }
    }
    log(n ? `Rutas recalculadas con el tráfico actual: ${n} camión(es) cambian el orden de sus paradas` : 'Rutas recalculadas: el orden actual ya es el mejor con el tráfico de ahora', 'plan')
    setTick((x) => x + 1)
  }, [cost, loadGeo])

  const urgent = useCallback(() => {
    const s = sim.current
    if (!s) return
    const used = new Set(s.fleet.flatMap((t) => t.stops.map((o) => o.site)))
    const free = s.data.sites.filter((x) => !used.has(x.id))
    const site = free[Math.floor(Math.random() * free.length)] || s.data.sites[0]
    s.urgent++
    const kg = 150 + Math.round(Math.random() * 6) * 50
    const order = { id: `U-${String(s.urgent).padStart(2, '0')}`, site: site.id, nom: site.nom, tipo: site.tipo, lon: site.lon, lat: site.lat, kg, win: [s.now, s.now + 120], svc: svcMin(kg), kind: 'recogida' }
    const r = insertUrgent(s.fleet, order, s.now, cost, s.data.depot)
    if (!r) log(`Recogida urgente ${order.id} en ${site.nom}: ningún camión tiene capacidad libre`, 'bad')
    else {
      log(`Recogida urgente ${order.id} en ${site.nom} (${kg} kg, antes de las ${hhmm(order.win[1])}) → ${r.truck} (+${r.addKm.toLocaleString('es-ES')} km)`, 'plan')
      loadGeo(s.fleet.find((t) => t.id === r.truck))
      setSelId(r.truck)
    }
    setTick((x) => x + 1)
  }, [cost, loadGeo])

  const jam = useCallback(() => {
    const s = sim.current
    const tr = s?.fleet.filter((t) => (t.phase === 'ruta' || t.phase === 'vuelta') && t.leg?.coords.length > 6).sort((a, b) => b.leg.dur - b.legT - (a.leg.dur - a.legT))[0]
    if (!tr) return null
    const path = tr.leg.coords.slice(tr.legIdx ?? 0)
    const p = path[Math.floor(path.length * 0.55)]
    setIncidents((x) => [...x, { id: `jam-${Date.now()}`, lon: p[0], lat: p[1], sim: true, road: 'atasco simulado', target: tr.id }])
    return tr.id
  }, [])

  // ---- vista para la interfaz
  const view = useMemo(() => {
    const s = sim.current
    if (!s) return null
    const depot = s.data.depot
    const trucks = s.fleet.map((tr) => {
      const e = etas(tr, s.now, cost, depot)
      const byId = Object.fromEntries(e.stops.map((x) => [x.id, x]))
      const stops = tr.stops.map((o, i) => ({ ...o, i, eta: byId[o.id]?.eta, lateEta: byId[o.id]?.late || 0, current: i === tr.k && tr.phase !== 'fin' && tr.phase !== 'vuelta' }))
      const next = stops.find((o) => o.status === 'pendiente')
      const lateNext = stops.filter((o) => o.status === 'pendiente' && o.lateEta > 0.5)
      // trazado pendiente: resto del tramo actual + tramos siguientes
      const path = []
      if (tr.leg && (tr.phase === 'ruta' || tr.phase === 'vuelta')) path.push(tr.pos, ...tr.leg.coords.slice((tr.legIdx ?? 0) + 1))
      const fromK = tr.phase === 'base' ? 0 : tr.k + (tr.phase === 'ruta' || tr.phase === 'vuelta' ? 1 : 0)
      for (let k = fromK; k <= tr.stops.length && tr.phase !== 'fin'; k++) {
        if (tr.phase === 'vuelta') break
        const lg = getLeg(tr, k)
        path.push(...(path.length ? lg.coords.slice(1) : lg.coords))
      }
      return {
        id: tr.id, color: tr.color, phase: tr.phase, pos: tr.pos, heading: tr.heading, slow: tr.slow, delayMin: tr.delayMin,
        speedKmh: tr.phase === 'ruta' || tr.phase === 'vuelta' ? tr.speedKmh || 0 : 0,
        load: Math.max(0, Math.round(tr.load)), cap: tr.cap, loadPct: Math.round((Math.max(0, tr.load) / tr.cap) * 100), km: Math.round(tr.kmDone * 10) / 10,
        stops, next, lateNext, done: stops.filter((o) => o.status !== 'pendiente').length, back: e.back, depart: tr.depart,
        path, gw: tr.gw, uplink: tr.uplink, bytes: tr.bytes, fCnt: tr.fCnt, battery: Math.round(tr.battery), devEui: tr.devEui,
        straight: !s.geo[tr.id],
      }
    })
    const all = trucks.flatMap((t) => t.stops)
    const done = all.filter((o) => o.status !== 'pendiente')
    const onTime = done.filter((o) => o.status === 'entregado').length
    const sf = 9
    return {
      key: s.key, now: s.now, trucks, events: s.events, ms: s.ms,
      plan: { km: s.plan.km, hours: s.plan.hours, trucksUsed: s.plan.trucksUsed, late: s.plan.lateStops },
      naive: { km: s.naive.km, hours: s.naive.hours, late: s.naive.lateStops, lateMin: s.naive.lateMin },
      saveKm: Math.round((s.naive.km - s.plan.km) * 10) / 10, savePct: Math.round((1 - s.plan.km / s.naive.km) * 100), co2: Math.round((s.naive.km - s.plan.km) * CO2_KG_KM),
      orders: all.length, done: done.length, onTime, predictedLate: trucks.reduce((n, t) => n + t.lateNext.length, 0),
      kmDone: Math.round(trucks.reduce((n, t) => n + t.km, 0)),
      allDone: trucks.every((t) => t.phase === 'fin'), lastBack: Math.max(...s.fleet.map((t) => t.endedAt ?? 0)),
      radio: { bytes: 13, sf, toa: Math.round(timeOnAirMs(13, sf) * 10) / 10, minS: Math.round(minIntervalS(13, sf)), toa7: Math.round(timeOnAirMs(13, 7) * 10) / 10 },
      depot,
    }
  }, [tick, cost, getLeg])

  const sel = view?.trucks.find((t) => t.id === selId) || null

  const source = useMemo(() => {
    const u = view?.trucks.find((t) => t.uplink)
    const moving = view?.trucks.filter((t) => t.phase !== 'base' && t.phase !== 'fin').length || 0
    return {
      id: 'flota', protocol: 'LoRaWAN · TTN v3', label: 'GPS de camiones de reparto (LoRaWAN)', endpoint: 'mqtt://eu1.cloud.thethings.network · app flota-camiones (simulado)', simulated: true,
      status: view ? 'ok' : err ? 'down' : 'idle', msgPerMin: Math.round((moving * (live ? 1 : speed)) / UPLINK_MIN), latencyMs: 0, lastTs: Date.now(),
      sample: u ? { frm_payload: u.uplink.uplink_message.frm_payload, hex: toHex(u.bytes), ...u.uplink.uplink_message.decoded_payload, gateway: u.gw?.id, rssi: u.gw?.rssi, sf: u.gw?.sf } : { info: enabled ? 'esperando el primer uplink' : 'abre la pestaña Flota para arrancar la simulación' },
    }
  }, [Math.floor(tick / 5), err, enabled, live, speed])

  return { view, err, geoState, speed, live, paused, setPaused, goSim, goLive, replan, urgent, jam, incidents, clearIncidents: () => setIncidents([]), selId, setSelId, sel, newDay: () => startDay((sim.current?.offset ?? -1) + 1), source }
}
