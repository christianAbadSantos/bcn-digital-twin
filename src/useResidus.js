// Residuos en el gemelo: contenedores reales (OSM) con sensores de llenado, puntos verdes y puntos
// críticos de limpieza (Open Data BCN), y planificación de la ruta de recogida desde la Zona Franca.
//   - Con la API .NET en marcha (fcc-residus-api: ASP.NET Core + EF Core + PostgreSQL), los niveles,
//     los indicadores y las rutas vienen de la API.
//   - Si no hay API (p. ej. en la web publicada), se simula lo mismo en el navegador (shared/residus.js).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FRACCIONS, avanca, capacitat, hash, kg, planifica } from '../shared/residus.js'

const DATA_URL = '/data/residus.json'
// API .NET: en local la de dotnet run; en la web publicada, la desplegada en MonsterASP (SQL Server)
const API = import.meta.env.VITE_RESIDUS_API ?? (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:5080' : 'https://residus-bcn.runasp.net')
const POLL_MS = 20000
export const BASE = { lat: 41.344, lon: 2.136, nom: 'Base Zona Franca (ubicación aproximada)' }
const CAPACITAT_KG = 9000
const ACCEL = 60 // horas simuladas por hora real, como el simulador de la API

const horaBcn = () => Number(new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hour12: false, timeZone: 'Europe/Madrid' }).format(new Date()))

function kpisDe(cs) {
  const per = FRACCIONS.map((f) => {
    const xs = cs.filter((c) => c.fraccio === f)
    return { fraccio: f, contenidors: xs.length, nivellMitja: xs.length ? Math.round((xs.reduce((s, c) => s + c.nivellPct, 0) / xs.length) * 10) / 10 : 0, plensMes80: xs.filter((c) => c.nivellPct >= 80).length, desbordats: xs.filter((c) => c.nivellPct >= 100).length }
  })
  return { contenidors: cs.length, plens: per.reduce((s, x) => s + x.plensMes80, 0), desbordats: per.reduce((s, x) => s + x.desbordats, 0), perFraccio: per }
}

export function useResidus() {
  const [dades, setDades] = useState(null) // residus.json
  const [mode, setMode] = useState('carregant') // 'api' | 'local' | 'carregant'
  const [cs, setCs] = useState([])
  const [kpisApi, setKpisApi] = useState(null)
  const [ruta, setRuta] = useState(null)
  const [estat, setEstat] = useState({ latency: 0, ts: null, error: null })
  const local = useRef(null)

  // datos reales (posiciones, puntos verdes, puntos críticos)
  useEffect(() => {
    fetch(DATA_URL).then((r) => r.json()).then(setDades).catch((e) => setEstat((s) => ({ ...s, error: `residus.json: ${e.message}` })))
  }, [])

  // API .NET si está disponible; si no, simulación local
  useEffect(() => {
    if (!dades) return
    let stop = false
    const iniciaLocal = () => {
      if (local.current) return
      let id = 0
      local.current = dades.punts.flatMap(([osmId, lon, lat, mask, sot]) =>
        FRACCIONS.flatMap((f, i) => (mask & (1 << i) ? [{ id: ++id, osmId, fraccio: f, lat, lon, soterrat: !!sot, capacitatLitres: capacitat(f, !!sot), nivellPct: Math.round((5 + 80 * hash(osmId * 7 + i)) * 10) / 10 }] : [])))
      setCs([...local.current])
    }
    const poll = async () => {
      if (document.hidden) return
      if (API) {
        const t0 = performance.now()
        try {
          const ctl = AbortSignal.timeout(8000) // en la nube la API puede tardar en despertar
          const [c, k] = await Promise.all([fetch(`${API}/api/contenidors`, { signal: ctl }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))), fetch(`${API}/api/kpis`, { signal: ctl }).then((r) => r.json())])
          if (stop) return
          setCs(c)
          setKpisApi(k)
          setMode('api')
          setEstat({ latency: Math.round(performance.now() - t0), ts: Date.now(), error: null })
          return
        } catch (e) {
          if (stop) return
          setEstat((s) => ({ ...s, error: `API no disponible (${e.message})` }))
        }
      }
      iniciaLocal()
      setMode('local')
    }
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => { stop = true; clearInterval(id) }
  }, [dades])

  // simulación local: cada 5 s avanza el llenado (sin API)
  useEffect(() => {
    if (mode !== 'local') return
    const tick = 5000
    const id = setInterval(() => {
      const h = horaBcn()
      for (const c of local.current || []) c.nivellPct = Math.round(avanca(c.nivellPct, c.fraccio, h, (tick / 3600000) * ACCEL, 0.6 + 0.8 * hash(c.id)) * 10) / 10
      setCs([...(local.current || [])])
      setEstat((s) => ({ ...s, ts: Date.now() }))
    }, tick)
    return () => clearInterval(id)
  }, [mode])

  const planificaRuta = useCallback(async (fraccio, llindar = 80) => {
    if (mode === 'api') {
      const r = await fetch(`${API}/api/rutes/proposta?fraccio=${fraccio}&llindar=${llindar}`).then((x) => x.json())
      setRuta({ ...r, fraccio, viatges: r.viatges.map((v) => ({ ...v, parades: v.parades.map((p) => ({ ...p, nivellPct: p.nivellPct })) })) })
      return
    }
    const punts = cs.filter((c) => c.fraccio === fraccio && c.nivellPct >= llindar).sort((a, b) => b.nivellPct - a.nivellPct).slice(0, 120)
      .map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, kg: kg(c.fraccio, c.capacitatLitres, c.nivellPct), nivellPct: c.nivellPct }))
    setRuta({ fraccio, llindarPct: llindar, base: BASE.nom, baseLat: BASE.lat, baseLon: BASE.lon, capacitatCamioKg: CAPACITAT_KG, ...planifica(BASE, punts, CAPACITAT_KG) })
  }, [mode, cs])

  const completaRuta = useCallback(async () => {
    if (!ruta) return
    const ids = ruta.viatges.flatMap((v) => v.parades.map((p) => p.id))
    if (mode === 'api') {
      await fetch(`${API}/api/rutes/completar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fraccio: ruta.fraccio, contenidorIds: ids, km: ruta.kmTotal }) })
      setCs((xs) => xs.map((c) => (ids.includes(c.id) && c.fraccio === ruta.fraccio ? { ...c, nivellPct: 0 } : c)))
    } else {
      for (const c of local.current || []) if (ids.includes(c.id)) c.nivellPct = 0
      setCs([...(local.current || [])])
    }
    setRuta(null)
  }, [ruta, mode])

  const kpis = useMemo(() => (mode === 'api' && kpisApi ? kpisApi : kpisDe(cs)), [mode, kpisApi, cs])

  const source = useMemo(() => {
    const top = cs.reduce((a, c) => (!a || c.nivellPct > a.nivellPct ? c : a), null)
    return {
      id: 'residus',
      protocol: mode === 'api' ? 'REST · ASP.NET Core' : 'LoRaWAN (simulado)',
      label: 'Sensores de llenado de contenedores',
      endpoint: mode === 'api' ? `${API}/api/contenidors (API .NET + PostgreSQL)` : 'simulación en el navegador (sin API .NET)',
      simulated: true,
      status: mode === 'carregant' ? 'idle' : 'ok',
      msgPerMin: mode === 'api' ? Math.round(cs.length * 0.05 * 4) : Math.round(cs.length * 0.05 * 12),
      latencyMs: estat.latency,
      lastTs: estat.ts || Date.now(),
      sample: top ? { contenedor: top.id, fraccion: top.fraccio, nivel_pct: top.nivellPct, osm: top.osmId } : { info: 'cargando contenedores' },
    }
  }, [mode, Math.floor((estat.ts || 0) / 30000), cs.length])

  return { dades, mode, api: API, cs, kpis, ruta, setRuta, planificaRuta, completaRuta, error: estat.error, ts: estat.ts, source }
}
