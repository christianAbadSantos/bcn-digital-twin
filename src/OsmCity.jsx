// Ciudad REAL en la escena 3D: relieve (DEM ICGC 5 m / Terrarium), edificios de OpenStreetMap con
// su altura (incluidas las partes de Sagrada Família y Arc de Triomf) e imagen aérea o de satélite.
//
// Para no saturar CPU/GPU en dispositivos pequeños:
//  - todo el trabajo pesado (descarga, decodificación, extrusión, triangulación) va en Web Workers;
//  - solo se piden las teselas que están en el FRUSTUM de la cámara (y las muy cercanas), por orden de distancia;
//  - LOD por distancia: cerca = edificios + imagen de más resolución; lejos = solo relieve con imagen ligera;
//  - three.js descarta por frustum cada malla de tesela (boundingSphere calculada);
//  - se descargan de memoria (GPU incluida) las teselas que quedan lejos;
//  - radio, resolución y nº de workers dependen del perfil del dispositivo (deviceTier.js).
import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { BASE_Z, IMAGERY, tileRange, sceneXZ, x2lon, y2lat } from './tileMath.js'
import { groundTiles, sceneToLonLat } from './ground.js'
import { lon2x, lat2y } from './tileMath.js'

const RANGE = tileRange(BASE_Z)

function makePool(n) {
  const workers = Array.from({ length: n }, () => new Worker(new URL('./workers/tileWorker.js', import.meta.url), { type: 'module' }))
  const busy = workers.map(() => 0)
  const waiting = new Map()
  let seq = 0
  workers.forEach((w) =>
    (w.onmessage = (e) => {
      const p = waiting.get(e.data.id)
      if (!p) return
      waiting.delete(e.data.id)
      busy[p.wi]--
      e.data.ok ? p.res(e.data) : p.rej(new Error(e.data.error))
    }),
  )
  return {
    get inflight() { return waiting.size },
    run(msg) {
      let wi = 0
      busy.forEach((b, i) => b < busy[wi] && (wi = i))
      busy[wi]++
      const id = ++seq
      return new Promise((res, rej) => {
        waiting.set(id, { res, rej, wi })
        workers[wi].postMessage({ ...msg, id })
      })
    },
    dispose() { workers.forEach((w) => w.terminate()) },
  }
}

const indexCache = new Map()
function gridIndex(V) {
  if (indexCache.has(V)) return indexCache.get(V)
  const N = V - 1
  const idx = new (V * V > 65535 ? Uint32Array : Uint16Array)(N * N * 6)
  let k = 0
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1
      idx.set([a, c, b, b, c, d], k)
      k += 6
    }
  const attr = new THREE.BufferAttribute(idx, 1)
  indexCache.set(V, attr)
  return attr
}

function bitmapTexture(bmp, renderer) {
  const t = new THREE.Texture(bmp)
  t.flipY = false
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.needsUpdate = true
  t.userData.bmp = bmp
  return t
}
const freeTexture = (t) => {
  if (!t) return
  t.dispose()
  t.userData.bmp?.close?.()
}

export default function OsmCity({ tier, tech, imagery = 'icgc', onStats }) {
  const { camera, gl, controls, scene } = useThree()
  const root = useRef()
  const pool = useMemo(() => makePool(tier.workers), [tier.workers])
  const tiles = useRef(new Map())
  const acc = useRef(0)
  const statsT = useRef(0)
  const info = useRef({ demSrc: null, errors: 0, osmFail: 0 })
  const styleRef = useRef({ tech, imagery })
  styleRef.current = { tech, imagery }

  const bldMat = useMemo(() => {
    const M = tier.lambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial
    return new M({ vertexColors: true, ...(tier.lambert ? {} : { roughness: 0.85, metalness: 0.05 }) })
  }, [tier.lambert])

  // limpiar todo al desmontar
  useEffect(
    () => () => {
      tiles.current.forEach((t) => disposeTile(t))
      tiles.current.clear()
      groundTiles.clear()
      pool.dispose()
      bldMat.dispose()
    },
    [pool, bldMat],
  )

  function disposeTile(t) {
    t.terrain?.geometry.dispose()
    t.terrain?.material.dispose()
    freeTexture(t.tex)
    t.bld?.geometry.dispose()
    if (t.group) root.current?.remove(t.group)
    groundTiles.delete(t.x, t.y)
    t.dead = true
  }

  function setTex(t, bmp, kind, zoom) {
    if (t.dead) return void bmp.close?.()
    const old = t.tex
    t.tex = bitmapTexture(bmp, gl)
    t.texKind = kind
    t.texZoom = zoom
    t.terrain.material.map = t.tex
    t.terrain.material.needsUpdate = true
    freeTexture(old)
  }

  async function loadTile(t) {
    t.loading = true
    const st = styleRef.current
    try {
      const r = await pool.run({
        type: 'chunk', z: BASE_Z, x: t.x, y: t.y,
        verts: t.far ? Math.max(16, tier.terrainVerts / 4) : tier.terrainVerts,
        texSize: t.far ? 256 : 1024,
        palette: st.tech ? 'tech' : 'map',
        exclude: [],
        minArea: tier.key === 'low' ? 40 : 0,
      })
      if (t.dead) return
      if (r.demSrc) info.current.demSrc = r.demSrc
      if (!r.osm) info.current.osmFail++
      const g = new THREE.Group()
      // relieve
      const tg = new THREE.BufferGeometry()
      tg.setAttribute('position', new THREE.BufferAttribute(r.terrain.position, 3))
      tg.setAttribute('uv', new THREE.BufferAttribute(r.terrain.uv, 2))
      tg.setIndex(gridIndex(r.terrain.V))
      tg.computeVertexNormals()
      tg.computeBoundingSphere()
      const M = tier.lambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial
      const tm = new M({ color: '#ffffff', ...(tier.lambert ? {} : { roughness: 0.97 }) })
      const terrain = new THREE.Mesh(tg, tm)
      terrain.receiveShadow = tier.shadows
      g.add(terrain)
      t.terrain = terrain
      groundTiles.set(t.x, t.y, r.terrain.heights, r.terrain.V)
      if (r.map) setTex(t, r.map, st.tech ? 'tech' : 'map', 0)
      // edificios (solo teselas cercanas)
      if (!t.far && r.bld && r.bld.n) {
        const bg = new THREE.BufferGeometry()
        bg.setAttribute('position', new THREE.BufferAttribute(r.bld.position, 3))
        bg.setAttribute('normal', new THREE.BufferAttribute(r.bld.normal, 3))
        bg.userData.cTech = new THREE.BufferAttribute(r.bld.colorTech, 3, true)
        bg.userData.cReal = new THREE.BufferAttribute(r.bld.colorReal, 3, true)
        bg.setAttribute('color', st.tech ? bg.userData.cTech : bg.userData.cReal)
        bg.setIndex(new THREE.BufferAttribute(r.bld.index, 1))
        bg.computeBoundingSphere()
        const bm = new THREE.Mesh(bg, bldMat)
        bm.castShadow = tier.shadows
        bm.receiveShadow = tier.shadows
        g.add(bm)
        t.bld = bm
        t.nBld = r.bld.index.length / 3
      }
      t.group = g
      root.current?.add(g)
      t.ready = true
    } catch {
      info.current.errors++
      t.failedAt = performance.now()
    } finally {
      t.loading = false
    }
  }

  async function retexture(t, want) {
    t.texPending = true
    const st = styleRef.current
    try {
      if (want.kind === 'img') {
        const src = IMAGERY[st.imagery] || IMAGERY.icgc
        const r = await pool.run({ type: 'imagery', z: BASE_Z, x: t.x, y: t.y, zoom: want.zoom, tpl: src.url })
        setTex(t, r.img, `img:${st.imagery}`, want.zoom)
      } else {
        const r = await pool.run({ type: 'paint', z: BASE_Z, x: t.x, y: t.y, palette: want.kind, texSize: t.far ? 256 : 1024 })
        setTex(t, r.map, want.kind, 0)
      }
    } catch {
      // imagen no disponible: se queda la textura vectorial
      t.texFail = `${want.kind}:${want.zoom}:${st.imagery}`
    } finally {
      t.texPending = false
    }
  }

  // cambio de estilo: colores de edificios al momento; texturas se reponen en el bucle
  useEffect(() => {
    tiles.current.forEach((t) => {
      const g = t.bld?.geometry
      if (g) g.setAttribute('color', tech ? g.userData.cTech : g.userData.cReal)
      t.texFail = null
    })
  }, [tech, imagery])

  const frustum = useMemo(() => new THREE.Frustum(), [])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const box = useMemo(() => new THREE.Box3(), [])

  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < 0.2) return // la gestión de teselas corre a 5 Hz, no en cada fotograma
    acc.current = 0
    const target = controls?.target || new THREE.Vector3()
    const camDist = camera.position.distanceTo(target) // unidades de escena (×100 m)
    const scale = THREE.MathUtils.clamp(camDist / 12, 0.55, 1.5)
    const R = tier.osmRadius * scale // m: radio con edificios
    const RF = R * 2.2 // m: radio solo relieve
    m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(m4)
    const [tlon, tlat] = sceneToLonLat(target.x, target.z)
    const span = RF / 1500 + 1
    const cx = lon2x(tlon, BASE_Z), cy = lat2y(tlat, BASE_Z)
    const want = []
    for (let y = Math.max(RANGE.y0, Math.floor(cy - span)); y <= Math.min(RANGE.y1, Math.floor(cy + span)); y++) {
      for (let x = Math.max(RANGE.x0, Math.floor(cx - span)); x <= Math.min(RANGE.x1, Math.floor(cx + span)); x++) {
        const [ax, az] = sceneXZ(x2lon(x, BASE_Z), y2lat(y, BASE_Z))
        const [bx, bz] = sceneXZ(x2lon(x + 1, BASE_Z), y2lat(y + 1, BASE_Z))
        // distancia (m) del punto mirado al rectángulo de la tesela
        const dx = Math.max(ax - target.x, 0, target.x - bx), dz = Math.max(az - target.z, 0, target.z - bz)
        const d = Math.hypot(dx, dz) * 100
        if (d > RF) continue
        box.min.set(Math.min(ax, bx), -0.2, Math.min(az, bz))
        box.max.set(Math.max(ax, bx), 2.2, Math.max(az, bz))
        const vis = frustum.intersectsBox(box)
        want.push({ key: `${x}/${y}`, x, y, d, vis, far: d > R })
      }
    }
    want.sort((a, b) => a.d * (a.vis ? 1 : 3) - b.d * (b.vis ? 1 : 3))
    const limit = tier.maxTiles * 3
    want.length = Math.min(want.length, limit) // tope del perfil: lo más lejano no se carga (lo tapa la niebla)
    // como mucho tier.maxTiles teselas con edificios (las más cercanas); el resto, solo relieve
    let nearN = 0
    for (const w of want) if (!w.far && ++nearN > tier.maxTiles) w.far = true

    // niebla a la medida de lo cargado: esconde el borde de las teselas sin tapar lo cercano
    if (scene.fog) {
      scene.fog.near = camDist * 0.85 + R / 300
      scene.fog.far = camDist + RF / 100
    }

    const map = tiles.current
    const cap = tier.workers * 2
    const now = performance.now()
    const st = styleRef.current
    for (const w of want) {
      let t = map.get(w.key)
      // fuera de cámara solo se cargan las teselas muy cercanas
      if (!w.vis && w.d > R * 0.5) { if (t) t.lastSeen = now; continue }
      if (t && t.ready && t.far && !w.far && !t.loading) {
        // se ha acercado: reconstruir con edificios
        disposeTile(t)
        map.delete(w.key)
        t = null
      }
      if (!t) {
        if (pool.inflight >= cap) continue
        t = { key: w.key, x: w.x, y: w.y, far: w.far }
        map.set(w.key, t)
        loadTile(t)
        continue
      }
      t.lastSeen = now
      if (t.failedAt && now - t.failedAt > 15000 && !t.loading && pool.inflight < cap) { t.failedAt = 0; loadTile(t) }
      if (!t.ready || t.texPending || pool.inflight >= cap) continue
      // LOD de la textura
      let wantTex
      if (st.tech) wantTex = { kind: 'tech', zoom: 0 }
      else {
        const src = IMAGERY[st.imagery] || IMAGERY.icgc
        const z = w.d < R * 0.35 ? tier.imgNearZoom : w.d < R ? tier.imgZoom : BASE_Z
        wantTex = { kind: 'img', zoom: Math.min(z, src.maxZ) }
      }
      const curKind = wantTex.kind === 'img' ? `img:${st.imagery}` : wantTex.kind
      const differs = t.texKind !== curKind || (wantTex.kind === 'img' && t.texZoom !== wantTex.zoom)
      const failKey = `${wantTex.kind}:${wantTex.zoom}:${st.imagery}`
      // mejorar solo lo que se ve; empeorar (liberar memoria) aunque no se vea
      if (differs && t.texFail !== failKey && (w.vis || (wantTex.kind === 'img' && t.texZoom > wantTex.zoom))) retexture(t, wantTex)
    }

    // descargar lo lejano y respetar el tope de teselas del perfil
    const keep = new Set(want.map((w) => w.key))
    const list = [...map.values()]
    for (const t of list) if (!keep.has(t.key) && !t.loading) { disposeTile(t); map.delete(t.key) }
    if (map.size > limit) {
      const order = [...map.values()].filter((t) => !t.loading).sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0))
      for (const t of order.slice(0, map.size - limit)) { disposeTile(t); map.delete(t.key) }
    }

    statsT.current += 0.2
    if (onStats && statsT.current >= 1) {
      statsT.current = 0
      let tris = 0, near = 0, ready = 0
      map.forEach((t) => { tris += t.nBld || 0; if (t.ready) ready++; if (t.ready && !t.far) near++ })
      onStats({ tiles: ready, near, tris, inflight: pool.inflight, demSrc: info.current.demSrc, errors: info.current.errors, osmFail: info.current.osmFail, calls: gl.info.render.calls })
    }
  })

  return <group ref={root} />
}
