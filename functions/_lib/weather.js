// Conector REST real: tiempo actual de Barcelona (Open-Meteo, sin clave).
// Se cachea 10 min en el borde de Cloudflare para gastar casi nada de cuota.
const URL =
  'https://api.open-meteo.com/v1/forecast?latitude=41.3851&longitude=2.1734' +
  '&current=precipitation,wind_speed_10m,temperature_2m&timezone=Europe%2FMadrid'

export async function getWeather() {
  try {
    const r = await fetch(URL, { cf: { cacheTtl: 600, cacheEverything: true } })
    if (!r.ok) throw new Error(`open-meteo ${r.status}`)
    const j = await r.json()
    return {
      rain: Number(j.current.precipitation ?? 0),
      wind: Math.round(Number(j.current.wind_speed_10m ?? 0)),
      temp: Math.round(Number(j.current.temperature_2m ?? 0)),
      real: true,
      ts: Date.now(),
    }
  } catch {
    // Si la API falla, el conector REST pasa a "degraded" y se usan valores neutros.
    return { rain: 0, wind: 10, temp: 18, real: false, ts: Date.now() }
  }
}
