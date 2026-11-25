// Estado del entorno común de datos: contenedores, decisiones de obra, mantenimiento, SharePoint y registro.
// Demo: se guarda en este navegador (localStorage). Los modelos IFC de ejemplo están en /data/cde/.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACCIONES, ROLES, applyAction, checkName, lecturaSensor, planPreventivo, spPlan } from '../../shared/cde.js'
import { certificado, sha256Hex, verificar } from '../../shared/cert.js'

const KEY = 'bcn-cde.v1'
const BASE = '/data/cde/'
const ahora = () => new Date().toISOString()

// ---- proyecto y datos de ejemplo
export const PROYECTO = {
  codigo: 'BCN01', nombre: 'Biblioteca de barri Sant Antoni', tipo: 'Equipamiento municipal (proyecto de ejemplo)',
  cliente: 'Ajuntament de Barcelona (ejemplo)', direccion: 'Interior de manzana c/ Comte Borrell, Sant Antoni', fase: 'Ejecución de obra',
  srs: 'ETRS89 / UTM 31N (EPSG:25831) · cota ICGC', creado: '2026-09-01', creadoPor: 'Christian Abad (CAB)',
}

function seed() {
  const t0 = Date.UTC(2026, 9, 1, 9)
  let k = 0
  const t = () => new Date(t0 + (k += 26) * 3600000).toISOString()
  const mk = (id, nombre, titulo, tamano, url) => ({ id, nombre, titulo, estado: 'WIP', idoneidad: 'S0', revision: 'P01.01', tamano, url: url ? BASE + nombre : null, subido: t(), autor: ROLES.autor.quien, historial: [] })
  const run = (d, pasos) => pasos.reduce((x, [acc, o]) => applyAction(x, acc, { ...o, ahora: t() }).doc, d)
  const docs = [
    // el modelo de arquitectura se validó y publicó con la versión anterior del IDS del cliente
    run({ ...mk('d1', 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', 'Modelo de arquitectura', 230000, true), ids: { ok: true, total: 17, malos: 0, t: t(), titulo: 'BCN01 · Requisitos (versión 0.9)' } }, [['compartir', { rol: 'autor', idoneidad: 'S1' }], ['pedirAutorizacion', { rol: 'coordinador' }], ['publicar', { rol: 'cliente' }]]),
    run(mk('d2', 'BCN01-CAB-ZZ-XX-M3-M-0001.ifc', 'Modelo de instalaciones', 58000, true), [['compartir', { rol: 'autor', idoneidad: 'S3' }]]),
    run(mk('d3', 'BCN01-CAB-ZZ-XX-SP-A-0001.pdf', 'Pliego de condiciones técnicas', 820000), [['compartir', { rol: 'autor', idoneidad: 'S2' }]]),
    { ...mk('d4', 'BCN01-CAB-ZZ-00-DR-A-1001.pdf', 'Plano de planta baja', 1240000), revision: 'P01.02' },
    mk('d5', 'BCN01-CAB-ZZ-XX-SA-F-0001.xlsx', 'Programa de mantenimiento', 64000),
    mk('d6', 'Plano cubierta v2 FINAL.pdf', 'Plano de cubierta (subido sin codificar)', 990000),
  ]
  const decisiones = [
    { id: 'DEC-001', titulo: 'Subir la puerta de evacuación a EI2 90', tipo: 'Decisión de obra', estado: 'Abierta', prioridad: 'Alta', ref: 'PU-002', modelo: 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', descripcion: 'Bomberos pide EI2 90 en la salida al patio por la ocupación de la sala infantil. Afecta al pedido de carpintería.', autor: 'Dirección de obra', asignada: ROLES.autor.quien, creada: t(), comentarios: [{ t: t(), quien: 'Coordinación BIM', texto: 'Actualizar FireRating en el modelo y avisar a carpintería.' }] },
    { id: 'DEC-002', titulo: 'Reforzar el apoyo de la climatizadora en cubierta', tipo: 'Consulta (RFI)', estado: 'En curso', prioridad: 'Normal', ref: 'CL-001', modelo: 'BCN01-CAB-ZZ-XX-M3-M-0001.ifc', descripcion: 'El peso de la UTA (≈ 950 kg) supera la bancada prevista. Estructura confirma refuerzo con perfiles HEB.', autor: 'Instaladora', asignada: 'Estructura', creada: t(), comentarios: [] },
    { id: 'DEC-003', titulo: 'Cambiar el vidrio de la fachada sur a control solar', tipo: 'Decisión de obra', estado: 'Resuelta', prioridad: 'Normal', ref: 'VE-00S2', modelo: 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', descripcion: 'Por el sobrecalentamiento previsto en la sala de lectura. Aprobado por la propiedad.', autor: 'Propiedad', asignada: ROLES.autor.quien, creada: t(), comentarios: [{ t: t(), quien: 'Cliente', texto: 'Aprobado. Coste dentro de imprevistos.' }] },
  ]
  return { v: 1, docs, decisiones, ots: [], correctivos: [], certs: [], sp: { cfg: { sitio: 'https://ayuntamiento-ejemplo.sharepoint.com/sites/BCN01', biblioteca: 'Documentos CDE' }, log: [] }, actividad: [{ t: t(), quien: PROYECTO.creadoPor, txt: `Proyecto ${PROYECTO.codigo} creado` }], rol: 'autor' }
}

const load = () => { try { const j = JSON.parse(localStorage.getItem(KEY)); if (j?.v === 1) return { certs: [], ...j } } catch { /* sin almacenamiento */ } return seed() }

export function useCde(active) {
  const [st, setSt] = useState(load)
  const [indice, setIndice] = useState(null)
  const [tick, setTick] = useState(0)
  const blobs = useRef(new Map()) // ficheros subidos en esta sesión (url local)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(st)) } catch { /* lleno o bloqueado */ } }, [st])
  useEffect(() => { if (active && !indice) fetch(BASE + 'indice.json').then((r) => r.json()).then(setIndice).catch(() => {}) }, [active, indice])
  // sensores: nueva lectura cada 5 s mientras el CDE está abierto
  useEffect(() => { if (!active) return; const id = setInterval(() => setTick((x) => x + 1), 5000); return () => clearInterval(id) }, [active])

  const byCode = useMemo(() => new Map((indice?.elementos || []).map((e) => [e.codigo, e])), [indice])
  const byGuid = useMemo(() => new Map((indice?.elementos || []).map((e) => [e.guid, e])), [indice])
  const log = (s, txt, quien) => ({ ...s, actividad: [{ t: ahora(), quien: quien || ROLES[s.rol].quien, txt }, ...s.actividad].slice(0, 300) })

  // ---- contenedores
  const act = useCallback((id, accion, opts = {}) => {
    let err = null
    setSt((s) => {
      const d = s.docs.find((x) => x.id === id)
      try {
        const r = applyAction(d, accion, { ...opts, rol: s.rol, quien: ROLES[s.rol].quien })
        return log({ ...s, docs: s.docs.map((x) => (x.id === id ? r.doc : x)) }, `${ACCIONES[accion].nom}: ${d.nombre} → ${r.doc.revision} (${r.doc.idoneidad})${opts.motivo ? ` · «${opts.motivo}»` : ''}`)
      } catch (e) { err = e.message; return s }
    })
    return err
  }, [])
  const subir = useCallback((file, titulo) => {
    const c = checkName(file.name)
    const url = URL.createObjectURL(file)
    const id = `d${Date.now()}`
    blobs.current.set(id, url)
    setSt((s) => log({ ...s, docs: [{ id, nombre: file.name, titulo: titulo || file.name, estado: 'WIP', idoneidad: 'S0', revision: 'P01.01', tamano: file.size, url: /\.ifc$/i.test(file.name) ? url : null, local: true, subido: ahora(), autor: ROLES[s.rol].quien, historial: [] }, ...s.docs] }, `Subido ${file.name}${c.ok ? '' : ' (nombre no conforme)'}`))
    return c
  }, [])
  const renombrar = useCallback((id, nombre) => setSt((s) => log({ ...s, docs: s.docs.map((d) => (d.id === id ? { ...d, nombre } : d)) }, `Renombrado a ${nombre}`)), [])

  // ---- validación IDS: resultado guardado en el contenedor (decide si se puede publicar)
  const setIds = useCallback((id, r, titulo) => setSt((s) => log({ ...s, docs: s.docs.map((d) => (d.id === id ? { ...d, ids: { ok: r.ok, total: r.total, malos: r.malos, t: ahora(), titulo } } : d)) }, `Validación IDS de ${s.docs.find((d) => d.id === id)?.nombre}: ${r.ok ? 'cumple' : `${r.malos} elemento(s) con fallos`} (${r.total} comprobados)`)), [])

  // ---- certificados: huella SHA-256 de cada versión publicada con fichero
  const enCurso = useRef(new Set())
  useEffect(() => {
    if (!active) return
    for (const d of st.docs) {
      if (d.estado !== 'PUBLISHED' || !d.url || d.local) continue
      const k = `${d.nombre}@${d.revision}`
      if ((st.certs || []).some((c) => `${c.nombre}@${c.revision}` === k) || enCurso.current.has(k)) continue
      enCurso.current.add(k)
      const pub = d.historial.find((h) => h.accion === 'publicar')
      fetch(d.url).then((r) => r.arrayBuffer()).then((b) => sha256Hex(b)).then((hash) => {
        const c = certificado({ hash, nombre: d.nombre, revision: d.revision, idoneidad: d.idoneidad, firmante: pub?.quien || ROLES.cliente.quien, proyecto: PROYECTO.codigo, t: pub?.t })
        setSt((s) => ((s.certs || []).some((x) => x.hash === hash && x.revision === d.revision) ? s : log({ ...s, certs: [c, ...(s.certs || [])] }, `Certificado ${c.codigo} emitido para ${d.nombre} ${d.revision}`, 'Sistema (huella SHA-256)')))
      }).catch(() => enCurso.current.delete(k))
    }
  }, [active, st.docs]) // eslint-disable-line react-hooks/exhaustive-deps
  const comprobar = useCallback(async (file) => verificar(await file.arrayBuffer(), st.certs || []), [st.certs])

  // ---- decisiones de obra
  const decisiones = useMemo(() => st.decisiones.map((d) => ({ ...d, guid: d.guid || byCode.get(d.ref)?.guid || null, elemento: byCode.get(d.ref)?.nombre || d.ref })), [st.decisiones, byCode])
  const addDecision = useCallback((d) => setSt((s) => {
    const id = `DEC-${String(s.decisiones.length + 1).padStart(3, '0')}`
    return log({ ...s, decisiones: [{ id, estado: 'Abierta', prioridad: 'Normal', comentarios: [], creada: ahora(), autor: ROLES[s.rol].quien, ...d }, ...s.decisiones] }, `Nueva ${d.tipo.toLowerCase()} ${id}: ${d.titulo}`)
  }), [])
  const updDecision = useCallback((id, patch, txt) => setSt((s) => log({ ...s, decisiones: s.decisiones.map((d) => (d.id === id ? { ...d, ...patch } : d)) }, txt || `${id} actualizada`)), [])
  const comentar = useCallback((id, texto) => setSt((s) => log({ ...s, decisiones: s.decisiones.map((d) => (d.id === id ? { ...d, comentarios: [...d.comentarios, { t: ahora(), quien: ROLES[s.rol].quien, texto }] } : d)) }, `Comentario en ${id}`)), [])

  // ---- mantenimiento (GMAO): activos del IFC + plan preventivo + correctivos
  const activos = useMemo(() => (indice?.elementos || []).filter((e) => ['IFCUNITARYEQUIPMENT', 'IFCPUMP', 'IFCELECTRICDISTRIBUTIONBOARD', 'IFCSENSOR'].includes(e.entidad)).map((e) => ({
    codigo: e.codigo, guid: e.guid, nombre: e.nombre, entidad: e.entidad,
    frecuencia: { 'CL-001': 'Trimestral', 'BO-001': 'Semestral', 'BO-002': 'Anual', 'CE-001': 'Anual' }[e.codigo] || 'Anual',
    criticidad: { 'CL-001': 'Alta', 'CE-001': 'Alta', 'BO-001': 'Media' }[e.codigo] || 'Baja',
  })), [indice])
  const preventivo = useMemo(() => planPreventivo(activos), [activos])
  const correctivo = useCallback((o) => setSt((s) => {
    const id = `OT-C-${String((s.correctivos || []).length + 1).padStart(3, '0')}`
    return log({ ...s, correctivos: [{ id, tipo: 'Correctivo', estado: 'Abierta', fecha: ahora().slice(0, 10), ...o }, ...(s.correctivos || [])] }, `Orden de trabajo ${id}: ${o.titulo}`)
  }), [])
  const cerrarOT = useCallback((id) => setSt((s) => log({ ...s, correctivos: s.correctivos.map((o) => (o.id === id ? { ...o, estado: 'Cerrada', cerrada: ahora() } : o)) }, `Orden ${id} cerrada`)), [])

  // ---- sensores en tiempo real
  const sensores = useMemo(() => (indice?.elementos || []).filter((e) => e.entidad === 'IFCSENSOR').map((e) => {
    const sid = { 'SE-001': 'bib-santantoni-pb-vestibulo', 'SE-002': 'bib-santantoni-pb-infantil', 'SE-003': 'bib-santantoni-p1-lectura', 'SE-004': 'bib-santantoni-p1-polivalente' }[e.codigo] || e.codigo
    return { ...e, sid, ...lecturaSensor(sid) }
  }), [indice, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- SharePoint (simulado)
  const plan = useMemo(() => spPlan(st.docs, st.sp.cfg), [st.docs, st.sp.cfg])
  const spSync = useCallback(() => setSt((s) => {
    const p = spPlan(s.docs, s.sp.cfg).filter((x) => x.accion !== 'al día')
    const docs = s.docs.map((d) => { const x = p.find((q) => q.id === d.id); return x ? { ...d, sp: { ruta: x.ruta, revision: d.revision, t: ahora() } } : d })
    return log({ ...s, docs, sp: { ...s.sp, log: [{ t: ahora(), n: p.length, llamadas: p.map((x) => x.graph) }, ...s.sp.log].slice(0, 20) } }, p.length ? `SharePoint: ${p.length} fichero(s) sincronizados (simulación)` : 'SharePoint: todo al día')
  }), [])
  const spCfg = useCallback((cfg) => setSt((s) => ({ ...s, sp: { ...s.sp, cfg: { ...s.sp.cfg, ...cfg } } })), [])

  return {
    ...st, indice, byCode, byGuid, decisiones, activos, preventivo, sensores, plan,
    setRol: (rol) => setSt((s) => ({ ...s, rol })), act, setIds, comprobar, certs: st.certs || [], subir, renombrar, addDecision, updDecision, comentar, correctivo, cerrarOT, spSync, spCfg,
    reset: () => { blobs.current.clear(); setSt(seed()) },
  }
}
