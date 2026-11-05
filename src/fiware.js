// Adaptador FIWARE (Orion / Orion-LD Context Broker) para datos de smart city en tiempo real.
//
// Lee entidades con los Smart Data Models de FIWARE (TrafficFlowObserved, AirQualityObserved,
// OffStreetParking/ParkingSpot, WeatherObserved, NoiseLevelObserved…) por NGSI-v2 o NGSI-LD y las
// normaliza a un formato común del gemelo: { id, type, kind, lon, lat, title, value, unit, level, ts }.
//
// De dónde lee (por orden):
//  1. VITE_FIWARE_URL  → directo al broker (el broker debe permitir CORS);
//  2. /api/fiware      → Pages Function que reenvía al broker de FIWARE_URL (con cabeceras de servicio y token)
//                        y guarda una instantánea por minuto en R2;
//  3. ?fiware=demo     → fichero de MUESTRA en public/data/fiware-sample.json (valores inventados, se marca así).
import { useEffect, useMemo, useRef, useState } from 'react'

const DIRECT = import.meta.env.VITE_FIWARE_URL || ''
const FLAVOR = (import.meta.env.VITE_FIWARE_NGSI || 'v2').toLowerCase() // 'v2' | 'ld'
const TYPES = (import.meta.env.VITE_FIWARE_TYPES || 'TrafficFlowObserved,AirQualityObserved,OffStreetParking,ParkingSpot,WeatherObserved,NoiseLevelObserved').split(',')
const POLL_MS = 15000
const LD_CONTEXT = 'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld'

// --- normalización (NGSI-v2 keyValues y NGSI-LD concise/keyValues)
const val = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x)
function coords(e) {
  const loc = val(e.location)
  if (loc?.type === 'Point') return loc.coordinates
  if (loc?.coordinates) {
    // polígono o línea: centro aproximado
    const flat = JSON.stringify(loc.coordinates).match(/-?\d+\.?\d*/g)?.map(Number) || []
    let lon = 0, lat = 0, n = 0
    for (let i = 0; i + 1 < flat.length; i += 2) { lon += flat[i]; lat += flat[i + 1]; n++ }
    if (n) return [lon / n, lat / n]
  }
  return null
}
const short = (t) => String(t || '').split(/[/#]/).pop()

export function normalize(e) {
  const type = short(e.type)
  const c = coords(e)
  if (!c) return null
  const base = { id: e.id, type, lon: c[0], lat: c[1], title: val(e.name) || short(e.id), ts: val(e.dateObserved) || val(e.dateModified) || null }
  switch (type) {
    case 'TrafficFlowObserved': {
      const v = Number(val(e.averageVehicleSpeed))
      const occ = Number(val(e.occupancy))
      const level = Number.isFinite(occ) ? (occ > 0.7 ? 'bad' : occ > 0.45 ? 'warn' : 'ok') : 'ok'
      return { ...base, kind: 'traffic', value: Number.isFinite(v) ? Math.round(v) : val(e.intensity), unit: Number.isFinite(v) ? 'km/h' : 'veh/h', level, extra: Number.isFinite(occ) ? `ocupación ${Math.round(occ * 100)} %` : '' }
    }
    case 'AirQualityObserved': {
      const no2 = Number(val(e.NO2) ?? val(e.no2))
      const pm10 = Number(val(e.PM10) ?? val(e.pm10))
      const level = no2 > 200 || pm10 > 50 ? 'bad' : no2 > 100 || pm10 > 35 ? 'warn' : 'ok'
      return { ...base, kind: 'air', value: Number.isFinite(no2) ? Math.round(no2) : Math.round(pm10), unit: Number.isFinite(no2) ? 'µg/m³ NO₂' : 'µg/m³ PM10', level, extra: Number.isFinite(pm10) && Number.isFinite(no2) ? `PM10 ${Math.round(pm10)}` : '' }
    }
    case 'OffStreetParking':
    case 'ParkingSpot': {
      const free = Number(val(e.availableSpotNumber))
      const total = Number(val(e.totalSpotNumber))
      const st = val(e.status)
      const value = Number.isFinite(free) ? free : st === 'free' ? 1 : 0
      const level = Number.isFinite(free) && Number.isFinite(total) ? (free / total < 0.05 ? 'bad' : free / total < 0.2 ? 'warn' : 'ok') : st === 'occupied' ? 'warn' : 'ok'
      return { ...base, kind: 'parking', value, unit: 'plazas libres', level, extra: Number.isFinite(total) ? `de ${total}` : '' }
    }
    case 'WeatherObserved':
      return { ...base, kind: 'weather', value: val(e.temperature), unit: '°C', level: 'ok', extra: val(e.precipitation) != null ? `lluvia ${val(e.precipitation)} mm` : '' }
    case 'NoiseLevelObserved': {
      const db = Number(val(e.LAeq) ?? val(e.LAS))
      return { ...base, kind: 'noise', value: Math.round(db), unit: 'dB(A)', level: db > 70 ? 'bad' : db > 60 ? 'warn' : 'ok' }
    }
    default:
      return { ...base, kind: 'other', value: null, unit: '', level: 'ok' }
  }
}

async function fetchEntities(base, flavor, viaProxy) {
  const out = []
  for (const type of TYPES) {
    const path = flavor === 'ld' ? `/ngsi-ld/v1/entities?type=${encodeURIComponent(type)}&options=keyValues&limit=1000` : `/v2/entities?type=${encodeURIComponent(type)}&options=keyValues&limit=1000`
    const url = viaProxy ? `${base}?path=${encodeURIComponent(path)}` : base.replace(/\/$/, '') + path
    const headers = flavor === 'ld' && !viaProxy ? { Link: `<${LD_CONTEXT}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"` } : {}
    const r = await fetch(url, { headers })
    if (r.status === 501) throw Object.assign(new Error('no configurado'), { idle: true })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    if (!(r.headers.get('content-type') || '').includes('json')) throw Object.assign(new Error('sin backend'), { idle: true })
    out.push(...(await r.json()))
  }
  return out
}

export function useFiware() {
  const demo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('fiware') === 'demo'
  const [state, setState] = useState({ entities: [], status: 'idle', error: null, ts: null, latency: null, n: 0 })
  const count = useRef(0)

  useEffect(() => {
    let stop = false
    const tick = async () => {
      if (document.hidden) return
      const t0 = performance.now()
      try {
        let raw
        if (demo) raw = await (await fetch('/data/fiware-sample.json')).json()
        else if (DIRECT) raw = await fetchEntities(DIRECT, FLAVOR, false)
        else raw = await fetchEntities('/api/fiware', FLAVOR, true)
        if (stop) return
        const entities = raw.map(normalize).filter(Boolean)
        count.current += entities.length
        setState({ entities, status: 'ok', error: null, ts: Date.now(), latency: Math.round(performance.now() - t0), n: entities.length, demo })
      } catch (e) {
        if (stop) return
        setState((s) => ({ ...s, status: e.idle ? 'idle' : 'down', error: e.message, ts: s.ts }))
      }
    }
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [demo])

  return useMemo(() => withSource(state), [state])
}

function withSource(s) {
  const source = {
    id: 'fiware',
    protocol: FLAVOR === 'ld' ? 'NGSI-LD · FIWARE' : 'NGSI-v2 · FIWARE',
    label: 'Context Broker (Orion) · smart city',
    endpoint: s.demo ? 'muestra local (public/data/fiware-sample.json)' : DIRECT || '/api/fiware → FIWARE_URL',
    simulated: Boolean(s.demo) || s.status !== 'ok',
    status: s.status,
    msgPerMin: s.status === 'ok' ? Math.round((s.n * 60000) / POLL_MS) : 0,
    latencyMs: s.latency ?? 0,
    lastTs: s.ts || Date.now(),
    sample: s.entities[0] ? { id: s.entities[0].id, type: s.entities[0].type, value: s.entities[0].value, unit: s.entities[0].unit } : { info: s.error === 'no configurado' || s.error === 'sin backend' ? 'Sin broker: define FIWARE_URL (Cloudflare) o VITE_FIWARE_URL, o abre con ?fiware=demo' : s.error || 'esperando datos' },
  }
  return { ...s, source }
}
