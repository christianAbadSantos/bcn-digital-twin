import { describe, expect, it } from 'vitest'
import { PSET, aCodigoPdE, checkCodigoPdE, checklist, loi } from '../shared/pde.js'

describe('Guía BIM de Puertos del Estado', () => {
  it('reconoce los códigos de archivo del anexo IV', () => {
    expect(checkCodigoPdE('18_01PR_AmpliacionPuerto')).toMatchObject({ ok: true, tipo: 'carpeta' })
    expect(checkCodigoPdE('26_01PR03_Memoria_2.pdf')).toMatchObject({ ok: true, tipo: 'documento', partes: { contador: '03', edicion: '2' } })
    expect(checkCodigoPdE('26_01PR_PL01_PlantaBaja.dwg')).toMatchObject({ ok: true, tipo: 'plano o modelo' })
    expect(checkCodigoPdE('Plano cubierta v2 FINAL.pdf').ok).toBe(false)
    expect(checkCodigoPdE('26_01XX_algo.pdf').errores[0]).toMatch(/PR, PY, PB o SA/)
  })

  it('convierte el nombre ISO 19650 del CDE al código PdE', () => {
    const m = aCodigoPdE({ nombre: 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', titulo: 'Modelo de arquitectura' })
    expect(m).toBe('26_01PR_M01A_ModeloDeArquitectura.ifc')
    expect(checkCodigoPdE(m).ok).toBe(true)
    const d = aCodigoPdE({ nombre: 'BCN01-CAB-ZZ-XX-SP-A-0001.pdf', titulo: 'Pliego de condiciones técnicas', revision: 'P02.01' })
    expect(checkCodigoPdE(d)).toMatchObject({ ok: true, tipo: 'documento' })
  })

  it('mide el nivel de información (LOI) del set de propiedades', () => {
    const lleno = Object.fromEntries(Object.entries(PSET).map(([g, ps]) => [g, Object.fromEntries(ps.map(([n]) => [n, 'x']))]))
    const r = loi([{ clase: 'IFCWALL', psets: lleno }, { clase: 'IFCWALL', psets: {} }])
    expect(r.pct).toBe(50)
    expect(r.faltan[0][1]).toBe(1)
  })

  it('rellena la checklist de auditoría', () => {
    const filas = checklist({ doc: { nombre: 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', estado: 'PUBLISHED', tamano: 50000 }, elementos: [], ids: { ok: true }, colisiones: { total: 2, abiertas: 0 }, georref: true })
    expect(filas.find((f) => /IFC/.test(f.req)).ok).toBe(true)
    expect(filas.find((f) => /IDS/.test(f.req)).ok).toBe(true)
    expect(filas.find((f) => /clasificación/.test(f.req)).ok).toBe(null)
  })
})

import fs from 'node:fs'
import { parseIds, validate } from '../shared/ids.js'
describe('IDS de la Guía BIM de PdE', () => {
  const ids = parseIds(fs.readFileSync(new URL('../public/data/cde/PdE-guia-bim.ids', import.meta.url), 'utf8'))
  it('tiene los grupos 01, 02, 03 y 05 del set de propiedades', () => {
    expect(ids.specs.map((s) => s.nombre.slice(0, 2))).toEqual(['01', '02', '03', '05'])
    expect(ids.specs[0].entidades).toContain('IFCPIPESEGMENT')
  })
  it('detecta un epígrafe contable que falta', () => {
    const lleno = Object.fromEntries(Object.entries(PSET).map(([g, ps]) => [g, Object.fromEntries(ps.map(([n]) => [n, n.includes('Aux') || /Planos|PPTP/.test(n) ? 'https://x.es/a' : 'x']))]))
    Object.assign(lleno['01_PdE_Identificación'], { '01_03_PdE_Estado': 'Obra', '01_04_PdE_Clasificación': 'PT.090.030', '01_05_PdE_Tipología': 'Obras marítimas' })
    lleno['02_PdE_Cantidades']['02_01_PdE_Unidad'] = 'ud'
    lleno['05_PdE_EOM']['05_03_01_PdE_Cod Contable'] = '0403'
    const sin = structuredClone(lleno); delete sin['05_PdE_EOM']['05_03_01_PdE_Cod Contable']
    const r = validate(ids, [{ guid: 'a', clase: 'IFCBUILDINGELEMENTPROXY', psets: lleno }, { guid: 'b', clase: 'IFCPIPESEGMENT', psets: sin }])
    expect(r.malos).toBe(1)
    expect(r.porGuid.b[0]).toMatch(/Cod Contable/)
  })
})
