// GIS del CDE: el edificio georreferenciado desde el IfcSite, sobre el relieve real del ICGC (5 m),
// con sus plantas extruidas, la parcela y los sensores en tiempo real.
import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { localToLonLat } from '../hospitalGeo.js'
import { DEM_SOURCES } from '../tileMath.js'

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const fc = (features) => ({ type: 'FeatureCollection', features })
// cota del terreno en un punto: se lee el píxel de la tesela de relieve del ICGC (terrain-RGB, 5 m)
async function cotaICGC(lon, lat, z = 14) {
  const n = 2 ** z
  const fx = ((lon + 180) / 360) * n
  const fy = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  const [tx, ty] = [Math.floor(fx), Math.floor(fy)]
  const url = DEM_SOURCES.icgc.url.replace('{z}', z).replace('{x}', tx).replace('{y}', ty)
  const img = await createImageBitmap(await (await fetch(url)).blob())
  const c = new OffscreenCanvas(img.width, img.height)
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  const [r, gr, b] = g.getImageData(Math.floor((fx - tx) * img.width), Math.floor((fy - ty) * img.height), 1, 1).data
  return -10000 + (r * 65536 + gr * 256 + b) * 0.1
}
const rect = (h, x, y, w, l) => ({ type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => localToLonLat(h, x + (a * w) / 2, y + (b * l) / 2))] })

export default function CdeMap({ indice, sensores, onGemelo }) {
  const ref = useRef(null)
  const map = useRef(null)
  const [ready, setReady] = useState(false)
  const [cota, setCota] = useState(null)
  const geo = indice && { lat: indice.origen.lat, lon: indice.origen.lon, trueNorth: [Math.cos((indice.rumbo * Math.PI) / 180), Math.sin((indice.rumbo * Math.PI) / 180)] }

  useEffect(() => {
    if (!geo) return
    const m = new maplibregl.Map({ container: ref.current, style: STYLE, center: [geo.lon, geo.lat], zoom: 18, pitch: 60, bearing: -25, attributionControl: { compact: true }, maxPitch: 80 })
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    m.on('load', () => {
      m.addSource('dem', { type: 'raster-dem', tiles: [DEM_SOURCES.icgc.url], tileSize: 256, maxzoom: DEM_SOURCES.icgc.maxZ, encoding: 'mapbox', attribution: 'Relieve: ICGC (CC BY 4.0)' })
      // el relieve se activa cuando el mapa ya se ve (las teselas del ICGC pueden tardar)
      m.once('idle', () => m.setTerrain({ source: 'dem', exaggeration: 1.4 }))
      // los edificios del mapa base, en segundo plano: el protagonista es el modelo
      for (const l of m.getStyle().layers) if (l.type === 'fill-extrusion') { m.setPaintProperty(l.id, 'fill-extrusion-opacity', 0.35); m.setPaintProperty(l.id, 'fill-extrusion-color', '#c9ccd2') }
      const P = indice.planta
      m.addSource('parcela', { type: 'geojson', data: rect(geo, 0, 0, P.ancho + 10, P.fondo + 10) })
      m.addLayer({ id: 'parcela', type: 'line', source: 'parcela', paint: { 'line-color': '#184f95', 'line-width': 3, 'line-dasharray': [2, 1.5] } })
      // plantas del edificio (alturas del modelo IFC)
      const plantas = [{ base: 0, top: 4, nom: 'Planta baja', color: '#f0a92e' }, { base: 4, top: 7.6, nom: 'Planta primera', color: '#f6c35a' }, { base: 7.6, top: 7.95, nom: 'Cubierta', color: '#5b6270' }]
      m.addSource('edificio', { type: 'geojson', data: fc(plantas.map((p) => ({ type: 'Feature', properties: p, geometry: rect(geo, 0, 0, P.ancho, P.fondo) }))) })
      m.addLayer({ id: 'edificio', type: 'fill-extrusion', source: 'edificio', paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'top'], 'fill-extrusion-opacity': 0.95 } })
      m.addSource('sensores', { type: 'geojson', data: fc([]) })
      m.addLayer({ id: 'sensores', type: 'circle', source: 'sensores', paint: { 'circle-radius': 9, 'circle-color': ['case', ['get', 'alerta'], '#ff4d5e', '#34c77b'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
      m.addLayer({ id: 'sensores-t', type: 'symbol', source: 'sensores', layout: { 'text-field': ['get', 'txt'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#101828', 'text-halo-color': '#fff', 'text-halo-width': 1.6 } })
      setReady(true)
      cotaICGC(geo.lon, geo.lat).then(setCota).catch(() => setCota(null))
    })
    // se reajusta si cambia el tamaño del recuadro (pestañas, panel lateral, ventana)
    const ro = new ResizeObserver(() => m.resize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); m.remove() }
  }, [indice]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !indice) return
    const pos = { 'SE-001': [-4.5, -3.5], 'SE-002': [-4.5, 5.5], 'SE-003': [-4.5, 0], 'SE-004': [7.5, 0] }
    map.current.getSource('sensores').setData(fc(sensores.map((s) => ({ type: 'Feature', properties: { alerta: !!s.alerta, txt: `${String(s.temp).replace('.', ',')}°` }, geometry: { type: 'Point', coordinates: localToLonLat(geo, ...(pos[s.codigo] || [0, 0])) } }))))
  }, [ready, sensores]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!indice) return <div className="cde-msg">Cargando la georreferencia del modelo…</div>
  return (
    <div className="cde-map">
      <div ref={ref} className="cde-map-c" />
      <div className="cde-geo">
        <b>Georreferencia del IFC</b>
        <span>IfcSite: {indice.origen.lat.toFixed(6)}, {indice.origen.lon.toFixed(6)}</span>
        <span>Norte real: {indice.rumbo}° respecto a la trama del Eixample</span>
        <span>Cota en el IfcSite: {String(indice.origen.cota ?? '—').replace('.', ',')} m · terreno ICGC: {cota != null ? `${cota.toFixed(1).replace('.', ',')} m` : '…'}</span>
        <button className="btn" onClick={() => onGemelo?.({ lon: indice.origen.lon, lat: indice.origen.lat, t: Date.now() })}>Ver en el gemelo de Barcelona</button>
      </div>
    </div>
  )
}
