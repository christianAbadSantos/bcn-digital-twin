import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CENTER, PORT_BOUNDS, PORT_PINS, PORT_POLY, RAIL_LINES } from './geo.js'
import { createMetroLayer } from './metroLayer.js'
import { createTreesLayer } from './treesLayer.js'

// Mapa libre: teselas vectoriales de OpenStreetMap servidas por OpenFreeMap (sin clave).
const STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const EMPTY = { type: 'FeatureCollection', features: [] }
const pt = (lon, lat, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } })
const SEV_COLOR = ['match', ['get', 'sev'], 'crit', '#e5173f', 'warn', '#f08c00', '#2f80ed']

// qué capas del mapa controla cada interruptor
const GROUPS = {
  bld3d: ['bld3d'],
  metro: ['metro-line', 'metro-stations', 'metro3d'],
  trees: ['trees3d'],
  traffic: ['zones-circle'],
  accidents: ['acc-heat', 'acc-now-dot', 'inc-halo', 'inc-dot'],
  alerts: ['alerts-ring'],
  rain: ['radar'],
  port: ['port-fill', 'port-line'],
}


// El estilo base (OpenFreeMap "liberty") es claro: lo oscurecemos por código para que case con la interfaz.
// Se decide por el nombre de cada capa; si alguna propiedad no existe se ignora.
function darkenBase(map) {
  const set = (id, prop, val) => { try { map.setPaintProperty(id, prop, val) } catch { /* sin esa propiedad */ } }
  for (const l of map.getStyle().layers) {
    const id = l.id
    if (l.type === 'background') set(id, 'background-color', '#0b0d11')
    else if (l.type === 'fill') {
      const c = /water|ocean|sea|lake|river/i.test(id) ? '#0d1b2a'
        : /park|wood|forest|grass|green|landcover|garden|pitch|golf|cemetery|scrub/i.test(id) ? '#0f1a15'
        : /building/i.test(id) ? '#171a20'
        : /aeroway|runway|taxiway/i.test(id) ? '#1b1f27'
        : '#12151a'
      set(id, 'fill-color', c)
    } else if (l.type === 'line') {
      const c = /water|river|stream|canal/i.test(id) ? '#102338'
        : /motorway|trunk|primary/i.test(id) ? '#3a4152'
        : /secondary|tertiary/i.test(id) ? '#2d3340'
        : /rail|transit|subway/i.test(id) ? '#232831'
        : /boundary|admin/i.test(id) ? '#2a2f3a'
        : /road|street|path|bridge|tunnel|service|minor|link|pedestrian|track/i.test(id) ? '#252a35'
        : null
      if (c) set(id, 'line-color', c)
    } else if (l.type === 'symbol') {
      set(id, 'text-color', '#8d96a6')
      set(id, 'text-halo-color', '#0b0d11')
    }
  }
}

function accidentsGeo(accidents, from, to) {
  return { type: 'FeatureCollection', features: accidents.filter((a) => a.hourIdx >= from && a.hourIdx <= to).map((a) => pt(a.lon, a.lat, { sev: a.sev })) }
}

export default function MapTwin({ data, hour, layers, live, focus, route, tilesUrl }) {
  const box = useRef(null)
  const mapRef = useRef(null)
  const liveRef = useRef(live)
  const dataRef = useRef(data)
  liveRef.current = live
  dataRef.current = data
  const [ready, setReady] = useState(false)
  const [msg, setMsg] = useState('')
  const [trees, setTrees] = useState(null)
  const portPins = useRef([])

  // ---- crear el mapa una vez
  useEffect(() => {
    const map = new maplibregl.Map({
      container: box.current,
      style: STYLE,
      center: [CENTER.lon, CENTER.lat],
      zoom: 12.6,
      pitch: 60,
      bearing: -20,
      maxPitch: 80,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl(), 'top-left')
    map.on('error', (e) => {
      const m = e?.error?.message || ''
      if (/style|openfreemap|Failed to fetch/i.test(m)) setMsg('No se pudo cargar el mapa base (OpenFreeMap). Revisa la conexión.')
    })

    map.on('load', () => {
      const style = map.getStyle()
      try { darkenBase(map) } catch { /* si falla, queda el estilo claro */ }
      // el estilo trae sus propios edificios 3D: los ocultamos y dibujamos los nuestros (con interruptor)
      style.layers.filter((l) => l.type === 'fill-extrusion').forEach((l) => map.setLayoutProperty(l.id, 'visibility', 'none'))
      const vec = Object.keys(style.sources).find((k) => style.sources[k].type === 'vector')
      if (vec) {
        map.addLayer({
          id: 'bld3d',
          type: 'fill-extrusion',
          source: vec,
          'source-layer': 'building',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#232a38', 60, '#3a4660'],
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.92,
          },
        })
      }

      // metro: líneas + estaciones
      map.addSource('metro', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: RAIL_LINES.map((l) => ({ type: 'Feature', properties: { color: l.color }, geometry: { type: 'LineString', coordinates: l.coords } })) },
      })
      map.addLayer({ id: 'metro-line', type: 'line', source: 'metro', paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.9 } })
      map.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: RAIL_LINES.flatMap((l) => l.coords.map((c) => pt(c[0], c[1], { color: l.color }))) } })
      map.addLayer({ id: 'metro-stations', type: 'circle', source: 'stations', minzoom: 12, paint: { 'circle-radius': 3.5, 'circle-color': '#fff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2 } })

      // puerto
      map.addSource('port', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...PORT_POLY, PORT_POLY[0]]] } } })
      map.addLayer({ id: 'port-fill', type: 'fill', source: 'port', paint: { 'fill-color': '#4cc9f0', 'fill-opacity': 0.08 } })
      map.addLayer({ id: 'port-line', type: 'line', source: 'port', paint: { 'line-color': '#4cc9f0', 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.8 } })

      // accidentes históricos simulados (mapa de calor de la semana + ventana de 6 h)
      map.addSource('acc-all', { type: 'geojson', data: accidentsGeo(dataRef.current.accidents, 0, 1e9) })
      map.addLayer({ id: 'acc-heat', type: 'heatmap', source: 'acc-all', paint: { 'heatmap-radius': 26, 'heatmap-opacity': 0.5, 'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.3, '#ffd166', 0.6, '#ff9f1c', 1, '#e5173f'] } })
      map.addSource('acc-now', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'acc-now-dot', type: 'circle', source: 'acc-now', paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'sev'], 'grave', '#e5173f', 'moderado', '#ff9f1c', '#ffd166'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } })

      // tráfico por zona (sensores MQTT) + incidentes (Kafka) + anillos de alerta
      map.addSource('zones', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'zones-circle', type: 'circle', source: 'zones', paint: { 'circle-radius': 15, 'circle-opacity': 0.8, 'circle-color': ['step', ['get', 'ratio'], '#e5173f', 0.6, '#f08c00', 0.85, '#2fb36b'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
      map.addSource('incidents', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'inc-halo', type: 'circle', source: 'incidents', paint: { 'circle-radius': 30, 'circle-color': '#e5173f', 'circle-opacity': 0.18 } })
      map.addLayer({ id: 'inc-dot', type: 'circle', source: 'incidents', paint: { 'circle-radius': 8, 'circle-color': '#e5173f', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } })
      map.addSource('alerts', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'alerts-ring', type: 'circle', source: 'alerts', paint: { 'circle-radius': 26, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': SEV_COLOR, 'circle-stroke-width': 3 } })

      // ruta recomendada
      map.addSource('route', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#7c3aed', 'line-width': 5, 'line-dasharray': [1.5, 1.2] } })
      map.addLayer({ id: 'route-pts', type: 'circle', source: 'route', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 9, 'circle-color': '#7c3aed', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } })

      // metro 3D en movimiento (Three.js dentro del mapa)
      map.addLayer(createMetroLayer(() => liveRef.current?.metro))

      // árboles reales en 3D (datos generados con scripts/build-trees.mjs)
      map.addLayer(createTreesLayer((st) => setTrees(st)))

      // radar de lluvia real (RainViewer)
      fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then((r) => r.json())
        .then((j) => {
          const f = j?.radar?.past?.[j.radar.past.length - 1]
          if (!f) return
          map.addSource('radar', { type: 'raster', tiles: [`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`], tileSize: 256, maxzoom: 7 })
          map.addLayer({ id: 'radar', type: 'raster', source: 'radar', paint: { 'raster-opacity': 0.5 } }, 'metro-line')
          map.setLayoutProperty('radar', 'visibility', layersRef.current.rain ? 'visible' : 'none')
        })
        .catch(() => {})

      // etiquetas del puerto (posiciones aproximadas)
      PORT_PINS.forEach((p) => {
        const el = document.createElement('div')
        el.className = 'map-pin'
        el.innerHTML = `<i></i><span>${p.name}</span>`
        portPins.current.push(el)
        new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([p.lon, p.lat]).addTo(map)
      })

      map.on('click', 'zones-circle', (e) => {
        const p = e.features[0].properties
        new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setText(`${p.name}: ${p.speed} km/h (habitual ${p.baseline}) · ${p.acc2024} accidentes reales en 2024 a menos de 300 m`).addTo(map)
      })
      map.on('mouseenter', 'zones-circle', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'zones-circle', () => (map.getCanvas().style.cursor = ''))

      setReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [])

  const layersRef = useRef(layers)
  layersRef.current = layers

  // ---- visibilidad de capas
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    Object.entries(GROUPS).forEach(([key, ids]) =>
      ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', layers[key] ? 'visible' : 'none')),
    )
  }, [ready, layers])

  useEffect(() => {
    portPins.current.forEach((el) => (el.style.display = layers.port ? '' : 'none'))
  }, [ready, layers.port])

  // ---- datos en vivo (zonas, incidentes, alertas)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !live) return
    map.getSource('zones')?.setData({ type: 'FeatureCollection', features: live.zones.map((z) => pt(z.lon, z.lat, { name: z.name, speed: z.speed, baseline: z.baseline, ratio: z.ratio, acc2024: z.acc2024 })) })
    map.getSource('incidents')?.setData({ type: 'FeatureCollection', features: live.incidents.map((i) => pt(i.lon, i.lat, { sev: i.severity })) })
    map.getSource('alerts')?.setData({ type: 'FeatureCollection', features: live.alerts.map((a) => pt(a.lon, a.lat, { sev: a.sev })) })
  }, [ready, live])

  // ---- accidentes históricos (ventana de 6 h hasta la hora elegida)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource('acc-now')?.setData(accidentsGeo(data.accidents, hour - 23, hour))
  }, [ready, hour, data])

  // ---- ruta recomendada
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (!route) return void map.getSource('route')?.setData(EMPTY)
    const a = [route.from.lon, route.from.lat]
    const b = [route.to.lon, route.to.lat]
    map.getSource('route')?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [a, b] } }, pt(a[0], a[1]), pt(b[0], b[1])] })
  }, [ready, route])

  // ---- volar a una alerta
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !focus) return
    if (focus.port) {
      map.fitBounds(PORT_BOUNDS, { padding: 50, pitch: 45, bearing: -35, duration: 1600, maxZoom: 14 })
      return
    }
    map.flyTo({ center: [focus.lon, focus.lat], zoom: 14.3, pitch: 65, duration: 1400 })
  }, [ready, focus])

  // ---- teselas 3D opcionales
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !layers.tiles3d || !tilesUrl) return
    let off = null
    let cancelled = false
    import('./tiles3d.js')
      .then((m) => m.enableTiles3D(map, tilesUrl))
      .then((dispose) => (cancelled ? dispose() : (off = dispose)))
      .catch(() => setMsg('No se pudo cargar la capa de teselas 3D. Revisa la URL de VITE_TILES3D_URL.'))
    return () => {
      cancelled = true
      off?.()
    }
  }, [ready, layers.tiles3d, tilesUrl])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      <div className="badge">
        Mapa: OpenStreetMap vía OpenFreeMap · Radar: RainViewer · Accidentes: reales 2024 (Guàrdia Urbana) · Tráfico, metro y puerto: simulados
        {layers.tiles3d && !tilesUrl && <div className="err">Capa 3D de Barcelona: falta VITE_TILES3D_URL (ver README).</div>}
        {layers.trees && trees?.state === 'missing' && <div className="err">Árboles: faltan public/data/trees.bin y trees.json. Genéralos con scripts/build-trees.mjs (ver README).</div>}
        {layers.trees && trees?.state === 'far' && <div className="muted">Árboles: acerca el mapa (zoom ≥ 14,2) para verlos.</div>}
        {layers.trees && trees?.state === 'ok' && trees.shown != null && (
          <div className="muted">Árboles: {trees.shown.toLocaleString('es')} dibujados de {trees.n.toLocaleString('es')}{trees.capped ? ' (límite de dibujo)' : ''} · posición y especie reales (Open Data BCN, CC BY 4.0); altura y copa ilustrativas</div>
        )}
        {msg && <div className="err">{msg}</div>}
      </div>
    </div>
  )
}
