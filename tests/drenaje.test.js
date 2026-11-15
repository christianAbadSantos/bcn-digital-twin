// Modelo de drenaje: lluvia → escorrentía → red → depósitos → desbordamiento
import { describe, expect, it } from 'vitest'
import { cabal, cadena, coefEscorrentia, simula } from '../shared/drenaje.js'

const D = [
  { codi: '01', nom: 'Centro', km2: 4, verd: 0.1 },
  { codi: '02', nom: 'Montaña', km2: 10, verd: 0.6 },
]

describe('método racional', () => {
  it('más verde, menos escorrentía', () => {
    expect(coefEscorrentia(0.6)).toBeLessThan(coefEscorrentia(0.1))
  })
  it('Q = C · i · A / 3,6', () => {
    expect(cabal(0.9, 36, 1)).toBeCloseTo(9, 6)
  })
})

describe('simulación', () => {
  it('con poca lluvia no se llena nada', () => {
    const r = simula(D, { mmh: 10 })
    expect(r.total.vExces).toBe(0)
    expect(r.total.vDesborda).toBe(0)
    expect(r.districtes.every((d) => d.estat === 'ok')).toBe(true)
  })
  it('por encima de la lluvia de diseño, la red va al límite y el exceso va a los depósitos', () => {
    const r = simula(D, { mmh: 75, mmhDisseny: 50, diposits: 1e9 })
    expect(r.total.us).toBeCloseTo(1.5, 6)
    expect(r.total.vExces).toBeGreaterThan(0)
    expect(r.total.vDiposits).toBe(r.total.vExces)
    expect(r.total.vDesborda).toBe(0)
    expect(r.districtes.every((d) => d.estat === 'ple')).toBe(true)
  })
  it('si los depósitos se llenan, sale agua a la calle', () => {
    const r = simula(D, { mmh: 120, minuts: 60, diposits: 1000 })
    expect(r.total.vDesborda).toBeCloseTo(r.total.vExces - 1000, 3)
    expect(r.districtes.some((d) => d.estat === 'inunda')).toBe(true)
    // el agua en la calle se reparte entre los distritos con exceso
    expect(r.districtes.reduce((s, d) => s + d.vDesborda, 0)).toBeCloseTo(r.total.vDesborda, 3)
  })
  it('más suelo permeable reduce el exceso con la misma red', () => {
    const base = simula(D, { mmh: 90 })
    const suds = simula(D, { mmh: 90, verdExtra: 0.2 })
    expect(suds.total.vExces).toBeLessThan(base.total.vExces)
    expect(suds.total.infiltrat).toBeGreaterThan(base.total.infiltrat)
  })
  it('el escenario climático multiplica la intensidad', () => {
    expect(simula(D, { mmh: 50, clima: 1.2 }).mmh).toBeCloseTo(60, 6)
  })
  it('el agua caída es la suma de lo que escurre y lo que se infiltra', () => {
    const r = simula(D, { mmh: 40, minuts: 30 })
    expect(r.total.vEscorrentia + r.total.infiltrat).toBeCloseTo(r.total.vPluja, 3)
  })
})

describe('el agua baja de la montaña al mar', () => {
  const BCN = [
    { codi: '06', nom: 'Gràcia', km2: 4, verd: 0.15 },
    { codi: '02', nom: 'Eixample', km2: 7, verd: 0.06 },
  ]
  it('el exceso de un distrito de arriba sube el uso de la red del de abajo', () => {
    const r = simula(BCN, { mmh: 80, mmhDisseny: 50 })
    const [g, e] = ['06', '02'].map((k) => r.districtes.find((d) => d.codi === k))
    expect(e.qIn).toBeCloseTo(g.exces * 0.5, 6)
    expect(e.us).toBeGreaterThan(g.us)
  })
  it('el agua que baja no se cuenta dos veces', () => {
    const r = simula(BCN, { mmh: 80, mmhDisseny: 50, diposits: 1e9 })
    const local = r.districtes.reduce((s, d) => s + d.exces - d.qBaixa, 0) * 30 * 60
    expect(r.total.vExces).toBeCloseTo(local, 3)
  })
})

describe('cadena causa → efecto', () => {
  it('todas las flechas unen nodos que existen', () => {
    const c = cadena(simula(D, { mmh: 80 }))
    const ids = new Set(c.nodes.map((n) => n.id))
    for (const [a, b] of c.arestes) {
      expect(ids.has(a)).toBe(true)
      expect(ids.has(b)).toBe(true)
    }
  })
})
