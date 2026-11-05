// Matemática de teselas (Web Mercator, esquema z/x/y) y fuentes de datos geográficos.
// Sin dependencias de three ni del DOM: lo usan tanto el hilo principal como el worker.
import { toLocal } from './geo.js'
import { S } from './scene3d.js'

export const BASE_Z = 14 // nivel de las teselas de ciudad (OSM vectorial y relieve 5 m de ICGC llegan a z14)

export const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z
export const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}
export const x2lon = (x, z) => (x / 2 ** z) * 360 - 180
export const y2lat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

// [lon,lat] -> escena (x = este, z = -norte), 1 unidad = 100 m
export const sceneXZ = (lon, lat) => {
  const [e, n] = toLocal([lon, lat])
  return [e * S, -n * S]
}
export const SCALE = S

// Zona que se puede cargar (Barcelona + Collserola + puerto + aeropuerto)
export const AREA = { w: 2.045, s: 41.285, e: 2.265, n: 41.47 }
export const tileRange = (z) => ({
  x0: Math.floor(lon2x(AREA.w, z)),
  x1: Math.floor(lon2x(AREA.e, z)),
  y0: Math.floor(lat2y(AREA.n, z)),
  y1: Math.floor(lat2y(AREA.s, z)),
})

// ---- Fuentes
// Relieve: ICGC (modelo de 5 m de Catalunya, codificación terrain-RGB) y, de respaldo, AWS Terrarium (SRTM y otras, global).
export const DEM_SOURCES = {
  icgc: { label: 'ICGC 5 m', url: 'https://geoserveis.icgc.cat/servei/catalunya/contextmaps-terreny-5m-rgb/wmts/{z}/{x}/{y}.png', enc: 'mapbox', maxZ: 14 },
  terrarium: { label: 'AWS Terrarium (SRTM)', url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', enc: 'terrarium', maxZ: 15 },
}

// Imagen aérea / de satélite para teñir el terreno
export const IMAGERY = {
  icgc: { label: 'Ortofoto ICGC (aérea, Catalunya)', url: 'https://geoserveis.icgc.cat/icc_mapesmultibase/noutm/wmts/orto/GRID3857/{z}/{x}/{y}.jpeg', maxZ: 19, attr: 'Ortofoto: Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0)' },
  esri: { label: 'Esri World Imagery (satélite)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZ: 18, attr: 'Imagen: Esri, Maxar, Earthstar Geographics' },
  s2: { label: 'Sentinel-2 cloudless 2020 (EOX, 10 m)', url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg', maxZ: 15, attr: 'Sentinel-2 cloudless 2020 by EOX (CC BY-NC-SA 4.0; contiene datos Copernicus)' },
}

// OSM vectorial (OpenMapTiles) servido por OpenFreeMap, sin clave
export const OSM_TILEJSON = 'https://tiles.openfreemap.org/planet'

export const fill = (tpl, z, x, y) => tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)
