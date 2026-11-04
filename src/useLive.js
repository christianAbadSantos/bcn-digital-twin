import { useCallback, useEffect, useRef, useState } from 'react'
import { buildSnapshot } from '../shared/engine.js'

// Protección de cuota (plan gratuito de Cloudflare): sondeo cada 5 s, solo con la pestaña
// visible y se pausa solo a los 5 min. Reanudar es un clic.
const POLL_MS = 5000
const IDLE_MS = 5 * 60 * 1000
const WEATHER =
  'https://api.open-meteo.com/v1/forecast?latitude=41.3851&longitude=2.1734' +
  '&current=precipitation,wind_speed_10m,temperature_2m&timezone=Europe%2FMadrid'

async function clientWeather(cache) {
  if (cache.current && Date.now() - cache.current.ts < 600000) return cache.current
  let w
  try {
    const r = await fetch(WEATHER)
    const j = await r.json()
    w = { rain: Number(j.current.precipitation ?? 0), wind: Math.round(Number(j.current.wind_speed_10m ?? 0)), temp: Math.round(Number(j.current.temperature_2m ?? 0)), real: true, ts: Date.now() }
  } catch {
    w = { rain: 0, wind: 10, temp: 18, real: false, ts: Date.now() }
  }
  cache.current = w
  return w
}

export function useLive(scenario) {
  const [snap, setSnap] = useState(null)
  const [mode, setMode] = useState('conectando') // 'backend' | 'local'
  const [paused, setPaused] = useState(false)
  const [hist, setHist] = useState(null)
  const wcache = useRef(null)
  const since = useRef(Date.now())

  const tick = useCallback(async () => {
    try {
      const r = await fetch(`/api/state?scenario=${scenario}`)
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('sin backend')
      setSnap(await r.json())
      setMode('backend')
      return
    } catch {
      /* sin backend (p. ej. npm run dev) o cuota agotada → motor local */
    }
    const w = await clientWeather(wcache)
    setSnap(buildSnapshot(Date.now(), w, { scenario, db: false }))
    setMode('local')
  }, [scenario])

  useEffect(() => {
    tick()
  }, [tick])

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      if (document.hidden) return
      if (Date.now() - since.current > IDLE_MS) {
        setPaused(true)
        return
      }
      tick()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [paused, tick])

  useEffect(() => {
    fetch('/api/history')
      .then((r) => (r.headers.get('content-type') || '').includes('json') ? r.json() : null)
      .then(setHist)
      .catch(() => setHist(null))
  }, [])

  const resume = useCallback(() => {
    since.current = Date.now()
    setPaused(false)
    tick()
  }, [tick])

  return { snap, mode, paused, resume, hist }
}
