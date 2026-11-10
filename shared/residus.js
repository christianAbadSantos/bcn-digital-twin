// Residuos (versión JavaScript del dominio de la API .NET fcc-residus-api):
// modelo de llenado de los contenedores y planificador de rutas de recogida.
// La web publicada lo usa cuando no hay API .NET a mano; con la API en marcha, manda la API.
// Mantener en sincronía con Services/OmplimentModel.cs y Services/PlanificadorRutes.cs.

export const FRACCIONS = ['Rebuig', 'Envasos', 'Paper', 'Vidre', 'Organica']
export const FRACCIO_NOM = { Rebuig: 'Resto', Envasos: 'Envases', Paper: 'Papel y cartón', Vidre: 'Vidrio', Organica: 'Orgánica' }
export const FRACCIO_COLOR = { Rebuig: '#6b7280', Envasos: '#e2b100', Paper: '#2a78d6', Vidre: '#0ca30c', Organica: '#8a5a2b' }

const RITME = { Rebuig: 2.6, Organica: 2.2, Envasos: 1.8, Paper: 1.5, Vidre: 0.7 }
const KG_L = { Vidre: 0.3, Organica: 0.25, Rebuig: 0.12, Paper: 0.06, Envasos: 0.03 }

export const factorHorari = (h) => (h < 6 ? 0.15 : h < 9 ? 1.3 : h < 13 ? 0.9 : h < 16 ? 1.1 : h < 20 ? 0.9 : 1.6)
export const avanca = (nivell, f, hora, hores, variacio = 1) => (hores <= 0 ? nivell : Math.min(100, Math.max(0, nivell + RITME[f] * factorHorari(hora) * variacio * hores)))
export const kg = (f, litres, nivellPct) => Math.round(litres * (nivellPct / 100) * KG_L[f] * 10) / 10
export const capacitat = (f, soterrat) => (soterrat ? 3000 : f === 'Envasos' || f === 'Paper' ? 3200 : f === 'Vidre' ? 2500 : 2200)

// mismo hash que Seeder.Hash en C# (aprox.: aquí solo hace falta que sea estable)
export const hash = (x) => {
  let h = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) % 10000 / 10000
}

const FACTOR_CARRER = 1.3, VEL_KMH = 18, MIN_PARADA = 1.5
export function distKm(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a)) * FACTOR_CARRER
}
const longitud = (b, r) => {
  if (!r.length) return 0
  let km = distKm(b.lat, b.lon, r[0].lat, r[0].lon) + distKm(r.at(-1).lat, r.at(-1).lon, b.lat, b.lon)
  for (let i = 0; i < r.length - 1; i++) km += distKm(r[i].lat, r[i].lon, r[i + 1].lat, r[i + 1].lon)
  return km
}
function dosOpt(b, ruta) {
  const r = [...ruta]
  let millora = true
  for (let pass = 0; millora && pass < 20; pass++) {
    millora = false
    for (let i = 0; i < r.length - 1; i++) {
      for (let k = i + 1; k < r.length; k++) {
        const a = i === 0 ? b : r[i - 1], d = k === r.length - 1 ? b : r[k + 1]
        const abans = distKm(a.lat, a.lon, r[i].lat, r[i].lon) + distKm(r[k].lat, r[k].lon, d.lat, d.lon)
        const despres = distKm(a.lat, a.lon, r[k].lat, r[k].lon) + distKm(r[i].lat, r[i].lon, d.lat, d.lon)
        if (despres + 1e-9 < abans) {
          const tram = r.slice(i, k + 1).reverse()
          r.splice(i, k - i + 1, ...tram)
          millora = true
        }
      }
    }
  }
  return r
}

// vecino más próximo + 2-opt, en varios viajes según la capacidad del camión (como la API)
export function planifica(base, punts, capacitatKg) {
  const pend = [...punts]
  const viatges = []
  while (pend.length) {
    const v = []
    let carga = 0, cur = base
    for (;;) {
      let best = -1, dBest = Infinity
      for (let i = 0; i < pend.length; i++) {
        if (carga + pend[i].kg > capacitatKg && v.length) continue
        const d = distKm(cur.lat, cur.lon, pend[i].lat, pend[i].lon)
        if (d < dBest) { dBest = d; best = i }
      }
      if (best < 0) break
      const p = pend.splice(best, 1)[0]
      v.push(p)
      carga += p.kg
      cur = p
    }
    const ord = dosOpt(base, v)
    viatges.push({ parades: ord, km: Math.round(longitud(base, ord) * 100) / 100, kg: Math.round(carga * 10) / 10 })
  }
  const km = viatges.reduce((s, v) => s + v.km, 0)
  const parades = viatges.reduce((s, v) => s + v.parades.length, 0)
  return { viatges, parades, kmTotal: Math.round(km * 100) / 100, kgTotal: Math.round(viatges.reduce((s, v) => s + v.kg, 0) * 10) / 10, minuts: Math.round((km / VEL_KMH) * 60 + parades * MIN_PARADA) }
}
