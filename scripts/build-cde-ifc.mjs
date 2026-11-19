// Genera los modelos IFC4 DE EJEMPLO del entorno común de datos (CDE):
//   public/data/cde/BCN01-CAB-ZZ-XX-M3-A-0001.ifc   arquitectura (muros, forjados, pilares, puertas, ventanas, espacios)
//   public/data/cde/BCN01-CAB-ZZ-XX-M3-M-0001.ifc   instalaciones (climatizadora, bombas, cuadro, sensores)
// Edificio ficticio: «Biblioteca de barri · Sant Antoni», en el interior de manzana de c/ Comte Borrell
// (ejemplo, no es un proyecto real). Georreferenciado en el IfcSite, con el norte real de la trama del Eixample.
// Los nombres siguen la convención de la UNE-EN ISO 19650-2 (anexo nacional):
//   Proyecto-Originador-Volumen-Nivel-Tipo-Rol-Número
// Uso: node scripts/build-cde-ifc.mjs
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const OUT_DIR = path.resolve('public/data/cde')
const INDICE = [] // código → GlobalId de cada elemento (para enlazar decisiones y órdenes de trabajo)
const ORIGIN = { lat: 41.379296, lon: 2.160447, cota: 14.4 } // interior de manzana, Sant Antoni (ejemplo); cota del terreno ICGC 5 m
const GRID_BEARING = 44.5
const a0 = (GRID_BEARING * Math.PI) / 180
const TRUE_NORTH = [Math.cos(a0), Math.sin(a0)]
const W = 24, L = 16 // planta del edificio (m), centrada en el origen local
const LEVELS = [
  { code: '00', name: 'Planta baja', z: 0, h: 4.0 },
  { code: '01', name: 'Planta primera', z: 4.0, h: 3.6 },
]
const ROOF_Z = 7.6

// GlobalId deterministas (mismo modelo cada vez que se genera: las decisiones de obra siguen enlazadas)
const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
const guidOf = (seed) => {
  const b = crypto.createHash('sha256').update(seed).digest()
  let s = CH[b[0] & 3]
  for (let i = 1; i < 22; i++) s += CH[b[i] & 63]
  return s
}
const str = (t) => (t == null ? '$' : `'${[...String(t).replace(/'/g, "''")].map((c) => (c.charCodeAt(0) < 128 ? c : `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\`)).join('')}'`)
const num = (v) => { const r = Math.round(v * 1e6) / 1e6; return Number.isInteger(r) ? `${r}.` : String(r) }
const dms = (deg) => {
  const s = Math.sign(deg), d = Math.abs(deg)
  const D = Math.floor(d), M = Math.floor((d - D) * 60), S = Math.floor(((d - D) * 60 - M) * 60)
  const U = Math.round(((((d - D) * 60 - M) * 60) - S) * 1e6)
  return `(${[D, M, S, U].map((v) => s * v).join(',')})`
}

function model({ file, role, discipline, description }) {
  const lines = []
  let n = 0
  const add = (s) => { lines.push(`#${++n}= ${s};`); return `#${n}` }
  const G = (seed) => `'${guidOf(`${file}:${seed}`)}'`

  const person = add(`IFCPERSON($,${str('Abad')},${str('Christian')},$,$,$,$,$)`)
  const org = add(`IFCORGANIZATION($,${str('CAB')},${str('Christian Abad · gemelo digital de Barcelona')},$,$)`)
  const owner = add(`IFCOWNERHISTORY(${add(`IFCPERSONANDORGANIZATION(${person},${org},$)`)},${add(`IFCAPPLICATION(${org},'1.0',${str('build-cde-ifc')},'bcn-twin-cde')`)},$,.ADDED.,$,$,$,1795046400)`)
  const units = add(`IFCUNITASSIGNMENT((${['LENGTHUNIT.,$,.METRE', 'AREAUNIT.,$,.SQUARE_METRE', 'VOLUMEUNIT.,$,.CUBIC_METRE', 'PLANEANGLEUNIT.,$,.RADIAN'].map((u) => add(`IFCSIUNIT(*,.${u}.)`)).join(',')}))`)
  const o3 = add('IFCCARTESIANPOINT((0.,0.,0.))')
  const zUp = add('IFCDIRECTION((0.,0.,1.))')
  const xDir = add('IFCDIRECTION((1.,0.,0.))')
  const world = add(`IFCAXIS2PLACEMENT3D(${o3},${zUp},${xDir})`)
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},${add(`IFCDIRECTION((${TRUE_NORTH.map((v) => v.toFixed(6)).join(',')}))`)})`)
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`)
  const prof2d = add(`IFCAXIS2PLACEMENT2D(${add('IFCCARTESIANPOINT((0.,0.))')},$)`)

  const project = add(`IFCPROJECT(${G('project')},${owner},${str('BCN01 · Biblioteca de barri Sant Antoni')},${str(`${description} (modelo de ejemplo para el entorno común de datos del gemelo digital de Barcelona)`)},$,$,$,(${ctx}),${units})`)
  const sitePl = add(`IFCLOCALPLACEMENT($,${world})`)
  const site = add(`IFCSITE(${G('site')},${owner},${str('Parcela · interior de manzana Comte Borrell')},${str('Sant Antoni, Barcelona (ejemplo)')},$,${sitePl},$,$,.ELEMENT.,${dms(ORIGIN.lat)},${dms(ORIGIN.lon)},${num(ORIGIN.cota)},$,$)`)
  const bldPl = add(`IFCLOCALPLACEMENT(${sitePl},${world})`)
  const building = add(`IFCBUILDING(${G('building')},${owner},${str('Biblioteca de barri Sant Antoni')},${str('Equipamiento municipal (ejemplo)')},$,${bldPl},$,$,.ELEMENT.,$,$,$)`)
  const storeys = LEVELS.map((lv) => {
    const pl = add(`IFCLOCALPLACEMENT(${bldPl},${add(`IFCAXIS2PLACEMENT3D(${add(`IFCCARTESIANPOINT((0.,0.,${num(lv.z)}))`)},${zUp},${xDir})`)})`)
    return { ...lv, pl, id: add(`IFCBUILDINGSTOREY(${G('storey' + lv.code)},${owner},${str(`${lv.code} · ${lv.name}`)},$,$,${pl},$,$,.ELEMENT.,${num(lv.z)})`), items: [] }
  })

  // colores (IfcSurfaceStyle) para que el visor muestre cada familia con su material
  const styles = {}
  const style = (k, [r, g, b], transp = 0) => {
    const col = add(`IFCCOLOURRGB($,${num(r)},${num(g)},${num(b)})`)
    const ren = add(`IFCSURFACESTYLERENDERING(${col},${num(transp)},$,$,$,$,$,$,.NOTDEFINED.)`)
    styles[k] = add(`IFCSURFACESTYLE(${str(k)},.BOTH.,(${ren}))`)
  }
  style('muro', [0.89, 0.86, 0.8]); style('muroInt', [0.95, 0.94, 0.92]); style('forjado', [0.62, 0.64, 0.67]); style('pilar', [0.55, 0.57, 0.6])
  style('vidrio', [0.45, 0.68, 0.86], 0.55); style('puerta', [0.55, 0.38, 0.24]); style('cubierta', [0.38, 0.42, 0.46]); style('espacio', [0.3, 0.6, 0.95], 0.85)
  style('equipo', [0.85, 0.45, 0.15]); style('bomba', [0.2, 0.5, 0.85]); style('cuadro', [0.25, 0.25, 0.3]); style('sensor', [0.9, 0.15, 0.2])

  // caja: rectángulo w×l (centrado) extruido h, en (x, y, z) del nivel y girado rot grados en planta
  function box(storeyPl, x, y, z, w, l, h, rot, styleKey) {
    const ang = (rot * Math.PI) / 180
    const dir = add(`IFCDIRECTION((${num(Math.cos(ang))},${num(Math.sin(ang))},0.))`)
    const pl = add(`IFCLOCALPLACEMENT(${storeyPl},${add(`IFCAXIS2PLACEMENT3D(${add(`IFCCARTESIANPOINT((${num(x)},${num(y)},${num(z)}))`)},${zUp},${dir})`)})`)
    const rect = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${prof2d},${num(w)},${num(l)})`)
    const solid = add(`IFCEXTRUDEDAREASOLID(${rect},${world},${zUp},${num(h)})`)
    add(`IFCSTYLEDITEM(${solid},(${styles[styleKey]}),$)`)
    const rep = add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`)
    return { pl, shape: add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`) }
  }
  const prop = (k, v) => add(`IFCPROPERTYSINGLEVALUE(${str(k)},$,${v},$)`)
  const L_ = (v) => `IFCLABEL(${str(v)})`, B_ = (v) => `IFCBOOLEAN(.${v ? 'T' : 'F'}.)`, Lm = (v) => `IFCLENGTHMEASURE(${num(v)})`, I_ = (v) => `IFCIDENTIFIER(${str(v)})`, T_ = (v) => `IFCTEXT(${str(v)})`, In = (v) => `IFCINTEGER(${v})`
  const pset = (target, name, props, seed) => {
    const ps = add(`IFCPROPERTYSET(${G(seed + name)},${owner},${str(name)},$,(${props.join(',')}))`)
    add(`IFCRELDEFINESBYPROPERTIES(${G(seed + name + 'rel')},${owner},$,$,(${target}),${ps})`)
  }
  const el = (st, entity, seed, name, desc, geom, tail) => {
    INDICE.push({ modelo: file, codigo: seed, guid: guidOf(`${file}:${seed}`), entidad: entity, nombre: desc, nivel: st.code })
    const id = add(`${entity}(${G(seed)},${owner},${str(name)},${str(desc)},$,${geom.pl},${geom.shape},${str(seed)}${tail})`)
    st.items.push(id)
    return id
  }

  if (discipline === 'A') {
    // muros perimetrales e interiores, forjados, pilares, puertas, ventanas, espacios
    const edges = [[[-W / 2, -L / 2], [W / 2, -L / 2], 'Fachada sur (c/ Comte Borrell)'], [[W / 2, -L / 2], [W / 2, L / 2], 'Fachada este'], [[W / 2, L / 2], [-W / 2, L / 2], 'Fachada norte (patio)'], [[-W / 2, L / 2], [-W / 2, -L / 2], 'Fachada oeste']]
    for (const st of storeys) {
      edges.forEach(([p, q, nom], i) => {
        const cx = (p[0] + q[0]) / 2, cy = (p[1] + q[1]) / 2, len = Math.hypot(q[0] - p[0], q[1] - p[1]), rot = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI
        const code = `MU-${st.code}${i + 1}`
        const w = el(st, 'IFCWALL', code, code, `${nom} · ${st.name}`, box(st.pl, cx, cy, 0, len + 0.3, 0.3, st.h, rot, 'muro'), ',.STANDARD.')
        pset(w, 'Pset_WallCommon', [prop('Reference', I_('MU-FACH-30')), prop('IsExternal', B_(true)), prop('LoadBearing', B_(true)), prop('FireRating', L_('EI 120')), prop('ThermalTransmittance', `IFCTHERMALTRANSMITTANCEMEASURE(0.35)`)], code)
      })
      // tabique central y núcleo de aseos
      const t1 = `MU-${st.code}5`
      const tw = el(st, 'IFCWALL', t1, t1, `Tabique de separación · ${st.name}`, box(st.pl, 3, 0, 0, 0.15, L - 0.3, st.h, 0, 'muroInt'), ',.PARTITIONING.')
      pset(tw, 'Pset_WallCommon', [prop('Reference', I_('TB-15')), prop('IsExternal', B_(false)), prop('LoadBearing', B_(false)), prop('FireRating', L_(st.code === '00' ? 'EI 60' : 'EI 30'))], t1)
      // forjado
      const fj = `FJ-${st.code}`
      const s = el(st, 'IFCSLAB', fj, fj, `Forjado ${st.name}`, box(st.pl, 0, 0, -0.3, W + 0.3, L + 0.3, 0.3, 0, 'forjado'), ',.FLOOR.')
      pset(s, 'Pset_SlabCommon', [prop('Reference', I_('FJ-30')), prop('IsExternal', B_(false)), prop('LoadBearing', B_(true)), prop('FireRating', L_('REI 120'))], fj)
      // pilares
      ;[[-6, -4], [-6, 4], [6, -4], [6, 4]].forEach(([x, y], i) => {
        const pc = `PI-${st.code}${i + 1}`
        const c = el(st, 'IFCCOLUMN', pc, pc, `Pilar de hormigón 40×40 · ${st.name}`, box(st.pl, x, y, 0, 0.4, 0.4, st.h - 0.3, 0, 'pilar'), ',.COLUMN.')
        pset(c, 'Pset_ColumnCommon', [prop('Reference', I_('HA-40x40')), prop('LoadBearing', B_(true)), prop('FireRating', L_('R 120'))], pc)
      })
      // ventanas en fachada sur y norte
      for (let k = 0; k < 4; k++) {
        for (const [yy, f] of [[-L / 2, 'S'], [L / 2, 'N']]) {
          const vc = `VE-${st.code}${f}${k + 1}`
          const v = el(st, 'IFCWINDOW', vc, vc, `Ventana ${f === 'S' ? 'calle' : 'patio'} ${k + 1} · ${st.name}`, box(st.pl, -8.4 + k * 5.6, yy, 1.0, 2.4, 0.34, 1.8, 0, 'vidrio'), `,${num(1.8)},${num(2.4)},.WINDOW.,.SINGLE_PANEL.,$`)
          pset(v, 'Pset_WindowCommon', [prop('Reference', I_('VE-240x180')), prop('IsExternal', B_(true)), prop('ThermalTransmittance', `IFCTHERMALTRANSMITTANCEMEASURE(1.4)`)], vc)
        }
      }
      // espacios
      const rooms = st.code === '00'
        ? [['Vestíbulo y préstamo', -4.5, -3.5, 15, 9], ['Sala infantil', -4.5, 5.5, 15, 5], ['Aseos y almacén', 7.5, 0, 9, 16]]
        : [['Sala de lectura', -4.5, 0, 15, 16], ['Sala polivalente', 7.5, 0, 9, 16]]
      rooms.forEach(([nom, x, y, w, l], i) => {
        const ec = `EP-${st.code}${i + 1}`
        const sp = add(`IFCSPACE(${G(ec)},${owner},${str(ec)},${str(nom)},$,${box(st.pl, x, y, 0, w - 0.3, l - 0.3, st.h - 0.35, 0, 'espacio').pl},${box(st.pl, x, y, 0, w - 0.3, l - 0.3, st.h - 0.35, 0, 'espacio').shape},${str(nom)},.ELEMENT.,.INTERNAL.,$)`)
        st.items.push(sp)
        pset(sp, 'Pset_SpaceCommon', [prop('Reference', I_(ec)), prop('IsExternal', B_(false)), prop('GrossPlannedArea', `IFCAREAMEASURE(${num((w - 0.3) * (l - 0.3))})`)], ec)
      })
    }
    // puerta de acceso y puerta de emergencia
    const st0 = storeys[0]
    const d1 = el(st0, 'IFCDOOR', 'PU-001', 'PU-001', 'Puerta de acceso principal', box(st0.pl, -4.5, -L / 2, 0, 2.0, 0.36, 2.4, 0, 'puerta'), `,${num(2.4)},${num(2.0)},.DOOR.,.DOUBLE_DOOR_SINGLE_SWING.,$`)
    pset(d1, 'Pset_DoorCommon', [prop('Reference', I_('PU-200x240')), prop('IsExternal', B_(true)), prop('FireRating', L_('EI2 60-C5')), prop('HandicapAccessible', B_(true))], 'PU-001')
    const d2 = el(st0, 'IFCDOOR', 'PU-002', 'PU-002', 'Salida de emergencia al patio', box(st0.pl, 7.5, L / 2, 0, 1.2, 0.36, 2.2, 0, 'puerta'), `,${num(2.2)},${num(1.2)},.DOOR.,.SINGLE_SWING_RIGHT.,$`)
    pset(d2, 'Pset_DoorCommon', [prop('Reference', I_('PU-120x220-EVAC')), prop('IsExternal', B_(true)), prop('FireRating', L_('EI2 60-C5')), prop('FireExit', B_(true))], 'PU-002')
    // cubierta
    const st1 = storeys[1]
    const cu = el(st1, 'IFCROOF', 'CU-001', 'CU-001', 'Cubierta plana transitable', box(st1.pl, 0, 0, st1.h, W + 0.3, L + 0.3, 0.35, 0, 'cubierta'), ',.FLAT_ROOF.')
    pset(cu, 'Pset_RoofCommon', [prop('Reference', I_('CU-INV-35')), prop('IsExternal', B_(true)), prop('FireRating', L_('REI 60'))], 'CU-001')
  } else {
    // instalaciones: activos con código GMAO, fabricante y frecuencia de mantenimiento
    const assets = [
      { code: 'CL-001', ent: 'IFCUNITARYEQUIPMENT', type: '.AIRHANDLER.', st: 1, x: 6, y: 3, z: 3.95, w: 3.2, l: 1.6, h: 1.5, sty: 'equipo', nom: 'Climatizadora UTA-1 (cubierta)', fab: 'Fabricante de ejemplo', mod: 'UTA 8000 m³/h', freq: 'Trimestral', crit: 'Alta' },
      { code: 'BO-001', ent: 'IFCPUMP', type: '.ENDSUCTION.', st: 0, x: 9.5, y: -6, z: 0, w: 0.8, l: 0.6, h: 0.9, sty: 'bomba', nom: 'Grupo de presión de agua fría', fab: 'Fabricante de ejemplo', mod: 'GP 2×1,5 kW', freq: 'Semestral', crit: 'Media' },
      { code: 'BO-002', ent: 'IFCPUMP', type: '.CIRCULATOR.', st: 0, x: 10.4, y: -6, z: 0, w: 0.5, l: 0.5, h: 0.7, sty: 'bomba', nom: 'Bomba de circulación ACS', fab: 'Fabricante de ejemplo', mod: 'BC 0,4 kW', freq: 'Anual', crit: 'Baja' },
      { code: 'CE-001', ent: 'IFCELECTRICDISTRIBUTIONBOARD', type: '.DISTRIBUTIONBOARD.', st: 0, x: 11.2, y: 2, z: 0.4, w: 0.9, l: 0.3, h: 1.8, sty: 'cuadro', nom: 'Cuadro general de baja tensión', fab: 'Fabricante de ejemplo', mod: 'CGBT 160 A', freq: 'Anual', crit: 'Alta' },
    ]
    const sensors = [
      { code: 'SE-001', st: 0, x: -4.5, y: -3.5, nom: 'Sensor ambiental vestíbulo', sid: 'bib-santantoni-pb-vestibulo' },
      { code: 'SE-002', st: 0, x: -4.5, y: 5.5, nom: 'Sensor ambiental sala infantil', sid: 'bib-santantoni-pb-infantil' },
      { code: 'SE-003', st: 1, x: -4.5, y: 0, nom: 'Sensor ambiental sala de lectura', sid: 'bib-santantoni-p1-lectura' },
      { code: 'SE-004', st: 1, x: 7.5, y: 0, nom: 'Sensor ambiental sala polivalente', sid: 'bib-santantoni-p1-polivalente' },
    ]
    for (const a of assets) {
      const st = storeys[a.st]
      const id = el(st, a.ent, a.code, a.code, a.nom, box(st.pl, a.x, a.y, a.z, a.w, a.l, a.h, 0, a.sty), `,${a.type}`)
      pset(id, 'Pset_ManufacturerTypeInformation', [prop('Manufacturer', L_(a.fab)), prop('ModelLabel', L_(a.mod))], a.code)
      pset(id, 'Pset_BCN_GMAO', [prop('CodigoActivo', I_(`BCN01-${a.code}`)), prop('FrecuenciaPreventivo', L_(a.freq)), prop('Criticidad', L_(a.crit)), prop('Instalado', L_('2026-03-15'))], a.code)
    }
    for (const s of sensors) {
      const st = storeys[s.st]
      const id = el(st, 'IFCSENSOR', s.code, s.code, s.nom, box(st.pl, s.x, s.y, 2.6, 0.18, 0.18, 0.12, 0, 'sensor'), ',.TEMPERATURESENSOR.')
      pset(id, 'Pset_BCN_Sensor', [prop('IdSensor', I_(s.sid)), prop('Magnitudes', T_('temperatura, humedad, CO2')), prop('IntervaloEnvio', L_('60 s'))], s.code)
      pset(id, 'Pset_BCN_GMAO', [prop('CodigoActivo', I_(`BCN01-${s.code}`)), prop('FrecuenciaPreventivo', L_('Anual')), prop('Criticidad', L_('Baja'))], s.code + 'g')
    }
  }

  add(`IFCRELAGGREGATES(${G('agg1')},${owner},$,$,${project},(${site}))`)
  add(`IFCRELAGGREGATES(${G('agg2')},${owner},$,$,${site},(${building}))`)
  add(`IFCRELAGGREGATES(${G('agg3')},${owner},$,$,${building},(${storeys.map((s) => s.id).join(',')}))`)
  storeys.forEach((st, i) => { if (st.items.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${G('cont' + i)},${owner},$,$,(${st.items.join(',')}),${st.id})`) })

  const ifc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');
FILE_NAME('${file}','2026-11-19T09:00:00',('Christian Abad'),('CAB'),'build-cde-ifc','bcn-twin-cde','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
${lines.join('\n')}
ENDSEC;
END-ISO-10303-21;
`
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUT_DIR, file), ifc)
  console.log(`${file}: ${lines.length} entidades`)
}

model({ file: 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', role: 'A', discipline: 'A', description: 'Modelo de arquitectura' })
model({ file: 'BCN01-CAB-ZZ-XX-M3-M-0001.ifc', role: 'M', discipline: 'M', description: 'Modelo de instalaciones' })
fs.writeFileSync(path.join(OUT_DIR, 'indice.json'), JSON.stringify({ origen: ORIGIN, rumbo: GRID_BEARING, planta: { ancho: W, fondo: L, altura: ROOF_Z + 0.35 }, elementos: INDICE }, null, 1))
console.log(`indice.json: ${INDICE.length} elementos`)

// lo que el CDE publica para otros sistemas (el gemelo digital lo lee): proyectos, georreferencia y
// modelos en estado Publicado. En producción lo serviría la API del CDE; aquí, un fichero estático.
const PUB = path.resolve('public/cde/publicados.json')
fs.mkdirSync(path.dirname(PUB), { recursive: true })
fs.writeFileSync(PUB, JSON.stringify({
  cde: 'Entorno común de datos · gemelo digital de Barcelona', norma: 'UNE-EN ISO 19650', generado: '2026-11-19',
  proyectos: [{
    codigo: 'BCN01', nombre: 'Biblioteca de barri Sant Antoni', tipo: 'Equipamiento municipal (ejemplo)', fase: 'Ejecución de obra',
    origen: ORIGIN, rumbo: GRID_BEARING, planta: { ancho: W, fondo: L }, plantas: [{ nom: 'Planta baja', base: 0, top: 4 }, { nom: 'Planta primera', base: 4, top: ROOF_Z }, { nom: 'Cubierta', base: ROOF_Z, top: ROOF_Z + 0.35 }],
    publicados: [{ nombre: 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', titulo: 'Modelo de arquitectura', revision: 'C01', idoneidad: 'A1', url: '/data/cde/BCN01-CAB-ZZ-XX-M3-A-0001.ifc' }],
    enlace: '/cde/',
  }],
}, null, 1))
console.log('cde/publicados.json escrito')
