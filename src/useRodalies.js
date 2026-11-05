// Trenes reales de Rodalies (Renfe GTFS-RT). En Cloudflare los sirve /api/rodalies;
// en local (npm run dev) se piden a través del proxy de Vite /renfe/… y se procesan aquí.
import { useEffect, useMemo, useState } from 'react'
import { parseRodalies } from '../shared/rodalies.js'

const POLL_MS = 20000

async function load() {
  try {
    const r = await fetch('/api/rodalies')
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) return await r.json()
  } catch {
    /* sin backend: modo local */
  }
  const [pos, upd] = await Promise.all([
    fetch('/renfe/vehicle_positions.json').then((r) => r.json()),
    fetch('/renfe/trip_updates.json').then((r) => r.json()).catch(() => null),
  ])
  return { source: 'Renfe GTFS-RT (datos abiertos)', ...parseRodalies(pos, upd) }
}

export function useRodalies() {
  const [state, setState] = useState({ trains: [], status: 'idle', ts: null, latency: 0, error: null })
  useEffect(() => {
    let stop = false
    const tick = async () => {
      if (document.hidden) return
      const t0 = performance.now()
      try {
        const d = await load()
        if (!stop) setState({ trains: d.trains || [], status: 'ok', ts: d.ts || Date.now(), latency: Math.round(performance.now() - t0), error: null })
      } catch (e) {
        if (!stop) setState((s) => ({ ...s, status: 'down', error: String(e?.message || e) }))
      }
    }
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [])

  return useMemo(() => {
    const s = state
    const late = s.trains.filter((t) => t.delayMin >= 5).length
    const sample = s.trains[0]
    return {
      ...s,
      source: {
        id: 'rodalies',
        protocol: 'GTFS-RT · Renfe',
        label: 'Rodalies de Catalunya (trenes reales)',
        endpoint: 'https://gtfsrt.renfe.com (datos abiertos de Renfe)',
        simulated: false,
        status: s.status === 'ok' ? (late > s.trains.length / 3 ? 'degraded' : 'ok') : s.status,
        msgPerMin: s.status === 'ok' ? Math.round((s.trains.length * 60000) / POLL_MS) : 0,
        latencyMs: s.latency,
        lastTs: s.ts || Date.now(),
        sample: sample ? { tren: sample.id, linea: sample.line, lat: sample.lat, lon: sample.lon, estado: sample.status, retraso_min: sample.delayMin } : { info: s.error || 'esperando datos' },
      },
    }
  }, [state])
}
