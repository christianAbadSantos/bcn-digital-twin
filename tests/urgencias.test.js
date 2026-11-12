// Asignación de bahías del muelle de urgencias
import { describe, expect, it } from 'vitest'
import { DWELL_MIN, assignBays } from '../shared/emergency.js'

const MIN = 60000
const BAYS = [
  { code: 'B1', tipo: 'SVA', prioridad: 0 },
  { code: 'B2', tipo: 'SVB', prioridad: 0 },
  { code: 'B3', tipo: 'POLIVALENTE', prioridad: 1 },
]

describe('asignación de bahías', () => {
  it('cada tipo de ambulancia va a su bahía preferida', () => {
    const r = assignBays([{ id: 'A', tipo: 'SVA', etaMs: 5 * MIN }, { id: 'B', tipo: 'SVB', etaMs: 5 * MIN }], BAYS, 0)
    expect(r.A.bay).toBe('B1')
    expect(r.B.bay).toBe('B2')
    expect(r.A.waitMin).toBe(0)
  })
  it('si su bahía está ocupada, usa la polivalente', () => {
    const r = assignBays([{ id: 'A', tipo: 'SVA', etaMs: 0 }, { id: 'C', tipo: 'SVA', etaMs: 1 * MIN }], BAYS, 0)
    expect(r.A.bay).toBe('B1')
    expect(r.C.bay).toBe('B3')
  })
  it('si todo está ocupado, espera a que quede una libre', () => {
    const r = assignBays([{ id: 'A', tipo: 'SVA', etaMs: 0 }, { id: 'B', tipo: 'SVA', etaMs: 0 }, { id: 'C', tipo: 'SVA', etaMs: 0 }], BAYS, 0)
    expect(r.C.waitMin).toBe(DWELL_MIN.SVA)
  })
  it('mantiene la bahía anterior si no empeora más de 1 minuto', () => {
    const r = assignBays([{ id: 'A', tipo: 'SVA', etaMs: 0, prevBay: 'B3' }], BAYS, 0)
    expect(r.A.bay).toBe('B3')
  })
})
