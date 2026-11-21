import { describe, expect, it } from 'vitest'
import { PUNTOS, ZONAS, alarmas, buscar, efectivo, estadoInicial, mandar, paso } from '../shared/bms.js'

const T0 = Date.UTC(2026, 10, 20, 11) // 12:00 en Barcelona, biblioteca abierta
const ord = (eq, n) => PUNTOS.find((p) => p.equipo === eq && p.nombre === n).ord

describe('BMS simulado', () => {
  it('cada zona y cada equipo tiene sus puntos con ruta ORD', () => {
    expect(PUNTOS.filter((p) => p.equipo === 'FCU-P1-01').map((p) => p.nombre)).toContain('SP_AMB')
    expect(PUNTOS.every((p) => p.ord.startsWith('station:|slot:/Drivers/'))).toBe(true)
    expect(new Set(PUNTOS.map((p) => p.ord)).size).toBe(PUNTOS.length)
  })

  it('la sala va hacia la consigna con el fancoil en marcha', () => {
    let est = estadoInicial(T0)
    est = mandar(est, [ord('FCU-P1-01', 'SP_AMB')], { valor: 19 }).est
    let r
    for (let i = 1; i <= 30; i++) { r = paso(est, T0 + i * 60000); est = r.est }
    expect(r.valores['zona:FCU-P1-01'].T).toBeCloseTo(19, 0)
    expect(r.valores[ord('FCU-P1-01', 'VAL_FRIO')]).toBe('Close')
  })

  it('no deja escribir en puntos de lectura ni fuera de rango', () => {
    const est = estadoInicial(T0)
    const { resultados } = mandar(est, [ord('FCU-P1-01', 'TEM_AMB'), ord('FCU-P1-01', 'SP_AMB')], { valor: 40 })
    expect(resultados[0].msg).toMatch(/solo lectura/)
    expect(resultados[1].msg).toMatch(/Fuera de rango/)
  })

  it('override manda sobre el fallback y auto lo retira', () => {
    const o = ord('CL-001', 'PM_UTA')
    let est = mandar(estadoInicial(T0), [o], { modo: 'override', valor: false }).est
    expect(efectivo(est, o)).toBe(false)
    expect(alarmas(paso(est, T0 + 60000).valores).length).toBeGreaterThanOrEqual(0)
    est = mandar(est, [o], { modo: 'auto' }).est
    expect(efectivo(est, o)).toBe(true)
  })

  it('el comando masivo encuentra todos los fancoils', () => {
    expect(buscar('PM_FCU', 'BCN01').length).toBe(ZONAS.length)
    const { resultados } = mandar(estadoInicial(T0), buscar('PM_FCU').map((p) => p.ord), { valor: true })
    expect(resultados.every((r) => r.msg === 'Fallback ya configurado')).toBe(true)
  })

  it('parar una bomba genera su alarma', () => {
    const est = mandar(estadoInicial(T0), [ord('BO-002', 'PM_BOM')], { valor: false }).est
    expect(alarmas(paso(est, T0 + 1000).valores).some((a) => a.equipo === 'BO-002')).toBe(true)
  })
})
