// Geografía esquemática de Barcelona para el gemelo digital.
// Las coordenadas son aproximadas (válidas para una demo visual, no para ingeniería).

export const CENTER = { lon: 2.1734, lat: 41.3851 }
const M_LAT = 110540
const M_LON = 111320 * Math.cos((CENTER.lat * Math.PI) / 180)

// [lon, lat] -> [este, norte] en metros respecto a Plaça Catalunya
export const toLocal = ([lon, lat]) => [(lon - CENTER.lon) * M_LON, (lat - CENTER.lat) * M_LAT]

// Línea de costa (SW -> NE). El mar queda al sureste.
export const COAST = [
  [2.08, 41.28],
  [2.13, 41.323],
  [2.165, 41.342],
  [2.185, 41.373],
  [2.2, 41.385],
  [2.22, 41.405],
  [2.245, 41.425],
  [2.28, 41.45],
]

// Recinto portuario (esquemático)
export const PORT_POLY = [
  [2.156, 41.338],
  [2.17, 41.33],
  [2.188, 41.343],
  [2.186, 41.356],
  [2.175, 41.36],
  [2.165, 41.348],
]
export const PORT_CENTER = [2.172, 41.345]

// Líneas ferroviarias simplificadas (tipo Rodalies)
export const RAIL_LINES = [
  {
    id: 'R1',
    name: 'R1 Litoral',
    color: '#f5a623',
    coords: [
      [2.25, 41.455],
      [2.237, 41.44],
      [2.218, 41.43],
      [2.187, 41.409],
      [2.165, 41.392],
      [2.14, 41.379],
      [2.1, 41.36],
    ],
  },
  {
    id: 'R2',
    name: 'R2 Aeroport',
    color: '#4cc9f0',
    coords: [
      [2.14, 41.379],
      [2.115, 41.35],
      [2.09, 41.32],
      [2.079, 41.297],
    ],
  },
  {
    id: 'R3',
    name: 'R3 Nord',
    color: '#b5179e',
    coords: [
      [2.14, 41.379],
      [2.165, 41.392],
      [2.19, 41.423],
      [2.2, 41.465],
    ],
  },
]

// Rutas de barcos entrando al puerto
export const SHIP_ROUTES = [
  [
    [2.26, 41.32],
    [2.2, 41.335],
    [2.178, 41.342],
  ],
  [
    [2.25, 41.36],
    [2.205, 41.352],
    [2.18, 41.35],
  ],
]

// Puntos negros de tráfico simulados (peso = probabilidad relativa)
export const HOTSPOTS = [
  { name: 'Glòries / Diagonal', lon: 2.19, lat: 41.403, w: 1.4 },
  { name: 'Plaça Espanya', lon: 2.149, lat: 41.375, w: 1.2 },
  { name: 'Ronda de Dalt · Vall d’Hebron', lon: 2.145, lat: 41.426, w: 1.1 },
  { name: 'Meridiana · Sagrera', lon: 2.19, lat: 41.423, w: 1.0 },
  { name: 'Pl. Francesc Macià', lon: 2.152, lat: 41.394, w: 1.0 },
  { name: 'Ronda Litoral · Poblenou', lon: 2.202, lat: 41.4, w: 0.9 },
  { name: 'Zona Franca', lon: 2.14, lat: 41.352, w: 0.8 },
  { name: 'Gran Via · Plaça Universitat', lon: 2.164, lat: 41.386, w: 0.8 },
]

// ---------- Geometría de rutas (para trenes y barcos) ----------
export function buildPath(coords) {
  const pts = coords.map(toLocal)
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  }
  return { coords, pts, cum, length: cum[cum.length - 1] }
}

// Posición a distancia s (metros) a lo largo del recorrido
export function pointAt(path, s) {
  const { coords, pts, cum } = path
  const d = Math.max(0, Math.min(path.length, s))
  let i = 1
  while (i < cum.length - 1 && cum[i] < d) i++
  const seg = cum[i] - cum[i - 1] || 1
  const f = (d - cum[i - 1]) / seg
  const lon = coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f
  const lat = coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f
  const de = pts[i][0] - pts[i - 1][0]
  const dn = pts[i][1] - pts[i - 1][1]
  return { lon, lat, east: de, north: dn }
}

// Ida y vuelta: t en segundos, v en m/s, offset en metros
export function pingPong(path, t, v, offset = 0) {
  const L = path.length
  const raw = (t * v + offset) % (2 * L)
  const forward = raw <= L
  const s = forward ? raw : 2 * L - raw
  const p = pointAt(path, s)
  if (!forward) {
    p.east = -p.east
    p.north = -p.north
  }
  return p
}

export const RAIL_PATHS = RAIL_LINES.map((l) => ({ ...l, path: buildPath(l.coords) }))
export const SHIP_PATHS = SHIP_ROUTES.map((c) => buildPath(c))
