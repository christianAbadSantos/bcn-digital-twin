// Visor IFC del CDE (three.js + web-ifc en un worker). Cada elemento es una malla: se puede seleccionar,
// ocultar por disciplina y colorear por decisiones abiertas, mantenimiento o lectura de sensores.
import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const SEL = new THREE.Color('#ffd400')

export default function CdeViewer({ modelos, colorPor, marcas, seleccion, onSelect, onCargado, ocultos, corte }) {
  const host = useRef(null)
  const ctx = useRef(null)
  const [estado, setEstado] = useState('Cargando modelos…')

  // escena
  useEffect(() => {
    const el = host.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.localClippingEnabled = true // planos de corte
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0f1114')
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000)
    camera.position.set(28, 22, 30)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 3, 0)
    scene.add(new THREE.HemisphereLight('#ffffff', '#40464f', 1.1))
    const sun = new THREE.DirectionalLight('#ffffff', 1.4)
    sun.position.set(30, 50, 20)
    scene.add(sun)
    const grid = new THREE.GridHelper(80, 40, '#2b3038', '#1d2127')
    grid.position.y = -0.31
    scene.add(grid)
    const root = new THREE.Group()
    scene.add(root)
    const meshes = new Map() // guid → mesh
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix() }
    const ro = new ResizeObserver(resize); ro.observe(el); resize()
    let raf
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop) }
    loop()
    // seleccionar con clic (sin arrastrar)
    const ray = new THREE.Raycaster(), p = new THREE.Vector2()
    let down = null
    const onDown = (e) => { down = [e.clientX, e.clientY] }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return
      const r = renderer.domElement.getBoundingClientRect()
      p.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(p, camera)
      const hit = ray.intersectObjects([...meshes.values()].filter((m) => m.visible), false)[0]
      ctx.current.onSelect?.(hit ? hit.object.userData : null)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    // planos de corte: uno horizontal (deja ver una planta por dentro) y uno vertical (sección)
    const planos = { h: new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6), v: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6) }
    ctx.current = { scene, camera, controls, root, meshes, renderer, onSelect, planos, caja: new THREE.Box3() }
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.removeChild(renderer.domElement) }
  }, [])
  useEffect(() => { if (ctx.current) ctx.current.onSelect = onSelect }, [onSelect])

  // cargar los modelos (una vez por fichero)
  const urls = modelos.map((m) => m.url).join('|')
  useEffect(() => {
    const c = ctx.current
    const w = new Worker(new URL('../workers/cdeIfcWorker.js', import.meta.url), { type: 'module' })
    let pend = modelos.length, total = 0
    const box = new THREE.Box3()
    for (const m of [...c.meshes.values()]) { c.root.remove(m); m.geometry.dispose() }
    c.meshes.clear()
    w.onmessage = (e) => {
      const r = e.data
      if (!r.ok) { setEstado(`No se pudo abrir ${r.file}: ${r.error}`); return }
      for (const it of r.elementos) {
        if (!it.index.length) continue // espacios: sin malla
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(it.position, 3))
        g.setAttribute('normal', new THREE.BufferAttribute(it.normal, 3))
        g.setIndex(new THREE.BufferAttribute(it.index, 1))
        const [cr, cg, cb, a] = it.color
        const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(cr, cg, cb), roughness: 0.75, metalness: 0.05, transparent: a < 0.99, opacity: a, side: THREE.DoubleSide, clippingPlanes: [c.planos.h, c.planos.v] })
        const mesh = new THREE.Mesh(g, mat)
        const { position, normal, index, ...meta } = it
        mesh.userData = { ...meta, file: r.file, base: mat.color.clone(), baseOp: a }
        c.root.add(mesh)
        c.meshes.set(it.guid, mesh)
        g.computeBoundingBox(); box.union(g.boundingBox)
      }
      total += r.elementos.length
      if (--pend === 0) {
        c.caja.copy(box)
        const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
        c.controls.target.copy(ctr)
        c.camera.position.set(ctr.x + size.x * 0.9, ctr.y + size.y * 1.6 + 8, ctr.z + size.z * 1.4 + 6)
        setEstado(null)
        onCargado?.([...c.meshes.values()].map((m) => m.userData))
        w.terminate()
      } else setEstado(`Cargado ${r.file} (${total} elementos)…`)
    }
    modelos.forEach((m, i) => w.postMessage({ id: i, url: m.url, file: m.file }))
    return () => w.terminate()
  }, [urls]) // eslint-disable-line react-hooks/exhaustive-deps

  // visibilidad, color y selección
  const vis = modelos.map((m) => `${m.file}:${m.visible}`).join('|')
  useEffect(() => {
    const c = ctx.current
    const show = new Map(modelos.map((m) => [m.file, m.visible]))
    for (const [guid, m] of c.meshes) {
      const u = m.userData
      m.visible = show.get(u.file) !== false && !ocultos?.has(guid)
      const mk = marcas?.[guid]
      let col = u.base, op = u.baseOp
      if (colorPor !== 'material') {
        col = mk ? new THREE.Color(mk) : new THREE.Color('#5b6270')
        op = mk ? 1 : 0.18
      }
      if (seleccion === guid) { col = SEL; op = 1 }
      m.material.color.copy(col)
      m.material.opacity = op
      m.material.transparent = op < 0.99
      m.material.depthWrite = op >= 0.99
      m.material.emissive = seleccion === guid ? new THREE.Color('#5a4a00') : new THREE.Color('#000000')
    }
  }, [vis, colorPor, marcas, seleccion, ocultos]) // eslint-disable-line react-hooks/exhaustive-deps

  // planos de corte (corte.h y corte.v entre 0 y 1 dentro de la caja del modelo; null = sin corte)
  useEffect(() => {
    const c = ctx.current
    const b = c.caja
    if (b.isEmpty()) return
    c.planos.h.constant = corte?.h != null ? b.min.y + (b.max.y - b.min.y) * corte.h : 1e6
    c.planos.v.constant = corte?.v != null ? b.min.x + (b.max.x - b.min.x) * corte.v : 1e6
  }, [corte?.h, corte?.v, estado]) // eslint-disable-line react-hooks/exhaustive-deps

  // centrar en el elemento seleccionado
  useEffect(() => {
    const c = ctx.current
    const m = seleccion && c.meshes.get(seleccion)
    if (!m) return
    m.geometry.computeBoundingBox()
    c.controls.target.copy(m.geometry.boundingBox.getCenter(new THREE.Vector3()))
  }, [seleccion])

  return (
    <div className="cde-viewer" ref={host}>
      {estado && <div className="cde-msg">{estado}</div>}
    </div>
  )
}
