// Capa OPCIONAL de teselas 3D hiperrealistas (formato OGC 3D Tiles) sobre MapLibre, con deck.gl.
// Fuentes posibles:
//  - VITE_TILES3D_URL: un tileset.json propio (p. ej. el modelo 3D de Barcelona convertido y subido a R2);
//  - VITE_GOOGLE_MAPS_KEY: Photorealistic 3D Tiles de Google (mallas fotogramétricas de toda la ciudad).
// Solo se descarga este código al activar la capa. El detalle (error de pantalla) y la memoria se
// ajustan al perfil del dispositivo para no saturar la GPU en móviles.
const GOOGLE_ROOT = 'https://tile.googleapis.com/v1/3dtiles/root.json'

const BUDGET = {
  low: { sse: 24, mem: 128 },
  mid: { sse: 12, mem: 384 },
  high: { sse: 6, mem: 1024 },
}

export async function enableTiles3D(map, { url, googleKey, tier = 'mid', onCredits }) {
  const [{ MapboxOverlay }, { Tile3DLayer }, { Tiles3DLoader }] = await Promise.all([
    import('@deck.gl/mapbox'),
    import('@deck.gl/geo-layers'),
    import('@loaders.gl/3d-tiles'),
  ])
  const b = BUDGET[tier] || BUDGET.mid
  const google = !url && googleKey
  const credits = new Set()
  const layer = new Tile3DLayer({
    id: 'bcn-3dtiles',
    data: google ? GOOGLE_ROOT : url,
    loader: Tiles3DLoader,
    pointSize: 2,
    loadOptions: {
      ...(google ? { fetch: { headers: { 'X-GOOG-API-KEY': googleKey } } } : {}),
      tileset: { maximumScreenSpaceError: b.sse, maximumMemoryUsage: b.mem, viewDistanceScale: tier === 'low' ? 0.6 : 1 },
    },
    onTilesetLoad: (ts) => {
      ts.options.maximumScreenSpaceError = b.sse
      ts.options.maximumMemoryUsage = b.mem
    },
    onTileLoad: (tile) => {
      // Google exige mostrar los créditos de las teselas visibles
      const c = tile?.content?.gltf?.asset?.copyright
      if (c) {
        c.split(';').forEach((x) => credits.add(x.trim()))
        onCredits?.([...credits].join(' · '))
      }
    },
  })
  const overlay = new MapboxOverlay({ interleaved: false, layers: [layer] })
  map.addControl(overlay)
  return () => {
    try {
      map.removeControl(overlay)
    } catch {
      /* el mapa ya no existe */
    }
  }
}
