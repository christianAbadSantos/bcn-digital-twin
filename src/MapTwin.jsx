import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CENTER, PORT_BOUNDS, PORT_PINS, PORT_POLY, RAIL_LINES } from './geo.js'
import { createMetroLayer } from './metroLayer.js'
import { createTreesLayer } from './treesLayer.js'
import { DEM_SOURCES, IMAGERY } from './tileMath.js'
import { REPORT_TYPES } from '../shared/reportsConfig.js'
import { GRUPS } from './urbanisme.js'

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
  reports: ['reports-halo', 'reports-dot'],
  v16: ['v16-halo', 'v16-dot', 'v16-label'],
  res: ['pcritic', 'res-route', 'res-dot', 'res-stop', 'pverd', 'pverd-label', 'res-base', 'res-base-label'],
  urg: ['amb-route', 'apron-fill', 'bays-fill', 'bays-line', 'bays-label', 'hosp-dot', 'hosp-label', 'amb-dot', 'amb-label'],
  trees: ['trees3d'],
  traffic: ['zones-circle'],
  accidents: ['acc-heat', 'acc-now-dot', 'inc-halo', 'inc-dot'],
  alerts: ['alerts-ring'],
  rain: ['radar'],
  port: ['port-fill', 'port-line'],
  urb: ['urb-fill', 'urb-line', 'urb-sel', 'cat-parcel', 'bld-sel'],
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

const BAY_COLOR = ['match', ['get', 'state'], 'ocupada', '#d03b3b', 'reservada', '#fab219', '#0ca30c']
const hhmm = (ms) => (ms ? new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—')

// urbanismo: color de cada grupo de calificación y límites de parcela del Catastro (WMS, permite CORS)
const URB_COLOR = ['match', ['get', 'g'], ...GRUPS.flatMap((g) => [g.k, g.color]), '#c3c9d3']
const CATASTRO_WMS = 'https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=Catastro&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'
// capas con su propio clic: si el clic cae en una de ellas no se abre la ficha de urbanismo
const CLICKABLE = ['fiware-dot', 'rodalies-dot', 'reports-dot', 'res-dot', 'pcritic', 'pverd', 'res-base', 'hosp-dot', 'amb-dot', 'v16-dot', 'bays-fill', 'zones-circle']

const FILL_COLOR = ['step', ['get', 'n'], '#0ca30c', 50, '#fab219', 80, '#ec835a', 100, '#d03b3b']
const FRACCIO_ES = { Rebuig: 'Resto', Envasos: 'Envases', Paper: 'Papel y cartón', Vidre: 'Vidrio', Organica: 'Orgánica' }
const FRACCIO_TINT = { Rebuig: '#6b7280', Envasos: '#e2b100', Paper: '#2a78d6', Vidre: '#0ca30c', Organica: '#8a5a2b' }

export default function MapTwin({ data, hour, layers, live, emergency, residus, resFraccio = 'all', urbanisme, onUrbPick, focus, route, tilesUrl, googleKey, tier = 'mid', picking = false, onPick }) {
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
  const pickRef = useRef(null)
  pickRef.current = picking ? onPick : null
  const urbPickRef = useRef(null)
  urbPickRef.current = onUrbPick

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
    if (import.meta.env.DEV) window.__map = map // para depurar desde la consola en local
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

      // ---- urbanismo: calificación del suelo (debajo de los edificios), parcelas del Catastro y edificio elegido
      const below = map.getLayer('bld3d') ? 'bld3d' : undefined
      map.addSource('urb', { type: 'geojson', data: EMPTY, generateId: true, attribution: 'Calificación: Mapa Urbanístic de Catalunya (Generalitat)' })
      map.addLayer({ id: 'urb-fill', type: 'fill', source: 'urb', layout: { visibility: 'none' }, paint: { 'fill-color': URB_COLOR, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 0.5] } }, below)
      map.addLayer({ id: 'urb-line', type: 'line', source: 'urb', minzoom: 14, layout: { visibility: 'none' }, paint: { 'line-color': '#ffffff', 'line-width': 0.8, 'line-opacity': 0.8 } }, below)
      map.addSource('cat-parcel', { type: 'raster', tiles: [CATASTRO_WMS], tileSize: 256, minzoom: 16, attribution: 'Parcelas: Dirección General del Catastro' })
      map.addLayer({ id: 'cat-parcel', type: 'raster', source: 'cat-parcel', minzoom: 16, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 } }, below)
      map.addSource('urb-sel', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'urb-sel', type: 'line', source: 'urb-sel', layout: { visibility: 'none', 'line-join': 'round' }, paint: { 'line-color': '#101828', 'line-width': 2.5, 'line-dasharray': [2, 1] } }, below)
      map.addSource('bld-sel', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'bld-sel', type: 'fill-extrusion', source: 'bld-sel', layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': '#6250d6', 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 0.9 } })
      map.on('click', (e) => {
        if (pickRef.current || !layersRef.current.urb || !urbPickRef.current) return
        const p = e.point
        if (map.queryRenderedFeatures(p, { layers: CLICKABLE.filter((id) => map.getLayer(id)) }).length) return
        const z = map.queryRenderedFeatures(p, { layers: ['urb-fill'] })[0]
        const b = map.getLayer('bld3d') && layersRef.current.bld3d ? map.queryRenderedFeatures(p, { layers: ['bld3d'] })[0] : null
        urbPickRef.current({
          lon: e.lngLat.lng, lat: e.lngLat.lat, idx: z ? z.id : null,
          bld: b ? { geometry: b.geometry, h: b.properties.render_height ?? 8, b: b.properties.render_min_height ?? 0 } : null,
        })
      })

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

      // reportes ciudadanos (foto + ubicación, enviados con sesión iniciada)
      map.addSource('reports', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'reports-halo', type: 'circle', source: 'reports', paint: { 'circle-radius': 14, 'circle-color': '#6250d6', 'circle-opacity': 0.15 } })
      map.addLayer({ id: 'reports-dot', type: 'circle', source: 'reports', paint: { 'circle-radius': 7, 'circle-color': '#6250d6', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } })
      map.on('click', 'reports-dot', (e) => {
        const p = e.features[0].properties
        // contenido de usuarios: se construye con textContent, nunca con HTML
        const box = document.createElement('div')
        box.className = 'rep-pop'
        if (String(p.foto).startsWith('https://res.cloudinary.com/')) {
          const img = document.createElement('img')
          img.src = p.foto
          img.alt = p.tipoTxt
          box.appendChild(img)
        }
        const b = document.createElement('b')
        b.textContent = p.tipoTxt
        const t = document.createElement('span')
        t.textContent = [p.texto, p.autor + ' · ' + p.fecha].filter(Boolean).join(' — ')
        box.append(b, t)
        const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' }).setLngLat(e.lngLat).setDOMContent(box).addTo(map)
        // al cargar la foto, recolocar el popup (elige otra vez arriba/abajo según el espacio)
        box.querySelector('img')?.addEventListener('load', () => popup.isOpen() && popup.setLngLat(e.lngLat))
      })
      map.on('mouseenter', 'reports-dot', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'reports-dot', () => (map.getCanvas().style.cursor = pickRef.current ? 'crosshair' : ''))
      // modo "elegir punto" para un reporte nuevo
      map.on('click', (e) => pickRef.current?.({ lon: e.lngLat.lng, lat: e.lngLat.lat }))

      // ---- residuos: puntos críticos de limpieza, contenedores con sensor, ruta de recogida, puntos verdes
      map.addSource('pcritic', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'pcritic', type: 'circle', source: 'pcritic', minzoom: 11, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 9], 'circle-color': '#8a5a2b', 'circle-opacity': ['interpolate', ['linear'], ['get', 'estat'], 0, 0.15, 40, 0.55], 'circle-stroke-color': '#8a5a2b', 'circle-stroke-width': 1 } })
      map.addSource('res-route', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'res-route', type: 'line', source: 'res-route', layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [2, 1.2], 'line-opacity': 0.85 } })
      map.addSource('res', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'res-dot', type: 'circle', source: 'res', minzoom: 12, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2.2, 15, 4.5, 17, 7], 'circle-color': FILL_COLOR, 'circle-stroke-color': ['get', 'tint'], 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 2] } })
      map.addSource('res-stop', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'res-stop', type: 'symbol', source: 'res-stop', minzoom: 13, layout: { 'text-field': ['get', 'n'], 'text-size': 10.5, 'text-font': ['Noto Sans Bold'], 'text-offset': [0, -1.1], 'text-allow-overlap': false }, paint: { 'text-color': '#101828', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } })
      map.addSource('pverd', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'pverd', type: 'circle', source: 'pverd', paint: { 'circle-radius': 7, 'circle-color': '#0ca30c', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } })
      map.addLayer({ id: 'pverd-label', type: 'symbol', source: 'pverd', minzoom: 13, layout: { 'text-field': ['get', 'nom'], 'text-size': 10.5, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'], 'text-max-width': 12 }, paint: { 'text-color': '#067a06', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } })
      map.addSource('res-base', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'res-base', type: 'circle', source: 'res-base', paint: { 'circle-radius': 10, 'circle-color': '#184f95', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } })
      map.addLayer({ id: 'res-base-label', type: 'symbol', source: 'res-base', layout: { 'text-field': ['get', 'nom'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#184f95', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } })
      const popR = (id, fn) => {
        map.on('click', id, (e) => new maplibregl.Popup({ closeButton: false, maxWidth: '300px' }).setLngLat(e.lngLat).setText(fn(e.features[0].properties)).addTo(map))
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = pickRef.current ? 'crosshair' : ''))
      }
      popR('res-dot', (p) => `${FRACCIO_ES[p.f] || p.f} · ${p.n} %${p.s ? ' · soterrado' : ''} · contenedor ${p.id} · posición real (OpenStreetMap), llenado simulado`)
      popR('pverd', (p) => `${p.nom} · ${p.tipus === 'zona' ? 'punto verde de zona' : 'punto verde de barrio'} · Open Data BCN`)
      popR('pcritic', (p) => `Punto crítico de limpieza · ${p.carrer} (${p.barri}) · ${p.motiu} · índice de suciedad ${p.estat} en la última visita (Open Data BCN, 2018)`)

      // ---- urgencias: hospital (IFC), bahías, ambulancias y balizas V16
      map.addSource('amb-route', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'amb-route', type: 'line', source: 'amb-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['get', 'v16'], '#d03b3b', '#184f95'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 4], 'line-opacity': 0.55 } })
      map.addSource('apron', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'apron-fill', type: 'fill', source: 'apron', minzoom: 15, paint: { 'fill-color': '#184f95', 'fill-opacity': 0.08, 'fill-outline-color': '#184f95' } })
      map.addSource('bays', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'bays-fill', type: 'fill-extrusion', source: 'bays', minzoom: 15, paint: { 'fill-extrusion-color': BAY_COLOR, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.8 } })
      map.addLayer({ id: 'bays-line', type: 'line', source: 'bays', minzoom: 15, paint: { 'line-color': '#ffffff', 'line-width': 1.5 } })
      map.addSource('bays-pt', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'bays-label', type: 'symbol', source: 'bays-pt', minzoom: 17.9, layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, -1.6], 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#101828', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } })
      map.addSource('hosp', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'hosp-dot', type: 'circle', source: 'hosp', paint: { 'circle-radius': 10, 'circle-color': '#d03b3b', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } })
      map.addLayer({ id: 'hosp-label', type: 'symbol', source: 'hosp', layout: { 'text-field': 'H', 'text-size': 13, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } })
      map.addSource('amb', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'amb-dot', type: 'circle', source: 'amb', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 15, 8], 'circle-color': '#ffffff', 'circle-stroke-color': ['case', ['get', 'v16'], '#d03b3b', ['==', ['get', 'tipo'], 'SVA'], '#c21f1f', '#e8833a'], 'circle-stroke-width': 3.5 } })
      map.addLayer({ id: 'amb-label', type: 'symbol', source: 'amb', minzoom: 11, layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': '#101828', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } })
      map.addSource('v16', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'v16-halo', type: 'circle', source: 'v16', paint: { 'circle-radius': 16, 'circle-color': '#f59e0b', 'circle-opacity': 0.22 } })
      map.addLayer({ id: 'v16-dot', type: 'circle', source: 'v16', paint: { 'circle-radius': 6.5, 'circle-color': '#f59e0b', 'circle-stroke-color': ['case', ['get', 'sim'], '#6250d6', '#ffffff'], 'circle-stroke-width': 2.5 } })
      map.addLayer({ id: 'v16-label', type: 'symbol', source: 'v16', minzoom: 9, layout: { 'text-field': ['get', 'label'], 'text-size': 10.5, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': '#8a5a00', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } })
      const pop = (id, fn) => {
        map.on('click', id, (e) => new maplibregl.Popup({ closeButton: false, maxWidth: '300px' }).setLngLat(e.lngLat).setText(fn(e.features[0].properties)).addTo(map))
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = pickRef.current ? 'crosshair' : ''))
      }
      pop('v16-dot', (p) => (p.sim ? 'Baliza V16 SIMULADA (para ver su efecto en la ETA)' : `Baliza V16 encendida · ${p.road}${p.km ? ' km ' + p.km : ''} · ${p.muni} · desde las ${p.since} · dato real DGT 3.0`))
      pop('amb-dot', (p) => p.info)
      pop('bays-fill', (p) => p.info)
      pop('hosp-dot', () => 'Hospital Clínic · Urgencias. Bahías leídas del IFC del muelle de ambulancias (modelo de ejemplo).')

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

  // ---- reportes ciudadanos
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const rs = live?.reports?.reports || []
    map.getSource('reports')?.setData({ type: 'FeatureCollection', features: rs.map((r) => pt(r.lon, r.lat, { foto: r.foto, tipoTxt: REPORT_TYPES[r.tipo] || 'Incidencia', texto: r.texto, autor: r.autor, fecha: new Date(r.creado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) })) })
  }, [ready, live?.reports])
  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = picking ? 'crosshair' : ''
  }, [picking])

  // ---- Rodalies (trenes reales)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const ts = live?.rodalies?.trains || []
    const txt = (t) => (t.delayMin == null ? 'sin dato de retraso' : t.delayMin <= 0 ? 'en hora' : `+${t.delayMin} min`)
    map.getSource('rodalies')?.setData({ type: 'FeatureCollection', features: ts.map((t) => pt(t.lon, t.lat, { id: t.id, line: t.line, color: t.color, delay: t.delayMin ?? 0, delayTxt: txt(t), text: t.delayMin > 0 ? `${t.line} +${t.delayMin}'` : t.line })) })
  }, [ready, live?.rodalies])

  // ---- residuos
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !residus?.dades) return
    const d = residus.dades
    map.getSource('pverd')?.setData({ type: 'FeatureCollection', features: d.puntsVerds.map((p) => pt(p.lon, p.lat, { nom: p.nom.replace(/^Punt Verd (de )?/, 'Punt verd '), tipus: p.tipus })) })
    map.getSource('pcritic')?.setData({ type: 'FeatureCollection', features: d.puntsCritics.map((p) => pt(p.lon, p.lat, { carrer: p.carrer, barri: p.barri, motiu: p.motiu, estat: p.estat ?? 0 })) })
    map.getSource('res-base')?.setData({ type: 'FeatureCollection', features: [pt(2.136, 41.344, { nom: 'Base Zona Franca' })] })
  }, [ready, residus?.dades])
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !residus) return
    const cs = resFraccio === 'all' ? residus.cs : residus.cs.filter((c) => c.fraccio === resFraccio)
    map.getSource('res')?.setData({ type: 'FeatureCollection', features: cs.map((c) => pt(c.lon, c.lat, { id: c.id, f: c.fraccio, n: c.nivellPct, s: c.soterrat ? 1 : 0, tint: FRACCIO_TINT[c.fraccio] })) })
  }, [ready, residus?.cs, resFraccio])
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !residus) return
    const r = residus.ruta
    if (!r || !r.viatges?.length) {
      map.getSource('res-route')?.setData(EMPTY)
      map.getSource('res-stop')?.setData(EMPTY)
      return
    }
    const base = [r.baseLon, r.baseLat]
    const colors = ['#184f95', '#6250d6', '#c2410c', '#0f766e', '#a21caf']
    let k = 0
    map.getSource('res-route')?.setData({ type: 'FeatureCollection', features: r.viatges.map((v, i) => ({ type: 'Feature', properties: { color: colors[i % colors.length] }, geometry: { type: 'LineString', coordinates: [base, ...v.parades.map((p) => [p.lon, p.lat]), base] } })) })
    map.getSource('res-stop')?.setData({ type: 'FeatureCollection', features: r.viatges.flatMap((v) => v.parades.map((p) => pt(p.lon, p.lat, { n: String(++k) }))) })
  }, [ready, residus?.ruta])

  // ---- urgencias: balizas V16
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !emergency) return
    map.getSource('v16')?.setData({ type: 'FeatureCollection', features: emergency.beacons.map((b) => pt(b.lon, b.lat, { sim: Boolean(b.sim), road: b.road, km: b.km ?? '', muni: b.municipality, since: hhmm(b.since), label: b.sim ? 'V16 (simulada)' : `V16 · ${b.road}` })) })
  }, [ready, emergency?.beacons])

  // ---- urgencias: hospital, bahías y ambulancias (cada segundo)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !emergency?.hospital) return
    const h = emergency.hospital
    map.getSource('hosp')?.setData({ type: 'FeatureCollection', features: [pt(h.entrance[0], h.entrance[1])] })
    map.getSource('apron')?.setData(h.apron ? { type: 'Feature', properties: {}, geometry: h.apron } : EMPTY)
  }, [ready, emergency?.hospital])
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !emergency) return
    const bays = emergency.bays
    const bayInfo = (b) => `${b.name} · ${b.w} × ${b.l} m${b.box ? ' · acceso directo al box de críticos' : ''} · ${b.state === 'ocupada' ? `ocupada por ${b.occ.id} hasta las ${hhmm(b.occ.until)}` : b.next ? `próxima: ${b.next.id} a las ${hhmm(b.next.etaMs)}` : 'libre'} · (del IFC)`
    map.getSource('bays')?.setData({ type: 'FeatureCollection', features: bays.map((b) => ({ type: 'Feature', properties: { state: b.state, info: bayInfo(b), h: b.h || 3 }, geometry: b.polygon })) })
    map.getSource('bays-pt')?.setData({ type: 'FeatureCollection', features: bays.map((b) => pt(b.center[0], b.center[1], { label: b.code })) })
    const vis = emergency.amb.filter((a) => a.phase !== 'base' && a.pos)
    const label = (a) => (a.phase === 'bahia' ? `${a.id} en ${a.bay}` : a.phase === 'espera' ? `${a.id} esperando ${a.bay || 'bahía'}` : `${a.id} · ${a.etaMin}′ → ${a.bay || '?'}`)
    const info = (a) => `${a.id} (${a.tipo}) desde ${a.origen} · ${a.phase === 'bahia' ? `en la bahía ${a.bay} hasta las ${hhmm(a.until)}` : a.phase === 'espera' ? `esperando bahía ${a.bay || ''}` : `llega a las ${hhmm(a.etaMs)} (${a.etaMin} min) · bahía ${a.bay || 'por asignar'}${a.waitMin ? ` (espera ${a.waitMin} min)` : ''}${a.v16.length ? ` · ${a.v16.length} baliza(s) V16 en la ruta` : ''} · ${Math.round(a.speedKmh)} km/h`} · GPS por LoRaWAN (simulado)`
    map.getSource('amb')?.setData({ type: 'FeatureCollection', features: vis.map((a) => pt(a.pos[0], a.pos[1], { tipo: a.tipo, v16: a.v16.length > 0, label: label(a), info: info(a) })) })
    map.getSource('amb-route')?.setData({ type: 'FeatureCollection', features: vis.filter((a) => a.path?.length > 1).map((a) => ({ type: 'Feature', properties: { v16: a.v16.length > 0 }, geometry: { type: 'LineString', coordinates: a.path } })) })
  }, [ready, emergency?.amb, emergency?.bays])

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

  // ---- urbanismo: datos, filtro por grupos y selección
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !urbanisme?.geo) return
    map.getSource('urb')?.setData(urbanisme.geo)
  }, [ready, urbanisme?.geo])
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !urbanisme) return
    const ks = GRUPS.filter((g) => urbanisme.on[g.k]).map((g) => g.k)
    for (const id of ['urb-fill', 'urb-line']) map.getLayer(id) && map.setFilter(id, ['in', ['get', 'g'], ['literal', ks]])
  }, [ready, urbanisme?.on])
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const s = urbanisme?.sel
    map.getSource('urb-sel')?.setData(s?.zona?.geometry ? { type: 'Feature', properties: {}, geometry: s.zona.geometry } : EMPTY)
    map.getSource('bld-sel')?.setData(s?.bld ? { type: 'Feature', properties: { h: s.bld.h, b: s.bld.b }, geometry: s.bld.geometry } : EMPTY)
  }, [ready, urbanisme?.sel])
  // con urbanismo encendido los edificios se vuelven translúcidos para ver el color del suelo
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !map.getLayer('bld3d')) return
    map.setPaintProperty('bld3d', 'fill-extrusion-opacity', layers.urb ? 0.45 : 0.95)
  }, [ready, layers.urb])

  // ---- volar a una alerta
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !focus) return
    if (focus.port) {
      map.fitBounds(PORT_BOUNDS, { padding: 50, pitch: 45, bearing: -35, duration: 1600, maxZoom: 14 })
      return
    }
    if (focus.bounds) {
      map.fitBounds(focus.bounds, { padding: 60, pitch: 30, bearing: 0, duration: 1600, maxZoom: 15.5 })
      return
    }
    map.flyTo({ center: [focus.lon, focus.lat], zoom: focus.zoom ?? 14.3, pitch: focus.pitch ?? 65, bearing: focus.bearing ?? map.getBearing(), duration: 1400 })
    // vista de planta (p. ej. el muelle de urgencias, en la planta -1): los edificios se aplanan a su
    // huella para ver lo que hay dentro; al alejarse (zoom < 17) vuelven a su altura
    if (focus.plan && map.getLayer('bld3d')) {
      const H = ['coalesce', ['get', 'render_height'], 8]
      map.setPaintProperty('bld3d', 'fill-extrusion-height', ['interpolate', ['linear'], ['zoom'], 17, H, 17.8, 0.2])
      map.setPaintProperty('bld3d', 'fill-extrusion-base', 0)
      const restore = () => {
        if (map.getZoom() >= 17) return
        map.setPaintProperty('bld3d', 'fill-extrusion-height', H)
        map.setPaintProperty('bld3d', 'fill-extrusion-base', ['coalesce', ['get', 'render_min_height'], 0])
        map.off('zoomend', restore)
      }
      map.on('zoomend', restore)
    }
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
        {layers.res && residus && (
          <div className="muted">Residuos: {residus.cs.length.toLocaleString('es')} contenedores reales (OpenStreetMap) · llenado simulado {residus.mode === 'api' ? 'por la API .NET' : 'en el navegador'} · puntos verdes y puntos críticos de limpieza: Open Data BCN</div>
        )}
        {layers.v16 && emergency && (
          <div className="muted">Balizas V16: {emergency.v16.status === 'ok' ? `${emergency.v16.beacons.length} encendidas ahora en Cataluña (DGT 3.0, datos abiertos)` : emergency.v16.status === 'down' ? 'sin datos de la DGT ahora mismo' : 'cargando…'}</div>
        )}
        {layers.urg && emergency && (
          <div className="muted">Urgencias: ambulancias simuladas (GPS LoRaWAN) en rutas reales · bahías del IFC de ejemplo del Clínic{emergency.err ? ` · ${emergency.err}` : ''}</div>
        )}
        {layers.fiware && live?.fiware && (
          <div className={live.fiware.status === 'ok' ? 'muted' : 'muted'}>
            FIWARE: {live.fiware.status === 'ok' ? `${live.fiware.n} entidades${live.fiware.demo ? ' (MUESTRA, valores inventados)' : ' en tiempo real'}` : 'sin broker configurado (ver README o ?fiware=demo)'}
          </div>
        )}
        {layers.urb && <div className="muted">Urbanismo: calificación real del suelo (Mapa Urbanístic de Catalunya, Generalitat) · fichas de parcela del Catastro en directo{urbanisme?.err ? ` · ${urbanisme.err}` : ''}</div>}
        {msg && <div className="err">{msg}</div>}
      </div>
    </div>
  )
}
