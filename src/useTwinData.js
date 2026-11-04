import { useEffect, useState } from 'react'
import { CENTER } from './geo.js'
import { alignRain, buildTimes, computeStats, parseAccidents } from './stats.js'

// Lluvia horaria de 2024 (archivo histórico de Open-Meteo, gratis y sin clave)
const ARCHIVE =
  `https://archive-api.open-meteo.com/v1/archive?latitude=${CENTER.lat}&longitude=${CENTER.lon}` +
  '&start_date=2024-01-01&end_date=2024-12-31&hourly=precipitation&timezone=Europe%2FMadrid'

// Carga los accidentes REALES de 2024 (fichero estático del proyecto) y la lluvia REAL de esas horas.
// Si la lluvia no llega, los accidentes se muestran igual y NO se inventa lluvia ni correlación.
export function useTwinData() {
  const [state, setState] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const accP = fetch('/data/accidents-2024.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`accidentes ${r.status}`))))
      const rainP = fetch(ARCHIVE).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      try {
        const [json, rainJson] = await Promise.all([accP, rainP])
        const times = buildTimes()
        const accidents = parseAccidents(json)
        const aligned = alignRain(times, rainJson)
        const rain = aligned ? aligned.rain : new Array(times.length).fill(0)
        const stats = computeStats(times, rain, accidents, json.totals, Boolean(aligned))
        const startHour = aligned ? stats.rainiestDay * 24 + 12 : 12
        if (alive)
          setState({
            times,
            rain,
            rainOk: Boolean(aligned),
            accidents,
            perHour: stats.perHour,
            stats,
            startHour,
            source: aligned ? 'Open-Meteo (archivo 2024)' : 'no disponible',
            accSource: json.source,
          })
      } catch (e) {
        if (alive) setState({ error: String(e.message || e) })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return state
}
