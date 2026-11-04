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

// Recinto portuario (APROXIMADO, trazado a mano: del Port Vell al Moll Prat siguiendo la costa).
// No sale de datos oficiales: ajusta los vértices si quieres más precisión.
export const PORT_POLY = [
  [2.1795, 41.377],
  [2.19, 41.364],
  [2.196, 41.352],
  [2.19, 41.344],
  [2.17, 41.33],
  [2.148, 41.319],
  [2.14, 41.32],
  [2.148, 41.335],
  [2.165, 41.35],
  [2.1745, 41.364],
]
// Puntos de interés del puerto (posiciones APROXIMADAS, sin verificar sobre el mapa)
export const PORT_PINS = [
  { name: 'Port Vell', lon: 2.1835, lat: 41.3755 },
  { name: 'Moll Adossat · cruceros', lon: 2.1855, lat: 41.356 },
  { name: 'Terminales de contenedores · Moll Prat', lon: 2.149, lat: 41.3265 },
]
export const PORT_BOUNDS = [[2.138, 41.317], [2.198, 41.379]] // [oeste, sur], [este, norte]
export const PORT_CENTER = [2.172, 41.345]

// Líneas de metro ESQUEMÁTICAS: cada vértice es una estación aproximada.
// Sirven para la demo visual y para el cálculo de rutas, no para planificar un viaje real.
export const RAIL_LINES = [
  {
    id: 'L1',
    name: 'L1',
    color: '#e2231a',
    coords: [
      [2.1486, 41.375],
      [2.1646, 41.3862],
      [2.1731, 41.3895],
      [2.1807, 41.3914],
      [2.1881, 41.3984],
      [2.19, 41.403],
      [2.1872, 41.4105],
      [2.189, 41.4225],
      [2.1865, 41.4297],
    ],
  },
  {
    id: 'L3',
    name: 'L3',
    color: '#00a651',
    coords: [
      [2.1129, 41.3863],
      [2.14, 41.379],
      [2.1486, 41.375],
      [2.17, 41.3745],
      [2.1735, 41.38],
      [2.17, 41.387],
      [2.165, 41.392],
      [2.153, 41.403],
      [2.15, 41.413],
      [2.1436, 41.4262],
    ],
  },
  {
    id: 'L4',
    name: 'L4',
    color: '#ffc20e',
    coords: [
      [2.209, 41.4094],
      [2.2006, 41.404],
      [2.196, 41.399],
      [2.192, 41.3945],
      [2.1895, 41.388],
      [2.189, 41.38],
      [2.1775, 41.3835],
      [2.1731, 41.3895],
      [2.168, 41.395],
      [2.166, 41.403],
    ],
  },
  {
    id: 'L9',
    name: 'L9 Sud · Aeroport',
    color: '#f68b1f',
    coords: [
      [2.0711, 41.2945],
      [2.098, 41.318],
      [2.123, 41.356],
      [2.1129, 41.3863],
    ],
  },
]

// Lugares de referencia para el recomendador de rutas
export const PLACES = [
  { id: 'sagrada', name: 'Sagrada Família', lon: 2.1744, lat: 41.4036 },
  { id: 'catalunya', name: 'Plaça Catalunya', lon: 2.17, lat: 41.387 },
  { id: 'aeroport', name: 'Aeroport T1', lon: 2.0711, lat: 41.2945 },
  { id: 'portvell', name: 'Port Vell', lon: 2.183, lat: 41.375 },
  { id: 'glories', name: 'Glòries', lon: 2.19, lat: 41.403 },
  { id: 'espanya', name: 'Plaça Espanya', lon: 2.1486, lat: 41.375 },
  { id: 'vallhebron', name: 'Vall d’Hebron', lon: 2.1436, lat: 41.4262 },
  { id: 'campnou', name: 'Camp Nou', lon: 2.1228, lat: 41.3809 },
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

// Puntos negros REALES: los 8 puntos de Barcelona con más accidentes gestionados por la Guàrdia Urbana en 2024
// (celdas de ~250 m, separados al menos 700 m). `acc` = accidentes a menos de 300 m del punto.
// Fuente: Open Data BCN, "Accidents gestionats per la Guàrdia Urbana a la ciutat de Barcelona" (2024).
// `w` (peso) = 0,6 + 0,8 × acc / máximo, y alimenta la simulación de tráfico.
export const HOTSPOTS = [
  { name: 'Corts Catalanes / Gràcia', barri: 'la Dreta de l’Eixample', lon: 2.1675, lat: 41.3889, w: 1.4, acc: 123 },
  { name: 'Corts Catalanes / Marina', barri: 'el Fort Pienc', lon: 2.1798, lat: 41.3981, w: 1.17, acc: 88 },
  { name: 'Aragó / Comte d’Urgell', barri: 'l’Antiga Esquerra de l’Eixample', lon: 2.1553, lat: 41.3853, w: 1.15, acc: 84 },
  { name: 'Ronda de Dalt (B-20) / Tibidabo', barri: 'Sant Gervasi - la Bonanova', lon: 2.1348, lat: 41.4148, w: 1.15, acc: 84 },
  { name: 'Diagonal / Sarrià', barri: 'les Corts', lon: 2.1373, lat: 41.3909, w: 1.04, acc: 67 },
  { name: 'Madrid / Brasil', barri: 'Sants - Badal', lon: 2.1297, lat: 41.3796, w: 1.02, acc: 65 },
  { name: 'Diagonal / Reina Maria Cristina', barri: 'les Corts', lon: 2.1278, lat: 41.3885, w: 1.02, acc: 65 },
  { name: 'Vall d’Hebron / Ronda de Dalt', barri: 'la Teixonera', lon: 2.1421, lat: 41.4242, w: 0.98, acc: 58 },
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
