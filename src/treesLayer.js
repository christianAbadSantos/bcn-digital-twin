// Árboles reales del arbolado viario de Barcelona (Open Data BCN) dibujados en 3D con Three.js
// dentro del mapa. Posición y grupo (frondosa / palmera / conífera) son REALES; la altura y el
// tamaño de copa NO vienen en el CSV: se generan de forma ilustrativa (deterministas por árbol).
// Solo se dibujan los árboles cercanos al centro de la vista y con zoom suficiente.
import * as THREE from 'three'
import maplibregl from 'maplibre-gl'
import { CENTER, toLocal } from './geo.js'

const MIN_ZOOM = 14.2
const MAX_DRAW = 60000 // tope de instancias por repintado
const hash = (i) => {
  let x = (i + 1) * 2654435761
  x ^= x >>> 15
  x = Math.imul(x, 2246822519)
  x ^= x >>> 13
  return ((x >>> 0) % 10000) / 10000
}

// devuelve {state} para que la interfaz explique qué pasa
export function createTreesLayer(onStatus) {
  let map, camera, scene, renderer
  let E = null, N = null, G = null, count = 0
  let trunks, broad, cone, palm
  let lastKey = ''
  const origin = maplibregl.MercatorCoordinate.fromLngLat([CENTER.lon, CENTER.lat], 0)
  const unit = origin.meterInMercatorCoordinateUnits()
  const tmp = new THREE.Object3D()
  const col = new THREE.Color()

  async function load() {
    try {
      const mr = await fetch('/data/trees.json')
      const meta = mr.ok ? await mr.json().catch(() => null) : null
      if (!meta?.n) return onStatus({ state: 'missing' })
      const br = await fetch('/data/trees.bin')
      const buf = br.ok ? await br.arrayBuffer() : null
      if (!buf || buf.byteLength !== meta.n * 9) return onStatus({ state: 'missing' })
      const n = meta.n
      const dv = new DataView(buf)
      E = new Float32Array(n); N = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const [e, nn] = toLocal([dv.getInt32(i * 8, true) / 1e6, dv.getInt32(i * 8 + 4, true) / 1e6])
        E[i] = e; N[i] = nn
      }
      G = new Uint8Array(buf, n * 8, n)
      count = n
      onStatus({ state: 'ok', n, meta })
      refresh(true)
    } catch {
      onStatus({ state: 'missing' })
    }
  }

  function makeMeshes(cap) {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5)
    const crownGeo = new THREE.IcosahedronGeometry(1, 0)
    const coneGeo = new THREE.ConeGeometry(1, 1, 7).rotateX(Math.PI / 2).translate(0, 0, 0.5)
    const mk = (geo, color) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }), cap)
      m.count = 0
      m.frustumCulled = false
      scene.add(m)
      return m
    }
    trunks = mk(trunkGeo, '#6b4f36')
    broad = mk(crownGeo, '#ffffff')
    palm = mk(crownGeo, '#ffffff')
    cone = mk(coneGeo, '#ffffff')
  }

  // elige los árboles dentro de un radio alrededor del centro de la vista
  function refresh(force) {
    if (!map || !E) return
    const z = map.getZoom()
    if (z < MIN_ZOOM) {
      trunks.count = broad.count = palm.count = cone.count = 0
      if (lastKey !== 'far') onStatus({ state: 'far', n: count })
      lastKey = 'far'
      return
    }
    const c = map.getCenter()
    const [ce, cn] = toLocal([c.lng, c.lat])
    const key = `${Math.round(ce / 120)}|${Math.round(cn / 120)}|${Math.round(z * 2)}`
    if (!force && key === lastKey) return
    lastKey = key
    const R = z >= 16 ? 600 : z >= 15 ? 1000 : 1500
    const R2 = R * R
    let nt = 0, nb = 0, np = 0, nc = 0
    for (let i = 0; i < count && nt < MAX_DRAW; i++) {
      const dx = E[i] - ce, dy = N[i] - cn
      if (dx * dx + dy * dy > R2) continue
      const h1 = hash(i), h2 = hash(i + 7919)
      const g = G[i]
      let h, r
      if (g === 1) { h = 8 + h1 * 5; r = 2.2 + h2 } // palmera
      else if (g === 2) { h = 9 + h1 * 6; r = 2.2 + h2 * 1.2 } // conífera
      else { h = 6.5 + h1 * 5; r = 3 + h2 * 2.2 } // frondosa
      // tronco
      const th = g === 1 ? h * 0.8 : g === 2 ? 1.5 : h * 0.45
      tmp.position.set(E[i], N[i], 0); tmp.rotation.set(0, 0, 0)
      tmp.scale.set(g === 1 ? 0.8 : 1, g === 1 ? 0.8 : 1, th); tmp.updateMatrix()
      trunks.setMatrixAt(nt++, tmp.matrix)
      // copa
      if (g === 0) {
        tmp.position.set(E[i], N[i], th + r * 0.7); tmp.scale.set(r, r, r * 0.85); tmp.updateMatrix()
        broad.setMatrixAt(nb, tmp.matrix); broad.setColorAt(nb++, col.setHSL(0.27 + hash(i + 31) * 0.07, 0.45, 0.28 + h2 * 0.12))
      } else if (g === 1) {
        tmp.position.set(E[i], N[i], th); tmp.scale.set(r, r, r * 0.45); tmp.updateMatrix()
        palm.setMatrixAt(np, tmp.matrix); palm.setColorAt(np++, col.setHSL(0.3, 0.5, 0.3))
      } else {
        tmp.position.set(E[i], N[i], th); tmp.scale.set(r, r, h - th); tmp.updateMatrix()
        cone.setMatrixAt(nc, tmp.matrix); cone.setColorAt(nc++, col.setHSL(0.35, 0.5, 0.2))
      }
    }
    trunks.count = nt; broad.count = nb; palm.count = np; cone.count = nc
    for (const m of [trunks, broad, palm, cone]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    onStatus({ state: 'ok', n: count, shown: nt, capped: nt >= MAX_DRAW })
    map.triggerRepaint()
  }

  return {
    id: 'trees3d',
    type: 'custom',
    renderingMode: '3d',

    onAdd(m, gl) {
      map = m
      camera = new THREE.Camera()
      scene = new THREE.Scene()
      scene.add(new THREE.AmbientLight(0xffffff, 0.9))
      const sun = new THREE.DirectionalLight(0xffffff, 1.0)
      sun.position.set(0.3, -0.5, 1).normalize()
      scene.add(sun)
      makeMeshes(MAX_DRAW)
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
      map.on('moveend', () => refresh(false))
      map.on('zoomend', () => refresh(false))
      load()
    },

    render(gl, matrix) {
      if (!E || trunks.count === 0) return
      const m = new THREE.Matrix4().fromArray(matrix)
      const l = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(unit, -unit, unit))
      camera.projectionMatrix = m.multiply(l)
      renderer.resetState()
      renderer.render(scene, camera)
    },

    onRemove() {
      renderer?.dispose()
    },
  }
}
