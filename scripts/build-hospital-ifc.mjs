// Genera public/data/hospital-clinic-urgencias.ifc: un IFC4 DE EJEMPLO con el muelle de ambulancias
// de Urgencias del Hospital Clínic (los IFC reales del hospital no son públicos).
//   - Georreferenciado: IfcSite con la latitud/longitud de la entrada de urgencias (OpenStreetMap,
//     nodo 7861380641, emergency=emergency_ward_entrance, planta -1) y el norte real del contexto.
//   - Cada bahía es un IfcSpace con PredefinedType .PARKING., geometría (perfil rectangular extruido)
//     y un conjunto de propiedades Pset_BCN_BahiaAmbulancia (tipo SVA/SVB, medidas, acceso al box).
// La app lee este fichero con web-ifc (src/workers/hospitalWorker.js): con el IFC real del hospital
// bastaría con cambiar el fichero. Uso: node scripts/build-hospital-ifc.mjs
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const OUT = path.resolve('public/data/hospital-clinic-urgencias.ifc')

// origen: entrada de urgencias (OSM). Eje X local = dirección de las calles horizontales del Eixample
// (rumbo 44,5°, hacia el Besòs); eje Y = hacia la montaña.
const ORIGIN = { lat: 41.389827, lon: 2.152712 }
const GRID_BEARING = 44.5
const a = (GRID_BEARING * Math.PI) / 180
const TRUE_NORTH = [Math.cos(a), Math.sin(a)] // el norte expresado en ejes locales

// bahías (centro en metros locales, medidas en metros). Disposición ILUSTRATIVA.
const BAYS = [
  { code: 'B1', tipo: 'SVA', x: -6, y: -9, w: 4.0, l: 9.0, box: true, prioridad: 1 },
  { code: 'B2', tipo: 'SVA', x: -10.2, y: -9, w: 4.0, l: 9.0, box: true, prioridad: 2 },
  { code: 'B3', tipo: 'SVB', x: -14.2, y: -9, w: 3.6, l: 8.0, box: false, prioridad: 3 },
  { code: 'B4', tipo: 'SVB', x: -18.0, y: -9, w: 3.6, l: 8.0, box: false, prioridad: 4 },
  { code: 'B5', tipo: 'SVB', x: -21.8, y: -9, w: 3.6, l: 8.0, box: false, prioridad: 5 },
  { code: 'B6', tipo: 'POLIVALENTE', x: -25.6, y: -9, w: 3.6, l: 8.0, box: false, prioridad: 6 },
]
const APRON = { x: -15.8, y: -9, w: 25, l: 15 } // zona de maniobra que contiene las bahías

// ---- utilidades STEP
const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
const guid = () => {
  const b = crypto.randomBytes(22)
  let s = CH[b[0] & 3] // el primer carácter de un GlobalId solo usa 2 bits
  for (let i = 1; i < 22; i++) s += CH[b[i] & 63]
  return `'${s}'`
}
// texto IFC: los caracteres no ASCII van como \X2\hhhh\X0\
const str = (t) => (t == null ? '$' : `'${[...String(t).replace(/'/g, "''")].map((c) => (c.charCodeAt(0) < 128 ? c : `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\`)).join('')}'`)
const num = (v) => (Number.isInteger(v) ? `${v}.` : String(v))
const dms = (deg) => {
  const s = Math.sign(deg), d = Math.abs(deg)
  const D = Math.floor(d), M = Math.floor((d - D) * 60), S = Math.floor(((d - D) * 60 - M) * 60)
  const U = Math.round(((((d - D) * 60 - M) * 60) - S) * 1e6)
  return `(${[D, M, S, U].map((v) => s * v).join(',')})`
}

const lines = []
let n = 0
const add = (s) => { lines.push(`#${++n}= ${s};`); return `#${n}` }

const person = add(`IFCPERSON($,${str('Abad')},${str('Christian')},$,$,$,$,$)`)
const org = add(`IFCORGANIZATION($,${str('bcn-digital-twin')},$,$,$)`)
const po = add(`IFCPERSONANDORGANIZATION(${person},${org},$)`)
const app = add(`IFCAPPLICATION(${org},'0.5',${str('build-hospital-ifc')},'bcn-twin')`)
const owner = add(`IFCOWNERHISTORY(${po},${app},$,.ADDED.,$,$,$,${Math.floor(Date.now() / 1000)})`)

const units = add(`IFCUNITASSIGNMENT((${[
  add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'),
  add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
  add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'),
  add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)'),
].join(',')}))`)

const o3 = add('IFCCARTESIANPOINT((0.,0.,0.))')
const zUp = add('IFCDIRECTION((0.,0.,1.))')
const xDir = add('IFCDIRECTION((1.,0.,0.))')
const world = add(`IFCAXIS2PLACEMENT3D(${o3},${zUp},${xDir})`)
const north = add(`IFCDIRECTION((${TRUE_NORTH.map((v) => v.toFixed(6)).join(',')}))`)
const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},${north})`)
const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`)
const o2 = add('IFCCARTESIANPOINT((0.,0.))')
const prof2d = add(`IFCAXIS2PLACEMENT2D(${o2},$)`)

const project = add(`IFCPROJECT(${guid()},${owner},${str('Hospital Clínic · Urgencias')},${str('Muelle de ambulancias (IFC de ejemplo generado para el gemelo digital de Barcelona)')},$,$,$,(${ctx}),${units})`)

const sitePl = add(`IFCLOCALPLACEMENT($,${world})`)
const site = add(`IFCSITE(${guid()},${owner},${str('Hospital Clínic de Barcelona')},${str('Entrada de urgencias (OpenStreetMap nodo 7861380641)')},$,${sitePl},$,$,.ELEMENT.,${dms(ORIGIN.lat)},${dms(ORIGIN.lon)},45.,$,$)`)
const bldPl = add(`IFCLOCALPLACEMENT(${sitePl},${world})`)
const building = add(`IFCBUILDING(${guid()},${owner},${str('Hospital Clínic')},${str('C/ Villarroel 170, 08036 Barcelona')},$,${bldPl},$,$,.ELEMENT.,$,$,$)`)
const stPl = add(`IFCLOCALPLACEMENT(${bldPl},${add(`IFCAXIS2PLACEMENT3D(${add('IFCCARTESIANPOINT((0.,0.,-4.))')},${zUp},${xDir})`)})`)
const storey = add(`IFCBUILDINGSTOREY(${guid()},${owner},${str('Planta -1')},${str('Urgencias · acceso de ambulancias')},$,${stPl},$,$,.ELEMENT.,-4.)`)

function space(name, longName, x, y, w, l, h, type) {
  const pl = add(`IFCLOCALPLACEMENT(${stPl},${add(`IFCAXIS2PLACEMENT3D(${add(`IFCCARTESIANPOINT((${num(x)},${num(y)},0.))`)},${zUp},${xDir})`)})`)
  const rect = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${prof2d},${num(w)},${num(l)})`)
  const solid = add(`IFCEXTRUDEDAREASOLID(${rect},${world},${zUp},${num(h)})`)
  const rep = add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`)
  const shape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`)
  return add(`IFCSPACE(${guid()},${owner},${str(name)},$,$,${pl},${shape},${str(longName)},.ELEMENT.,.${type}.,$)`)
}
const prop = (k, v) => add(`IFCPROPERTYSINGLEVALUE(${str(k)},$,${v},$)`)

const apron = space('MUELLE', 'Muelle de ambulancias', APRON.x, APRON.y, APRON.w, APRON.l, 0.05, 'EXTERNAL')
const bays = BAYS.map((b) => {
  const id = space(b.code, `Bahía ${b.code.slice(1)} · ${b.tipo}`, b.x, b.y, b.w, b.l, 3.2, 'PARKING')
  const pset = add(`IFCPROPERTYSET(${guid()},${owner},'Pset_BCN_BahiaAmbulancia',$,(${[
    prop('Codigo', `IFCIDENTIFIER(${str(b.code)})`),
    prop('TipoUnidad', `IFCLABEL(${str(b.tipo)})`),
    prop('Anchura', `IFCLENGTHMEASURE(${num(b.w)})`),
    prop('Longitud', `IFCLENGTHMEASURE(${num(b.l)})`),
    prop('AccesoDirectoBoxCriticos', `IFCBOOLEAN(.${b.box ? 'T' : 'F'}.)`),
    prop('Prioridad', `IFCINTEGER(${b.prioridad})`),
  ].join(',')}))`)
  add(`IFCRELDEFINESBYPROPERTIES(${guid()},${owner},$,$,(${id}),${pset})`)
  return id
})

add(`IFCRELAGGREGATES(${guid()},${owner},$,$,${project},(${site}))`)
add(`IFCRELAGGREGATES(${guid()},${owner},$,$,${site},(${building}))`)
add(`IFCRELAGGREGATES(${guid()},${owner},$,$,${building},(${storey}))`)
add(`IFCRELAGGREGATES(${guid()},${owner},$,$,${storey},(${[apron, ...bays].join(',')}))`)

const now = new Date().toISOString().slice(0, 19)
const ifc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');
FILE_NAME('hospital-clinic-urgencias.ifc','${now}',('Christian Abad'),('bcn-digital-twin'),'build-hospital-ifc','bcn-digital-twin','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
${lines.join('\n')}
ENDSEC;
END-ISO-10303-21;
`
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, ifc)
console.log(`IFC escrito: ${OUT} (${lines.length} entidades, ${BAYS.length} bahías)`)
