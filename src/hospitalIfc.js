// Lectura del IFC del hospital con web-ifc: de cada IfcSpace saca su nombre, tipo, posición, medidas
// (perfil rectangular extruido) y propiedades (Pset_BCN_BahiaAmbulancia), y del IfcSite la latitud y
// longitud de referencia y el norte real. Así las bahías del mapa salen del modelo BIM, no del código.
// Se usa en el worker (src/workers/hospitalWorker.js) y se puede probar en Node.
import { IFCSITE, IFCSPACE, IFCRELDEFINESBYPROPERTIES, IFCGEOMETRICREPRESENTATIONCONTEXT, IFCBUILDINGSTOREY } from 'web-ifc'

// web-ifc devuelve los valores envueltos ({ value } o { _representationValue }, según el tipo)
const val = (v) => (v && typeof v === 'object' ? ('value' in v ? v.value : '_representationValue' in v ? v._representationValue : v) : v)
// ángulo compuesto IFC (grados, minutos, segundos, millonésimas) → grados decimales
const fromDms = (c) => {
  const arr = val(c)
  const p = (Array.isArray(arr) ? arr : []).map((x) => Number(val(x)))
  if (!p.length) return null
  const s = p.find((x) => x !== 0) < 0 ? -1 : 1
  const [d = 0, m = 0, sec = 0, u = 0] = p.map(Math.abs)
  return s * (d + m / 60 + (sec + u / 1e6) / 3600)
}

// texto IFC (\X2\00ED\X0\ → í)
export const ifcText = (t) => String(val(t) ?? '').replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, h) => h.match(/.{4}/g).map((x) => String.fromCharCode(parseInt(x, 16))).join(''))

export function readHospital(api, model) {
  const first = (type) => {
    const ids = api.GetLineIDsWithType(model, type)
    return ids.size() ? api.GetLine(model, ids.get(0), true) : null
  }
  const site = first(IFCSITE)
  const ctx = first(IFCGEOMETRICREPRESENTATIONCONTEXT)
  const storey = first(IFCBUILDINGSTOREY)
  const tn = ctx?.TrueNorth?.DirectionRatios?.map((x) => Number(val(x))) || [0, 1]

  // propiedades por objeto
  const props = new Map()
  const rels = api.GetLineIDsWithType(model, IFCRELDEFINESBYPROPERTIES)
  for (let i = 0; i < rels.size(); i++) {
    const rel = api.GetLine(model, rels.get(i), true)
    const pset = rel.RelatingPropertyDefinition
    const kv = {}
    for (const p of pset?.HasProperties || []) kv[ifcText(p.Name)] = val(p.NominalValue)
    for (const o of rel.RelatedObjects || []) {
      const id = o.expressID ?? val(o)
      props.set(id, { ...(props.get(id) || {}), [ifcText(pset.Name)]: kv })
    }
  }

  const spaces = []
  const ids = api.GetLineIDsWithType(model, IFCSPACE)
  for (let i = 0; i < ids.size(); i++) {
    const s = api.GetLine(model, ids.get(i), true)
    const loc = s.ObjectPlacement?.RelativePlacement?.Location?.Coordinates?.map((x) => Number(val(x))) || [0, 0, 0]
    const item = s.Representation?.Representations?.[0]?.Items?.[0]
    const prof = item?.SweptArea
    spaces.push({
      id: s.expressID,
      guid: val(s.GlobalId),
      name: ifcText(s.Name),
      longName: ifcText(s.LongName),
      type: val(s.PredefinedType), // PARKING = bahía
      x: loc[0],
      y: loc[1],
      w: Number(val(prof?.XDim) || 0),
      l: Number(val(prof?.YDim) || 0),
      h: Number(val(item?.Depth) || 0),
      psets: props.get(s.expressID) || {},
    })
  }
  return {
    name: ifcText(site?.Name),
    lat: fromDms(site?.RefLatitude),
    lon: fromDms(site?.RefLongitude),
    trueNorth: tn,
    storey: ifcText(storey?.Name),
    elevation: Number(val(storey?.Elevation) || 0),
    spaces,
  }
}

export { localToLonLat, spacePolygon } from './hospitalGeo.js'
