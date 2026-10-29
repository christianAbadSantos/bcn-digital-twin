import React, { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { COAST, PORT_CENTER, RAIL_PATHS, SHIP_PATHS, toLocal, pingPong } from './geo.js'
import { mulberry32 } from './sim.js'

const S = 0.01 // 1 unidad de escena = 100 m
// [lon,lat] -> posición de escena (x = este, z = -norte)
const P = (c) => {
  const [e, n] = toLocal(c)
  return [e * S, 0, -n * S]
}
const headingOf = (east, north) => Math.atan2(north, east) // rotación Y para eje largo en X (z = -norte)

// ---------- Mar y tierra ----------
function Ground() {
  const sea = useMemo(() => {
    const shape = new THREE.Shape()
    const pts = [...COAST.map((c) => toLocal(c)), toLocal([2.4, 41.52]), toLocal([2.4, 41.2]), toLocal([2.0, 41.2])]
    shape.moveTo(pts[0][0] * S, pts[0][1] * S)
    pts.slice(1).forEach(([e, n]) => shape.lineTo(e * S, n * S))
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }, [])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#1b2332" />
      </mesh>
      <mesh geometry={sea} rotation-x={-Math.PI / 2} position={[0, 0.0, 0]}>
        <meshStandardMaterial color="#0c3b66" roughness={0.4} metalness={0.2} />
      </mesh>
      <gridHelper args={[600, 120, '#2c3a52', '#1f2a3d']} position={[0, 0.01, 0]} />
    </group>
  )
}

// ---------- Ciudad: bloques tipo Eixample (instanciados) ----------
function City() {
  const ref = useRef()
  const { items } = useMemo(() => {
    const rng = mulberry32(42)
    const a = P(COAST[1])
    const b = P(COAST[6])
    const side = (x, z) => (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0])
    const landSign = Math.sign(side(0, 0))
    const ang = Math.atan2(b[2] - a[2], b[0] - a[0]) // cuadrícula alineada con la costa
    const cos = Math.cos(ang)
    const sin = Math.sin(ang)
    const out = []
    const step = 1.5 // ~150 m
    for (let i = -40; i <= 40; i++) {
      for (let j = -40; j <= 40; j++) {
        const lx = i * step
        const lz = j * step
        const x = lx * cos - lz * sin
        const z = lx * sin + lz * cos
        if (Math.hypot(x, z) > 62) continue
        if (Math.sign(side(x, z)) !== landSign) continue
        // más altos cerca del centro
        const d = Math.hypot(x, z)
        const h = (0.25 + rng() * 0.9) * (1.4 - d / 70)
        out.push({ x, z, h: Math.max(0.15, h), ang })
      }
    }
    return { items: out }
  }, [])

  useLayoutEffect(() => {
    const m = new THREE.Object3D()
    items.forEach((it, i) => {
      m.position.set(it.x, it.h / 2, it.z)
      m.rotation.set(0, -it.ang, 0)
      m.scale.set(1.15, it.h, 1.15)
      m.updateMatrix()
      ref.current.setMatrixAt(i, m.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [items])

  return (
    <instancedMesh ref={ref} args={[null, null, items.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#34415a" roughness={0.9} />
    </instancedMesh>
  )
}

// ---------- Trenes 3D ----------
function Train({ path, color, offset }) {
  const g = useRef()
  useFrame(({ clock }) => {
    const p = pingPong(path, clock.elapsedTime, 28, offset)
    const [x, , z] = P([p.lon, p.lat])
    g.current.position.set(x, 0.18, z)
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
    </group>
  )
}

function Rails({ visible }) {
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
          <Train key={`${l.id}-${k}`} path={l.path} color={l.color} offset={(k * l.path.length * 2) / 3 + li * 500} />
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
      <instancedMesh ref={ref} args={[null, null, items.length]}>
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
  return (
    <group position={[x, 0, z]} ref={g}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 1.8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={Math.max(0.35, 1 - age / 7)} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.35, 0.55, 24]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.9} />
      </mesh>
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

export default function ThreeTwin({ data, hour, layers }) {
  const mm = data.rain[hour] || 0
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas camera={{ position: [0, 55, 85], fov: 50, near: 0.1, far: 2000 }} dpr={[1, 2]}>
        <color attach="background" args={[mm > 0.2 ? '#1a2232' : '#0b0f17']} />
        <fog attach="fog" args={[mm > 0.2 ? '#1a2232' : '#0b0f17', 80, 360]} />
        <ambientLight intensity={mm > 0.2 ? 0.55 : 0.8} />
        <directionalLight position={[60, 90, 40]} intensity={mm > 0.2 ? 0.7 : 1.3} />
        <Ground />
        <City />
        <Rails visible={layers.rail} />
        <Port visible={layers.port} />
        <Rain mm={mm} visible={layers.rain} />
        <Accidents data={data} hour={hour} visible={layers.accidents} />
        <OrbitControls target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={8} maxDistance={260} />
      </Canvas>
      <div className="badge">Trenes, barcos y accidentes: simulados · Lluvia: {data.source} · {mm.toFixed(1)} mm/h</div>
    </div>
  )
}
