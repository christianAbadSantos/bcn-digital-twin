import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html, PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { COAST, PLACES, PORT_CENTER, RAIL_PATHS, SHIP_PATHS, toLocal, pingPong } from './geo.js'
import { mulberry32 } from './sim.js'
import { S, terrainH, skyState } from './scene3d.js'
import OsmCity from './OsmCity.jsx'
import PortIfc from './PortIfc.jsx'
import { LANDMARKS } from './landmarks.js'
import { detectTier, lowerTier } from './deviceTier.js'
import { groundY } from './ground.js'
import { IMAGERY, DEM_SOURCES } from './tileMath.js'
import { PORT_BIM_CATALOG } from './portBim.js'

// Sigue la cota del relieve real (si está cargado); si no, usa la y que se le da
function useGround(ref, x, z, y0, dy = 0) {
  useFrame(() => {
    if (!ref.current) return
    const g = groundY(x, z)
    ref.current.position.y = (g ?? y0) + dy
  })
}
// [lon,lat] -> posición de escena (x = este, z = -norte)
const P = (c) => {
  const [e, n] = toLocal(c)
  return [e * S, 0, -n * S]
}
const headingOf = (east, north) => Math.atan2(north, east) // rotación Y para eje largo en X (z = -norte)

// ---------- Cielo (degradado + resplandor del sol) ----------
function Sky({ sky }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color('#4f95dc') },
          uBottom: { value: new THREE.Color('#bcd7ee') },
          uSun: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color('#fff4e0') },
          uGlow: { value: 1 },
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec3 vP; uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uSun; uniform vec3 uSunColor; uniform float uGlow;
          void main(){
            float h = clamp(vP.y, 0.0, 1.0);
            vec3 c = mix(uBottom, uTop, pow(h, 0.55));
            float s = max(dot(normalize(vP), normalize(uSun)), 0.0);
            c += uSunColor * (pow(s, 90.0) * 0.9 + pow(s, 7.0) * 0.18) * uGlow;
            gl_FragColor = vec4(c, 1.0);
            gl_FragColor = linearToOutputTexel(gl_FragColor);
          }`,
      }),
    []
  )
  useLayoutEffect(() => {
    mat.uniforms.uTop.value.set(sky.top)
    mat.uniforms.uBottom.value.set(sky.horizon)
    mat.uniforms.uSun.value.set(...sky.sunDir)
    mat.uniforms.uSunColor.value.set(sky.lightColor)
    mat.uniforms.uGlow.value = sky.night ? 0.35 : 1 - sky.wet
  }, [sky, mat])
  return (
    <mesh renderOrder={-1}>
      <sphereGeometry args={[1500, 32, 16]} />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}

// ---------- Terreno con relieve aproximado (Collserola, Montjuïc) ----------
function Terrain({ tech }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(300, 300, 240, 240)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const urban = new THREE.Color(tech ? '#15171d' : '#585b62')
    const grass = new THREE.Color(tech ? '#1b2233' : '#58863a')
    const forest = new THREE.Color(tech ? '#222c44' : '#2f5a2c')
    const rock = new THREE.Color(tech ? '#3b4766' : '#78705a')
    const soil = new THREE.Color(tech ? '#1a2030' : '#5d5037')
    const c = new THREE.Color()
    const sm = (a, b, v) => Math.min(1, Math.max(0, (v - a) / (b - a)))
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = terrainH(x, z)
      pos.setY(i, h)
      const d = Math.hypot(x, z)
      c.copy(urban).lerp(grass, Math.max(sm(0.04, 0.3, h), sm(58, 80, d)))
      c.lerp(forest, sm(0.4, 1.2, h))
      c.lerp(rock, sm(3.2, 5.5, h))
      // manchas de campos y variación de tono (como en la referencia)
      const nz = Math.sin(x * 0.55) * Math.cos(z * 0.43) + 0.5 * Math.sin(x * 1.7 + z * 1.3)
      if (h > 0.08 && nz > 0.85) c.lerp(soil, 0.55)
      c.multiplyScalar(0.93 + 0.1 * Math.sin(x * 2.1) * Math.cos(z * 1.9))
      colors.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [tech])
  return (
    <group>
      {tech && <gridHelper args={[300, 150, '#2b303b', '#1a1d25']} position={[0, 0.012, 0]} />}
      <mesh geometry={geo} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.06, 0]}>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color={tech ? '#0a0b0e' : '#4d5e40'} roughness={1} />
      </mesh>
    </group>
  )
}

// ---------- Mar con oleaje animado ----------
function Sea({ tech }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape()
    const pts = [...COAST.map((c) => toLocal(c)), toLocal([2.9, 41.9]), toLocal([2.9, 40.8]), toLocal([1.5, 40.8])]
    shape.moveTo(pts[0][0] * S, pts[0][1] * S)
    pts.slice(1).forEach(([e, n]) => shape.lineTo(e * S, n * S))
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }, [])
  const tex = useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 256
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#9fb4c4'
    ctx.fillRect(0, 0, 256, 256)
    const rng = mulberry32(5)
    for (let i = 0; i < 700; i++) {
      const x = rng() * 256, y = rng() * 256, l = 6 + rng() * 22
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + rng() * 0.18})`
      ctx.lineWidth = 1 + rng() * 1.4
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + l, y + (rng() - 0.5) * 3)
      ctx.stroke()
    }
    const t = new THREE.CanvasTexture(cv)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(0.35, 0.35)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useFrame((_, dt) => {
    tex.offset.x += dt * 0.004
    tex.offset.y += dt * 0.0025
  })
  return (
    <mesh geometry={geo} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} receiveShadow>
      <meshStandardMaterial color={tech ? '#176079' : '#2c7199'} emissive={tech ? '#04202b' : '#000000'} map={tex} roughness={0.28} metalness={0.2} />
    </mesh>
  )
}

// ---------- Ciudad: bloques tipo Eixample (instanciados) ----------
const STONE = ['#c9b8a0', '#bfae95', '#d6c8b0', '#b5a58f', '#cdbba5', '#a99a86', '#d2c2a8']
// estilo técnico (visor BIM): pizarra, azul marino y algún cristal verdoso
const SLATE = ['#4a5075', '#3a4268', '#5c6285', '#2f3658', '#6a7090', '#46507a', '#2f6272']
const STEP = 1.5 // ~150 m entre centros de manzana
const R_CITY = 62

// Rejilla alineada con la costa; la comparten edificios, coches y árboles de calle
const GRID = (() => {
  const a = P(COAST[1])
  const b = P(COAST[6])
  const side = (x, z) => (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0])
  const landSign = Math.sign(side(0, 0))
  const ang = Math.atan2(b[2] - a[2], b[0] - a[0])
  const cos = Math.cos(ang)
  const sin = Math.sin(ang)
  const toW = (lx, lz) => [lx * cos - lz * sin, lx * sin + lz * cos]
  const urban = (x, z) => Math.sign(side(x, z)) === landSign && Math.hypot(x, z) <= R_CITY && terrainH(x, z) < 0.12
  const rng = mulberry32(42)
  const blocks = []
  for (let i = -40; i <= 40; i++) {
    for (let j = -40; j <= 40; j++) {
      const [x, z] = toW(i * STEP, j * STEP)
      if (!urban(x, z)) continue
      const d = Math.hypot(x, z)
      // Eixample: 5-8 plantas casi todas; alguna torre suelta; algo más alto en el centro
      const tower = rng() > 0.95 ? rng() * 0.45 : 0
      const h = 0.2 + rng() * 0.12 + tower + Math.max(0, 0.08 - d / 800)
      blocks.push({ x, z, lx: i * STEP, lz: j * STEP, y0: terrainH(x, z), h, c: Math.floor(rng() * STONE.length) })
    }
  }
  return { ang, cos, sin, toW, urban, blocks }
})()

function City({ tech }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const m = new THREE.Object3D()
    const col = new THREE.Color()
    GRID.blocks.forEach((it, i) => {
      m.position.set(it.x, it.y0 + it.h / 2, it.z)
      m.rotation.set(0, -GRID.ang, 0)
      m.scale.set(1.15, it.h, 1.15)
      m.updateMatrix()
      ref.current.setMatrixAt(i, m.matrix)
      ref.current.setColorAt(i, col.set((tech ? SLATE : STONE)[it.c]).offsetHSL(0, 0, (((i * 37) % 11) - 5) * 0.006))
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.instanceColor.needsUpdate = true
  }, [tech])
  return (
    <instancedMesh ref={ref} args={[null, null, GRID.blocks.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  )
}

// ---------- Árboles de calle (junto a las esquinas de las manzanas) ----------
function StreetTrees() {
  const trunk = useRef()
  const crown = useRef()
  const items = useMemo(() => {
    const rng = mulberry32(11)
    const out = []
    GRID.blocks.forEach((bk) => {
      if (rng() > 0.5) return
      const [x, z] = GRID.toW(bk.lx + 0.63, bk.lz + (rng() > 0.5 ? 0.3 : -0.3))
      out.push({ x, z, y: terrainH(x, z), s: 0.8 + rng() * 0.5, c: rng() })
    })
    return out
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Object3D()
    const col = new THREE.Color()
    items.forEach((t, i) => {
      m.rotation.set(0, 0, 0)
      m.position.set(t.x, t.y + 0.03 * t.s, t.z)
      m.scale.set(t.s, t.s, t.s)
      m.updateMatrix()
      trunk.current.setMatrixAt(i, m.matrix)
      m.position.set(t.x, t.y + 0.1 * t.s, t.z)
      m.scale.set(0.05 * t.s, 0.05 * t.s, 0.05 * t.s)
      m.updateMatrix()
      crown.current.setMatrixAt(i, m.matrix)
      crown.current.setColorAt(i, col.setHSL(0.26 + t.c * 0.08, 0.42, 0.22 + t.c * 0.12))
    })
    ;[trunk, crown].forEach((r) => (r.current.instanceMatrix.needsUpdate = true))
    crown.current.instanceColor.needsUpdate = true
  }, [items])
  return (
    <group>
      <instancedMesh ref={trunk} args={[null, null, items.length]}>
        <cylinderGeometry args={[0.008, 0.01, 0.06, 5]} />
        <meshStandardMaterial color="#5b4630" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[null, null, items.length]} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
    </group>
  )
}

// ---------- Tráfico: coches por las calles de la rejilla (velocidad ligada a la congestión real/simulada) ----------
const CAR_COLORS = ['#f2f2f2', '#d9d9d9', '#1b1d22', '#8a8f98', '#b3262e', '#2f5d9e', '#e7b416', '#3f7a52']
function Cars({ live, tech }) {
  const ref = useRef()
  const speedRef = useRef(1)
  speedRef.current = live ? Math.min(1, Math.max(0.25, live.zones.reduce((s, z) => s + z.ratio, 0) / live.zones.length)) : 1
  const cars = useMemo(() => {
    const rng = mulberry32(21)
    const out = []
    for (let n = 0; n < 900 && out.length < 420; n++) {
      const alongX = rng() > 0.5
      const k = Math.floor((rng() - 0.5) * 70) // calle k-ésima
      const off = (k + 0.5) * STEP // eje de la calle
      const dir = rng() > 0.5 ? 1 : -1
      const lane = off + dir * 0.07
      // tramo urbano continuo de esa calle
      const ok = (t) => {
        const [x, z] = alongX ? GRID.toW(t, lane) : GRID.toW(lane, t)
        return GRID.urban(x, z)
      }
      if (!ok(0) && !ok(STEP * 3) && !ok(-STEP * 3)) continue
      let lo = 0, hi = 0
      while (lo > -R_CITY && ok(lo - 1)) lo -= 1
      while (hi < R_CITY && ok(hi + 1)) hi += 1
      if (hi - lo < 10) continue
      out.push({ alongX, lane, dir, lo, hi, t0: rng() * (hi - lo), v: 0.35 + rng() * 0.3, c: Math.floor(rng() * CAR_COLORS.length) })
    }
    return out
  }, [])
  useLayoutEffect(() => {
    const col = new THREE.Color()
    cars.forEach((c, i) => ref.current.setColorAt(i, col.set(CAR_COLORS[c.c])))
    ref.current.instanceColor.needsUpdate = true
  }, [cars])
  const m = useMemo(() => new THREE.Object3D(), [])
  const dist = useRef(0)
  useFrame((_, dt) => {
    dist.current += dt * speedRef.current
    cars.forEach((c, i) => {
      const L = c.hi - c.lo
      let u = (c.t0 + dist.current * c.v * 3) % L
      if (c.dir < 0) u = L - u
      const t = c.lo + u
      const [x, z] = c.alongX ? GRID.toW(t, c.lane) : GRID.toW(c.lane, t)
      const dx = c.alongX ? GRID.cos : -GRID.sin
      const dz = c.alongX ? GRID.sin : GRID.cos
      m.position.set(x, terrainH(x, z) + 0.016, z)
      m.rotation.set(0, -Math.atan2(dz * c.dir, dx * c.dir), 0)
      m.updateMatrix()
      ref.current.setMatrixAt(i, m.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[null, null, cars.length]} castShadow>
      <boxGeometry args={[0.075, 0.03, 0.032]} />
      <meshStandardMaterial roughness={0.45} metalness={0.4} emissive={tech ? '#ffffff' : '#000000'} emissiveIntensity={tech ? 0.25 : 0} />
    </instancedMesh>
  )
}

// ---------- Monumentos reconocibles (formas esquemáticas) ----------
function Landmarks() {
  const [gx, , gz] = P([2.1894, 41.4036])
  const [sx, , sz] = P([2.1744, 41.4036])
  const spires = [[-0.18, 0.1, 1.45], [0.18, 0.1, 1.45], [-0.18, -0.12, 1.2], [0.18, -0.12, 1.2], [0, 0, 1.75], [0, 0.22, 1.1]]
  return (
    <group>
      {/* Torre Glòries (~144 m) */}
      <mesh position={[gx, 0.72, gz]} castShadow>
        <cylinderGeometry args={[0.1, 0.13, 1.44, 24]} />
        <meshStandardMaterial color="#c9503e" roughness={0.45} metalness={0.25} />
      </mesh>
      {/* Sagrada Família (agujas, hasta ~170 m) */}
      <group position={[sx, 0, sz]}>
        {spires.map(([x, z, h], i) => (
          <mesh key={i} position={[x, h / 2, z]} castShadow>
            <coneGeometry args={[0.06, h, 8]} />
            <meshStandardMaterial color="#cdbb95" roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  )
}


// ---------- Línea de costa (espuma) ----------
function Shore({ tech }) {
  const line = useMemo(() => {
    const pts = COAST.map((c) => new THREE.Vector3(...P(c)).setY(0.06))
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: tech ? '#4cc9f0' : '#e8f4ff', transparent: true, opacity: 0.55 }))
  }, [tech])
  return <primitive object={line} />
}

// ---------- Bosque de Collserola (procedural, solo decorativo) ----------
function Forest() {
  const ref = useRef()
  const items = useMemo(() => {
    const rng = mulberry32(77)
    const out = []
    for (let t = 0; t < 160000 && out.length < 14000; t++) {
      const x = (rng() - 0.5) * 160
      const z = (rng() - 0.5) * 160
      const y = terrainH(x, z)
      if (y < 0.3 || Math.hypot(x, z) < 45) continue
      out.push({ x, y, z, w: 0.05 + rng() * 0.05, h: 0.12 + rng() * 0.12, c: rng() })
    }
    return out
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Object3D()
    const col = new THREE.Color()
    items.forEach((it, i) => {
      m.position.set(it.x, it.y + it.h / 2, it.z)
      m.scale.set(it.w, it.h, it.w)
      m.updateMatrix()
      ref.current.setMatrixAt(i, m.matrix)
      ref.current.setColorAt(i, col.setHSL(0.27 + it.c * 0.08, 0.4, 0.18 + it.c * 0.1))
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.instanceColor.needsUpdate = true
  }, [items])
  return (
    <instancedMesh ref={ref} args={[null, null, items.length]}>
      <coneGeometry args={[1, 1, 6]} />
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
  )
}

// ---------- Puntos de información flotantes ----------
function Pin({ pos, h = 1.1, color = '#ffd400', title, lines = [], tone = '' }) {
  const ref = useRef()
  const label = useRef()
  useGround(ref, pos[0], pos[2], pos[1])
  // etiqueta de tamaño fijo en pantalla: compacta de lejos, oculta muy lejos (no tapa la escena al acercarse)
  const wp = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    if (!label.current || !ref.current) return
    ref.current.getWorldPosition(wp)
    const d = camera.position.distanceTo(wp)
    label.current.style.display = d > 140 ? 'none' : ''
    label.current.classList.toggle('compact', d > 22)
  })
  return (
    <group position={pos} ref={ref}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, h, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} />
      </mesh>
      <mesh position={[0, h, 0]}>
        <sphereGeometry args={[0.07, 16, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Html position={[0, h + 0.1, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none', transform: 'translate3d(-50%,-100%,0)' }}>
        <div ref={label} className={`pin ${tone}`}>
          <b>{title}</b>
          {lines.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      </Html>
    </group>
  )
}

// punto sobre el terreno
const PT = (c) => {
  const [x, , z] = P(c)
  return [x, terrainH(x, z), z]
}
const ratioTone = (r) => (r < 0.6 ? 'bad' : r < 0.85 ? 'warn' : 'ok')
const ratioColor = { bad: '#ff4d5e', warn: '#ff9f1c', ok: '#34c77b' }
const SHOWN_PLACES = ['catalunya', 'portvell', 'espanya', 'campnou', 'vallhebron', 'aeroport']

function InfoPins({ live, data, hour, visible }) {
  if (!visible || !live) return null
  const run = live.port?.filter((c) => c.state === 'RUN').length ?? 0
  const boxes = live.port?.reduce((s, c) => s + (c.state === 'RUN' ? c.boxesPerHour : 0), 0) ?? 0
  const w = live.weather
  const nAcc = data.accidents.filter((a) => a.hourIdx > hour - 24 && a.hourIdx <= hour).length
  return (
    <group>
      {live.zones.map((z) => {
        const tone = ratioTone(z.ratio)
        return (
          <Pin key={z.id} pos={P([z.lon, z.lat])} h={1.3} color={ratioColor[tone]} tone={tone} title={z.name}
            lines={[`${Math.round(z.speed)} km/h (habitual ${Math.round(z.baseline)})`, `${z.acc2024} accidentes reales en 2024`, ...(z.incident ? ['⚠ incidente abierto'] : [])]} />
        )
      })}
      {PLACES.filter((p) => SHOWN_PLACES.includes(p.id)).map((p) => (
        <Pin key={p.id} pos={P([p.lon, p.lat])} h={0.75} color="#9aa3b2" title={p.name} />
      ))}
      <Pin pos={PT([2.1186, 41.4225])} h={0.8} color="#9aa3b2" title="Tibidabo" lines={['512 m']} />
      <Pin pos={PT([2.1655, 41.364])} h={0.8} color="#9aa3b2" title="Montjuïc" lines={['173 m']} />
      <Pin pos={P([2.1894, 41.4036])} h={1.9} color="#9aa3b2" title="Torre Glòries" lines={['144 m']} />
      <Pin pos={P(PORT_CENTER)} h={1.5} color="#4cc9f0" title="Puerto · grúas" lines={[`${run}/${live.port?.length ?? 0} en marcha`, `${boxes} contenedores/h (simulado)`]} />
      <Pin pos={P([2.225, 41.372])} h={2.1} color="#ffd400" title="Tiempo" lines={[`Lluvia ${w.rain.toFixed(1)} mm/h`, `Viento ${Math.round(w.wind)} km/h · ${Math.round(w.temp)} °C`, `${nAcc} accidentes reales en las últimas 24 h`]} />
    </group>
  )
}


// ---------- Cámara: vistas predefinidas con transición suave ----------
const V = (lon, lat, y) => {
  const [x, , z] = P([lon, lat])
  return new THREE.Vector3(x, y, z)
}
const PRESETS = {
  ciudad: { label: 'Ciudad', pos: new THREE.Vector3(0, 38, 78), look: new THREE.Vector3(0, 0, 0) },
  puerto: { label: 'Puerto', pos: V(2.1935, 41.347, 5), look: V(2.172, 41.345, 0.3) },
  montjuic: { label: 'Montjuïc', pos: V(2.186, 41.376, 1.4), look: V(2.1655, 41.364, 1.1) },
  calle: { label: 'Calle', pos: V(2.148, 41.39, 0.32), look: V(2.19, 41.4036, 0.25) },
  sagrada: { label: 'Sagrada Família', pos: V(2.1785, 41.3995, 2.6), look: V(2.1744, 41.4036, 1.2) },
  colom: { label: 'Port Vell (IFC)', pos: V(2.1812, 41.3732, 1.1), look: V(2.1785, 41.3752, 0.25) },
  arc: { label: 'Arc de Triomf', pos: V(2.1832, 41.3885, 0.9), look: V(2.18067, 41.39107, 0.6) },
  collserola: { label: 'Collserola', pos: V(2.156, 41.3935, 0.4), look: (() => { const v = V(2.1186, 41.4225, 0); v.y = terrainH(v.x, v.z) * 0.7; return v })() },
}
const TOUR = ['ciudad', 'sagrada', 'arc', 'colom', 'puerto', 'montjuic', 'calle', 'collserola']

function CameraRig({ goto, controls }) {
  useFrame((state, dt) => {
    if (!goto || !controls.current) return
    const k = 1 - Math.exp(-dt * 2.4)
    state.camera.position.lerp(goto.pos, k)
    controls.current.target.lerp(goto.look, k)
    controls.current.update()
  })
  return null
}

// escribe la posición de la cámara en el minimapa (sin re-renderizar React)
function CamProbe({ dotRef }) {
  const { camera } = useThree()
  useFrame(() => {
    const el = dotRef.current
    if (!el) return
    el.setAttribute('cx', String(80 + (camera.position.x / 75) * 80))
    el.setAttribute('cy', String(60 + (camera.position.z / 75) * 60))
  })
  return null
}

function MiniMap({ live, dotRef }) {
  const coast = useMemo(() => COAST.map((c) => { const [x, , z] = P(c); return [80 + (x / 75) * 80, 60 + (z / 75) * 60] }), [])
  const sea = `M${coast.map((q) => q.join(',')).join(' L')} L160,120 L0,120 L0,${coast[0][1]} Z`
  return (
    <svg viewBox="0 0 160 120" className="minimap">
      <rect width="160" height="120" fill="#12151a" />
      <path d={sea} fill="#10253a" />
      {RAIL_PATHS.map((l) => (
        <polyline key={l.id} fill="none" stroke={l.color} strokeWidth="1" opacity="0.8" points={l.coords.map((c) => { const [x, , z] = P(c); return `${80 + (x / 75) * 80},${60 + (z / 75) * 60}` }).join(' ')} />
      ))}
      {live?.zones.map((z) => {
        const [x, , zz] = P([z.lon, z.lat])
        return <circle key={z.id} cx={80 + (x / 75) * 80} cy={60 + (zz / 75) * 60} r="3" fill={z.ratio < 0.6 ? '#ff4d5e' : z.ratio < 0.85 ? '#ff9f1c' : '#34c77b'} />
      })}
      <circle ref={dotRef} cx="80" cy="60" r="3.2" fill="none" stroke="#ffd400" strokeWidth="1.5" />
    </svg>
  )
}

// histograma de accidentes reales + lluvia alrededor de la hora actual (±3 días)
function Spark({ data, hour }) {
  const W = 230, H = 46, N = 72
  const lo = Math.max(0, Math.min(hour - N, data.times.length - 2 * N - 1))
  const idx = Array.from({ length: 2 * N + 1 }, (_, i) => lo + i).filter((i) => i < data.times.length)
  const maxA = Math.max(2, ...idx.map((i) => data.perHour[i]))
  const maxR = Math.max(1, ...idx.map((i) => data.rain[i] || 0))
  const bw = W / idx.length
  const rainPath = idx.map((i, k) => `${k ? 'L' : 'M'}${(k * bw).toFixed(1)},${(H - ((data.rain[i] || 0) / maxR) * H * 0.9).toFixed(1)}`).join(' ')
  const cur = (hour - lo) * bw
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark">
      <path d={rainPath} fill="none" stroke="#4c9dff" strokeWidth="1.2" opacity="0.9" />
      {idx.map((i, k) => (data.perHour[i] ? <rect key={i} x={k * bw} y={H - (data.perHour[i] / maxA) * H} width={Math.max(1, bw - 0.6)} height={(data.perHour[i] / maxA) * H} fill="#ffd400" opacity="0.85" /> : null))}
      <line x1={cur} x2={cur} y1="0" y2={H} stroke="#fff" strokeWidth="1" />
    </svg>
  )
}

// ---------- Trenes 3D ----------
function Train({ path, color, offset, tag, tone }) {
  const g = useRef()
  useFrame(({ clock }) => {
    const p = pingPong(path, clock.elapsedTime, 28, offset)
    const [x, , z] = P([p.lon, p.lat])
    g.current.position.set(x, (groundY(x, z) ?? 0) + 0.18, z)
    g.current.rotation.y = headingOf(p.east, p.north)
  })
  return (
    <group ref={g}>
      {[-1.0, 0, 1.0].map((dx, i) => (
        <group key={i} position={[dx, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.9, 0.28, 0.32]} />
            <meshStandardMaterial color={color} metalness={0.4} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.8, 0.09, 0.34]} />
            <meshStandardMaterial color="#cfe8ff" emissive="#9fd3ff" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
      {tag && (
        <Html position={[0, 0.55, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`pin tag ${tone || ''}`}>{tag}</div>
        </Html>
      )}
    </group>
  )
}

function Rails({ visible, live }) {
  const lines = useMemo(
    () =>
      RAIL_PATHS.map((l) => {
        const pts = l.coords.map((c) => new THREE.Vector3(...P(c)).setY(0.05))
        return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: l.color }))
      }),
    []
  )
  return (
    <group visible={visible}>
      {lines.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
      {RAIL_PATHS.map((l, li) =>
        [0, 1, 2].map((k) => (
          <Train
            key={`${l.id}-${k}`}
            path={l.path}
            color={l.color}
            offset={(k * l.path.length * 2) / 3 + li * 500}
            tag={k === 0 && live ? `${l.id} · ${live.metro.find((m) => m.id === l.id)?.status === 'retraso' ? 'retraso' : 'normal'}` : null}
            tone={live?.metro.find((m) => m.id === l.id)?.status === 'retraso' ? 'bad' : ''}
          />
        ))
      )}
    </group>
  )
}

// ---------- Puerto: contenedores y barcos ----------
function Containers() {
  const ref = useRef()
  const items = useMemo(() => {
    const rng = mulberry32(9)
    const palette = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#e9c46a', '#8d99ae']
    const out = []
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 6; j++)
        if (rng() > 0.12) out.push({ i, j, h: 1 + Math.floor(rng() * 3), c: palette[Math.floor(rng() * palette.length)] })
    return out
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Object3D()
    const col = new THREE.Color()
    items.forEach((it, k) => {
      m.position.set(it.i * 0.42 - 3.4, it.h * 0.09 + 0.05, it.j * 0.2 - 0.5)
      m.scale.set(0.38, it.h * 0.18, 0.17)
      m.updateMatrix()
      ref.current.setMatrixAt(k, m.matrix)
      ref.current.setColorAt(k, col.set(it.c))
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.instanceColor.needsUpdate = true
  }, [items])
  const [x, , z] = P(PORT_CENTER)
  return (
    <group position={[x, 0, z]} rotation-y={0.5}>
      <mesh position={[0, 0.045, 0]} receiveShadow>
        <boxGeometry args={[8, 0.03, 3.4]} />
        <meshStandardMaterial color="#8a8d93" roughness={0.9} />
      </mesh>
      <instancedMesh ref={ref} args={[null, null, items.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    </group>
  )
}

function Ship({ path, offset }) {
  const g = useRef()
  useFrame(({ clock }) => {
    const p = pingPong(path, clock.elapsedTime, 12, offset)
    const [x, , z] = P([p.lon, p.lat])
    g.current.position.set(x, 0.1, z)
    g.current.rotation.y = headingOf(p.east, p.north)
  })
  return (
    <group ref={g}>
      <mesh>
        <boxGeometry args={[3.2, 0.3, 0.7]} />
        <meshStandardMaterial color="#1d3557" />
      </mesh>
      <mesh position={[-1.1, 0.35, 0]}>
        <boxGeometry args={[0.7, 0.45, 0.5]} />
        <meshStandardMaterial color="#f1faee" />
      </mesh>
      {[0.2, 0.6, 1.0].map((x, i) => (
        <mesh key={i} position={[x, 0.28, 0]}>
          <boxGeometry args={[0.32, 0.26, 0.5]} />
          <meshStandardMaterial color={['#e63946', '#f4a261', '#2a9d8f'][i]} />
        </mesh>
      ))}
    </group>
  )
}

function Port({ visible }) {
  return (
    <group visible={visible}>
      <Containers />
      {SHIP_PATHS.map((p, i) => (
        <Ship key={i} path={p} offset={i * 3000} />
      ))}
    </group>
  )
}

// ---------- Lluvia (partículas) ----------
function Rain({ mm, visible }) {
  const N = 5000
  const ref = useRef()
  const pos = useMemo(() => {
    const rng = mulberry32(3)
    const a = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      a[i * 3] = (rng() - 0.5) * 220
      a[i * 3 + 1] = rng() * 60
      a[i * 3 + 2] = (rng() - 0.5) * 220
    }
    return a
  }, [])
  useFrame((_, dt) => {
    const attr = ref.current.geometry.attributes.position
    const speed = 35 + mm * 4
    for (let i = 0; i < N; i++) {
      let y = attr.array[i * 3 + 1] - speed * dt
      if (y < 0) y += 60
      attr.array[i * 3 + 1] = y
    }
    attr.needsUpdate = true
    ref.current.geometry.setDrawRange(0, Math.floor(N * Math.min(1, mm / 3)))
  })
  return (
    <points ref={ref} visible={visible}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={pos} count={N} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#9bd7ff" size={0.35} transparent opacity={0.7} />
    </points>
  )
}

// ---------- Accidentes (anillos pulsantes) ----------
function Pulse({ a, age }) {
  const g = useRef()
  const [x, , z] = P([a.lon, a.lat])
  const color = a.sev === 'grave' ? '#ff4d6d' : a.sev === 'moderado' ? '#ff9f1c' : '#ffd166'
  useFrame(({ clock }) => {
    const s = 1 + 0.35 * Math.sin(clock.elapsedTime * 4 + a.hourIdx)
    g.current.scale.set(s, 1, s)
  })
  const gy = useRef()
  useGround(gy, x, z, 0)
  return (
    <group ref={gy} position={[x, 0, z]}>
    <group ref={g}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 1.8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={Math.max(0.35, 1 - age / 7)} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.35, 0.55, 24]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.9} />
      </mesh>
    </group>
    </group>
  )
}

function Accidents({ data, hour, visible }) {
  const recent = useMemo(() => data.accidents.filter((a) => a.hourIdx > hour - 7 && a.hourIdx <= hour), [data, hour])
  return (
    <group visible={visible}>
      {recent.map((a) => (
        <Pulse key={a.id} a={a} age={hour - a.hourIdx} />
      ))}
    </group>
  )
}

export default function ThreeTwin({ data, hour, layers, live }) {
  const mm = data.rain[hour] || 0
  const sky = useMemo(() => skyState(data.times[hour], mm), [data.times[hour], mm])
  const [lx, ly, lz] = sky.sunDir.map((v) => v * 120)
  const controls = useRef()
  const compass = useRef()
  const dot = useRef()
  const [goto, setGoto] = useState(null)
  const [tour, setTour] = useState(false)
  const [active, setActive] = useState('ciudad')
  const [style, setStyle] = useState('tecnico')
  const tech = style === 'tecnico'
  // ciudad: 'osm' = OpenStreetMap + relieve + imagen reales (por teselas); 'esquema' = la maqueta procedural
  const [city, setCity] = useState('osm')
  const osm = city === 'osm'
  const [imagery, setImagery] = useState('icgc')
  const [tier, setTier] = useState(detectTier)
  const [stats, setStats] = useState(null)
  const [ifc, setIfc] = useState(null)

  const go = (k) => {
    setActive(k)
    setGoto({ pos: PRESETS[k].pos, look: PRESETS[k].look })
  }
  useEffect(() => {
    if (!tour) return
    let i = TOUR.indexOf(active)
    const id = setInterval(() => {
      i = (i + 1) % TOUR.length
      go(TOUR[i])
    }, 9000)
    return () => clearInterval(id)
  }, [tour])

  const stop = () => {
    setGoto(null)
    setTour(false)
  }
  const onCam = () => {
    if (compass.current && controls.current) compass.current.style.transform = `rotate(${controls.current.getAzimuthalAngle()}rad)`
  }

  const zs = live?.zones
  const avgRatio = zs ? zs.reduce((a, z) => a + z.ratio, 0) / zs.length : null
  const nAcc = data.accidents.filter((a) => a.hourIdx > hour - 24 && a.hourIdx <= hour).length
  const phase = sky.night ? 'Noche' : sky.wet > 0.3 ? 'Día lluvioso' : 'Día'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas shadows={tier.shadows} camera={{ position: [0, 38, 78], fov: 50, near: 0.02, far: 3000 }} dpr={tier.dpr} gl={{ powerPreference: 'high-performance', antialias: tier.key !== 'low' }}>
        {/* si los FPS reales no llegan, baja el perfil (menos radio, menos resolución, sin sombras) */}
        <PerformanceMonitor flipflops={2} onDecline={() => setTier((t) => (t.key === 'low' ? t : lowerTier(t)))} />
        <color attach="background" args={[tech ? '#08090c' : sky.horizon]} />
        <fog attach="fog" args={osm ? [tech ? '#08090c' : sky.horizon, tier.osmRadius / 100 * 1.2, tier.osmRadius / 100 * 3.2] : [tech ? '#08090c' : sky.horizon, tech ? 90 : 70, tech ? 420 : 460]} />
        {!tech && <Sky sky={sky} />}
        <hemisphereLight args={tech ? ['#9fb0d8', '#0b0c10', 0.9] : [sky.hemiSky, sky.hemiGround, sky.hemiIntensity]} />
        <directionalLight
          position={tech ? [70, 100, 55] : [lx, ly, lz]}
          color={tech ? '#dfe6ff' : sky.lightColor}
          intensity={tech ? 1.15 : sky.lightIntensity}
          castShadow
          shadow-mapSize={tier.key === 'high' ? [2048, 2048] : [1024, 1024]}
          shadow-camera-left={-75}
          shadow-camera-right={75}
          shadow-camera-top={75}
          shadow-camera-bottom={-75}
          shadow-camera-near={1}
          shadow-camera-far={400}
          shadow-bias={-0.0004}
        />
        {osm ? (
          <>
            <OsmCity key={tier.key} tier={tier} tech={tech} imagery={imagery} onStats={setStats} />
            <PortIfc tier={tier} visible={layers.port} onStatus={setIfc} />
            {layers.labels && LANDMARKS.map((l) => (
              <Pin key={l.id} pos={P([l.lon, l.lat])} h={l.h * S + 0.35} color="#e8c46a" title={l.name} lines={l.note ? [l.note] : []} />
            ))}
          </>
        ) : (
          <>
            <Terrain tech={tech} />
            <Sea tech={tech} />
            <Shore tech={tech} />
            {!tech && <Forest />}
            <City tech={tech} />
            {!tech && <StreetTrees />}
            <Cars live={live} tech={tech} />
            <Landmarks />
          </>
        )}
        <Rails visible={layers.metro} live={live} />
        <Port visible={layers.port} />
        <Rain mm={mm} visible={layers.rain} />
        <Accidents data={data} hour={hour} visible={layers.accidents} />
        <InfoPins live={live} data={data} hour={hour} visible={layers.labels} />
        {layers.fiware && live?.fiware?.entities.map((e) => (
          <Pin key={e.id} pos={P([e.lon, e.lat])} h={0.9} color={ratioColor[e.level] || '#4cc9f0'} tone={e.level} title={`FIWARE · ${e.title}`} lines={[`${e.value ?? '—'} ${e.unit}${e.extra ? ' · ' + e.extra : ''}`]} />
        ))}
        <CameraRig goto={goto} controls={controls} />
        <CamProbe dotRef={dot} />
        <OrbitControls ref={controls} makeDefault target={[0, 0, 0]} enableDamping maxPolarAngle={Math.PI / 2.02} minDistance={0.6} maxDistance={300} onStart={stop} onChange={onCam} />
      </Canvas>

      <div className="hud hud-info">
        <div className="hud-t">{data.times[hour].replace('T', ' ')} · {phase}</div>
        <div className="hud-r"><span>Lluvia</span><b>{mm.toFixed(1)} mm/h</b></div>
        <div className="hud-r"><span>Accidentes reales (24 h)</span><b>{nAcc}</b></div>
        <div className="hud-r"><span>Tráfico (red)</span><b>{avgRatio == null ? '—' : `${Math.round(avgRatio * 100)} % del habitual`}</b></div>
        <div className="hud-r"><span>Alertas abiertas</span><b>{live ? live.alerts.length : '—'}</b></div>
        {osm ? (
          <>
            <div className="hud-r"><span>Dispositivo</span><b>perfil {tier.name}</b></div>
            <div className="hud-r"><span>Teselas</span><b>{stats ? `${stats.tiles} (${stats.near} con edificios)${stats.inflight ? ` · cargando ${stats.inflight}` : ''}` : '…'}</b></div>
            <div className="hud-r"><span>Triángulos edificios</span><b>{stats ? Math.round(stats.tris / 1000) + ' k' : '…'}</b></div>
            {ifc && <div className="hud-r"><span>IFC Port</span><b>{ifc.filter((i) => i.state === 'ok').length}/{ifc.length}{ifc.some((i) => i.state === 'cargando') ? ' · cargando' : ''}{ifc.some((i) => i.state === 'error') ? ' · con errores' : ''}</b></div>}
            <div className="hud-n">
              Reales: edificios y calles (OpenStreetMap vía OpenFreeMap), relieve ({stats?.demSrc || DEM_SOURCES.icgc.label}), {tech ? 'mapa vectorial' : IMAGERY[imagery].attr}, accidentes y lluvia.
              {' '}IFC: <a href={PORT_BIM_CATALOG} target="_blank" rel="noreferrer">Biblioteca IFC del Port de Barcelona</a> (CC BY 4.0), colocados a mano.
              {' '}Simulados: trenes, barcos y tráfico.
              {stats?.osmFail ? <span className="err"> · {stats.osmFail} teselas OSM sin datos</span> : null}
              {stats?.errors ? <span className="err"> · {stats.errors} errores de carga</span> : null}
            </div>
          </>
        ) : (
          <div className="hud-n">Reales: accidentes y lluvia. Simulados: trenes, barcos, coches y tráfico. Aproximados: relieve, sol, edificios.</div>
        )}
      </div>

      <div className="hud hud-chip">{data.times[hour].replace('T', ' ')} · {mm.toFixed(1)} mm/h · {nAcc} acc. 24 h</div>

      <div className="hud hud-compass" title="Orientación (N arriba al inicio)">
        <div ref={compass} className="compass"><i>N</i></div>
      </div>

      <div className="hud hud-mini">
        <div className="hud-t">Mapa · tú estás en el círculo</div>
        <MiniMap live={live} dotRef={dot} />
        <div className="hud-t">Accidentes reales (barras) y lluvia (línea) · ±3 días</div>
        <Spark data={data} hour={hour} />
      </div>

      <div className="hud hud-tools">
        {Object.entries(PRESETS).map(([k, v]) => (
          <button key={k} className={active === k && goto ? 'on' : ''} onClick={() => { setTour(false); go(k) }}>{v.label}</button>
        ))}
        <span className="sep" />
        <button onClick={() => setCity((v) => (v === 'osm' ? 'esquema' : 'osm'))} title="Ciudad real por teselas o maqueta ligera">Ciudad: {osm ? 'OSM real' : 'esquema'}</button>
        <button onClick={() => setStyle((v) => (v === 'tecnico' ? 'realista' : 'tecnico'))}>Estilo: {tech ? 'técnico' : 'realista'}</button>
        {osm && !tech && (
          <select value={imagery} onChange={(e) => setImagery(e.target.value)} title="Fuente de imagen aérea / satélite">
            {Object.entries(IMAGERY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        )}
        <button className={tour ? 'on' : ''} onClick={() => { setTour((t) => !t); if (!tour) go(TOUR[(TOUR.indexOf(active) + 1) % TOUR.length]) }}>{tour ? '■ Tour' : '▶ Tour'}</button>
      </div>
    </div>
  )
}
