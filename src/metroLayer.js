// Capa personalizada de MapLibre que dibuja trenes de metro en 3D con Three.js
// dentro del propio mapa (comparten cámara y contexto WebGL).
// Encima de cada tren va una etiqueta HTML (línea, estado) que lo sigue en pantalla; al pulsarla,
// la cámara sigue a ese tren. Si el relieve 3D está activo, los trenes se apoyan en el terreno.
import * as THREE from 'three'
import maplibregl from 'maplibre-gl'
import { CENTER, RAIL_PATHS, toLocal, pingPong } from './geo.js'

const EXAGGERATE = 4 // los trenes reales son diminutos a escala de ciudad: se agrandan para verlos
const CARS = 4
const LABEL_Z = 48 // m sobre el tren

export function createMetroLayer(getMetro, labelsEl) {
  let map, camera, scene, renderer, root
  const trains = []
  const origin = maplibregl.MercatorCoordinate.fromLngLat([CENTER.lon, CENTER.lat], 0)
  const unit = origin.meterInMercatorCoordinateUnits()
  let follow = -1
  let lastFollow = 0
  const v4 = new THREE.Vector4()
  const proj = new THREE.Matrix4()

  const carGeo = new THREE.BoxGeometry(17, 3.2, 3.6)
  const stripGeo = new THREE.BoxGeometry(15, 0.9, 3.7)
  const stripMat = new THREE.MeshStandardMaterial({ color: '#dff1ff', emissive: '#9fd3ff', emissiveIntensity: 0.6 })

  function buildTrain(color) {
    const g = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.4, side: THREE.DoubleSide })
    for (let c = 0; c < CARS; c++) {
      const x = (c - (CARS - 1) / 2) * 18
      const car = new THREE.Mesh(carGeo, bodyMat)
      car.position.set(x, 0, 0)
      const strip = new THREE.Mesh(stripGeo, stripMat)
      strip.position.set(x, 0.5, 0)
      g.add(car, strip)
    }
    g.scale.setScalar(EXAGGERATE)
    g.userData.mat = bodyMat
    return g
  }

  function makeLabel(tr, i) {
    if (!labelsEl) return null
    const el = document.createElement('button')
    el.className = 'train-pin'
    el.style.setProperty('--c', tr.color)
    el.innerHTML = `<i></i><b>${tr.line.id}</b><span></span>`
    el.title = 'Seguir este tren'
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      follow = follow === i ? -1 : i
      trains.forEach((t, k) => t.el?.classList.toggle('on', k === follow))
      if (follow >= 0) map.easeTo({ zoom: Math.max(map.getZoom(), 15.2), pitch: 62, duration: 600 })
    })
    labelsEl.appendChild(el)
    return el
  }

  return {
    id: 'metro3d',
    type: 'custom',
    renderingMode: '3d',
    stopFollow() {
      follow = -1
      trains.forEach((t) => t.el?.classList.remove('on'))
    },
    setLabelsVisible(on) {
      if (labelsEl) labelsEl.style.display = on ? '' : 'none'
    },

    onAdd(m, gl) {
      map = m
      camera = new THREE.Camera()
      scene = new THREE.Scene()
      scene.add(new THREE.AmbientLight(0xffffff, 0.85))
      const sun = new THREE.DirectionalLight(0xffffff, 1.1)
      sun.position.set(0.3, -0.5, 1).normalize()
      scene.add(sun)
      root = new THREE.Group()
      scene.add(root)
      RAIL_PATHS.forEach((line, li) => {
        for (let k = 0; k < 3; k++) {
          const g = buildTrain(line.color)
          root.add(g)
          const tr = { g, line, li, k, color: line.color, delayed: null }
          tr.el = makeLabel(tr, trains.length)
          trains.push(tr)
        }
      })
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
      // arrastrar el mapa a mano deja de seguir al tren
      m.on('dragstart', () => this.stopFollow())
    },

    render(gl, matrix) {
      const t = performance.now() / 1000
      const status = getMetro?.() || []
      const terrain = map.getTerrain?.()
      const cw = map.getCanvas().clientWidth
      const ch = map.getCanvas().clientHeight
      proj.fromArray(matrix)
      trains.forEach((tr, i) => {
        const delayed = status.find((l) => l.id === tr.line.id)?.status === 'retraso'
        if (delayed !== tr.delayed) {
          tr.delayed = delayed
          tr.g.userData.mat.color.set(delayed ? '#ff4d6d' : tr.color)
          if (tr.el) {
            tr.el.classList.toggle('bad', delayed)
            tr.el.querySelector('span').textContent = delayed ? 'retraso' : 'normal'
          }
        }
        const v = delayed ? 13 : 22 // m/s: con retraso van más lentos
        const p = pingPong(tr.line.path, t, v, (tr.k * tr.line.path.length * 2) / 3 + tr.li * 500)
        const [e, n] = toLocal([p.lon, p.lat])
        // con relieve activo: apoyar en el terreno (la cota ya viene multiplicada por la exageración)
        const ground = terrain ? map.queryTerrainElevation([p.lon, p.lat]) || 0 : 0
        const z = ground + 10
        tr.g.position.set(e, n, z) // metros respecto al centro; z = altura
        tr.g.rotation.z = Math.atan2(p.north, p.east)
        tr.lon = p.lon
        tr.lat = p.lat

        // etiqueta: proyectar el punto encima del tren a píxeles de pantalla
        if (tr.el) {
          v4.set(origin.x + e * unit, origin.y - n * unit, (z + LABEL_Z) * unit, 1).applyMatrix4(proj)
          const vis = v4.w > 0 && Math.abs(v4.x / v4.w) < 1.05 && Math.abs(v4.y / v4.w) < 1.05
          if (!vis) tr.el.style.display = 'none'
          else {
            const x = ((v4.x / v4.w + 1) / 2) * cw
            const y = ((1 - v4.y / v4.w) / 2) * ch
            tr.el.style.display = ''
            tr.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
            tr.el.style.zIndex = String(1000 - Math.round(v4.w * 10) % 1000)
          }
        }
      })

      // seguir al tren elegido (fuera del render, como mucho ~30 veces por segundo)
      if (follow >= 0 && performance.now() - lastFollow > 33) {
        lastFollow = performance.now()
        const tr = trains[follow]
        setTimeout(() => map.setCenter([tr.lon, tr.lat]), 0)
      }

      const m = new THREE.Matrix4().fromArray(matrix)
      // metros → coordenadas Mercator (el eje y se invierte: norte = -y en Mercator)
      const l = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(unit, -unit, unit))
      camera.projectionMatrix = m.multiply(l)
      renderer.resetState()
      renderer.render(scene, camera)
      map.triggerRepaint()
    },

    onRemove() {
      trains.forEach((t) => t.el?.remove())
      renderer?.dispose()
    },
  }
}
