// Geometría del IFC del hospital en el mapa (sin web-ifc: así no entra en el paquete principal).

// metros locales del IFC → [lon, lat] (plano tangente; de sobra para un hospital)
export function localToLonLat(h, x, y) {
  const [nx, ny] = h.trueNorth // el norte en ejes locales
  const north = x * nx + y * ny
  const east = x * ny - y * nx
  const R = 6378137
  return [h.lon + (east / (R * Math.cos((h.lat * Math.PI) / 180))) * (180 / Math.PI), h.lat + (north / R) * (180 / Math.PI)]
}

// rectángulo de un espacio → polígono GeoJSON
export function spacePolygon(h, s) {
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => localToLonLat(h, s.x + (a * s.w) / 2, s.y + (b * s.l) / 2))
  return { type: 'Polygon', coordinates: [c] }
}
