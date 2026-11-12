// Modelo de llenado y planificador de rutas de recogida (misma lógica que la API .NET)
import { describe, expect, it } from 'vitest'
import { avanca, capacitat, distKm, hash, kg, planifica, probRecollida } from '../shared/residus.js'

const BASE = { lat: 41.344, lon: 2.136 }

describe('llenado de contenedores', () => {
  it('no cambia si no pasa el tiempo', () => {
    expect(avanca(40, 'Rebuig', 10, 0)).toBe(40)
  })
  it('sube con el tiempo y se queda en 100 %', () => {
    expect(avanca(40, 'Rebuig', 10, 2)).toBeGreaterThan(40)
    expect(avanca(99, 'Rebuig', 21, 10)).toBe(100)
  })
  it('el resto se llena más rápido que el vidrio', () => {
    expect(avanca(0, 'Rebuig', 10, 5)).toBeGreaterThan(avanca(0, 'Vidre', 10, 5))
  })
  it('por la noche se llena más despacio que a la hora de cenar', () => {
    expect(avanca(0, 'Rebuig', 3, 1)).toBeLessThan(avanca(0, 'Rebuig', 21, 1))
  })
})

describe('recogida ordinaria simulada', () => {
  it('no se recoge por debajo del 75 %', () => {
    expect(probRecollida(70, 5)).toBe(0)
  })
  it('un contenedor desbordado tiene más probabilidad de recogerse', () => {
    expect(probRecollida(100, 1)).toBeGreaterThan(probRecollida(80, 1))
  })
  it('la probabilidad está entre 0 y 1', () => {
    const p = probRecollida(90, 3)
    expect(p).toBeGreaterThan(0)
    expect(p).toBeLessThan(1)
  })
})

describe('utilidades', () => {
  it('peso y capacidad', () => {
    expect(kg('Vidre', 1000, 50)).toBe(150)
    expect(capacitat('Vidre', false)).toBe(2500)
    expect(capacitat('Rebuig', true)).toBe(3000)
  })
  it('el hash es estable y está entre 0 y 1', () => {
    expect(hash(42)).toBe(hash(42))
    for (const x of [0, 1, 7, 123456]) {
      expect(hash(x)).toBeGreaterThanOrEqual(0)
      expect(hash(x)).toBeLessThan(1)
    }
  })
  it('distancia por calle: Plaça Catalunya → Sagrada Família ≈ 3 km', () => {
    const d = distKm(41.387, 2.170, 41.4036, 2.1744)
    expect(d).toBeGreaterThan(2)
    expect(d).toBeLessThan(3.5)
  })
})

describe('planificador de rutas', () => {
  const punts = Array.from({ length: 12 }, (_, i) => ({ id: i, lat: 41.38 + (i % 4) * 0.004, lon: 2.15 + Math.floor(i / 4) * 0.005, kg: 1000 }))

  it('visita todas las paradas una sola vez', () => {
    const r = planifica(BASE, punts, 9000)
    const ids = r.viatges.flatMap((v) => v.parades.map((p) => p.id)).sort((a, b) => a - b)
    expect(ids).toEqual(punts.map((p) => p.id))
    expect(r.parades).toBe(12)
  })
  it('respeta la capacidad del camión con varios viajes', () => {
    const r = planifica(BASE, punts, 4000)
    expect(r.viatges.length).toBe(3)
    for (const v of r.viatges) expect(v.kg).toBeLessThanOrEqual(4000)
  })
  it('sin paradas no hay viajes', () => {
    const r = planifica(BASE, [], 9000)
    expect(r.viatges).toEqual([])
    expect(r.kmTotal).toBe(0)
  })
  it('el 2-opt no empeora una ruta ya ordenada', () => {
    const linia = Array.from({ length: 5 }, (_, i) => ({ id: i, lat: BASE.lat + (i + 1) * 0.005, lon: BASE.lon, kg: 10 }))
    const r = planifica(BASE, linia, 9000)
    // ida y vuelta en línea recta: el doble de la distancia a la última parada
    expect(r.kmTotal).toBeCloseTo(2 * distKm(BASE.lat, BASE.lon, linia[4].lat, linia[4].lon), 1)
  })
})
