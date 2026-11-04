// Datos históricos REALES: accidentes de la Guàrdia Urbana (2024) + lluvia horaria de Open-Meteo.
// Todo el análisis se calcula en el navegador.

export const YEAR = 2024
export const HOURS = 366 * 24 // 2024 es bisiesto
const WET_MM = 0.2 // una hora cuenta como "con lluvia" si llueve ≥ 0,2 mm

export const SEV_LABEL = { leve: 'sin heridos', moderado: 'heridos leves', grave: 'heridos graves o fallecidos' }
const SEV = ['leve', 'moderado', 'grave'] // índice = código del JSON (0, 1, 2)

// Eje de tiempo en hora civil: 8.784 horas del 1-ene al 31-dic. Formato 'YYYY-MM-DDTHH:00'.
export function buildTimes() {
  const out = []
  for (let d = 0; d < 366; d++) {
    const day = new Date(Date.UTC(YEAR, 0, 1 + d)).toISOString().slice(0, 10)
    for (let h = 0; h < 24; h++) out.push(`${day}T${String(h).padStart(2, '0')}:00`)
  }
  return out
}

export function parseAccidents(json) {
  const { barris } = json
  return json.rows.map((r, i) => ({
    id: String(i),
    hourIdx: r[0] * 24 + r[1],
    lon: r[2],
    lat: r[3],
    sev: SEV[r[4]],
    victims: r[5],
    barri: barris[r[6]],
  }))
}

// Alinea la respuesta de Open-Meteo con nuestro eje. Horas que no existen en la respuesta → null.
// (El día del cambio de hora hay una hora de desajuste; es despreciable sobre 8.784 horas.)
export function alignRain(times, api) {
  const t = api?.hourly?.time
  const p = api?.hourly?.precipitation
  if (!Array.isArray(t) || !Array.isArray(p)) return null
  const map = new Map()
  t.forEach((k, i) => {
    const key = `${k.slice(0, 13)}:00`
    const v = p[i]
    if (v == null) return
    map.set(key, Math.max(map.get(key) ?? 0, v))
  })
  let missing = 0
  const rain = times.map((k) => {
    const v = map.get(k)
    if (v == null) {
      missing++
      return 0
    }
    return v
  })
  // si falta más del 2 % de las horas, no nos fiamos
  return missing > HOURS * 0.02 ? null : { rain, missing }
}

function pearson(a, b) {
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

// Razón de tasas con lluvia / sin lluvia, ajustada por estrato (hora del día × laborable/fin de semana):
// estimador de Mantel-Haenszel; varianza de Greenland-Robins para el intervalo del 95 %.
export function mantelHaenszel(rain, perHour) {
  const A = {}
  const B = {}
  const T1 = {}
  const T0 = {}
  for (let i = 0; i < rain.length; i++) {
    const day = Math.floor(i / 24)
    const s = (i % 24) + 24 * (day % 7 >= 5 ? 1 : 0) // 1-ene-2024 fue lunes → día%7 ≥ 5 = fin de semana
    const wet = rain[i] >= WET_MM
    if (wet) {
      A[s] = (A[s] || 0) + perHour[i]
      T1[s] = (T1[s] || 0) + 1
    } else {
      B[s] = (B[s] || 0) + perHour[i]
      T0[s] = (T0[s] || 0) + 1
    }
  }
  let R = 0
  let S = 0
  let V = 0
  for (let s = 0; s < 48; s++) {
    const t1 = T1[s] || 0
    const t0 = T0[s] || 0
    const t = t1 + t0
    if (!t || !t1 || !t0) continue
    const a = A[s] || 0
    const b = B[s] || 0
    R += (a * t0) / t
    S += (b * t1) / t
    V += (t1 * t0 * (a + b)) / (t * t)
  }
  if (!R || !S) return null
  const rr = R / S
  const se = Math.sqrt(V / (R * S))
  return { rr, lo: Math.exp(Math.log(rr) - 1.96 * se), hi: Math.exp(Math.log(rr) + 1.96 * se) }
}

export function computeStats(times, rain, accidents, totals, rainOk) {
  const perHour = new Array(times.length).fill(0)
  accidents.forEach((a) => {
    if (a.hourIdx >= 0 && a.hourIdx < perHour.length) perHour[a.hourIdx]++
  })
  const base = { totals, total: accidents.length, perHour, rainOk }
  if (!rainOk) return base

  const wet = []
  const dry = []
  rain.forEach((r, i) => (r >= WET_MM ? wet : dry).push(perHour[i]))
  const avg = (x) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : 0)

  // día más lluvioso (para empezar la demo en un día con lluvia)
  let bestDay = 0
  let bestMm = -1
  for (let d = 0; d < 366; d++) {
    let mm = 0
    for (let h = 0; h < 24; h++) mm += rain[d * 24 + h]
    if (mm > bestMm) {
      bestMm = mm
      bestDay = d
    }
  }

  return {
    ...base,
    r: pearson(rain, perHour),
    wetHours: wet.length,
    avgWet: avg(wet),
    avgDry: avg(dry),
    mh: mantelHaenszel(rain, perHour),
    rainiestDay: bestDay,
    rainiestMm: bestMm,
  }
}
