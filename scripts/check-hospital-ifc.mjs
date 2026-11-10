// Comprueba el IFC del hospital: lo abre con web-ifc y lista sus espacios y propiedades.
// Uso: node scripts/check-hospital-ifc.mjs
import fs from 'node:fs'
import * as W from 'web-ifc'
const { readHospital, localToLonLat } = await import('../src/hospitalIfc.js')
const api = new W.IfcAPI()
await api.Init()
const m = api.OpenModel(new Uint8Array(fs.readFileSync('public/data/hospital-clinic-urgencias.ifc')))
const h = readHospital(api, m)
console.log(h.name, h.lat, h.lon, h.trueNorth, h.storey, h.elevation)
for (const s of h.spaces) console.log(s.name, s.longName, s.type, s.x, s.y, s.w, s.l, JSON.stringify(s.psets))
console.log('B1 en', localToLonLat(h, -6, -9))
let meshes = 0; api.StreamAllMeshes(m, () => meshes++); console.log('mallas', meshes)
