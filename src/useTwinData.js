import { useEffect, useMemo, useState } from 'react'
import { CENTER } from './geo.js'
import { simulateAccidents, summarize, syntheticRain } from './sim.js'

const URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${CENTER.lat}&longitude=${CENTER.lon}` +
  '&hourly=precipitation&past_days=7&forecast_days=1&timezone=Europe%2FMadrid'

// Carga la lluvia horaria real de Barcelona (Open-Meteo, gratis y sin clave)
// y construye el dataset de accidentes simulados correlacionado con ella.
export function useTwinData() {
  const [weather, setWeather] = useState(null)

  useEffect(() => {
    let alive = true
    fetch(URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((j) => {
        if (!alive) return
        setWeather({ times: j.hourly.time, rain: j.hourly.precipitation.map((v) => v ?? 0), source: 'Open-Meteo (real)' })
      })
      .catch(() => {
        if (!alive) return
        const s = syntheticRain()
        setWeather({ ...s, source: 'sintética (sin conexión a la API)' })
      })
    return () => {
      alive = false
    }
  }, [])

  return useMemo(() => {
    if (!weather) return null
    const { accidents, perHour } = simulateAccidents(weather.times, weather.rain)
    return { ...weather, accidents, perHour, stats: summarize(weather.rain, perHour) }
  }, [weather])
}
