// Utilidades de la escena 3D (sin dependencias de three: se pueden probar con Node).
import { toLocal } from './geo.js'

export const S = 0.01 // 1 unidad de escena = 100 m
const EXAG = 1.5 // exageración vertical del relieve (los montes reales se ven muy planos a esta escala)
const sc = ([lon, lat]) => {
  const [e, n] = toLocal([lon, lat])
  return [e * S, -n * S]
}

// Relieve APROXIMADO: suma de colinas con la altura real de las cumbres conocidas.
// No es un modelo digital del terreno. [lon, lat, altura m, radio m]
const PEAKS = [
  [2.1186, 41.4225, 345, 1500], // Tibidabo (suma ≈ 512 m con la masa de Collserola)
  [2.1, 41.415, 230, 2300], // masa de Collserola (aproximada)
  [2.161, 41.419, 261, 550], // Turó de la Rovira
  [2.1527, 41.4145, 170, 650], // Park Güell
  [2.1655, 41.364, 173, 950], // Montjuïc
].map(([lon, lat, h, r]) => {
  const [x, z] = sc([lon, lat])
  return { x, z, h: h * S * EXAG, s: r * S }
})

export function terrainH(x, z) {
  let h = 0
  for (const p of PEAKS) {
    const d2 = (x - p.x) ** 2 + (z - p.z) ** 2
    h += p.h * Math.exp(-d2 / (2 * p.s * p.s))
  }
  return Math.max(0, h - 0.1) // recorta las colas para que la ciudad llana quede a cota 0
}

// ---- cielo según la hora del día y la lluvia
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
const toHex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b)
  return toHex(A.map((v, i) => v + (B[i] - v) * t))
}
const clamp01 = (v) => Math.max(0, Math.min(1, v))

export function skyState(timeStr, mm) {
  const hh = Number(timeStr.slice(11, 13)) + Number(timeStr.slice(14, 16) || 0) / 60
  const ang = ((hh - 6) / 12) * Math.PI // 0 = amanecer (este), π = atardecer (oeste)
  const elev = Math.sin(ang)
  const day = clamp01((elev + 0.05) / 0.4) // 0 de noche, 1 de día pleno
  const dusk = clamp01(1 - Math.abs(elev - 0.05) / 0.28) // máximo con el sol en el horizonte
  let top = mix('#04070f', '#4f95dc', day)
  let horizon = mix('#0b1220', '#bcd7ee', day)
  horizon = mix(horizon, '#f0a070', dusk * 0.75)
  top = mix(top, '#5a5f8c', dusk * 0.35)
  const wet = clamp01(mm / 2) * 0.65
  const grey = mix('#10141c', '#8a929c', day)
  top = mix(top, grey, wet)
  horizon = mix(horizon, mix('#161a22', '#a2a9b2', day), wet)

  const night = elev < -0.02
  const x = night ? -Math.cos(ang) : Math.cos(ang)
  const y = night ? Math.max(0.25, -elev * 0.8 + 0.25) : Math.max(0.08, elev)
  const z = 0.35
  const l = Math.hypot(x, y, z)
  return {
    top,
    horizon,
    sunDir: [x / l, y / l, z / l], // dirección hacia el sol (o la luna de noche)
    lightColor: night ? '#8fa8d8' : mix('#ffd9a8', '#fff4e0', clamp01(elev * 1.6)),
    lightIntensity: night ? 0.35 : (0.5 + 1.1 * clamp01(elev * 1.4)) * (1 - wet * 0.65),
    hemiSky: mix('#2a3350', '#bcd7ee', day),
    hemiGround: mix('#10131a', '#4a4a40', day),
    hemiIntensity: night ? 0.45 : 0.35 + 0.45 * day,
    night,
    wet,
  }
}
