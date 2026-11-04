// Capa personalizada de MapLibre que dibuja trenes de metro en 3D con Three.js
// dentro del propio mapa (comparten cámara y contexto WebGL).
import * as THREE from 'three'
import maplibregl from 'maplibre-gl'
import { CENTER, RAIL_PATHS, toLocal, pingPong } from './geo.js'

const EXAGGERATE = 4 // los trenes reales son diminutos a escala de ciudad: se agrandan para verlos
const CARS = 4

export function createMetroLayer(getMetro) {
  let map, camera, scene, renderer, root
  const trains = []
  const origin = maplibregl.MercatorCoordinate.fromLngLat([CENTER.lon, CENTER.lat], 0)
  const unit = origin.meterInMercatorCoordinateUnits()

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

  return {
    id: 'metro3d',
    type: 'custom',
    renderingMode: '3d',

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
          trains.push({ g, line, li, k, color: line.color, delayed: false })
        }
      })
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
    },

    render(gl, matrix) {
      const t = performance.now() / 1000
      const status = getMetro?.() || []
      trains.forEach((tr) => {
        const delayed = status.find((l) => l.id === tr.line.id)?.status === 'retraso'
        if (delayed !== tr.delayed) {
          tr.delayed = delayed
          tr.g.userData.mat.color.set(delayed ? '#ff4d6d' : tr.color)
        }
        const v = delayed ? 13 : 22 // m/s: con retraso van más lentos
        const p = pingPong(tr.line.path, t, v, (tr.k * tr.line.path.length * 2) / 3 + tr.li * 500)
        const [e, n] = toLocal([p.lon, p.lat])
        tr.g.position.set(e, n, 10) // metros respecto al centro; z = altura
        tr.g.rotation.z = Math.atan2(p.north, p.east)
      })

      const m = new THREE.Matrix4().fromArray(matrix)
      // metros → coordenadas Mercator (el eje y se invierte: norte = -y en Mercator)
      const l = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(unit, -unit, unit))
      camera.projectionMatrix = m.multiply(l)
      renderer.resetState()
      renderer.render(scene, camera)
      map.triggerRepaint()
    },

    onRemove() {
      renderer?.dispose()
    },
  }
}
