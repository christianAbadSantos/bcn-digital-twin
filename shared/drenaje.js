// Agua y lluvia: modelo didáctico de drenaje urbano de Barcelona (lluvia → escorrentía → alcantarillado →
// depósitos anti-inundación → desbordamiento). Lógica pura, sin interfaz, para poder probarla.
//
// Qué es real y qué es hipótesis:
//   - Real: superficie de cada distrito y su parte de suelo permeable (parques, Collserola), calculada con la
//     calificación urbanística del Mapa Urbanístic de Catalunya (scripts/build-drenaje.mjs).
//   - Real (prensa): la ciudad tiene unos 15 depósitos de pluviales con más de 500.000 m³ en total, y los volúmenes
//     de los tres que se dibujan en el mapa. Su posición es aproximada.
//   - Hipótesis: coeficientes de escorrentía, lluvia que aguanta la red y el factor de cambio climático. Se pueden
//     mover con los controles, y la interfaz lo dice.

// Método racional: Q (m³/s) = C · i (mm/h) · A (km²) / 3,6
export const C_URBA = 0.9 // tejados y asfalto
export const C_VERD = 0.2 // parques y bosque
export const coefEscorrentia = (verd) => C_VERD * verd + C_URBA * (1 - verd)
export const cabal = (c, mmh, km2) => (c * mmh * km2) / 3.6

export const CAPACITAT_DEPOSITS_CIUTAT = 500000 // m³ (más de 500.000 m³ en unos 15 depósitos)
export const DEPOSITS = [
  { nom: 'Zona Universitària', m3: 105500, lon: 2.1135, lat: 41.3846 },
  { nom: 'Parc de Joan Miró', m3: 55000, lon: 2.149, lat: 41.3776 },
  { nom: 'Escola Industrial', m3: 27000, lon: 2.1437, lat: 41.3866 },
]

export const PALANQUES_PER_DEFECTE = {
  mmh: 40, // intensidad de la lluvia
  minuts: 30, // duración del episodio
  verdExtra: 0, // puntos de suelo urbanizado que se vuelven permeables (SUDS: parterres, pavimento drenante…)
  mmhDisseny: 50, // lluvia que aguanta la red de alcantarillado (hipótesis)
  clima: 1, // multiplicador de la intensidad (escenario climático, hipótesis)
  diposits: CAPACITAT_DEPOSITS_CIUTAT, // m³
}

export const ESCENARIS = {
  avui: { nom: 'Hoy', p: {} },
  suds: { nom: 'Con más verde (SUDS)', p: { verdExtra: 0.1 } },
  clima: { nom: 'Clima 2050 (hipótesis)', p: { clima: 1.2 } },
  diposits: { nom: 'Más depósitos', p: { diposits: CAPACITAT_DEPOSITS_CIUTAT * 1.5 } },
}

// Pendiente de Barcelona: de Collserola al mar. Parte del agua que la red de un distrito de arriba no puede
// tragar baja por la calle al distrito de abajo (reparto aproximado según la geografía; hipótesis).
export const BAIXA = 0.5 // fracción del exceso que baja por la superficie
export const AVALL = {
  '05': [['04', 0.5], ['02', 0.5]], // Sarrià-Sant Gervasi → Les Corts, Eixample
  '07': [['06', 0.4], ['10', 0.6]], // Horta-Guinardó → Gràcia, Sant Martí
  '08': [['09', 1]], // Nou Barris → Sant Andreu
  '06': [['02', 1]], // Gràcia → Eixample
  '09': [['10', 1]], // Sant Andreu → Sant Martí
  '04': [['03', 0.5], ['02', 0.5]], // Les Corts → Sants-Montjuïc, Eixample
  '02': [['01', 0.5], ['10', 0.5]], // Eixample → Ciutat Vella, Sant Martí
}
const ORDRE = ['05', '07', '08', '06', '09', '04', '02', '01', '03', '10']

const estat = (us, desborda) => (us < 0.8 ? 'ok' : us < 1 ? 'alt' : desborda ? 'inunda' : 'ple')

// districtes: [{ codi, nom, km2, verd }]  →  resultados por distrito y totales de la ciudad
export function simula(districtes, palanques = {}) {
  const p = { ...PALANQUES_PER_DEFECTE, ...palanques }
  const mmh = p.mmh * p.clima
  const seg = p.minuts * 60
  const ds = districtes.map((d) => {
    const verd = Math.min(1, d.verd + p.verdExtra * (1 - d.verd))
    const c = coefEscorrentia(verd)
    const q = cabal(c, mmh, d.km2) // m³/s en el pico
    const cap = cabal(coefEscorrentia(d.verd), p.mmhDisseny, d.km2) // la red se diseñó con el suelo de hoy
    return { ...d, verdEf: verd, c, q, cap, qIn: 0 }
  })
  // de arriba abajo: cada distrito recibe parte del exceso de los de arriba
  const per = Object.fromEntries(ds.map((d) => [d.codi, d]))
  const ordre = [...ds].sort((a, b) => (ORDRE.indexOf(a.codi) + 1 || 99) - (ORDRE.indexOf(b.codi) + 1 || 99))
  for (const d of ordre) {
    const exces = Math.max(0, d.q + d.qIn - d.cap)
    const avall = (AVALL[d.codi] || []).filter(([k]) => per[k])
    const baixa = avall.length ? exces * BAIXA : 0
    for (const [k, f] of avall) per[k].qIn += baixa * f
    Object.assign(d, { us: d.cap > 0 ? (d.q + d.qIn) / d.cap : 0, exces, qBaixa: baixa, vExces: (exces - baixa) * seg })
  }
  const km2 = ds.reduce((s, d) => s + d.km2, 0)
  const vPluja = (mmh / 1000) * (p.minuts / 60) * km2 * 1e6 // m³ caídos
  const vEscorrentia = ds.reduce((s, d) => s + d.q * seg, 0)
  const vExces = ds.reduce((s, d) => s + d.vExces, 0)
  const vDiposits = Math.min(vExces, p.diposits)
  const vDesborda = Math.max(0, vExces - p.diposits)
  const ompliment = p.diposits > 0 ? vExces / p.diposits : 0
  // si los depósitos se llenan, el agua que sobra sale a la calle en los distritos con exceso, en proporción
  for (const d of ds) {
    d.vDesborda = vExces > 0 ? (vDesborda * d.vExces) / vExces : 0
    d.estat = estat(d.us, d.vDesborda > 1)
  }
  const qTotal = ds.reduce((s, d) => s + d.q, 0)
  const capTotal = ds.reduce((s, d) => s + d.cap, 0)
  return {
    p, mmh, districtes: ds,
    total: { km2, vPluja, vEscorrentia, qTotal, capTotal, us: capTotal ? qTotal / capTotal : 0, vExces, vDiposits, vDesborda, ompliment, infiltrat: Math.max(0, vPluja - vEscorrentia) },
    districtesEnRisc: ds.filter((d) => d.estat === 'ple' || d.estat === 'inunda').length,
  }
}

// Cadena causa → efecto: cada nodo con su valor y su estado (para el diagrama)
export function cadena(r) {
  const t = r.total
  const pct = (x) => `${Math.round(x * 100)} %`
  const n = (x) => Math.round(x).toLocaleString('es-ES')
  const sev = (x, a, b) => (x >= b ? 'bad' : x >= a ? 'warn' : 'ok')
  return {
    nodes: [
      { id: 'pluja', col: 0, fila: 0, nom: 'Lluvia', val: `${Math.round(r.mmh)} mm/h`, palanca: true, sev: sev(r.mmh, 30, 60) },
      { id: 'durada', col: 0, fila: 1, nom: 'Duración', val: `${r.p.minuts} min`, palanca: true },
      { id: 'verd', col: 0, fila: 2, nom: 'Suelo permeable', val: `+${Math.round(r.p.verdExtra * 100)} pp`, palanca: true },
      { id: 'clima', col: 0, fila: 3, nom: 'Clima', val: r.p.clima === 1 ? 'actual' : `×${r.p.clima}`, palanca: true },
      { id: 'escorrentia', col: 1, fila: 0, nom: 'Escorrentía', val: `${n(t.qTotal)} m³/s`, sev: sev(t.us, 0.8, 1) },
      { id: 'xarxa', col: 1, fila: 1, nom: 'Red alcantarillado', val: pct(t.us), sev: sev(t.us, 0.8, 1) },
      { id: 'disseny', col: 1, fila: 2, nom: 'Red aguanta', val: `${r.p.mmhDisseny} mm/h`, palanca: true },
      { id: 'diposits', col: 2, fila: 0, nom: 'Depósitos', val: pct(t.ompliment), sev: sev(t.ompliment, 0.7, 1) },
      { id: 'capacitat', col: 2, fila: 1, nom: 'Capacidad dep.', val: `${n(r.p.diposits / 1000)} mil m³`, palanca: true },
      { id: 'districtes', col: 2, fila: 2, nom: 'Distritos al límite', val: `${r.districtesEnRisc} de ${r.districtes.length}`, sev: r.districtesEnRisc ? 'warn' : 'ok' },
      { id: 'carrer', col: 3, fila: 0, nom: 'Agua en la calle', val: `${n(t.vDesborda)} m³`, sev: t.vDesborda > 0 ? 'bad' : 'ok' },
      { id: 'infiltra', col: 3, fila: 1, nom: 'Se infiltra', val: `${n(t.infiltrat)} m³`, sev: 'ok' },
    ],
    arestes: [
      ['pluja', 'escorrentia'], ['durada', 'diposits'], ['verd', 'escorrentia'], ['verd', 'infiltra'], ['clima', 'pluja'],
      ['escorrentia', 'xarxa'], ['disseny', 'xarxa'], ['xarxa', 'diposits'], ['xarxa', 'districtes'],
      ['capacitat', 'diposits'], ['diposits', 'carrer'], ['districtes', 'carrer'],
    ],
  }
}
