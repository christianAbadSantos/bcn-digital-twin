import { describe, expect, it } from 'vitest'
import { INICIO, HOY, estadoEn, planificar, sensoresObra, valorGanado } from '../shared/obra.js'

// elementos como los da el visor: clase, nombre (código) y set de propiedades PdE
const el = (codigo, clase, fase, planta, ud, q) => ({
  guid: 'g-' + codigo, nombre: codigo, clase,
  psets: {
    '01_PdE_Identificación': { '01_02_PdE_Localizador': `BCN01-P${planta}` },
    '02_PdE_Cantidades': { '02_01_PdE_Unidad': ud, '02_02_PdE_Longitud': q, '02_04_PdE_Area': q, '02_05_PdE_Volumen': q },
    '03_PdE_Proyecto': { '03_01_PdE_Fase Obra': fase, '03_04_01_PdE_Ud Medición 01': `UO-${codigo.split('-')[0]}` },
  },
})
const ELS = [
  el('PI-001', 'IFCCOLUMN', 'F2 Estructura', '00', 'm3', 0.6),
  el('FJ-00', 'IFCSLAB', 'F2 Estructura', '00', 'm2', 396),
  el('FJ-01', 'IFCSLAB', 'F2 Estructura', '01', 'm2', 396),
  el('MU-001', 'IFCWALL', 'F3 Cerramientos', '00', 'm2', 98),
  el('MU-011', 'IFCWALL', 'F3 Cerramientos', '01', 'm2', 88),
  el('CU-001', 'IFCROOF', 'F3 Cerramientos', '01', 'm2', 396),
  el('BO-001', 'IFCPUMP', 'F4 Instalaciones', '00', 'ud', 1),
  el('CL-001', 'IFCUNITARYEQUIPMENT', 'F4 Instalaciones', '01', 'ud', 1),
  el('EP-001', 'IFCSPACE', 'F5 Acabados', '00', 'm2', 130),
]
const plan = planificar(ELS)
const d = (s) => new Date(s + 'T12:00:00Z').getTime()

describe('Obra 4D: plan derivado del modelo', () => {
  it('ordena las tareas por fase y planta y deja fuera los espacios', () => {
    const t = (c) => plan.elementos.find((e) => e.codigo === c)
    expect(t('FJ-00').fin).toBeLessThan(t('FJ-01').inicio)
    expect(t('MU-001').inicio).toBeGreaterThan(t('FJ-00').fin)
    expect(t('CL-001').fin).toBe(plan.fin)
    expect(plan.elementos.some((e) => e.codigo === 'EP-001')).toBe(false)
    expect(plan.inicio).toBe(INICIO)
  })
  it('calcula el coste de cada elemento con su medición', () => {
    expect(plan.elementos.find((e) => e.codigo === 'FJ-00').coste).toBeGreaterThan(10000)
    expect(plan.bac).toBe(plan.elementos.reduce((s, e) => s + e.coste, 0))
  })
})

describe('estado en una fecha', () => {
  it('antes del inicio no hay nada y al final está todo', () => {
    expect(Object.values(estadoEn(plan, INICIO - 864e5)).every((s) => s.estado === 'pendiente')).toBe(true)
    expect(Object.values(estadoEn(plan, plan.fin + 1)).every((s) => s.estado === 'hecho')).toBe(true)
  })
  it('el avance real de los cerramientos va por detrás del plan', () => {
    const mu = plan.elementos.find((e) => e.codigo === 'MU-001')
    const t = mu.fin
    expect(estadoEn(plan, t, 'plan')['g-MU-001'].estado).toBe('hecho')
    expect(estadoEn(plan, t, 'real')['g-MU-001'].estado).not.toBe('hecho')
  })
})

describe('Obra 5D: valor ganado', () => {
  it('al final el valor planificado es el presupuesto', () => {
    expect(valorGanado(plan, plan.fin + 1).pv).toBeCloseTo(plan.bac, 0)
  })
  it('hoy la obra va con retraso y con sobrecoste', () => {
    const v = valorGanado(plan, HOY)
    expect(v.spi).toBeLessThan(1)
    expect(v.cpi).toBeLessThan(1)
    expect(v.ac).toBeGreaterThan(v.ev)
    expect(v.serie.length).toBeGreaterThan(10)
    expect(v.serie.at(-1).ev).toBeNull() // el futuro no tiene valor ganado ni coste real
  })
})

describe('sensores de obra', () => {
  it('el pico de temperatura del forjado llega entre 12 y 48 h tras el hormigonado', () => {
    const fj = plan.elementos.find((e) => e.codigo === 'FJ-00')
    const temps = [6, 12, 24, 36, 48, 96].map((h) => [h, sensoresObra(plan, fj.fin + h * 36e5).curado.find((c) => c.codigo === 'FJ-00').temp])
    const pico = temps.reduce((a, b) => (b[1] > a[1] ? b : a))
    expect(pico[0]).toBeGreaterThanOrEqual(12)
    expect(pico[0]).toBeLessThanOrEqual(48)
  })
  it('avisa si llueve el día del hormigonado de FJ-01', () => {
    const fj = plan.elementos.find((e) => e.codigo === 'FJ-01')
    expect(sensoresObra(plan, fj.fin + 36e5).alertas.some((a) => /FJ-01/.test(a) && /lluvia/i.test(a))).toBe(true)
  })
  it('sin obra activa no hay vibración', () => {
    expect(sensoresObra(plan, INICIO - 864e5).vibracion).toBe(0)
  })
})
