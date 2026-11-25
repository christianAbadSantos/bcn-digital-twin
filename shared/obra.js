// Obra 4D/5D: plan de obra, valor ganado y sensores de obra a partir del modelo IFC (spec: docs/specs/obra-4d5d.md).
// El plan sale de las propiedades PdE de cada elemento: fase (03_01), planta (01_02), unidad de obra (03_04_01)
// y cantidades (02). Precios, retrasos, lluvia y sensores son DE EJEMPLO (simulados y deterministas).

const DIA = 864e5
const fecha = (s) => new Date(s + 'T07:00:00Z').getTime() // las 8:00 en Barcelona
export const INICIO = fecha('2026-09-07')
export const HOY = new Date('2026-11-25T11:00:00Z').getTime() // fecha de corte del ejemplo

// tareas = fase × planta. retraso: días que se alarga en la realidad; sobrecoste: coste real / previsto
export const TAREAS = [
  { id: 'F2-P00', fase: 'F2 Estructura', planta: '00', nom: 'Estructura · planta baja', ini: '2026-09-07', dias: 26, retraso: 0, sobrecoste: 1.0 },
  { id: 'F2-P01', fase: 'F2 Estructura', planta: '01', nom: 'Estructura · planta primera', ini: '2026-10-05', dias: 25, retraso: 0, sobrecoste: 1.02 },
  { id: 'F3-P00', fase: 'F3 Cerramientos', planta: '00', nom: 'Cerramientos · planta baja', ini: '2026-10-19', dias: 32, retraso: 9, sobrecoste: 1.08, causa: 'lluvia' },
  { id: 'F3-P01', fase: 'F3 Cerramientos', planta: '01', nom: 'Cerramientos y cubierta · planta primera', ini: '2026-11-09', dias: 40, retraso: 12, sobrecoste: 1.08, causa: 'lluvia' },
  { id: 'F4-P00', fase: 'F4 Instalaciones', planta: '00', nom: 'Instalaciones · planta baja', ini: '2026-11-23', dias: 30, retraso: 3, sobrecoste: 1.03 },
  { id: 'F4-P01', fase: 'F4 Instalaciones', planta: '01', nom: 'Instalaciones · planta primera y cubierta', ini: '2026-12-14', dias: 47, retraso: 5, sobrecoste: 1.03 },
]

// precios unitarios de ejemplo (€ por unidad de medición) por unidad de obra
export const PRECIOS = { 'UO-PI': 900, 'UO-FJ': 110, 'UO-MU': 165, 'UO-VE': 780, 'UO-PU': 1450, 'UO-CU': 125, 'UO-CL': 42000, 'UO-BO': 5200, 'UO-CE': 11000, 'UO-SE': 380, 'UO-CD': 95, 'UO-TU': 45 }
// dentro de cada tarea se construye en este orden (el forjado al final: es el hormigonado; la UTA, lo último)
const ORDEN = ['IFCCOLUMN', 'IFCSLAB', 'IFCWALL', 'IFCWINDOW', 'IFCDOOR', 'IFCROOF', 'IFCPIPESEGMENT', 'IFCDUCTSEGMENT', 'IFCSENSOR', 'IFCELECTRICDISTRIBUTIONBOARD', 'IFCPUMP', 'IFCUNITARYEQUIPMENT']

const cantidad = (q, ud) => (ud === 'm2' ? q['02_04_PdE_Area'] : ud === 'm3' ? q['02_05_PdE_Volumen'] : ud === 'm' ? q['02_02_PdE_Longitud'] : 1)

// plan de obra a partir de los elementos del modelo
export function planificar(elementos) {
  const out = []
  for (const t of TAREAS) {
    const ini = fecha(t.ini), dur = t.dias * DIA
    const els = elementos
      .filter((e) => e.clase !== 'IFCSPACE')
      .filter((e) => e.psets?.['03_PdE_Proyecto']?.['03_01_PdE_Fase Obra'] === t.fase && e.psets?.['01_PdE_Identificación']?.['01_02_PdE_Localizador'] === `BCN01-P${t.planta}`)
      .sort((a, b) => ORDEN.indexOf(a.clase) - ORDEN.indexOf(b.clase) || String(a.nombre).localeCompare(b.nombre))
    els.forEach((e, i) => {
      const q = e.psets['02_PdE_Cantidades'] || {}, ud = q['02_01_PdE_Unidad'] || 'ud'
      const uo = e.psets['03_PdE_Proyecto']['03_04_01_PdE_Ud Medición 01']
      const med = Number(cantidad(q, ud)) || 0
      const n = els.length, durR = dur + t.retraso * DIA
      out.push({
        guid: e.guid, codigo: e.nombre, clase: e.clase, tarea: t.id, uo, ud, medicion: med, coste: Math.round(med * (PRECIOS[uo] || 0)),
        inicio: ini + (i / n) * dur, fin: ini + ((i + 1) / n) * dur,
        inicioR: ini + (i / n) * durR, finR: ini + ((i + 1) / n) * durR, sobrecoste: t.sobrecoste,
      })
    })
  }
  return { elementos: out, inicio: INICIO, fin: Math.max(...out.map((e) => e.fin)), finR: Math.max(...out.map((e) => e.finR)), bac: out.reduce((s, e) => s + e.coste, 0) }
}

const frac = (t, a, b) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a))

// estado de cada elemento en una fecha, según el plan o según la realidad
export function estadoEn(plan, t, modo = 'plan') {
  const out = {}
  for (const e of plan.elementos) {
    const f = modo === 'real' ? frac(t, e.inicioR, e.finR) : frac(t, e.inicio, e.fin)
    out[e.guid] = { codigo: e.codigo, tarea: e.tarea, pct: Math.round(f * 100), estado: f >= 1 ? 'hecho' : f > 0 ? 'en curso' : 'pendiente' }
  }
  return out
}

// valor ganado: PV (plan), EV (lo hecho valorado a precio de presupuesto) y AC (coste real) hasta la fecha de corte
function valores(plan, t) {
  let pv = 0, ev = 0, ac = 0
  const tc = Math.min(t, HOY)
  for (const e of plan.elementos) {
    pv += e.coste * frac(t, e.inicio, e.fin)
    const r = e.coste * frac(tc, e.inicioR, e.finR)
    ev += r
    ac += r * e.sobrecoste
  }
  return { pv, ev, ac }
}
export function valorGanado(plan, t) {
  const { pv, ev, ac } = valores(plan, t)
  const pvCorte = valores(plan, Math.min(t, HOY)).pv
  const spi = pvCorte ? ev / pvCorte : 1, cpi = ac ? ev / ac : 1
  const serie = []
  for (let x = plan.inicio; x <= Math.max(plan.fin, plan.finR) + 7 * DIA; x += 7 * DIA) {
    const v = valores(plan, x)
    serie.push({ t: x, pv: v.pv, ev: x <= HOY ? v.ev : null, ac: x <= HOY ? v.ac : null })
  }
  return { pv, ev, ac, spi, cpi, bac: plan.bac, eac: cpi ? plan.bac / cpi : plan.bac, serie, corte: HOY }
}

// lluvia diaria de ejemplo (mm), otoño de 2026
const LLUVIA = { '2026-09-21': 3.1, '2026-10-12': 4.0, '2026-10-30': 14.2, '2026-11-03': 6.5, '2026-11-12': 22.4, '2026-11-13': 9.8, '2026-11-24': 4.6, '2026-12-02': 7.2, '2027-01-15': 11.0 }
export const lluviaDia = (t) => LLUVIA[new Date(t).toISOString().slice(0, 10)] || 0
const tempAmbiente = (t) => { const doy = (t - Date.UTC(new Date(t).getUTCFullYear(), 0, 1)) / DIA; return 16.5 + 7 * Math.cos((2 * Math.PI * (doy - 205)) / 365) }
const fmt = (x) => String(Math.round(x * 10) / 10).replace('.', ',')

// sensores de obra en una fecha: curado del hormigón de cada forjado, vibración y lluvia, con alertas
export function sensoresObra(plan, t) {
  const amb = tempAmbiente(t)
  const curado = [], alertas = []
  for (const e of plan.elementos.filter((x) => x.clase === 'IFCSLAB')) {
    const h = (t - e.finR) / 36e5
    if (h < 0 || h > 28 * 24) continue
    // calor de hidratación: pico ≈ 24 h después del hormigonado, luego enfría hacia la temperatura ambiente
    const temp = amb + 22 * (h / 24) * Math.exp(1 - h / 24)
    curado.push({ codigo: e.codigo, horas: Math.round(h), temp: Math.round(temp * 10) / 10, dias: Math.floor(h / 24) })
    const mm = lluviaDia(e.finR)
    if (h < 7 * 24 && mm > 2) alertas.push(`Lluvia de ${fmt(mm)} mm el día del hormigonado de ${e.codigo}: revisar el curado y la superficie`)
    if (temp < 5) alertas.push(`${e.codigo}: riesgo de helada durante el curado (${fmt(temp)} °C)`)
  }
  // vibración (velocidad de pico de partícula) solo con estructura o cerramientos en curso y en horario de obra
  const est = estadoEn(plan, t, 'real')
  const activas = new Set(Object.values(est).filter((s) => s.estado === 'en curso').map((s) => s.tarea))
  const hora = (new Date(t).getUTCHours() + 1) % 24
  const ruidosa = [...activas].some((id) => id.startsWith('F2') || id.startsWith('F3'))
  let vibracion = 0
  if (ruidosa && hora >= 8 && hora < 18) {
    const k = Math.floor(t / DIA)
    vibracion = 1.2 + 1.6 * Math.abs(Math.sin(t / 5.3e6)) + (k % 9 === 0 ? 3.1 : 0)
    vibracion = Math.round(vibracion * 10) / 10
    if (vibracion > 5) alertas.push(`Vibración de ${fmt(vibracion)} mm/s, por encima del umbral orientativo de 5 mm/s para edificios vecinos (DIN 4150-3)`)
  }
  const lluvia = lluviaDia(t)
  if (lluvia > 10 && [...activas].some((id) => id.startsWith('F3'))) alertas.push(`Lluvia de ${fmt(lluvia)} mm: parar los trabajos de fachada y cubierta`)
  return { ambiente: Math.round(amb * 10) / 10, curado, vibracion, lluvia, activas: TAREAS.filter((x) => activas.has(x.id)), alertas }
}
