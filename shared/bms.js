// BMS (control de instalaciones) simulado del edificio BCN01, al estilo de Niagara 4: cada punto tiene una
// ruta ORD, un tipo, si es de lectura o de escritura, y está asociado a un elemento del modelo IFC por su código
// (y de ahí a su GlobalId). Los valores salen de lecturaSensor() más una dinámica sencilla: si el fancoil está
// en marcha, la sala va hacia su consigna; la climatizadora (UTA) renueva aire y baja el CO₂.
// Con un Niagara real se cambiaría la fuente por su API (oBIX / REST) manteniendo estas mismas rutas.
import { lecturaSensor } from './cde.js'

const ESTACION = 'station:|slot:/Drivers/BacnetNetwork/BCN01'

// zonas = espacios del modelo de arquitectura (IfcSpace), cada una con su fancoil y, si hay, su sensor
export const ZONAS = [
  { espacio: 'EP-001', nombre: 'Vestíbulo y préstamo', planta: 0, fcu: 'FCU-PB-01', sensor: 'SE-001', sid: 'bib-santantoni-pb-vestibulo', aforo: 40 },
  { espacio: 'EP-002', nombre: 'Sala infantil', planta: 0, fcu: 'FCU-PB-02', sensor: 'SE-002', sid: 'bib-santantoni-pb-infantil', aforo: 30 },
  { espacio: 'EP-003', nombre: 'Aseos y almacén', planta: 0, fcu: 'FCU-PB-03', sensor: null, sid: 'bib-santantoni-pb-aseos', aforo: 6 },
  { espacio: 'EP-011', nombre: 'Sala de lectura', planta: 1, fcu: 'FCU-P1-01', sensor: 'SE-003', sid: 'bib-santantoni-p1-lectura', aforo: 60 },
  { espacio: 'EP-012', nombre: 'Sala polivalente', planta: 1, fcu: 'FCU-P1-02', sensor: 'SE-004', sid: 'bib-santantoni-p1-polivalente', aforo: 40 },
]
export const PLANTAS = ['Planta baja', 'Planta primera']

// equipos del modelo de instalaciones, agrupados como en el árbol del BMS
export const EQUIPOS = [
  { codigo: 'CL-001', nombre: 'Climatizadora UTA-1', sistema: 'Climatización', carpeta: 'UTA_1' },
  { codigo: 'BO-001', nombre: 'Grupo de presión agua fría', sistema: 'Fontanería', carpeta: 'GP_AF' },
  { codigo: 'BO-002', nombre: 'Bomba circulación ACS', sistema: 'Fontanería', carpeta: 'BC_ACS' },
  { codigo: 'CE-001', nombre: 'Cuadro general BT', sistema: 'Electricidad', carpeta: 'CGBT' },
]

// definición de puntos: [nombre, tipo, unidad, escritura, grupo]
const P_ZONA = [
  ['TEM_AMB', 'numeric', '°C', false, 'Ambiente'], ['HUM_AMB', 'numeric', '%', false, 'Ambiente'], ['CO2_AMB', 'numeric', 'ppm', false, 'Ambiente'],
  ['SP_AMB', 'numeric', '°C', true, 'Consignas'], ['PM_FCU', 'boolean', '', true, 'Mando'],
  ['VAL_FRIO', 'enum', '', false, 'Estado'], ['VAL_CAL', 'enum', '', false, 'Estado'],
]
const P_EQUIPO = {
  'CL-001': [
    ['SP_TEM_IMP', 'numeric', '°C', true, 'Consignas'], ['SP_PRE_IMP', 'numeric', 'Pa', true, 'Consignas'], ['PM_UTA', 'boolean', '', true, 'Consignas'],
    ['TEM_IMP', 'numeric', '°C', false, 'Impulsión'], ['HUM_IMP', 'numeric', '%', false, 'Impulsión'], ['PRE_IMP', 'numeric', 'Pa', false, 'Impulsión'], ['COM_ASP', 'enum', '', false, 'Impulsión'],
    ['TEM_RET', 'numeric', '°C', false, 'Retorno'], ['HUM_RET', 'numeric', '%', false, 'Retorno'], ['REG_FRI', 'numeric', '%', false, 'Retorno'], ['REG_CAL', 'numeric', '%', false, 'Retorno'],
    ['ALA_FILTRO', 'alarm', '', false, 'Alarmas'], ['ALA_IMP', 'alarm', '', false, 'Alarmas'], ['ALA_RET', 'alarm', '', false, 'Alarmas'],
  ],
  'BO-001': [['PM_BOM', 'boolean', '', true, 'Mando'], ['PRE_SAL', 'numeric', 'bar', false, 'Medidas'], ['SP_PRE', 'numeric', 'bar', true, 'Consignas'], ['ALA_BOM', 'alarm', '', false, 'Alarmas']],
  'BO-002': [['PM_BOM', 'boolean', '', true, 'Mando'], ['TEM_ACS', 'numeric', '°C', false, 'Medidas'], ['SP_ACS', 'numeric', '°C', true, 'Consignas'], ['ALA_BOM', 'alarm', '', false, 'Alarmas']],
  'CE-001': [['POT_ACT', 'numeric', 'kW', false, 'Medidas'], ['ENE_HOY', 'numeric', 'kWh', false, 'Medidas'], ['ALA_DIF', 'alarm', '', false, 'Alarmas']],
}
const LIMITES = { SP_AMB: [17, 28], SP_TEM_IMP: [14, 30], SP_PRE_IMP: [200, 900], SP_PRE: [2, 6], SP_ACS: [45, 65] }
const INICIAL = { SP_AMB: 22.5, PM_FCU: true, SP_TEM_IMP: 21, SP_PRE_IMP: 600, PM_UTA: true, PM_BOM: true, SP_PRE: 4, SP_ACS: 55 }

export function puntos() {
  const out = []
  for (const z of ZONAS) for (const [n, tipo, ud, rw, grupo] of P_ZONA) {
    out.push({ ord: `${ESTACION}/Plantas/P${z.planta}/${z.fcu.replace(/-/g, '_')}/${n}`, nombre: n, tipo, ud, rw, grupo, equipo: z.fcu, elemento: z.espacio })
  }
  for (const e of EQUIPOS) for (const [n, tipo, ud, rw, grupo] of P_EQUIPO[e.codigo]) {
    out.push({ ord: `${ESTACION}/${e.sistema}/${e.carpeta}/${n}`, nombre: n, tipo, ud, rw, grupo, equipo: e.codigo, elemento: e.codigo })
  }
  return out
}
export const PUNTOS = puntos()
export const PUNTO = new Map(PUNTOS.map((p) => [p.ord, p]))

// estado: valores de "fallback" (Set) y anulaciones (Override) por ORD, más la temperatura de cada zona
export function estadoInicial(t = Date.now()) {
  const fallback = {}
  for (const p of PUNTOS) if (p.rw) fallback[p.ord] = INICIAL[p.nombre]
  const temp = Object.fromEntries(ZONAS.map((z) => [z.fcu, lecturaSensor(z.sid, t).temp]))
  // energía consumida desde medianoche, estimada con la potencia media del edificio (≈ 11 kW)
  const d = new Date(t), horas = d.getHours() + d.getMinutes() / 60
  return { t, fallback, override: {}, temp, energia: Math.round(horas * 11 * 10) / 10 }
}

export const efectivo = (est, ord) => (ord in est.override ? est.override[ord].valor : est.fallback[ord])
const ordDe = (equipo, nombre) => PUNTOS.find((p) => p.equipo === equipo && p.nombre === nombre)?.ord

// un paso de simulación (dt en segundos): devuelve el nuevo estado y los valores de todos los puntos
export function paso(est, t = Date.now()) {
  const dt = Math.min(600, Math.max(0, (t - est.t) / 1000))
  const v = (eq, n) => efectivo(est, ordDe(eq, n))
  const uta = v('CL-001', 'PM_UTA')
  const temp = { ...est.temp }
  const valores = {}
  let ocupacion = 0, potencia = 3.2 // alumbrado y tomas
  for (const z of ZONAS) {
    const s = lecturaSensor(z.sid, t)
    const sp = v(z.fcu, 'SP_AMB'), on = v(z.fcu, 'PM_FCU')
    const libre = s.temp + 1.2 // sin climatizar, la sala se calienta con la ocupación
    const objetivo = on ? sp + (uta ? 0 : 0.8) : libre
    const k = 1 - Math.exp(-dt / (on ? 240 : 900))
    temp[z.fcu] = temp[z.fcu] + (objetivo - temp[z.fcu]) * k
    const T = Math.round(temp[z.fcu] * 10) / 10
    const co2 = Math.round(uta ? s.co2 : s.co2 * 1.35 + 80)
    const ocup = Math.round(Math.max(0, (s.co2 - 420) / 900) * z.aforo)
    ocupacion += ocup
    const frio = on && T > sp + 0.3, cal = on && T < sp - 0.3
    if (on) potencia += 0.35 + (frio || cal ? 0.9 : 0)
    const base = `${ESTACION}/Plantas/P${z.planta}/${z.fcu.replace(/-/g, '_')}/`
    Object.assign(valores, { [base + 'TEM_AMB']: T, [base + 'HUM_AMB']: s.hum, [base + 'CO2_AMB']: co2, [base + 'SP_AMB']: sp, [base + 'PM_FCU']: on, [base + 'VAL_FRIO']: frio ? 'Open' : 'Close', [base + 'VAL_CAL']: cal ? 'Open' : 'Close' })
    valores[`zona:${z.fcu}`] = { T, hum: s.hum, co2, ocup, sp, on, frio, cal }
  }
  // climatizadora
  const spImp = v('CL-001', 'SP_TEM_IMP'), spPre = v('CL-001', 'SP_PRE_IMP')
  const tRet = Math.round((ZONAS.reduce((a, z) => a + temp[z.fcu], 0) / ZONAS.length) * 10) / 10
  const ruido = Math.sin(t / 53000) * 0.2
  const tImp = uta ? Math.round((spImp + ruido) * 10) / 10 : tRet
  const preImp = uta ? Math.round(spPre + Math.sin(t / 37000) * 12) : 0
  if (uta) potencia += 7.5
  const u = (n, x) => (valores[ordDe('CL-001', n)] = x)
  u('SP_TEM_IMP', spImp); u('SP_PRE_IMP', spPre); u('PM_UTA', uta)
  u('TEM_IMP', tImp); u('HUM_IMP', uta ? 45 : 0); u('PRE_IMP', preImp); u('COM_ASP', uta ? 'Open' : 'Close')
  u('TEM_RET', tRet); u('HUM_RET', Math.round(ZONAS.reduce((a, z) => a + valores[`zona:${z.fcu}`].hum, 0) / ZONAS.length))
  u('REG_FRI', uta && tRet > spImp ? Math.min(100, Math.round((tRet - spImp) * 25)) : 0)
  u('REG_CAL', uta && tRet < spImp ? Math.min(100, Math.round((spImp - tRet) * 25)) : 0)
  u('ALA_FILTRO', preImp > 850 ? 'Alarma' : 'Normal'); u('ALA_IMP', uta && Math.abs(tImp - spImp) > 2 ? 'Alarma' : 'Normal'); u('ALA_RET', tRet > 26 ? 'Alarma' : 'Normal')
  // bombas y cuadro
  for (const [eq, sp, med, unidad] of [['BO-001', 'SP_PRE', 'PRE_SAL', 0], ['BO-002', 'SP_ACS', 'TEM_ACS', 1]]) {
    const on = v(eq, 'PM_BOM'), c = v(eq, sp)
    valores[ordDe(eq, 'PM_BOM')] = on; valores[ordDe(eq, sp)] = c
    valores[ordDe(eq, med)] = on ? Math.round((c + Math.sin(t / 41000 + unidad) * (unidad ? 0.8 : 0.1)) * 10) / 10 : unidad ? 38 : 0.8
    valores[ordDe(eq, 'ALA_BOM')] = on ? 'Normal' : 'Alarma'
    if (on) potencia += unidad ? 0.4 : 3
  }
  const energia = est.energia + (potencia * dt) / 3600
  valores[ordDe('CE-001', 'POT_ACT')] = Math.round(potencia * 10) / 10
  valores[ordDe('CE-001', 'ENE_HOY')] = Math.round(energia * 10) / 10
  valores[ordDe('CE-001', 'ALA_DIF')] = 'Normal'
  return { est: { ...est, t, temp, energia }, valores, ocupacion }
}

// alarmas activas a partir de los valores
export function alarmas(valores) {
  const out = []
  for (const z of ZONAS) {
    const s = valores[`zona:${z.fcu}`]
    if (!s) continue
    if (s.co2 > 1000) out.push({ elemento: z.espacio, equipo: z.fcu, texto: `${z.nombre}: CO₂ alto (${s.co2} ppm)` })
    if (s.T > 26) out.push({ elemento: z.espacio, equipo: z.fcu, texto: `${z.nombre}: temperatura alta (${String(s.T).replace('.', ',')} °C)` })
  }
  for (const p of PUNTOS) if (p.tipo === 'alarm' && valores[p.ord] === 'Alarma') out.push({ elemento: p.elemento, equipo: p.equipo, texto: `${p.equipo}: ${p.nombre}` })
  return out
}

// buscar puntos como en el comando masivo de Niagara: por nombre y por carpeta
export function buscar(nombre = '', carpeta = '') {
  const n = nombre.trim().toUpperCase(), c = carpeta.trim().toLowerCase()
  return PUNTOS.filter((p) => (!n || p.nombre.toUpperCase().includes(n)) && (!c || p.ord.toLowerCase().includes(c)))
}

// mandar un valor a uno o varios puntos. modo: 'set' (fallback), 'override' (anulación), 'auto' (quitar anulación)
export function mandar(est, ords, { modo = 'set', valor } = {}) {
  const fallback = { ...est.fallback }, override = { ...est.override }
  const resultados = ords.map((ord) => {
    const p = PUNTO.get(ord)
    if (!p) return { ord, ok: false, msg: 'No existe' }
    if (!p.rw) return { ord, ok: false, msg: 'Bloqueado: punto de solo lectura' }
    if (modo === 'auto') {
      if (!(ord in override)) return { ord, ok: true, msg: 'Sin anulación' }
      delete override[ord]
      return { ord, ok: true, msg: 'Anulación retirada' }
    }
    let x = valor
    if (p.tipo === 'boolean') x = x === true || x === 'true' || x === 1
    else if (p.tipo === 'numeric') {
      x = Number(x)
      const lim = LIMITES[p.nombre]
      if (!Number.isFinite(x)) return { ord, ok: false, msg: 'Valor no numérico' }
      if (lim && (x < lim[0] || x > lim[1])) return { ord, ok: false, msg: `Fuera de rango (${lim[0]}–${lim[1]} ${p.ud})` }
    }
    if (modo === 'override') { override[ord] = { valor: x, prioridad: 8 }; return { ord, ok: true, msg: 'Override aplicado (prioridad 8)' } }
    if (fallback[ord] === x && !(ord in override)) return { ord, ok: true, msg: 'Fallback ya configurado' }
    fallback[ord] = x
    return { ord, ok: true, msg: 'Fallback aplicado' }
  })
  return { est: { ...est, fallback, override }, resultados }
}
