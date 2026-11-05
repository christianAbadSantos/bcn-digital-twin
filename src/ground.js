// Cota del terreno REAL (DEM) en coordenadas de escena, a partir de las teselas ya cargadas.
// Si la tesela aún no está, devuelve null y quien llama usa su valor por defecto.
import { CENTER, toLocal } from './geo.js'
import { S } from './scene3d.js'
import { BASE_Z, lon2x, lat2y } from './tileMath.js'

const [M_LON] = toLocal([CENTER.lon + 1, CENTER.lat])
const [, M_LAT] = toLocal([CENTER.lon, CENTER.lat + 1])
export const sceneToLonLat = (x, z) => [CENTER.lon + x / S / M_LON, CENTER.lat - z / S / M_LAT]

const tiles = new Map() // "x/y" -> { heights, V }
export const groundTiles = {
  set: (x, y, heights, V) => tiles.set(`${x}/${y}`, { heights, V }),
  delete: (x, y) => tiles.delete(`${x}/${y}`),
  clear: () => tiles.clear(),
  get size() { return tiles.size },
}

// altura en metros sobre el nivel del mar, o null
export function elevAtLonLat(lon, lat) {
  const fx = lon2x(lon, BASE_Z)
  const fy = lat2y(lat, BASE_Z)
  const t = tiles.get(`${Math.floor(fx)}/${Math.floor(fy)}`)
  if (!t) return null
  const N = t.V - 1
  const u = (fx - Math.floor(fx)) * N
  const v = (fy - Math.floor(fy)) * N
  const i = Math.min(N - 1, Math.floor(u)), j = Math.min(N - 1, Math.floor(v))
  const tx = u - i, ty = v - j
  const h = t.heights
  const a = h[j * t.V + i], b = h[j * t.V + i + 1], c = h[(j + 1) * t.V + i], d = h[(j + 1) * t.V + i + 1]
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}

// en unidades de escena
export function groundY(x, z) {
  const [lon, lat] = sceneToLonLat(x, z)
  const h = elevAtLonLat(lon, lat)
  return h == null ? null : h * S
}
