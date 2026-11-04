// Capa OPCIONAL de teselas 3D (formato 3D Tiles: tileset.json) sobre MapLibre, con deck.gl.
// Solo se descarga este código si activas la capa Y hay una URL en VITE_TILES3D_URL.
// Pesa mucho en GPU: por eso va detrás de un interruptor.
export async function enableTiles3D(map, url) {
  const [{ MapboxOverlay }, { Tile3DLayer }, { Tile3DLoader }] = await Promise.all([
    import('@deck.gl/mapbox'),
    import('@deck.gl/geo-layers'),
    import('@loaders.gl/3d-tiles'),
  ])
  const overlay = new MapboxOverlay({
    interleaved: false,
    layers: [new Tile3DLayer({ id: 'bcn-3dtiles', data: url, loader: Tile3DLoader, pointSize: 2 })],
  })
  map.addControl(overlay)
  return () => {
    try {
      map.removeControl(overlay)
    } catch {
      /* el mapa ya no existe */
    }
  }
}
