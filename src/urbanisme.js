// Urbanismo en el gemelo (al estilo de los mapas de zonificación tipo Gridics):
//   - Calificación urbanística real de cada manzana (Mapa Urbanístic de Catalunya, Generalitat),
//     precargada en public/data/urbanisme.json con scripts/build-urbanisme.mjs.
//   - Ficha de la parcela al hacer clic: datos reales del Catastro (uso, año, superficies, plantas,
//     viviendas), consultados en directo a los servicios web de la DG del Catastro (permiten CORS).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export const DATA_URL = '/data/urbanisme.json'
const CAT = 'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero'

// Grupos de calificación (códigos C_QUAL_MUC del MUC) para colorear y filtrar el mapa
export const GRUPS = [
  { k: 'antic', nom: 'Casco antiguo', color: '#9c4f2e', codis: ['R1'] },
  { k: 'densa', nom: 'Manzana densa (Eixample y ejes)', color: '#e8835a', codis: ['R2', 'R3'] },
  { k: 'blocs', nom: 'Bloques y edificación aislada', color: '#f0b64a', codis: ['R4', 'R5', 'R6'] },
  { k: 'conserva', nom: 'Conservación del tejido', color: '#c28c5c', codis: ['M2'] },
  { k: 'activitat', nom: 'Actividad económica y 22@', color: '#7b6fd6', codis: ['A1', 'A2', 'A3', 'M3', 'D2'] },
  { k: 'transforma', nom: 'En transformación', color: '#8d97a8', codis: ['M1', 'D1', 'D3', 'D4', 'D5'] },
  { k: 'equip', nom: 'Equipamientos y vivienda dotacional', color: '#2a78d6', codis: ['SE', 'SD'] },
  { k: 'verd', nom: 'Parques y espacios libres', color: '#3fa34d', codis: ['SV', 'SS', 'N1', 'N2', 'N3', 'N4'] },
  { k: 'infra', nom: 'Viario e infraestructuras', color: '#c3c9d3', codis: ['SX', 'SX0', 'SX1', 'SX2', 'SX3', 'SF', 'SA', 'SP', 'SC', 'ST', 'SH'] },
]
export const GRUP_DE = Object.fromEntries(GRUPS.flatMap((g) => g.codis.map((c) => [c, g.k])))
export const GRUP = Object.fromEntries(GRUPS.map((g) => [g.k, g]))
export const grupDe = (codi) => GRUP_DE[codi] || (codi?.startsWith('SX') ? 'infra' : 'transforma')

// Clave del Plan General Metropolitano (PGM 1976) y qué significa, a partir de la descripción del Ajuntament.
// Orientativo: la normativa exacta de cada solar está en el planeamiento vigente (MPGM, PERI, etc.).
const CLAUS = [
  [/Densificació Urbana Intensiva/i, '13b', 'Manzana compacta del Eixample y de los grandes ejes: edificios entre medianeras alineados a la calle. La altura máxima depende del ancho de la calle.'],
  [/Densificació Urbana Semiintensiva/i, '13a', 'Como la intensiva pero con menos densidad: edificios entre medianeras, típicos de los barrios que crecieron alrededor de los antiguos pueblos (Gràcia, Sants, Sant Andreu…).'],
  [/Densificació urbana/i, '13', 'Densificación urbana: edificios entre medianeras alineados a la calle.'],
  [/Nucli Antic de Substitució/i, '12', 'Casco antiguo donde se puede sustituir la edificación manteniendo la trama de calles histórica.'],
  [/Nucli Antic de Conservació|Nucli antis/i, '12', 'Casco antiguo que se protege: se conserva la estructura de las calles y de los edificios.'],
  [/Conservació est\. urbana/i, '15', 'Conservación de la estructura urbana y edificatoria: barrios con un carácter que el plan quiere mantener.'],
  [/Verd privat protegit/i, '8', 'Jardín privado protegido: no se puede edificar.'],
  [/volumetria espec|vol\. esp|Volumetria especifica/i, '18', 'Volumetría específica: la forma de los edificios (bloques, alturas) la fija un plan concreto.'],
  [/edif(icació|\.)? aïllada/i, '20', 'Edificación aislada: torres o casas separadas de los vecinos, con espacio libre alrededor.'],
  [/activitats @/i, '22@', 'Zona 22@: antiguo suelo industrial del Poblenou reconvertido en actividades tecnológicas y de conocimiento, con vivienda y equipamientos.'],
  [/industrial/i, '22a', 'Zona industrial.'],
  [/Terciari/i, '', 'Oficinas, comercio y servicios en el ámbito del puerto.'],
  [/Renovació urbana|Remodelació/i, '14', 'Renovación urbana: ámbito que el plan quiere transformar (rehabilitar, cambiar de uso o abrir parques, calles o equipamientos).'],
  [/Habitatge dotacional/i, 'HD', 'Vivienda dotacional pública: pisos de alquiler asequible en suelo público (jóvenes, mayores…).'],
  [/Equipament|dotacional hoteler/i, '7', 'Equipamiento: escuelas, centros de salud, bibliotecas, polideportivos y otros servicios para la ciudad.'],
  [/Parc forestal/i, '27', 'Parque forestal (Collserola).'],
  [/Parcs i jardins|Zona verda|Zones verdes|Espai lliure|espais lliures/i, '6', 'Parques y jardines urbanos: suelo público para zonas verdes.'],
  [/Protecció de sistemes/i, '', 'Franja de protección junto a grandes infraestructuras (rondas, vías…).'],
  [/viari|Vies cíviques|viària/i, '5', 'Calles y vías: suelo público para la circulación de peatones y vehículos.'],
  [/ferroviari/i, '3', 'Sistema ferroviario: vías y estaciones.'],
  [/portuari|maritimo/i, '2', 'Sistema portuario.'],
  [/serveis tècnics/i, '4', 'Servicios técnicos y ambientales: depuradoras, subestaciones, centros de residuos…'],
  [/hidrogràfic/i, '', 'Ríos y rieras.'],
]
export function clauDe(desc) {
  const c = CLAUS.find(([re]) => re.test(desc || ''))
  return c ? { clau: c[1], que: c[2] } : { clau: '', que: '' }
}

// Área aproximada de un polígono en m² (proyección equirectangular local; suficiente a escala de ciudad)
const R = 6371008.8
function areaRing(ring) {
  const lat0 = (ring.reduce((s, c) => s + c[1], 0) / ring.length) * Math.PI / 180
  const kx = Math.cos(lat0) * R * Math.PI / 180, ky = R * Math.PI / 180
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky)
  return Math.abs(a / 2)
}
const areaPoly = (p) => p.reduce((s, r, i) => s + (i === 0 ? areaRing(r) : -areaRing(r)), 0)
export function areaDe(g) {
  if (!g) return 0
  return g.type === 'Polygon' ? areaPoly(g.coordinates) : g.type === 'MultiPolygon' ? g.coordinates.reduce((s, p) => s + areaPoly(p), 0) : 0
}

// Ámbito de calificación que contiene un punto (el viario solo si no hay otro)
function inRing(p, r) {
  let ok = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ok = !ok
  }
  return ok
}
const inPoly = (p, poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h))
export function zonaEn(geo, p) {
  let infra = null
  for (const f of geo?.features || []) {
    const g = f.geometry
    const hit = g.type === 'Polygon' ? inPoly(p, g.coordinates) : g.coordinates.some((c) => inPoly(p, c))
    if (!hit) continue
    if (f.properties.g !== 'infra') return f
    infra = infra || f
  }
  return infra
}

// ---- Catastro
const SOTANO = /^(-\d+|S\d*|SS|ST|SM|SO)$/i
const BAJA = /^(0+|BJ|PB|BA|LO|LC)$/i
// número de plantas sobre rasante a partir de los códigos de planta de los locales
function plantes(pts) {
  const s = new Set(), b = new Set()
  for (const p of pts) {
    if (!p || /^(OD|OS|T)$/i.test(p)) continue
    if (SOTANO.test(p)) b.add(p)
    else s.add(BAJA.test(p) ? '0' : p.replace(/^0+(?=\d)/, ''))
  }
  return { sobre: s.size, sota: b.size }
}
const num = (x) => Number(String(x ?? '').replace(',', '.')) || 0

async function jget(url, signal) {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`Catastro ${r.status}`)
  return r.json()
}

// Referencia catastral de la parcela más cercana a un punto (hasta ~50 m)
async function parcelaEn(lon, lat, signal) {
  const j = await jget(`${CAT}/COVCCoordenadas.svc/json/Consulta_RCCOOR_Distancia?SRS=EPSG:4326&CoorX=${lon.toFixed(6)}&CoorY=${lat.toFixed(6)}`, signal)
  const l = j?.Consulta_RCCOOR_DistanciaResult?.coordenadas_distancias?.coordd?.[0]?.lpcd?.[0]
  if (!l) return null
  return { rc: l.pc.pc1 + l.pc.pc2, adreca: (l.ldt || '').replace(/\s*BARCELONA \(BARCELONA\)\s*$/i, ''), dist: num(l.dis) }
}

// Ficha resumida de una parcela catastral
export async function fitxaCadastre(lon, lat, signal) {
  const p = await parcelaEn(lon, lat, signal)
  if (!p) return null
  const j = await jget(`${CAT}/COVCCallejero.svc/json/Consulta_DNPRC?RefCat=${p.rc}`, signal)
  const res = j?.consulta_dnprcResult
  if (!res || res.lerr) throw new Error(res?.lerr?.[0]?.des || 'sin datos del Catastro')
  const f = { rc: p.rc, adreca: p.adreca, dist: p.dist, link: `https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?del=8&mun=900&refcat=${p.rc}` }
  if (res.bico) {
    // parcela con un solo inmueble (sin división horizontal)
    const d = res.bico.bi.debi || {}
    const lc = [].concat(res.bico.lcons || [])
    const pl = plantes(lc.map((c) => c.dt?.lourb?.loint?.pt))
    const usos = {}
    for (const c of lc) usos[c.lcd] = (usos[c.lcd] || 0) + num(c.dfcons?.stl)
    Object.assign(f, {
      tipus: res.bico.finca?.ltp || '',
      us: d.luso || '',
      any: num(d.ant) || null,
      sup: num(d.sfc),
      sol: num(res.bico.finca?.dff?.ss) || null,
      plantes: pl.sobre, soterranis: pl.sota,
      habitatges: lc.filter((c) => /VIVIENDA/i.test(c.lcd)).length,
      usos: Object.entries(usos).sort((a, b) => b[1] - a[1]).slice(0, 4),
    })
  } else if (res.lrcdnp) {
    // división horizontal: lista de inmuebles (pisos, locales, plazas…)
    const xs = [].concat(res.lrcdnp.rcdnp || [])
    const anys = xs.map((x) => num(x.debi?.ant)).filter(Boolean)
    const usos = {}, m2 = {}
    for (const x of xs) {
      const u = x.debi?.luso || 'Otros'
      usos[u] = (usos[u] || 0) + 1
      m2[u] = (m2[u] || 0) + num(x.debi?.sfc)
    }
    // las plazas de aparcamiento y trasteros usan "P1, P2…" como número de plaza, no de planta
    const pl = plantes(xs.filter((x) => !/Almacen|Estacionamiento/i.test(x.debi?.luso || '')).map((x) => x.dt?.locs?.lous?.lourb?.loint?.pt))
    const usPral = Object.entries(m2).sort((a, b) => b[1] - a[1])[0]?.[0] || '' // uso con más superficie
    Object.assign(f, {
      tipus: 'Edificio en división horizontal',
      us: usPral,
      any: anys.length ? Math.min(...anys) : null,
      sup: xs.reduce((s, x) => s + num(x.debi?.sfc), 0),
      sol: null,
      plantes: pl.sobre, soterranis: pl.sota,
      inmobles: xs.length,
      habitatges: usos.Residencial || 0,
      usosN: Object.entries(usos).sort((a, b) => b[1] - a[1]).slice(0, 4),
    })
  }
  f.edificabilitat = f.sol ? Math.round((f.sup / f.sol) * 100) / 100 : null
  return f
}

// ---- hook: datos de calificación, filtros y parcela seleccionada
export function useUrbanisme(enabled) {
  const [geo, setGeo] = useState(null)
  const [err, setErr] = useState(null)
  const [on, setOn] = useState(() => Object.fromEntries(GRUPS.map((g) => [g.k, g.k !== 'infra'])))
  const [sel, setSel] = useState(null) // { lon, lat, zona, alturaOsm, fitxa, estat }
  const ctl = useRef(null)
  const geoRef = useRef(null)
  geoRef.current = geo

  useEffect(() => {
    if (!enabled || geo) return
    fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((j) => {
        for (const f of j.features) f.properties.g = grupDe(f.properties.q) // grupo, para colorear y filtrar
        setGeo(j)
      })
      .catch((e) => setErr(`urbanisme.json: ${e.message}`))
  }, [enabled, geo])

  // superficie de la ciudad por grupo (para el resumen del panel)
  const resum = useMemo(() => {
    if (!geo) return null
    const a = Object.fromEntries(GRUPS.map((g) => [g.k, 0]))
    for (const f of geo.features) a[grupDe(f.properties.q)] += areaDe(f.geometry)
    const total = Object.values(a).reduce((s, x) => s + x, 0)
    return { total, perGrup: GRUPS.map((g) => ({ ...g, m2: a[g.k], pct: total ? (a[g.k] / total) * 100 : 0 })) }
  }, [geo])

  // idx: posición del ámbito en urbanisme.json (id que genera el mapa); bld: edificio 3D bajo el clic
  const tria = useCallback(async ({ lon, lat, idx, bld }) => {
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    // si el mapa aún no ha dibujado la capa en ese punto, se busca el ámbito en los datos
    const gf = idx != null ? geoRef.current?.features[idx] : zonaEn(geoRef.current, [lon, lat])
    const zona = gf ? { ...gf.properties, m2: areaDe(gf.geometry), geometry: gf.geometry } : null
    setSel({ lon, lat, zona, bld: bld || null, alturaOsm: bld ? Math.round(bld.h) : null, fitxa: null, estat: 'carregant' })
    try {
      const fitxa = await fitxaCadastre(lon, lat, c.signal)
      if (!c.signal.aborted) setSel((s) => ({ ...s, fitxa, estat: fitxa ? 'ok' : 'buit' }))
    } catch (e) {
      if (!c.signal.aborted) setSel((s) => ({ ...s, estat: 'error', error: e.message }))
    }
  }, [])
  const tanca = useCallback(() => { ctl.current?.abort(); setSel(null) }, [])
  const toggle = useCallback((k) => setOn((o) => ({ ...o, [k]: !o[k] })), [])

  return { geo, err, on, toggle, resum, sel, tria, tanca }
}
