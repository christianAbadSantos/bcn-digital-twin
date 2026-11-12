// Urbanismo: grupos de calificación, claves del PGM, áreas y lectura de las respuestas del Catastro
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GRUPS, areaDe, clauDe, fitxaCadastre, grupDe, zonaEn } from '../src/urbanisme.js'

describe('calificación del suelo', () => {
  it('cada código del MUC pertenece a un solo grupo', () => {
    const codis = GRUPS.flatMap((g) => g.codis)
    expect(new Set(codis).size).toBe(codis.length)
  })
  it('agrupa los códigos', () => {
    expect(grupDe('R2')).toBe('densa')
    expect(grupDe('SV')).toBe('verd')
    expect(grupDe('M3')).toBe('activitat')
    expect(grupDe('SX9')).toBe('infra') // viario no listado
  })
  it('traduce la descripción a su clave del PGM', () => {
    expect(clauDe('Densificació Urbana Intensiva').clau).toBe('13b')
    expect(clauDe('Densificació Urbana Semiintensiva').clau).toBe('13a')
    expect(clauDe("Zona d'activitats @").clau).toBe('22@')
    expect(clauDe('Parcs i jardins urbans').clau).toBe('6')
    expect(clauDe('algo desconocido')).toEqual({ clau: '', que: '' })
  })
})

describe('áreas', () => {
  // cuadrado de 0,001° de lado en Barcelona ≈ 111 m × 83 m
  const q = [[2.17, 41.39], [2.171, 41.39], [2.171, 41.391], [2.17, 41.391], [2.17, 41.39]]
  it('área de un polígono', () => {
    const a = areaDe({ type: 'Polygon', coordinates: [q] })
    expect(a).toBeGreaterThan(9000)
    expect(a).toBeLessThan(9600)
  })
  it('resta los agujeros y suma los multipolígonos', () => {
    const forat = [[2.1702, 41.3902], [2.1704, 41.3902], [2.1704, 41.3904], [2.1702, 41.3904], [2.1702, 41.3902]]
    const ple = areaDe({ type: 'Polygon', coordinates: [q] })
    expect(areaDe({ type: 'Polygon', coordinates: [q, forat] })).toBeLessThan(ple)
    expect(areaDe({ type: 'MultiPolygon', coordinates: [[q], [q]] })).toBeCloseTo(2 * ple, 3)
  })
})

describe('ficha del Catastro', () => {
  afterEach(() => vi.unstubAllGlobals())
  const resposta = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
  const coord = { Consulta_RCCOOR_DistanciaResult: { coordenadas_distancias: { coordd: [{ lpcd: [{ pc: { pc1: '0125408', pc2: 'DF3802E' }, ldt: 'CL ARAGO 254 BARCELONA (BARCELONA)', dis: '0' }] }] } } }

  it('edificio sin división horizontal', async () => {
    const lcons = [
      { lcd: 'ALMACEN', dt: { lourb: { loint: { pt: '-1' } } }, dfcons: { stl: '483' } },
      { lcd: 'COMERCIO', dt: { lourb: { loint: { pt: '0' } } }, dfcons: { stl: '339' } },
      { lcd: 'VIVIENDA', dt: { lourb: { loint: { pt: 'EN' } } }, dfcons: { stl: '92' } },
      { lcd: 'VIVIENDA', dt: { lourb: { loint: { pt: '01' } } }, dfcons: { stl: '92' } },
      { lcd: 'VIVIENDA', dt: { lourb: { loint: { pt: '02' } } }, dfcons: { stl: '92' } },
    ]
    const dnp = { consulta_dnprcResult: { bico: { bi: { debi: { luso: 'Residencial', sfc: '4856', ant: '1975' } }, finca: { ltp: 'Parcela construida sin división horizontal', dff: { ss: '495' } }, lcons } } }
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(resposta(coord)).mockReturnValueOnce(resposta(dnp)))
    const f = await fitxaCadastre(2.163, 41.3905)
    expect(f).toMatchObject({ rc: '0125408DF3802E', adreca: 'CL ARAGO 254', us: 'Residencial', any: 1975, sup: 4856, sol: 495, plantes: 4, soterranis: 1, habitatges: 3 })
    expect(f.edificabilitat).toBeCloseTo(9.81, 2)
  })

  it('edificio en división horizontal: las plazas de parking no cuentan como plantas', async () => {
    const unitat = (luso, sfc, pt) => ({ debi: { luso, sfc: String(sfc), ant: '1972' }, dt: { locs: { lous: { lourb: { loint: { pt } } } } } })
    const rcdnp = [
      ...Array.from({ length: 15 }, (_, i) => unitat('Almacen-Estacionamiento', 21, `P${i + 1}`)),
      ...['01', '02', '03'].flatMap((pt) => [unitat('Residencial', 90, pt), unitat('Residencial', 90, pt)]),
      unitat('Comercial', 200, 'BJ'),
    ]
    const dnp = { consulta_dnprcResult: { lrcdnp: { rcdnp } } }
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(resposta(coord)).mockReturnValueOnce(resposta(dnp)))
    const f = await fitxaCadastre(2.14, 41.39)
    expect(f.plantes).toBe(4) // baja + 3
    expect(f.us).toBe('Residencial') // uso con más superficie (540 m² frente a 315 m² de plazas)
    expect(f.inmobles).toBe(22)
    expect(f.habitatges).toBe(6)
    expect(f.edificabilitat).toBeNull()
  })

  it('sin parcela cerca devuelve null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(resposta({ Consulta_RCCOOR_DistanciaResult: { control: { cuerr: 1 } } })))
    expect(await fitxaCadastre(2.1, 41.3)).toBeNull()
  })
})

describe('ámbito bajo un punto', () => {
  const sq = (x, y, d) => [[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]
  const geo = {
    features: [
      { properties: { d: 'viari', g: 'infra' }, geometry: { type: 'Polygon', coordinates: [sq(0, 0, 10)] } },
      { properties: { d: 'nucli', g: 'antic' }, geometry: { type: 'Polygon', coordinates: [sq(2, 2, 2)] } },
    ],
  }
  it('prefiere la calificación al viario', () => {
    expect(zonaEn(geo, [3, 3]).properties.d).toBe('nucli')
  })
  it('si solo hay viario, devuelve el viario', () => {
    expect(zonaEn(geo, [8, 8]).properties.d).toBe('viari')
  })
  it('fuera de todo, null', () => {
    expect(zonaEn(geo, [20, 20])).toBeNull()
  })
})
