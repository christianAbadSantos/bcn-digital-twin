import React, { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { CENTER, PORT_POLY, RAIL_PATHS, SHIP_PATHS, RAIL_LINES, pingPong } from './geo.js'

const empty = { type: 'FeatureCollection', features: [] }
const pt = (lon, lat, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } })

function accidentsGeo(accidents, from, to) {
  return {
    type: 'FeatureCollection',
    features: accidents.filter((a) => a.hourIdx >= from && a.hourIdx <= to).map((a) => pt(a.lon, a.lat, { sev: a.sev })),
  }
}

function setVis(map, ids, on) {
  ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'))
}

export default function MapboxTwin({ data, hour, layers, token, onToken }) {
  const box = useRef(null)
  const mapRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const dataRef = useRef(data)
  dataRef.current = data

  // Crear el mapa
  useEffect(() => {
    if (!token) return
    mapboxgl.accessToken = token
    let map
    try {
      map = new mapboxgl.Map({
        container: box.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [CENTER.lon, CENTER.lat],
        zoom: 12.4,
        pitch: 62,
        bearing: -25,
        antialias: true,
      })
    } catch (e) {
      setError(String(e.message || e))
      return
    }
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-left')
    map.on('error', (e) => {
      const msg = e?.error?.message || ''
      if (/401|Unauthorized|access token/i.test(msg)) setError('Token de Mapbox no válido. Revisa que sea un token público (pk.…).')
    })

    let raf = 0
    let last = 0

    map.on('load', () => {
      // Edificios 3D
      map.addLayer({
        id: 'buildings3d',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 12.5,
        paint: {
          'fill-extrusion-color': '#2a3547',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'min_height'],
          'fill-extrusion-opacity': 0.88,
        },
      })

      // Puerto
      map.addSource('port', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...PORT_POLY, PORT_POLY[0]]] } } })
      map.addLayer({ id: 'port-fill', type: 'fill', source: 'port', paint: { 'fill-color': '#3a86ff', 'fill-opacity': 0.25 } })
      map.addLayer({ id: 'port-line', type: 'line', source: 'port', paint: { 'line-color': '#3a86ff', 'line-width': 1.5 } })

      // Líneas de tren
      map.addSource('rails', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: RAIL_LINES.map((l) => ({ type: 'Feature', properties: { color: l.color }, geometry: { type: 'LineString', coordinates: l.coords } })),
        },
      })
      map.addLayer({ id: 'rails-line', type: 'line', source: 'rails', paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.9 } })

      // Trenes y barcos animados
      map.addSource('trains', { type: 'geojson', data: empty })
      map.addLayer({ id: 'trains-dot', type: 'circle', source: 'trains', paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
      map.addSource('ships', { type: 'geojson', data: empty })
      map.addLayer({ id: 'ships-dot', type: 'circle', source: 'ships', paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-color': '#3a86ff', 'circle-stroke-width': 3 } })

      // Accidentes: mapa de calor de toda la semana + puntos de la ventana actual
      map.addSource('acc-all', { type: 'geojson', data: accidentsGeo(dataRef.current.accidents, 0, 1e9) })
      map.addLayer({
        id: 'acc-heat',
        type: 'heatmap',
        source: 'acc-all',
        paint: {
          'heatmap-radius': 28,
          'heatmap-opacity': 0.55,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.3, '#ffd166', 0.6, '#ff9f1c', 1, '#ff4d6d'],
        },
      })
      map.addSource('acc-now', { type: 'geojson', data: empty })
      map.addLayer({
        id: 'acc-now-dot',
        type: 'circle',
        source: 'acc-now',
        paint: {
          'circle-radius': 8,
          'circle-color': ['match', ['get', 'sev'], 'grave', '#ff4d6d', 'moderado', '#ff9f1c', '#ffd166'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.95,
        },
      })

      // Radar de lluvia real (RainViewer)
      fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then((r) => r.json())
        .then((j) => {
          const frames = j?.radar?.past
          if (!frames?.length) return
          const f = frames[frames.length - 1]
          map.addSource('radar', {
            type: 'raster',
            tiles: [`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`],
            tileSize: 256,
            maxzoom: 7,
          })
          map.addLayer({ id: 'radar', type: 'raster', source: 'radar', paint: { 'raster-opacity': 0.65 } }, 'port-fill')
        })
        .catch(() => {})

      setReady(true)

      // Bucle de animación (~15 fps)
      const loop = (now) => {
        raf = requestAnimationFrame(loop)
        if (now - last < 66) return
        last = now
        const t = now / 1000
        const trains = []
        RAIL_PATHS.forEach((l, li) => {
          for (let k = 0; k < 3; k++) {
            const p = pingPong(l.path, t, 22, (k * l.path.length * 2) / 3 + li * 500)
            trains.push(pt(p.lon, p.lat, { color: l.color }))
          }
        })
        map.getSource('trains')?.setData({ type: 'FeatureCollection', features: trains })
        const ships = []
        SHIP_PATHS.forEach((path, i) => {
          const p = pingPong(path, t, 9, i * 3000)
          ships.push(pt(p.lon, p.lat))
        })
        map.getSource('ships')?.setData({ type: 'FeatureCollection', features: ships })
      }
      raf = requestAnimationFrame(loop)
    })

    return () => {
      cancelAnimationFrame(raf)
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [token])

  // Accidentes de las últimas 6 h respecto a la hora seleccionada
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource('acc-now')?.setData(accidentsGeo(data.accidents, hour - 6, hour))
  }, [ready, hour, data])

  // Capas visibles
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    setVis(map, ['acc-heat', 'acc-now-dot'], layers.accidents)
    setVis(map, ['rails-line', 'trains-dot'], layers.rail)
    setVis(map, ['port-fill', 'port-line', 'ships-dot'], layers.port)
    setVis(map, ['radar'], layers.rain)
  }, [ready, layers])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {!token && (
        <div className="gate">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Hace falta un token de Mapbox</h3>
            <p className="muted">
              Crea uno gratis en <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer">account.mapbox.com</a> y pega aquí el token público (empieza por <code>pk.</code>). Se guarda solo en tu navegador.
            </p>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="pk.eyJ1Ijoi…" />
            <button className="btn" onClick={() => draft.trim().startsWith('pk.') && onToken(draft.trim())}>Usar token</button>
          </div>
        </div>
      )}
      {error && <div className="badge err">{error}</div>}
      {!error && token && <div className="badge">Radar: RainViewer · Trenes y barcos: simulados</div>}
    </div>
  )
}
