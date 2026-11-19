import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { applyAction, bcfFiles, canDo, checkName, crc32, lecturaSensor, planPreventivo, spPlan, uuidFrom, zip } from '../shared/cde.js'

const doc0 = { id: 'd1', nombre: 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', estado: 'WIP', idoneidad: 'S0', revision: 'P01.01', historial: [], ids: { ok: true, malos: 0 } }

describe('nomenclatura UNE-EN ISO 19650-2', () => {
  it('acepta un nombre conforme y separa sus campos', () => {
    const r = checkName('BCN01-CAB-ZZ-XX-M3-A-0001.ifc')
    expect(r.ok).toBe(true)
    expect(r.partes).toMatchObject({ proyecto: 'BCN01', originador: 'CAB', tipo: 'M3', rol: 'A', numero: '0001' })
  })
  it('explica qué falla en un nombre que no cumple', () => {
    expect(checkName('Plano cubierta v2 FINAL.pdf').ok).toBe(false)
    const r = checkName('BCN01-CAB-ZZ-XX-Q9-A-12.pdf')
    expect(r.ok).toBe(false)
    expect(r.errores.join(' ')).toMatch(/Tipo de información/)
    expect(r.errores.join(' ')).toMatch(/Número/)
  })
})

describe('estados, idoneidad y revisiones', () => {
  it('recorre En curso → Compartido → Publicado con los roles de cada paso', () => {
    const a = applyAction(doc0, 'compartir', { rol: 'autor', idoneidad: 'S1' }).doc
    expect(a).toMatchObject({ estado: 'SHARED', idoneidad: 'S1', revision: 'P01' })
    expect(canDo(a, 'publicar', 'cliente')).toMatch(/S4/)
    const b = applyAction(a, 'pedirAutorizacion', { rol: 'coordinador' }).doc
    const c = applyAction(b, 'publicar', { rol: 'cliente' }).doc
    expect(c).toMatchObject({ estado: 'PUBLISHED', idoneidad: 'A1', revision: 'C01' })
    expect(c.historial).toHaveLength(3)
    const d = applyAction(c, 'nuevaVersion', { rol: 'autor' }).doc
    expect(d).toMatchObject({ estado: 'WIP', idoneidad: 'S0', revision: 'P02.01' })
    const e = applyAction(applyAction(applyAction(d, 'compartir', { rol: 'autor', idoneidad: 'S3' }).doc, 'pedirAutorizacion', { rol: 'coordinador' }).doc, 'publicar', { rol: 'cliente' }).doc
    expect(e.revision).toBe('C02')
  })
  it('un modelo IFC no se publica sin pasar la validación IDS', () => {
    const s4 = { ...doc0, estado: 'SHARED', idoneidad: 'S4', revision: 'P01' }
    expect(canDo({ ...s4, ids: null }, 'publicar', 'cliente')).toMatch(/validar el modelo con el IDS/)
    expect(canDo({ ...s4, ids: { ok: false, malos: 2 } }, 'publicar', 'cliente')).toMatch(/2 elemento/)
    expect(canDo(s4, 'publicar', 'cliente')).toBeNull()
    expect(canDo({ ...s4, nombre: 'BCN01-CAB-ZZ-XX-SP-A-0001.pdf', ids: null }, 'publicar', 'cliente')).toBeNull()
  })
  it('cada rol solo puede hacer lo suyo y no se comparte un nombre que no cumple', () => {
    expect(canDo(doc0, 'compartir', 'cliente')).toMatch(/autor/)
    expect(canDo({ ...doc0, nombre: 'plano final.pdf' }, 'compartir', 'autor')).toMatch(/nomenclatura/)
    expect(() => applyAction(doc0, 'publicar', { rol: 'cliente' })).toThrow()
  })
  it('una devolución vuelve a En curso con la siguiente revisión menor y guarda el motivo', () => {
    const a = applyAction({ ...doc0, revision: 'P01.02', historial: [{ antes: { revision: 'P01.01' }, despues: { revision: 'P01.02' } }] }, 'compartir', { rol: 'autor', idoneidad: 'S1' }).doc
    expect(() => applyAction(a, 'devolver', { rol: 'coordinador' })).toThrow(/motivo/)
    const r = applyAction(a, 'devolver', { rol: 'coordinador', motivo: 'Faltan las puertas de evacuación' })
    expect(r.doc).toMatchObject({ estado: 'WIP', idoneidad: 'S0', revision: 'P01.03' })
    expect(r.entrada.motivo).toMatch(/evacuación/)
  })
})

describe('decisiones de obra en BCF 2.1', () => {
  const dec = [{ id: 'DEC-001', titulo: 'Puerta de evacuación EI2 90', tipo: 'Decisión de obra', estado: 'Abierta', prioridad: 'Alta', creada: '2026-11-19T09:00:00Z', autor: 'CAB', descripcion: 'Cambiar a EI2 90 <según PCI>', guid: '3N1k_uFfzz8FtAaegDCYu1', modelo: 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', comentarios: [{ t: '2026-11-19T10:00:00Z', quien: 'Coordinación', texto: 'De acuerdo' }] }]
  it('cada tema lleva su markup con el GlobalId del elemento y un punto de vista', () => {
    const f = bcfFiles(dec)
    expect(f.map((x) => x.path)).toEqual(['bcf.version', 'project.bcfp', `${uuidFrom('DEC-001')}/markup.bcf`, `${uuidFrom('DEC-001')}/viewpoint.bcfv`])
    expect(f[2].text).toContain('TopicStatus="Abierta"')
    expect(f[2].text).toContain('&lt;según PCI&gt;')
    expect(f[3].text).toContain('IfcGuid="3N1k_uFfzz8FtAaegDCYu1"')
    expect(uuidFrom('DEC-001')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('el ZIP es válido: cabeceras, CRC y directorio central', () => {
    const z = zip(bcfFiles(dec))
    const dv = new DataView(z.buffer)
    expect(dv.getUint32(0, true)).toBe(0x04034b50)
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50)
    expect(dv.getUint16(z.length - 22 + 10, true)).toBe(4)
    // valor de comprobación estándar del CRC-32
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('mantenimiento, sensores y SharePoint', () => {
  const indice = JSON.parse(fs.readFileSync(new URL('../public/data/cde/indice.json', import.meta.url), 'utf8'))
  it('el índice del modelo enlaza cada código con su GlobalId', () => {
    const pu = indice.elementos.find((e) => e.codigo === 'PU-002')
    expect(pu.guid).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/)
    expect(indice.elementos.filter((e) => e.entidad === 'IFCSENSOR')).toHaveLength(4)
  })
  it('el plan preventivo sale de la frecuencia de cada activo', () => {
    const p = planPreventivo([{ codigo: 'CL-001', nombre: 'Climatizadora', frecuencia: 'Trimestral', criticidad: 'Alta' }, { codigo: 'BO-002', nombre: 'Bomba', frecuencia: 'Anual' }])
    expect(p.filter((o) => o.activo === 'CL-001')).toHaveLength(4)
    expect(p.filter((o) => o.activo === 'BO-002')).toHaveLength(1)
    expect(p[0].fecha).toBe('2027-02-19')
  })
  it('los sensores dan valores plausibles y deterministas', () => {
    const t = Date.UTC(2026, 10, 19, 13)
    const a = lecturaSensor('bib-santantoni-p1-lectura', t)
    expect(a).toEqual(lecturaSensor('bib-santantoni-p1-lectura', t))
    expect(a.temp).toBeGreaterThan(18); expect(a.temp).toBeLessThan(27)
    expect(a.co2).toBeGreaterThan(400)
  })
  it('SharePoint: cada contenedor va a la carpeta de su estado y solo se sube lo que cambia', () => {
    const cfg = { biblioteca: 'Documentos CDE' }
    const docs = [{ id: 'a', nombre: 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', estado: 'PUBLISHED', revision: 'C01' }, { id: 'b', nombre: 'X.pdf', estado: 'WIP', revision: 'P01.01', sp: { ruta: 'Documentos CDE/01 En curso/X.pdf', revision: 'P01.01' } }]
    const p = spPlan(docs, cfg)
    expect(p[0]).toMatchObject({ ruta: 'Documentos CDE/03 Publicado/BCN01-CAB-ZZ-XX-M3-A-0001.ifc', accion: 'subir' })
    expect(p[0].graph).toMatch(/^PUT https:\/\/graph\.microsoft\.com\/v1\.0\/sites\//)
    expect(p[1].accion).toBe('al día')
  })
})
