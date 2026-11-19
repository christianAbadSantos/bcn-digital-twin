import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { parseIds, parseXml, validate, describe as desc } from '../shared/ids.js'
import { detectClashes, overlap } from '../shared/clash.js'
import { certificado, codigoDe, sha256Hex, verificar } from '../shared/cert.js'

const ids = parseIds(fs.readFileSync(new URL('../public/data/cde/BCN01-requisitos.ids', import.meta.url), 'utf8'))

describe('validación IDS (buildingSMART IDS 1.0)', () => {
  it('lee el fichero de requisitos del cliente', () => {
    expect(ids.titulo).toMatch(/BCN01/)
    expect(ids.specs).toHaveLength(5)
    const muros = ids.specs[0]
    expect(muros.entidades).toEqual(['IFCWALL'])
    expect(muros.requisitos.map(desc)).toEqual(['atributo Name con el patrón MU-[0-9]{3}', 'Pset_WallCommon.IsExternal', 'Pset_WallCommon.FireRating ∈ {EI 60, EI 90, EI 120}'])
    expect(ids.specs[3].entidades).toContain('IFCPIPESEGMENT')
  })
  it('marca qué elementos cumplen y explica por qué falla cada uno', () => {
    const els = [
      { guid: 'a', clase: 'IFCWALL', nombre: 'MU-001', psets: { Pset_WallCommon: { IsExternal: true, FireRating: 'EI 120' } } },
      { guid: 'b', clase: 'IFCWALL', nombre: 'MU-015', psets: { Pset_WallCommon: { IsExternal: false, FireRating: 'EI 30' } } },
      { guid: 'c', clase: 'IFCWALL', nombre: 'Muro 7', psets: { Pset_WallCommon: { FireRating: 'EI 60' } } },
      { guid: 'd', clase: 'IFCDOOR', nombre: 'PU-001', psets: { Pset_DoorCommon: { FireRating: 'EI2 60-C5', IsExternal: true } } },
      { guid: 'e', clase: 'IFCSLAB', nombre: 'FJ-00', psets: {} },
    ]
    const r = validate(ids, els)
    expect(r.ok).toBe(false)
    expect(r.malos).toBe(2)
    expect(r.porGuid.b).toEqual(['Pset_WallCommon.FireRating = «EI 30» no cumple {EI 60, EI 90, EI 120}'])
    expect(r.porGuid.c.join(' ')).toMatch(/Name = «Muro 7» no cumple el patrón/)
    expect(r.porGuid.c.join(' ')).toMatch(/falta Pset_WallCommon\.IsExternal/)
    expect(r.okGuid.sort()).toEqual(['a', 'd'])
    expect(r.resultados[0]).toMatchObject({ aplicados: 3, cumplen: 1 })
  })
  it('el lector XML entiende prefijos, atributos y elementos vacíos', () => {
    const x = parseXml('<?xml version="1.0"?><a:b x:y="1"><c/><d>t &amp; u</d></a:b>')
    expect(x).toMatchObject({ name: 'b', attrs: { y: '1' } })
    expect(x.children.map((c) => c.name)).toEqual(['c', 'd'])
    expect(x.children[1].text).toBe('t & u')
  })
})

describe('colisiones entre disciplinas', () => {
  const caja = (x0, y0, z0, x1, y1, z1) => [[x0, y0, z0], [x1, y1, z1]]
  it('solo cuenta solapes reales, no elementos que se tocan', () => {
    expect(overlap(caja(0, 0, 0, 1, 1, 1), caja(1, 0, 0, 2, 1, 1))).toBeNull()
    expect(overlap(caja(0, 0, 0, 1, 1, 1), caja(0.5, 0.5, 0.5, 2, 2, 2))).toEqual([[0.5, 0.5, 0.5], [1, 1, 1]])
  })
  it('cruza arquitectura con instalaciones y ordena por gravedad', () => {
    const els = [
      { guid: 'tabique', file: 'A.ifc', clase: 'IFCWALL', tag: 'MU-015', bbox: caja(2.9, -8, 4, 3.1, 8, 7.6) },
      { guid: 'forjado', file: 'A.ifc', clase: 'IFCSLAB', tag: 'FJ-01', bbox: caja(-12, -8, 3.7, 12, 8, 4) },
      { guid: 'muro', file: 'A.ifc', clase: 'IFCWALL', tag: 'MU-001', bbox: caja(-12, -8.2, 0, 12, -7.9, 4) },
      { guid: 'conducto', file: 'M.ifc', clase: 'IFCDUCTSEGMENT', tag: 'CD-001', bbox: caja(-1, 0.9, 6.7, 9, 1.5, 7.1) },
      { guid: 'bajante', file: 'M.ifc', clase: 'IFCPIPESEGMENT', tag: 'TU-001', bbox: caja(9.5, 5.1, 0.3, 9.7, 5.3, 4.9) },
      { guid: 'espacio', file: 'A.ifc', clase: 'IFCSPACE', tag: 'EP-011', bbox: caja(-12, -8, 4, 12, 8, 7.6) },
    ]
    const c = detectClashes(els)
    expect(c.map((x) => [x.a.tag, x.b.tag])).toEqual([['MU-015', 'CD-001'], ['FJ-01', 'TU-001']])
    expect(c[0]).toMatchObject({ id: 'COL-001', guidA: 'tabique', guidB: 'conducto' })
  })
})

describe('certificado de documentos (SHA-256)', () => {
  it('calcula la huella estándar y un código corto de verificación', async () => {
    const h = await sha256Hex(new TextEncoder().encode('abc'))
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(codigoDe(h)).toBe('BA78-16BF-8F01-CFEA')
  })
  it('reconoce el documento certificado y detecta cualquier cambio', async () => {
    const original = new TextEncoder().encode('ISO-10303-21; modelo C01')
    const cert = certificado({ hash: await sha256Hex(original), nombre: 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', revision: 'C01', idoneidad: 'A1', firmante: 'Cliente', proyecto: 'BCN01' })
    expect((await verificar(original, [cert])).certificado?.revision).toBe('C01')
    expect((await verificar(new TextEncoder().encode('ISO-10303-21; modelo C01 '), [cert])).certificado).toBeNull()
  })
})
