import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CENTER, PORT_BOUNDS, PORT_PINS, PORT_POLY, RAIL_LINES } from './geo.js'
import { createMetroLayer } from './metroLayer.js'
import { createTreesLayer } from './treesLayer.js'
import { DEM_SOURCES, IMAGERY } from './tileMath.js'

// Mapa libre: teselas vectoriales de OpenStreetMap servidas por OpenFreeMap (sin clave).
const STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const EMPTY = { type: 'FeatureCollection', features: [] }
const pt = (lon, lat, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } })
const SEV_COLOR = ['match', ['get', 'sev'], 'crit', '#d03b3b', 'warn', '#fab219', '#2a78d6']

// qué capas del mapa controla cada interruptor
const GROUPS = {
  bld3d: ['bld3d'],
  metro: ['metro-line', 'metro-stations', 'metro3d'],
  terrain: ['hillshade'],
  sat: ['sat'],
  fiware: ['fiware-halo', 'fiware-dot'],
  rodalies: ['rodalies-dot', 'rodalies-label'],
  trees: ['trees3d'],
  traffic: ['zones-circle'],
  accidents: ['acc-heat', 'acc-now-dot', 'inc-halo', 'inc-dot'],
  alerts: ['alerts-ring'],
  rain: ['radar'],
  port: ['port-fill', 'port-line'],
}


// Estilo base (OpenFreeMap "liberty") pasado a una gama clara y sobria, a juego con la interfaz:
// grises muy claros, agua azul pálido, verde apagado y calles blancas. Así destacan los datos encima.
// Se decide por el nombre de cada capa; si alguna propiedad no existe se ignora.
function styleBase(map) {
  const set = (id, prop, val) => { try { map.setPaintProperty(id, prop, val) } catch { /* sin esa propiedad */ } }
  for (const l of map.getStyle().layers) {
    const id = l.id
    if (l.type === 'background') set(id, 'background-color', '#f2f3f5')
    else if (l.type === 'fill') {
      const c = /water|ocean|sea|lake|river/i.test(id) ? '#d3e3f1'
        : /park|wood|forest|grass|green|landcover|garden|pitch|golf|cemetery|scrub/i.test(id) ? '#e1ebdc'
        : /building/i.test(id) ? '#e4e6ea'
        : /aeroway|runway|taxiway/i.test(id) ? '#e6e8ec'
        : '#eef0f2'
      set(id, 'fill-color', c)
      set(id, 'fill-outline-color', c)
    } else if (l.type === 'line') {
      const c = /water|river|stream|canal/i.test(id) ? '#bcd3e8'
        : /casing/i.test(id) ? '#dde0e5'
        : /motorway|trunk|primary/i.test(id) ? '#ffffff'
        : /secondary|tertiary/i.test(id) ? '#ffffff'
        : /rail|transit|subway/i.test(id) ? '#c7cbd2'
        : /boundary|admin/i.test(id) ? '#c3c7cf'
        : /road|street|path|bridge|tunnel|service|minor|link|pedestrian|track/i.test(id) ? '#ffffff'
        : null
      if (c) set(id, 'line-color', c)
    } else if (l.type === 'symbol') {
      set(id, 'text-color', '#5b6372')
      set(id, 'text-halo-color', '#ffffff')
      set(id, 'icon-opacity', 0.55)
    }
  }
}

// primera capa de líneas o símbolos del estilo base (para insertar debajo los rásteres)
function firstLineOrSymbol(map) {
  return map.getStyle().layers.find((l) => l.type === 'line' || l.type === 'symbol')?.id
}

function accidentsGeo(accidents, from, to) {
  return { type: 'FeatureCollection', features: accidents.filter((a) => a.hourIdx >= from && a.hourIdx <= to).map((a) => pt(a.lon, a.lat, { sev: a.sev })) }
}

export default function MapTwin({ data, hour, layers, live, focus, route, tilesUrl, googleKey, tier = 'mid' }) {
  const box = useRef(null)
  const mapRef = useRef(null)
  const liveRef = useRef(live)
  const dataRef = useRef(data)
  liveRef.current = live
  dataRef.current = data
  const [ready, setReady] = useState(false)
  const [msg, setMsg] = useState('')
  const [trees, setTrees] = useState(null)
  const [credits, setCredits] = useState('')
  const portPins = useRef([])
  const labelsBox = useRef(null)
  const metroRef = useRef(null)

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
      try { styleBase(map) } catch { /* si falla, queda el estilo original */ }
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
            'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#f4f5f7', 60, '#d5dbe4', 150, '#b9c3d1'],
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.95,
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
      map.addLayer({ id: 'port-fill', type: 'fill', source: 'port', paint: { 'fill-color': '#2a78d6', 'fill-opacity': 0.07 } })
      map.addLayer({ id: 'port-line', type: 'line', source: 'port', paint: { 'line-color': '#184f95', 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.7 } })

      // accidentes históricos simulados (mapa de calor de la semana + ventana de 6 h)
      map.addSource('acc-all', { type: 'geojson', data: accidentsGeo(dataRef.current.accidents, 0, 1e9) })
      map.addLayer({ id: 'acc-heat', type: 'heatmap', source: 'acc-all', paint: { 'heatmap-radius': 26, 'heatmap-opacity': 0.38, 'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'rgba(250,178,25,0)', 0.4, '#fab219', 0.6, '#ec835a', 1, '#d03b3b'] } })
      map.addSource('acc-now', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'acc-now-dot', type: 'circle', source: 'acc-now', paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'sev'], 'grave', '#d03b3b', 'moderado', '#ec835a', '#fab219'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } })

      // tráfico por zona (sensores MQTT) + incidentes (Kafka) + anillos de alerta
      map.addSource('zones', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'zones-circle', type: 'circle', source: 'zones', paint: { 'circle-radius': 15, 'circle-opacity': 0.8, 'circle-color': ['step', ['get', 'ratio'], '#d03b3b', 0.6, '#fab219', 0.85, '#0ca30c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
      map.addSource('incidents', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'inc-halo', type: 'circle', source: 'incidents', paint: { 'circle-radius': 30, 'circle-color': '#d03b3b', 'circle-opacity': 0.18 } })
      map.addLayer({ id: 'inc-dot', type: 'circle', source: 'incidents', paint: { 'circle-radius': 8, 'circle-color': '#d03b3b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } })
      map.addSource('alerts', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'alerts-ring', type: 'circle', source: 'alerts', paint: { 'circle-radius': 26, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': SEV_COLOR, 'circle-stroke-width': 3 } })

      // entidades FIWARE (Smart Data Models) del Context Broker
      map.addSource('fiware', { type: 'geojson', data: EMPTY })
      const LVL = ['match', ['get', 'level'], 'bad', '#d03b3b', 'warn', '#fab219', '#0ca30c']
      map.addLayer({ id: 'fiware-halo', type: 'circle', source: 'fiware', paint: { 'circle-radius': 13, 'circle-color': LVL, 'circle-opacity': 0.18 } })
      map.addLayer({ id: 'fiware-dot', type: 'circle', source: 'fiware', paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': LVL, 'circle-stroke-width': 3 } })
      map.on('click', 'fiware-dot', (e) => {
        const p = e.features[0].properties
        new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setText(`FIWARE · ${p.type}: ${p.title} — ${p.value ?? '—'} ${p.unit}${p.extra ? ' · ' + p.extra : ''}`).addTo(map)
      })
      map.on('mouseenter', 'fiware-dot', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'fiware-dot', () => (map.getCanvas().style.cursor = ''))

      // trenes REALES de Rodalies (Renfe GTFS-RT): punto con el color de la línea y etiqueta línea · retraso
      map.addSource('rodalies', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'rodalies-dot', type: 'circle', source: 'rodalies', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 8], 'circle-color': ['get', 'color'], 'circle-stroke-color': ['case', ['>=', ['get', 'delay'], 5], '#d03b3b', '#ffffff'], 'circle-stroke-width': 2.5 } })
      map.addLayer({ id: 'rodalies-label', type: 'symbol', source: 'rodalies', minzoom: 11, layout: { 'text-field': ['get', 'text'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': false }, paint: { 'text-color': '#101828', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } })
      map.on('click', 'rodalies-dot', (e) => {
        const p = e.features[0].properties
        new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setText(`Rodalies ${p.line} · tren ${p.id} · ${p.delayTxt} · dato real de Renfe (GTFS-RT)`).addTo(map)
      })
      map.on('mouseenter', 'rodalies-dot', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'rodalies-dot', () => (map.getCanvas().style.cursor = ''))

      // ruta recomendada
      map.addSource('route', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#6250d6', 'line-width': 5, 'line-dasharray': [1.5, 1.2] } })
      map.addLayer({ id: 'route-pts', type: 'circle', source: 'route', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 9, 'circle-color': '#6250d6', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } })

      // metro 3D en movimiento (Three.js dentro del mapa) + etiqueta encima de cada tren
      metroRef.current = createMetroLayer(() => liveRef.current?.metro, labelsBox.current)
      map.addLayer(metroRef.current)

      // árboles reales en 3D (datos generados con scripts/build-trees.mjs)
      map.addLayer(createTreesLayer((st) => setTrees(st)))

      // relieve real: modelo de 5 m del ICGC (terrain-RGB). Sombreado siempre disponible; 3D con el interruptor "Relieve"
      map.addSource('dem', { type: 'raster-dem', tiles: [DEM_SOURCES.icgc.url], tileSize: 256, maxzoom: DEM_SOURCES.icgc.maxZ, encoding: 'mapbox', attribution: 'Relieve: ICGC (CC BY 4.0)' })
      map.addSource('dem-hs', { type: 'raster-dem', tiles: [DEM_SOURCES.icgc.url], tileSize: 256, maxzoom: DEM_SOURCES.icgc.maxZ, encoding: 'mapbox' })
      map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem-hs', paint: { 'hillshade-exaggeration': 0.3, 'hillshade-shadow-color': '#7d8696', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#9aa3b1' } }, firstLineOrSymbol(map))

      // ortofoto / satélite debajo de calles y edificios
      map.addSource('sat', { type: 'raster', tiles: [IMAGERY.icgc.url], tileSize: 256, maxzoom: 19, attribution: IMAGERY.icgc.attr })
      map.addLayer({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.92, 'raster-saturation': -0.15 } }, firstLineOrSymbol(map))

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

  // relieve 3D (terreno) y etiquetas de trenes
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const apply = () => {
      try {
        map.setTerrain(layers.terrain ? { source: 'dem', exaggeration: 1 } : null)
      } catch {
        map.once('idle', apply) // el estilo aún está cargando: reintentar cuando termine
      }
    }
    apply()
  }, [ready, layers.terrain])
  useEffect(() => {
    metroRef.current?.setLabelsVisible(layers.metro)
    if (!layers.metro) metroRef.current?.stopFollow()
  }, [ready, layers.metro])

  // ---- datos en vivo (zonas, incidentes, alertas)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !live) return
    map.getSource('zones')?.setData({ type: 'FeatureCollection', features: live.zones.map((z) => pt(z.lon, z.lat, { name: z.name, speed: z.speed, baseline: z.baseline, ratio: z.ratio, acc2024: z.acc2024 })) })
    map.getSource('incidents')?.setData({ type: 'FeatureCollection', features: live.incidents.map((i) => pt(i.lon, i.lat, { sev: i.severity })) })
    map.getSource('alerts')?.setData({ type: 'FeatureCollection', features: live.alerts.map((a) => pt(a.lon, a.lat, { sev: a.sev })) })
  }, [ready, live])

  // ---- Rodalies (trenes reales)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const ts = live?.rodalies?.trains || []
    const txt = (t) => (t.delayMin == null ? 'sin dato de retraso' : t.delayMin <= 0 ? 'en hora' : `+${t.delayMin} min`)
    map.getSource('rodalies')?.setData({ type: 'FeatureCollection', features: ts.map((t) => pt(t.lon, t.lat, { id: t.id, line: t.line, color: t.color, delay: t.delayMin ?? 0, delayTxt: txt(t), text: t.delayMin > 0 ? `${t.line} +${t.delayMin}'` : t.line })) })
  }, [ready, live?.rodalies])

  // ---- FIWARE
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const ents = live?.fiware?.entities || []
    map.getSource('fiware')?.setData({ type: 'FeatureCollection', features: ents.map((e) => pt(e.lon, e.lat, { type: e.type, title: e.title, value: e.value, unit: e.unit, level: e.level, extra: e.extra || '' })) })
  }, [ready, live?.fiware])

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
    if (!ready || !map || !layers.tiles3d || !(tilesUrl || googleKey)) return
    let off = null
    let cancelled = false
    import('./tiles3d.js')
      .then((m) => m.enableTiles3D(map, { url: tilesUrl, googleKey, tier, onCredits: setCredits }))
      .then((dispose) => (cancelled ? dispose() : (off = dispose)))
      .catch(() => setMsg('No se pudo cargar la capa de teselas 3D. Revisa VITE_TILES3D_URL o VITE_GOOGLE_MAPS_KEY.'))
    return () => {
      cancelled = true
      off?.()
    }
  }, [ready, layers.tiles3d, tilesUrl, googleKey, tier])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      <div ref={labelsBox} className="train-pins" />
      <div className="badge">
        Mapa: OpenStreetMap vía OpenFreeMap · Relieve: ICGC 5 m{layers.sat ? ' · Ortofoto: ICGC' : ''} · Radar: RainViewer · Accidentes: reales 2024 (Guàrdia Urbana) · Tráfico, metro y puerto: simulados
        {layers.tiles3d && credits && <div className="muted">Teselas 3D: {credits}</div>}
        {layers.trees && trees?.state === 'missing' && <div className="err">Árboles: faltan public/data/trees.bin y trees.json. Genéralos con scripts/build-trees.mjs (ver README).</div>}
        {layers.trees && trees?.state === 'far' && <div className="muted">Árboles: acerca el mapa (zoom ≥ 14,2) para verlos.</div>}
        {layers.trees && trees?.state === 'ok' && trees.shown != null && (
          <div className="muted">Árboles: {trees.shown.toLocaleString('es')} dibujados de {trees.n.toLocaleString('es')}{trees.capped ? ' (límite de dibujo)' : ''} · posición y especie reales (Open Data BCN, CC BY 4.0); altura y copa ilustrativas</div>
        )}
        {layers.rodalies && live?.rodalies && (
          <div className="muted">Rodalies: {live.rodalies.status === 'ok' ? `${live.rodalies.trains.length} trenes en tiempo real (Renfe, datos abiertos)` : 'sin datos de Renfe ahora mismo'}</div>
        )}
        {layers.fiware && live?.fiware && (
          <div className={live.fiware.status === 'ok' ? 'muted' : 'muted'}>
            FIWARE: {live.fiware.status === 'ok' ? `${live.fiware.n} entidades${live.fiware.demo ? ' (MUESTRA, valores inventados)' : ' en tiempo real'}` : 'sin broker configurado (ver README o ?fiware=demo)'}
          </div>
        )}
        {msg && <div className="err">{msg}</div>}
      </div>
    </div>
  )
}
