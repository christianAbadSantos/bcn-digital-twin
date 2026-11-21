// Visor IFC del CDE con That Open Components (@thatopen/components + @thatopen/fragments).
// El IfcLoader convierte cada IFC a Fragments en el navegador (web-ifc en WebAssembly) y el FragmentsManager
// lo pinta con su worker. Cada elemento se identifica por su GlobalId: con getLocalIdsByGuids /
// getGuidsByLocalIds se enlaza el modelo con el IDS, las colisiones, las decisiones BCF y el GMAO.
// (three aquí es la copia "three-tho" que pide That Open: ver vite.thatopen.js)
import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import workerUrl from '@thatopen/fragments/worker?url'

const mat = (color, opacity = 1) => ({ color: new THREE.Color(color), renderedFaces: FRAGS.RenderedFaces.ONE, opacity, transparent: opacity < 1 })
const SEL = mat('#ffd400')
const GRIS = mat('#5b6270', 0.18)

// caja (en coordenadas del visor) del elemento con ese GlobalId, o null
async function cajaDe(c, guid) {
  for (const { model, g2l } of c.modelos.values()) {
    const id = g2l.get(guid)
    if (id != null) return model.getMergedBox([id])
  }
  return null
}

// colorPor: 'material' (colores del IFC), 'natural' (colores del IFC + marcas encima) o cualquier capa (gris + marcas).
// marcas: { guid: '#color' | { color, opacity } }. onListo(api) da acceso al mundo 3D (etiquetas, encuadres).
export default function CdeViewer({ modelos, colorPor, marcas, seleccion, onSelect, onCargado, ocultos, corte, fondo = '#0f1114', onListo }) {
  const host = useRef(null)
  const ctx = useRef(null)
  const [estado, setEstado] = useState('Preparando el visor…')
  const [cargados, setCargados] = useState(0) // sube cada vez que termina una carga, para repintar

  // mundo de That Open: escena, renderizador, cámara, rejilla, fragments e IfcLoader
  useEffect(() => {
    const el = host.current
    const components = new OBC.Components()
    const world = components.get(OBC.Worlds).create()
    world.scene = new OBC.SimpleScene(components)
    world.scene.setup()
    world.scene.three.background = new THREE.Color(fondo)
    world.renderer = new OBC.SimpleRenderer(components, el)
    world.camera = new OBC.SimpleCamera(components)
    components.init()
    components.get(OBC.Grids).create(world)

    const fragments = components.get(OBC.FragmentsManager)
    fragments.init(workerUrl)
    world.camera.controls.addEventListener('update', () => fragments.core.update())
    fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(world.camera.three)
      model.getClippingPlanesEvent = () => world.renderer.three.clippingPlanes // el worker descarta lo cortado
      world.scene.three.add(model.object)
      fragments.core.update(true)
    })

    const ifcLoader = components.get(OBC.IfcLoader)
    const listo = ifcLoader.setup({ autoSetWasm: false, wasm: { path: new URL(`${import.meta.env.BASE_URL}cde/wasm/`, location.href).href, absolute: true } })

    // seleccionar con clic (sin arrastrar) con el Raycaster de That Open
    const caster = components.get(OBC.Raycasters).get(world)
    let down = null
    const onDown = (e) => { down = [e.clientX, e.clientY] }
    const onUp = async (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return
      const r = await caster.castRay()
      if (!r?.fragments) return ctx.current.onSelect?.(null)
      const [guid] = await r.fragments.getGuidsByLocalIds([r.localId])
      ctx.current.onSelect?.(guid ? { guid, file: r.fragments.modelId } : null)
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)

    // planos de corte globales del renderizador (horizontal: ver una planta; vertical: sección)
    const planos = { h: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), v: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0) }
    ctx.current = { components, world, fragments, ifcLoader, listo, caster, planos, onSelect, modelos: new Map(), caja: new THREE.Box3(), cola: Promise.resolve() }
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); components.dispose() }
  }, [])
  useEffect(() => { if (ctx.current) ctx.current.onSelect = onSelect }, [onSelect])

  // cargar los IFC (una vez por fichero): IFC → Fragments, y tabla GlobalId ↔ localId de cada modelo
  const urls = modelos.map((m) => m.url).join('|')
  useEffect(() => {
    const c = ctx.current
    let vivo = true
    ;(async () => {
      try {
        await c.listo
        for (const id of [...c.modelos.keys()]) await c.fragments.core.disposeModel(id)
        c.modelos.clear()
        const caja = new THREE.Box3()
        for (const m of modelos) {
          setEstado(`Convirtiendo ${m.file} a Fragments…`)
          const buf = new Uint8Array(await (await fetch(m.url)).arrayBuffer())
          const model = await c.ifcLoader.load(buf, false, m.file)
          if (!vivo) return
          const ids = await model.getItemsIdsWithGeometry()
          const guids = await model.getGuidsByLocalIds(ids)
          const g2l = new Map()
          guids.forEach((g, i) => { if (g) g2l.set(g, ids[i]) })
          c.modelos.set(m.file, { model, g2l })
          caja.union(model.box)
        }
        c.caja.copy(caja)
        const ctr = caja.getCenter(new THREE.Vector3()), size = caja.getSize(new THREE.Vector3())
        await c.world.camera.controls.setLookAt(ctr.x + size.x * 0.9, ctr.y + size.y * 1.6 + 8, ctr.z + size.z * 1.4 + 6, ctr.x, ctr.y, ctr.z, false)
        await c.fragments.core.update(true)
        setEstado(null)
        setCargados((n) => n + 1)
        onCargado?.([]) // los datos de cada elemento los da useModelMeta
        onListo?.({ world: c.world, caja: c.caja.clone(), cajaDe: (guid) => cajaDe(c, guid) })
      } catch (err) {
        if (vivo) setEstado(`No se pudo abrir el modelo: ${err?.message || err}`)
      }
    })()
    return () => { vivo = false }
  }, [urls]) // eslint-disable-line react-hooks/exhaustive-deps

  // visibilidad, color por capa (IDS, colisiones, decisiones, GMAO, sensores) y selección
  const vis = modelos.map((m) => `${m.file}:${m.visible}`).join('|')
  useEffect(() => {
    const c = ctx.current
    const show = new Map(modelos.map((m) => [m.file, m.visible]))
    const pintar = async () => {
      for (const [file, { model, g2l }] of c.modelos) {
        const ver = show.get(file) !== false
        await model.setVisible(undefined, ver)
        const ocultar = [...(ocultos || [])].map((g) => g2l.get(g)).filter((x) => x != null)
        if (ver && ocultar.length) await model.setVisible(ocultar, false)
        await model.resetHighlight()
        if (colorPor !== 'material') {
          if (colorPor !== 'natural') await model.highlight(undefined, GRIS)
          const porColor = new Map()
          for (const [g, col] of Object.entries(marcas || {})) {
            const id = g2l.get(g)
            const k = typeof col === 'string' ? col : `${col.color}@${col.opacity ?? 1}`
            if (id != null) porColor.set(k, [...(porColor.get(k) || []), id])
          }
          for (const [col, ids] of porColor) { const [c0, op] = col.split('@'); await model.highlight(ids, mat(c0, op ? Number(op) : 1)) }
        }
        const s = seleccion && g2l.get(seleccion)
        if (s != null) await model.highlight([s], SEL)
      }
      await c.fragments.core.update(true)
    }
    c.cola = c.cola.then(pintar).catch(() => {}) // en orden, sin pisarse
  }, [vis, colorPor, marcas, seleccion, ocultos, cargados]) // eslint-disable-line react-hooks/exhaustive-deps

  // planos de corte (corte.h y corte.v entre 0 y 1 dentro de la caja del modelo; null = sin corte)
  useEffect(() => {
    const c = ctx.current
    const b = c.caja
    if (b.isEmpty()) return
    const activos = []
    if (corte?.h != null) { c.planos.h.constant = b.min.y + (b.max.y - b.min.y) * corte.h; activos.push(c.planos.h) }
    if (corte?.v != null) { c.planos.v.constant = b.min.x + (b.max.x - b.min.x) * corte.v; activos.push(c.planos.v) }
    c.world.renderer.three.clippingPlanes = activos
    c.fragments.core.update(true)
  }, [corte?.h, corte?.v, cargados])

  // centrar la cámara en el elemento seleccionado
  useEffect(() => {
    const c = ctx.current
    if (!seleccion) return
    for (const { model, g2l } of c.modelos.values()) {
      const id = g2l.get(seleccion)
      if (id == null) continue
      model.getMergedBox([id]).then((bx) => { const p = bx.getCenter(new THREE.Vector3()); c.world.camera.controls.setTarget(p.x, p.y, p.z, true) })
    }
  }, [seleccion, cargados])

  return (
    <div className="cde-viewer" ref={host}>
      {estado && <div className="cde-msg">{estado}</div>}
      <span className="cde-motor">That Open Components · Fragments</span>
    </div>
  )
}
