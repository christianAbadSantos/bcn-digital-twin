// Modelos IFC del Port de Barcelona dentro de la escena 3D.
// Se cargan solo cuando la cámara mira cerca del puerto, de uno en uno y en un worker.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PORT_BIM, pickLod, ifcUrl } from './portBim.js'
import { sceneXZ } from './tileMath.js'
import { groundY } from './ground.js'
import { S } from './scene3d.js'

const PORT_XZ = sceneXZ(2.18, 41.372)
const NEAR = 35 // unidades de escena (3,5 km): más lejos no se descarga nada

function buildObject(r) {
  const g = new THREE.Group()
  // centrar en planta y apoyar en el suelo
  const cx = (r.min[0] + r.max[0]) / 2, cz = (r.min[2] + r.max[2]) / 2
  for (const gr of r.groups) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(gr.position, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(gr.normal, 3))
    geo.setIndex(new THREE.BufferAttribute(gr.index, 1))
    geo.translate(-cx, -r.min[1], -cz)
    geo.computeBoundingSphere()
    const [cr, cg, cb, a] = gr.color
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(cr, cg, cb), roughness: 0.7, metalness: 0.1, transparent: a < 0.99, opacity: a, side: THREE.DoubleSide })
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = true
    g.add(m)
  }
  g.scale.setScalar(S)
  return g
}

export default function PortIfc({ tier, visible, onStatus }) {
  const { controls } = useThree()
  const [active, setActive] = useState(false)
  const worker = useRef(null)
  const root = useRef()
  const items = useMemo(() => PORT_BIM.map((it) => ({ ...it, lod: pickLod(it, tier.ifcMaxBytes) })), [tier.ifcMaxBytes])

  // activar al acercarse al puerto (una vez activado, se queda)
  useFrame(() => {
    if (active || !visible) return
    const t = controls?.target
    if (t && Math.hypot(t.x - PORT_XZ[0], t.z - PORT_XZ[1]) < NEAR) setActive(true)
  })

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const w = new Worker(new URL('./workers/ifcWorker.js', import.meta.url), { type: 'module' })
    worker.current = w
    const status = items.map((it) => ({ name: it.name, lod: it.lod, bytes: it.size[it.lod], state: 'pendiente' }))
    const push = () => onStatus?.(status.map((s) => ({ ...s })))
    push()
    const objs = []
    ;(async () => {
      for (let i = 0; i < items.length && !cancelled; i++) {
        const it = items[i]
        status[i].state = 'cargando'
        push()
        try {
          const r = await new Promise((res, rej) => {
            w.onmessage = (e) => (e.data.ok ? res(e.data) : rej(new Error(e.data.error)))
            w.postMessage({ id: i, url: ifcUrl(`${it.f}_${it.lod}.ifc`) })
          })
          if (cancelled) return
          const o = buildObject(r)
          const [x, z] = sceneXZ(it.lon, it.lat)
          o.position.set(x, groundY(x, z) ?? 0.02, z)
          o.rotation.y = (it.rot * Math.PI) / 180
          o.userData.name = it.name
          root.current?.add(o)
          objs.push(o)
          status[i].state = 'ok'
          status[i].tris = r.tris
        } catch (err) {
          status[i].state = 'error'
          status[i].error = err.message
        }
        push()
      }
    })()
    return () => {
      cancelled = true
      w.terminate()
      objs.forEach((o) => {
        o.traverse((m) => { m.geometry?.dispose(); m.material?.dispose() })
        root.current?.remove(o)
      })
    }
  }, [active, items])

  // recolocar en altura cuando llegue el relieve real
  useFrame(() => {
    root.current?.children.forEach((o) => {
      if (o.userData.grounded) return
      const y = groundY(o.position.x, o.position.z)
      if (y != null) {
        o.position.y = y
        o.userData.grounded = true
      }
    })
  })

  return <group ref={root} visible={visible} />
}
