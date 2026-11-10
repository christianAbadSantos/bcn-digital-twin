// Urgencias en el gemelo: hospital (IFC), ambulancias (GPS por LoRaWAN, simulado), balizas V16 (reales).
//   - Las bahías del muelle de ambulancias salen del IFC del hospital (leído con web-ifc en un worker).
//   - Las ambulancias recorren rutas reales (OSRM) y envían su posición como uplinks LoRaWAN simulados.
//   - Las balizas V16 son reales (DGT 3.0): si hay una en la ruta pendiente, la ETA sube.
//   - Con las ETA se asigna a cada ambulancia la bahía donde aparcará y a qué hora (shared/emergency.js).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseV16 } from '../shared/v16.js'
import { DWELL_MIN, V16_DELAY_MIN, assignBays, beaconsOnPath, distM, lorawanUplink, positionAt, prepareRoute, remainingPath, trafficFactor } from '../shared/emergency.js'
import { spacePolygon, localToLonLat } from './hospitalGeo.js'

const IFC_URL = '/data/hospital-clinic-urgencias.ifc'
const ROUTES_URL = '/data/ambulance-routes.json'
const V16_POLL_MS = 60000
const TICK_MS = 1000
const UPLINK_S = 15 // cada ambulancia envía su posición cada 15 s (LoRaWAN, SF7–SF9)

// pasarelas LoRaWAN simuladas repartidas por el área metropolitana
const GATEWAYS = [
  { id: 'bcn-gw-eixample', lon: 2.1615, lat: 41.3915 },
  { id: 'bcn-gw-poblenou', lon: 2.1985, lat: 41.4035 },
  { id: 'bcn-gw-sants', lon: 2.1375, lat: 41.3765 },
  { id: 'bcn-gw-noubarris', lon: 2.1765, lat: 41.4385 },
  { id: 'bdn-gw-centre', lon: 2.2445, lat: 41.4475 },
  { id: 'prat-gw-aeroport', lon: 2.0785, lat: 41.2975 },
  { id: 'stc-gw-centre', lon: 2.0855, lat: 41.4735 },
  { id: 'lh-gw-granvia', lon: 2.1165, lat: 41.3595 },
  { id: 'bcn-gw-pedralbes', lon: 2.1135, lat: 41.3875 },
]
function gatewayFor(pos) {
  let best = null
  for (const g of GATEWAYS) {
    const d = distM(pos, [g.lon, g.lat])
    if (!best || d < best.d) best = { ...g, d }
  }
  const km = best.d / 1000
  return { id: best.id, rssi: Math.round(-70 - 22 * Math.log10(1 + km * 4)), snr: +(9 - km * 1.8).toFixed(1), sf: km < 1.5 ? 7 : km < 4 ? 8 : 9 }
}

const INITIAL = ['ruta', 'base', 'bahia', 'ruta', 'base', 'ruta', 'base', 'bahia', 'ruta', 'base']

// pseudoaleatorio estable por ambulancia
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261) / 4294967296

async function loadV16() {
  try {
    const r = await fetch('/api/v16')
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) return await r.json()
  } catch { /* sin backend: modo local */ }
  const xml = await fetch('/dgt/datex2/v3/dgt/SituationPublication/datex2_v37.xml').then((r) => (r.ok ? r.text() : Promise.reject(new Error(`DGT ${r.status}`))))
  return { source: 'DGT 3.0 · NAP DATEX II v3.7 (datos abiertos)', ...parseV16(xml) }
}

function loadHospital() {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./workers/hospitalWorker.js', import.meta.url), { type: 'module' })
    w.onmessage = (e) => { w.terminate(); e.data.ok ? resolve(e.data) : reject(new Error(e.data.error)) }
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'worker IFC')) }
    w.postMessage({ url: IFC_URL })
  })
}

export function useEmergency(zones) {
  const [hospital, setHospital] = useState(null)
  const [routes, setRoutes] = useState(null)
  const [v16, setV16] = useState({ beacons: [], status: 'idle', ts: null, latency: 0, error: null, totalSpain: 0 })
  const [simBeacons, setSimBeacons] = useState([])
  const [tick, setTick] = useState(0)
  const [err, setErr] = useState(null)
  const ambs = useRef(null)
  const assign = useRef({})
  const zonesRef = useRef(zones)
  zonesRef.current = zones
  const beaconsRef = useRef([])
  beaconsRef.current = [...v16.beacons, ...simBeacons]

  // hospital (IFC) y rutas
  useEffect(() => {
    loadHospital()
      .then(({ hospital: h, bytes }) => {
        const bays = h.spaces.filter((s) => s.type === 'PARKING').map((s) => {
          const p = s.psets.Pset_BCN_BahiaAmbulancia || {}
          return { code: p.Codigo || s.name, name: s.longName, tipo: p.TipoUnidad || 'POLIVALENTE', prioridad: p.Prioridad ?? 9, box: Boolean(p.AccesoDirectoBoxCriticos), w: s.w, l: s.l, h: s.h, polygon: spacePolygon(h, s), center: localToLonLat(h, s.x, s.y) }
        }).sort((a, b) => a.prioridad - b.prioridad)
        const apron = h.spaces.find((s) => s.type === 'EXTERNAL')
        setHospital({ ...h, bytes, bays, apron: apron ? spacePolygon(h, apron) : null, entrance: [h.lon, h.lat] })
      })
      .catch((e) => setErr(`IFC del hospital: ${e.message}`))
    fetch(ROUTES_URL).then((r) => r.json()).then((j) => setRoutes(j.routes.map(prepareRoute))).catch((e) => setErr(`rutas: ${e.message}`))
  }, [])

  // balizas V16 reales
  useEffect(() => {
    let stop = false
    const poll = async () => {
      if (document.hidden) return
      const t0 = performance.now()
      try {
        const d = await loadV16()
        if (!stop) setV16({ beacons: d.beacons || [], totalSpain: d.totalSpain || 0, status: 'ok', ts: d.ts || Date.now(), latency: Math.round(performance.now() - t0), error: null })
      } catch (e) {
        if (!stop) setV16((s) => ({ ...s, status: 'down', error: String(e?.message || e) }))
      }
    }
    poll()
    const id = setInterval(poll, V16_POLL_MS)
    return () => { stop = true; clearInterval(id) }
  }, [])

  // estado inicial: unas ambulancias ya en ruta, otras en bahía y otras en base
  useEffect(() => {
    if (!hospital || !routes || ambs.current) return
    const now = Date.now()
    const freeBays = [...hospital.bays]
    ambs.current = routes.map((rt, i) => {
      const h = hash(rt.id)
      const a = { id: rt.id, tipo: rt.tipo, origen: rt.origen, rt, devEui: `70B3D57ED005${(0xa10 + i).toString(16).toUpperCase().padStart(4, '0')}`, fCnt: Math.floor(h * 4000), t: 0, phase: 'ruta', until: 0, bay: null, lastUp: now - h * UPLINK_S * 1000 }
      // reparto inicial: 2 en una bahía, 4 en camino y 4 en su base (saldrán escalonadas en los próximos 25 min)
      const start = INITIAL[i % INITIAL.length]
      const k = freeBays.findIndex((x) => x.tipo === a.tipo || x.tipo === 'POLIVALENTE')
      if (start === 'bahia' && k >= 0) {
        const b = freeBays.splice(k, 1)[0]
        Object.assign(a, { phase: 'bahia', bay: b.code, until: now + (0.3 + h * 0.6) * DWELL_MIN[a.tipo] * 60000 })
      } else if (start === 'base') Object.assign(a, { phase: 'base', until: now + (2 + h * 23) * 60000 })
      else a.t = rt.total * (0.1 + 0.75 * hash(rt.id + 'p'))
      return a
    })
    setTick((t) => t + 1)
  }, [hospital, routes])

  // simulación: 1 vez por segundo
  useEffect(() => {
    if (!hospital || !routes) return
    let last = Date.now()
    const id = setInterval(() => {
      const list = ambs.current
      if (!list) return
      const now = Date.now()
      const dt = (now - last) / 1000
      last = now
      const occupied = new Map(list.filter((a) => a.phase === 'bahia').map((a) => [a.bay, a]))
      for (const a of list) {
        if (a.phase === 'ruta') {
          const p = positionAt(a.rt, a.t)
          a.path = remainingPath(a.rt, p.idx, p.pos)
          a.slow = trafficFactor(a.path, zonesRef.current)
          a.t += dt / a.slow
          a.pos = p.pos
          a.heading = p.heading
          a.speedKmh = (p.speedMs * 3.6) / a.slow
          a.v16 = beaconsOnPath(a.path, beaconsRef.current)
          a.etaMs = now + (a.rt.total - a.t) * a.slow * 1000 + a.v16.length * V16_DELAY_MIN * 60000
          if (a.t >= a.rt.total) {
            const want = assign.current[a.id]?.bay
            if (want && !occupied.has(want)) {
              Object.assign(a, { phase: 'bahia', bay: want, until: now + DWELL_MIN[a.tipo] * 60000, arrivedAt: now })
              occupied.set(want, a)
            } else Object.assign(a, { phase: 'espera', pos: hospital.entrance, arrivedAt: now })
          }
        } else if (a.phase === 'espera') {
          const want = assign.current[a.id]?.bay
          a.etaMs = now
          if (want && !occupied.has(want)) {
            Object.assign(a, { phase: 'bahia', bay: want, until: now + DWELL_MIN[a.tipo] * 60000 })
            occupied.set(want, a)
          }
        } else if (a.phase === 'bahia' && now >= a.until) {
          occupied.delete(a.bay)
          // vuelve a su base y tarda entre 10 y 30 min en tener otro aviso hacia el Clínic
          Object.assign(a, { phase: 'base', bay: null, until: now + (10 + hash(a.id + now) * 20) * 60000 })
        } else if (a.phase === 'base' && now >= a.until) {
          Object.assign(a, { phase: 'ruta', t: 0, arrivedAt: null })
        }
        if (a.phase === 'bahia') {
          const b = hospital.bays.find((x) => x.code === a.bay)
          a.pos = b?.center || hospital.entrance
          a.speedKmh = 0
        }
        // uplink LoRaWAN periódico (solo si está fuera de la base)
        if (a.phase !== 'base' && a.pos && now - a.lastUp >= UPLINK_S * 1000) {
          a.lastUp = now
          a.fCnt++
          a.uplink = lorawanUplink({ ...a, phase: a.phase }, a.fCnt, gatewayFor(a.pos))
        }
      }
      // asignación de bahías para las que vienen y las que esperan
      const bays = hospital.bays.map((b) => ({ ...b, freeAt: occupied.get(b.code)?.until || now }))
      const arrivals = list.filter((a) => a.phase === 'ruta' || a.phase === 'espera').map((a) => ({ id: a.id, tipo: a.tipo, etaMs: a.etaMs, prevBay: assign.current[a.id]?.bay }))
      assign.current = assignBays(arrivals, bays, now)
      setTick((t) => t + 1)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [hospital, routes])

  // baliza V16 SIMULADA en la ruta de la ambulancia que más tarda (para ver el efecto)
  const simulateV16 = useCallback(() => {
    const list = (ambs.current || []).filter((a) => a.phase === 'ruta' && a.path?.length > 20)
    const a = list.sort((x, y) => y.etaMs - x.etaMs)[0]
    if (!a) return null
    const p = a.path[Math.floor(a.path.length * 0.45)]
    setSimBeacons((s) => [...s, { id: `sim-${Date.now()}`, lat: p[1], lon: p[0], road: 'simulada', km: null, municipality: '', sim: true, since: Date.now(), target: a.id }])
    return a.id
  }, [])
  const clearSim = useCallback(() => setSimBeacons([]), [])

  // vista para la interfaz
  const view = useMemo(() => {
    const now = Date.now()
    const list = ambs.current || []
    const amb = list.map((a) => ({
      id: a.id, tipo: a.tipo, origen: a.origen, phase: a.phase, pos: a.pos, heading: a.heading || 0, speedKmh: a.speedKmh || 0,
      etaMs: a.etaMs, etaMin: a.etaMs ? Math.max(0, Math.round((a.etaMs - now) / 60000)) : null,
      v16: a.phase === 'ruta' ? a.v16 || [] : [], slow: a.slow || 1, path: a.phase === 'ruta' ? a.path : null,
      bay: a.phase === 'bahia' ? a.bay : assign.current[a.id]?.bay || null,
      waitMin: assign.current[a.id]?.waitMin || 0, until: a.until, uplink: a.uplink,
    }))
    const bays = (hospital?.bays || []).map((b) => {
      const occ = amb.find((a) => a.phase === 'bahia' && a.bay === b.code)
      const next = amb.filter((a) => (a.phase === 'ruta' || a.phase === 'espera') && a.bay === b.code).sort((x, y) => x.etaMs - y.etaMs)[0]
      return { ...b, state: occ ? 'ocupada' : next && next.etaMs - now < 10 * 60000 ? 'reservada' : 'libre', occ, next }
    })
    return { amb, bays }
  }, [tick, hospital])

  const beacons = useMemo(() => [...v16.beacons, ...simBeacons], [v16.beacons, simBeacons])

  // fuentes para el panel "Fuentes" (se recalculan cada ~10 s, no en cada segundo)
  const bucket = Math.floor(tick / 10)
  const sources = useMemo(() => {
    const sample = view.amb.find((a) => a.uplink)?.uplink
    const moving = view.amb.filter((a) => a.phase !== 'base').length
    return [
      {
        id: 'v16', protocol: 'DATEX II · DGT 3.0', label: 'Balizas V16 conectadas (reales)', endpoint: 'https://nap.dgt.es (Punto de Acceso Nacional, datos abiertos)', simulated: false,
        status: v16.status, msgPerMin: v16.status === 'ok' ? 1 : 0, latencyMs: v16.latency, lastTs: v16.ts || Date.now(),
        sample: v16.beacons[0] ? { carretera: v16.beacons[0].road, km: v16.beacons[0].km, municipio: v16.beacons[0].municipality, activa_desde: new Date(v16.beacons[0].since).toLocaleTimeString('es-ES') } : { info: v16.error || `0 balizas en Cataluña (${v16.totalSpain} en España)` },
      },
      {
        id: 'amb', protocol: 'LoRaWAN · TTN v3', label: 'GPS de ambulancias (LoRaWAN)', endpoint: 'mqtt://eu1.cloud.thethings.network (simulado)', simulated: true,
        status: hospital && routes ? 'ok' : err ? 'down' : 'idle', msgPerMin: Math.round((moving * 60) / UPLINK_S), latencyMs: 0, lastTs: Date.now(),
        sample: sample || { info: 'esperando el primer uplink' },
      },
      {
        id: 'ifc-h', protocol: 'IFC4 · web-ifc', label: 'BIM del hospital (muelle de urgencias)', endpoint: IFC_URL + ' (IFC de ejemplo)', simulated: true,
        status: hospital ? 'ok' : err ? 'down' : 'idle', msgPerMin: 0, latencyMs: 0, lastTs: Date.now(),
        sample: hospital ? { edificio: hospital.name, planta: hospital.storey, bahias: hospital.bays.map((b) => `${b.code} ${b.tipo}`).join(', ') } : { info: err || 'cargando IFC' },
      },
    ]
  }, [bucket, v16, hospital, routes, err])

  return { hospital, routesOk: Boolean(routes), err, v16, beacons, simBeacons, simulateV16, clearSim, sources, ...view }
}
