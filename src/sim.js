import { HOTSPOTS } from './geo.js'

// PRNG determinista para que la simulación sea reproducible
export function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function poisson(rng, lambda) {
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > L)
  return k - 1
}

// Intensidad horaria típica del tráfico (0-23h)
const TRAFFIC = [0.25, 0.18, 0.15, 0.15, 0.2, 0.4, 0.8, 1.3, 1.5, 1.1, 0.9, 0.95, 1.1, 1.1, 1.0, 1.0, 1.15, 1.45, 1.5, 1.2, 0.9, 0.65, 0.5, 0.35]

// ⚠️ DATOS SIMULADOS: los accidentes se generan con un modelo (Poisson) en el que la lluvia
// aumenta la tasa. Sirve para demostrar el pipeline. Para datos reales, sustituir por el
// dataset "Accidents gestionats per la Guàrdia Urbana" de Open Data BCN.
export function simulateAccidents(times, rainMm, rainEffect = 0.28) {
  const rng = mulberry32(20261029)
  const totalW = HOTSPOTS.reduce((s, h) => s + h.w, 0)
  const accidents = []
  const perHour = new Array(times.length).fill(0)

  times.forEach((t, i) => {
    const hour = Number(t.slice(11, 13))
    const rain = rainMm[i] || 0
    const lambda = 0.7 * TRAFFIC[hour] * (1 + rainEffect * Math.min(rain, 10))
    const n = poisson(rng, lambda)
    perHour[i] = n
    for (let k = 0; k < n; k++) {
      let r = rng() * totalW
      let h = HOTSPOTS[0]
      for (const c of HOTSPOTS) {
        if ((r -= c.w) <= 0) {
          h = c
          break
        }
      }
      accidents.push({
        id: `${i}-${k}`,
        hourIdx: i,
        lon: h.lon + (rng() - 0.5) * 0.006,
        lat: h.lat + (rng() - 0.5) * 0.004,
        place: h.name,
        sev: rng() < 0.12 ? 'grave' : rng() < 0.4 ? 'moderado' : 'leve',
      })
    }
  })
  return { accidents, perHour }
}

export function pearson(a, b) {
  const n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

export function summarize(rainMm, perHour) {
  const wet = []
  const dry = []
  rainMm.forEach((r, i) => (r >= 0.2 ? wet : dry).push(perHour[i]))
  const avg = (x) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : 0)
  return {
    r: pearson(rainMm, perHour),
    total: perHour.reduce((s, v) => s + v, 0),
    wetHours: wet.length,
    avgWet: avg(wet),
    avgDry: avg(dry),
  }
}

// Lluvia sintética de respaldo si falla la API del tiempo
export function syntheticRain(hours = 192) {
  const rng = mulberry32(7)
  const now = new Date()
  const times = []
  const rain = []
  let storm = 0
  for (let i = 0; i < hours; i++) {
    const d = new Date(now.getTime() - (hours - 1 - i) * 3600_000)
    times.push(d.toISOString().slice(0, 13) + ':00')
    if (storm <= 0 && rng() < 0.04) storm = 3 + Math.floor(rng() * 8)
    rain.push(storm > 0 ? +(rng() * 6).toFixed(1) : 0)
    storm--
  }
  return { times, rain }
}
