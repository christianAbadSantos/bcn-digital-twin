// Entorno común de datos (CDE) del gemelo digital: contenedores ISO 19650, visor IFC, decisiones de obra
// enlazadas al modelo, mantenimiento (GMAO), GIS con relieve y sensores, SharePoint y registro de actividad.
import React, { Suspense, lazy, useMemo, useState } from 'react'
import { ACCIONES, ESTADOS, IDONEIDAD, ROLES, TIPOS, ROLES_DOC, ESTADOS_DEC, TIPOS_DEC, SP_CARPETAS, bcfFiles, canDo, checkName, zip } from '../../shared/cde.js'
import { PROYECTO, useCde } from './useCde.js'
import './cde.css'

const CdeViewer = lazy(() => import('./CdeViewer.jsx'))
const CdeMap = lazy(() => import('./CdeMap.jsx'))

const TABS = [['docs', 'Documentos'], ['modelo', 'Modelo 3D'], ['dec', 'Decisiones de obra'], ['gmao', 'Mantenimiento'], ['mapa', 'Mapa GIS'], ['sp', 'SharePoint'], ['log', 'Actividad'], ['proyecto', 'Proyecto']]
const fecha = (t) => (t ? new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const kb = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.round(b / 1000)} kB`)
const Estado = ({ e }) => <span className="cde-est" style={{ '--c': ESTADOS[e].color }}>{ESTADOS[e].nom}</span>
const descargar = (nombre, bytes, tipo) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: tipo })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }
const COL_DEC = { Abierta: '#ff4d5e', 'En curso': '#ff9f1c', Resuelta: '#34c77b', Cerrada: '#4c9dff' }

export default function Cde({ onGemelo }) {
  const cde = useCde(true)
  const [tab, setTab] = useState('docs')
  const [sel, setSel] = useState(null) // guid seleccionado en el visor
  const [elems, setElems] = useState([])
  const [colorPor, setColorPor] = useState('material')
  const [ocultos, setOcultos] = useState({})
  const [msg, setMsg] = useState(null)
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4000) }

  const modelos = useMemo(() => cde.docs.filter((d) => d.url && d.estado !== 'ARCHIVED').map((d) => ({ file: d.nombre, url: d.url, rev: d.revision, estado: d.estado, visible: !ocultos[d.nombre] })), [cde.docs, ocultos])
  const elSel = elems.find((e) => e.guid === sel) || null
  const marcas = useMemo(() => {
    const m = {}
    if (colorPor === 'decisiones') for (const d of cde.decisiones) if (d.guid) m[d.guid] = COL_DEC[d.estado]
    if (colorPor === 'gmao') { for (const a of cde.activos) m[a.guid] = a.criticidad === 'Alta' ? '#ff9f1c' : '#34c77b'; for (const o of cde.correctivos || []) if (o.estado !== 'Cerrada' && o.guid) m[o.guid] = '#ff4d5e' }
    if (colorPor === 'sensores') for (const s of cde.sensores) m[s.guid] = s.alerta ? '#ff4d5e' : '#34c77b'
    return m
  }, [colorPor, cde.decisiones, cde.activos, cde.correctivos, cde.sensores])
  const verEnModelo = (guid) => { setSel(guid); setTab('modelo') }

  return (
    <div className="cde">
      <header className="cde-top">
        <div>
          <b>{PROYECTO.codigo} · {PROYECTO.nombre}</b>
          <small>Entorno común de datos · UNE-EN ISO 19650 · IFC / BCF · {PROYECTO.fase}</small>
        </div>
        <label className="cde-rol">Actuando como
          <select value={cde.rol} onChange={(e) => cde.setRol(e.target.value)}>
            {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.nom} · {r.quien}</option>)}
          </select>
        </label>
        <button className="btn" onClick={() => { if (confirm('¿Volver a los datos de ejemplo? Se pierden los cambios de esta demo.')) cde.reset() }}>Restaurar demo</button>
      </header>
      <nav className="cde-tabs">{TABS.map(([k, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}{k === 'dec' && <span className="cnt">{cde.decisiones.filter((d) => d.estado === 'Abierta').length}</span>}</button>)}</nav>
      {msg && <div className="cde-flash">{msg}</div>}

      <div className="cde-body">
        {tab === 'docs' && <Documentos cde={cde} flash={flash} onVer={(d) => { setOcultos({}); setTab('modelo') }} />}
        {tab === 'modelo' && (
          <div className="cde-split">
            <div className="cde-vwrap">
              <div className="cde-vbar">
                {modelos.map((m) => <label key={m.file} className="chk"><input type="checkbox" checked={m.visible} onChange={() => setOcultos((o) => ({ ...o, [m.file]: !o[m.file] }))} />{checkName(m.file).partes.rol === 'M' ? 'Instalaciones' : 'Arquitectura'} <small>{m.rev} · {ESTADOS[m.estado].nom}</small></label>)}
                <label>Colorear por <select value={colorPor} onChange={(e) => setColorPor(e.target.value)}><option value="material">Material</option><option value="decisiones">Decisiones de obra</option><option value="gmao">Mantenimiento</option><option value="sensores">Sensores en tiempo real</option></select></label>
              </div>
              <Suspense fallback={<div className="cde-msg">Cargando el visor…</div>}>
                <CdeViewer modelos={modelos} colorPor={colorPor} marcas={marcas} seleccion={sel} onSelect={(u) => setSel(u?.guid || null)} onCargado={setElems} />
              </Suspense>
              {colorPor !== 'material' && <Leyenda modo={colorPor} />}
            </div>
            <Elemento cde={cde} el={elSel} onClose={() => setSel(null)} flash={flash} />
          </div>
        )}
        {tab === 'dec' && <Decisiones cde={cde} onVer={verEnModelo} />}
        {tab === 'gmao' && <Gmao cde={cde} onVer={verEnModelo} />}
        {tab === 'mapa' && <Suspense fallback={<div className="cde-msg">Cargando el mapa…</div>}><CdeMap indice={cde.indice} sensores={cde.sensores} onGemelo={onGemelo} /></Suspense>}
        {tab === 'sp' && <SharePoint cde={cde} />}
        {tab === 'log' && <Actividad cde={cde} />}
        {tab === 'proyecto' && <Proyecto cde={cde} />}
      </div>
    </div>
  )
}

function Leyenda({ modo }) {
  const L = { decisiones: Object.entries(COL_DEC), gmao: [['Activo crítico', '#ff9f1c'], ['Activo', '#34c77b'], ['Orden correctiva abierta', '#ff4d5e']], sensores: [['En rango', '#34c77b'], ['Alerta', '#ff4d5e']] }[modo]
  return <div className="cde-ley">{L.map(([n, c]) => <span key={n}><i style={{ background: c }} />{n}</span>)}</div>
}

// ---------- Documentos (contenedores)
function Documentos({ cde, flash, onVer }) {
  const [abierto, setAbierto] = useState(null)
  const rol = cde.rol
  const accion = (d, acc) => {
    let opts = {}
    if (acc === 'compartir') { const s = prompt('Código de idoneidad para compartir:\nS1 coordinación · S2 información · S3 revisión y comentarios', 'S1'); if (!s) return; opts.idoneidad = s.trim().toUpperCase() }
    if (acc === 'devolver' || acc === 'rechazar') { const m = prompt('Motivo (queda en el historial):'); if (!m) return; opts.motivo = m }
    const err = cde.act(d.id, acc, opts)
    flash(err ? `No se puede: ${err}` : `${ACCIONES[acc].nom}: hecho`)
  }
  const subir = (e) => {
    const f = e.target.files[0]
    if (!f) return
    const c = cde.subir(f)
    flash(c.ok ? `${f.name} subido a En curso` : `${f.name} subido, pero el nombre no cumple la ISO 19650: ${c.errores[0]}`)
    e.target.value = ''
  }
  return (
    <div className="cde-page">
      <div className="cde-states">
        {Object.entries(ESTADOS).map(([k, e]) => (
          <div key={k} className="cde-state" style={{ '--c': e.color }}><b>{e.nom}</b><span>{cde.docs.filter((d) => d.estado === k).length} contenedores</span><small>{e.desc}</small></div>
        ))}
      </div>
      <div className="cde-row">
        <label className="btn primary">Subir fichero<input type="file" hidden onChange={subir} /></label>
        <span className="muted">Se comprueba la nomenclatura ISO 19650 al subir: <code>Proyecto-Originador-Volumen-Nivel-Tipo-Rol-Número</code>, por ejemplo <code>BCN01-CAB-ZZ-XX-M3-A-0001.ifc</code>.</span>
      </div>
      <table className="cde-t">
        <thead><tr><th>Contenedor</th><th>Estado</th><th>Idoneidad</th><th>Revisión</th><th>Tamaño</th><th>SharePoint</th><th>Acciones ({ROLES[rol].nom.toLowerCase()})</th></tr></thead>
        <tbody>{cde.docs.map((d) => {
          const c = checkName(d.nombre)
          return (
            <React.Fragment key={d.id}>
              <tr className={abierto === d.id ? 'sel' : ''}>
                <td><button className="link" onClick={() => setAbierto(abierto === d.id ? null : d.id)}><b className="mono">{d.nombre}</b></button><small>{d.titulo}{c.ok ? ` · ${TIPOS[c.partes.tipo]} · ${ROLES_DOC[c.partes.rol]}` : ''}</small>{!c.ok && <small className="bad">Nombre no conforme: {c.errores[0]}</small>}</td>
                <td><Estado e={d.estado} /></td>
                <td title={IDONEIDAD[d.idoneidad]?.nom}><b>{d.idoneidad}</b><small>{IDONEIDAD[d.idoneidad]?.nom}</small></td>
                <td className="mono">{d.revision}</td>
                <td>{kb(d.tamano)}</td>
                <td>{d.sp ? <small className="ok">✓ {d.sp.revision}</small> : <small className="muted">—</small>}</td>
                <td className="acts">
                  {Object.keys(ACCIONES).filter((a) => ACCIONES[a].de === d.estado && ACCIONES[a].rol === rol).map((a) => {
                    const no = canDo(d, a, rol)
                    return <button key={a} className="btn sm" disabled={!!no} title={no || ACCIONES[a].pide} onClick={() => accion(d, a)}>{ACCIONES[a].nom}</button>
                  })}
                  {!c.ok && rol === 'autor' && d.estado === 'WIP' && <button className="btn sm" onClick={() => { const n = prompt('Nuevo nombre ISO 19650:', 'BCN01-CAB-ZZ-RF-DR-A-1003.pdf'); if (n) cde.renombrar(d.id, n.trim()) }}>Renombrar</button>}
                  {d.url && <button className="btn sm" onClick={() => onVer(d)}>Ver en 3D</button>}
                </td>
              </tr>
              {abierto === d.id && (
                <tr className="hist"><td colSpan={7}>
                  <b>Historial de {d.nombre}</b>
                  {d.historial.length === 0 ? <p className="muted">Sin cambios de estado todavía.</p> : (
                    <ol>{d.historial.map((h, i) => <li key={i}><span className="mono">{fecha(h.t)}</span> · <b>{h.nom}</b> por {h.quien}: {ESTADOS[h.antes.estado].nom} {h.antes.revision} ({h.antes.idoneidad}) → {ESTADOS[h.despues.estado].nom} {h.despues.revision} ({h.despues.idoneidad}){h.motivo ? ` · «${h.motivo}»` : ''}</li>)}</ol>
                  )}
                </td></tr>
              )}
            </React.Fragment>
          )
        })}</tbody>
      </table>
      <p className="muted">Cambia el rol arriba («Actuando como») para ver el flujo completo: el autor comparte, el coordinador pide la autorización y el cliente publica. Los botones que no puedes usar explican por qué.</p>
    </div>
  )
}

// ---------- ficha del elemento seleccionado
function Elemento({ cde, el, onClose, flash }) {
  const [nueva, setNueva] = useState(null)
  if (!el) return <aside className="cde-side"><h3>Elemento</h3><p className="muted">Pulsa un elemento del modelo para ver su clase, su GlobalId, sus propiedades y las decisiones y órdenes de mantenimiento enlazadas.</p></aside>
  const decs = cde.decisiones.filter((d) => d.guid === el.guid)
  const activo = cde.activos.find((a) => a.guid === el.guid)
  const sensor = cde.sensores.find((s) => s.guid === el.guid)
  const ots = [...(cde.correctivos || []), ...cde.preventivo.slice(0, 40)].filter((o) => o.guid === el.guid)
  return (
    <aside className="cde-side">
      <div className="cde-sh"><h3>{el.descripcion || el.nombre}</h3><button className="btn sm" onClick={onClose}>✕</button></div>
      <dl className="cde-kv">
        <dt>Clase IFC</dt><dd className="mono">{el.clase}</dd>
        <dt>Código</dt><dd className="mono">{el.tag || el.nombre}</dd>
        <dt>Planta</dt><dd>{el.planta}</dd>
        <dt>GlobalId</dt><dd className="mono sel">{el.guid}</dd>
        <dt>Modelo</dt><dd className="mono small">{el.file}</dd>
      </dl>
      {sensor && <div className={`cde-live ${sensor.alerta ? 'bad' : ''}`}><b>En directo</b><span>{String(sensor.temp).replace('.', ',')} °C · {sensor.hum} % · {sensor.co2} ppm CO₂</span>{sensor.alerta && <span>{sensor.alerta}</span>}</div>}
      {Object.entries(el.psets).map(([ps, kv]) => (
        <details key={ps} open={ps !== 'Pset_ManufacturerTypeInformation'}><summary>{ps}</summary>
          <dl className="cde-kv">{Object.entries(kv).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></React.Fragment>)}</dl>
        </details>
      ))}
      <h4>Decisiones de obra ({decs.length})</h4>
      {decs.map((d) => <div key={d.id} className="cde-mini"><span className="dot" style={{ background: COL_DEC[d.estado] }} /><b>{d.id}</b> {d.titulo}<small>{d.tipo} · {d.estado}</small></div>)}
      {nueva ? (
        <form className="cde-form" onSubmit={(e) => { e.preventDefault(); cde.addDecision({ ...nueva, ref: el.tag || el.nombre, guid: el.guid, modelo: el.file }); setNueva(null); flash('Decisión registrada y enlazada al elemento') }}>
          <select value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })}>{TIPOS_DEC.map((t) => <option key={t}>{t}</option>)}</select>
          <input required placeholder="Título" value={nueva.titulo} onChange={(e) => setNueva({ ...nueva, titulo: e.target.value })} />
          <textarea placeholder="Qué se decide y por qué" value={nueva.descripcion} onChange={(e) => setNueva({ ...nueva, descripcion: e.target.value })} />
          <div className="cde-row"><button className="btn primary sm">Guardar</button><button type="button" className="btn sm" onClick={() => setNueva(null)}>Cancelar</button></div>
        </form>
      ) : <button className="btn sm" onClick={() => setNueva({ tipo: 'Decisión de obra', titulo: '', descripcion: '' })}>+ Decisión sobre este elemento</button>}
      {activo && (
        <>
          <h4>Mantenimiento</h4>
          <p className="muted">Activo {activo.codigo} · criticidad {activo.criticidad.toLowerCase()} · preventivo {activo.frecuencia.toLowerCase()}</p>
          {ots.slice(0, 4).map((o) => <div key={o.id} className="cde-mini"><b>{o.id}</b> {o.titulo}<small>{o.tipo} · {o.estado} · {o.fecha}</small></div>)}
          <button className="btn sm" onClick={() => { const t = prompt('Describe la avería:', `Revisar ${el.descripcion}`); if (t) { cde.correctivo({ titulo: t, activo: activo.codigo, guid: el.guid, criticidad: activo.criticidad }); flash('Orden correctiva creada') } }}>+ Orden correctiva</button>
        </>
      )}
    </aside>
  )
}

// ---------- decisiones de obra
function Decisiones({ cde, onVer }) {
  const [filtro, setFiltro] = useState('todas')
  const [txt, setTxt] = useState({})
  const list = cde.decisiones.filter((d) => filtro === 'todas' || d.estado === filtro)
  const exportar = () => descargar(`${PROYECTO.codigo}-decisiones.bcfzip`, zip(bcfFiles(cde.decisiones, { proyecto: PROYECTO.codigo })), 'application/zip')
  return (
    <div className="cde-page">
      <div className="cde-row">
        <div className="seg">{['todas', ...ESTADOS_DEC].map((e) => <button key={e} className={filtro === e ? 'on' : ''} onClick={() => setFiltro(e)}>{e === 'todas' ? 'Todas' : e} ({e === 'todas' ? cde.decisiones.length : cde.decisiones.filter((d) => d.estado === e).length})</button>)}</div>
        <button className="btn primary" onClick={exportar} title="BCF 2.1: se abre en Revit, Navisworks, Solibri, BIMcollab, BlenderBIM…">Exportar BCF</button>
      </div>
      <p className="muted">Cada decisión queda enlazada a un elemento del modelo por su GlobalId: la ves en 3D, se exporta en BCF a cualquier herramienta BIM y deja rastro de quién decidió qué y cuándo.</p>
      <div className="cde-cards">
        {list.map((d) => (
          <article key={d.id} className="cde-card" style={{ '--c': COL_DEC[d.estado] }}>
            <header><b>{d.id}</b><span className="cde-est" style={{ '--c': COL_DEC[d.estado] }}>{d.estado}</span><small>{d.tipo} · prioridad {d.prioridad.toLowerCase()}</small></header>
            <h4>{d.titulo}</h4>
            <p>{d.descripcion}</p>
            <div className="cde-link">Elemento: <b className="mono">{d.ref}</b> · {d.elemento}{d.guid && <> · <button className="link" onClick={() => onVer(d.guid)}>ver en el modelo</button></>}</div>
            <small className="muted">{d.autor} · {fecha(d.creada)}{d.asignada ? ` · asignada a ${d.asignada}` : ''}</small>
            {d.comentarios.map((c, i) => <div key={i} className="cde-com"><b>{c.quien}</b> <small>{fecha(c.t)}</small><p>{c.texto}</p></div>)}
            <div className="cde-row">
              <select value={d.estado} onChange={(e) => cde.updDecision(d.id, { estado: e.target.value }, `${d.id} → ${e.target.value}`)}>{ESTADOS_DEC.map((e) => <option key={e}>{e}</option>)}</select>
              <input placeholder="Comentar…" value={txt[d.id] || ''} onChange={(e) => setTxt({ ...txt, [d.id]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && txt[d.id]) { cde.comentar(d.id, txt[d.id]); setTxt({ ...txt, [d.id]: '' }) } }} />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

// ---------- mantenimiento (GMAO)
function Gmao({ cde, onVer }) {
  const csv = () => descargar(`${PROYECTO.codigo}-ordenes.csv`, '﻿' + ['id;tipo;activo;titulo;fecha;estado', ...[...(cde.correctivos || []), ...cde.preventivo].map((o) => [o.id, o.tipo, o.activo, o.titulo, o.fecha, o.estado].join(';'))].join('\n'), 'text/csv')
  return (
    <div className="cde-page">
      <div className="cde-row"><h3 style={{ margin: 0 }}>Activos del modelo</h3><button className="btn" onClick={csv}>Exportar órdenes (CSV para el GMAO)</button></div>
      <p className="muted">Los activos salen del modelo de instalaciones (Pset_BCN_GMAO): código, criticidad y frecuencia del preventivo. El plan se genera solo y cada orden apunta al elemento IFC. La conexión con un GMAO real (Maximo, Infor, GMAO municipal) se haría por su API con estos mismos datos.</p>
      <table className="cde-t">
        <thead><tr><th>Código</th><th>Activo</th><th>Clase IFC</th><th>Criticidad</th><th>Preventivo</th><th>Próxima revisión</th><th></th></tr></thead>
        <tbody>{cde.activos.map((a) => (
          <tr key={a.codigo}><td className="mono">{a.codigo}</td><td>{a.nombre}</td><td className="mono small">{a.entidad}</td><td><span className={`tag ${a.criticidad === 'Alta' ? 'warn' : ''}`}>{a.criticidad}</span></td><td>{a.frecuencia}</td><td>{cde.preventivo.find((o) => o.activo === a.codigo)?.fecha || '—'}</td><td><button className="link" onClick={() => onVer(a.guid)}>ver en el modelo</button></td></tr>
        ))}</tbody>
      </table>
      <div className="cde-two">
        <div><h3>Correctivos</h3>
          {(cde.correctivos || []).length === 0 && <p className="muted">Sin averías abiertas. Se crean desde la ficha de un activo en el Modelo 3D.</p>}
          {(cde.correctivos || []).map((o) => <div key={o.id} className="cde-mini"><b>{o.id}</b> {o.titulo}<small>{o.activo} · {o.estado} · {o.fecha}</small>{o.estado !== 'Cerrada' && <button className="btn sm" onClick={() => cde.cerrarOT(o.id)}>Cerrar</button>}</div>)}
        </div>
        <div><h3>Preventivo · próximos 12 meses</h3>
          {cde.preventivo.slice(0, 12).map((o) => <div key={o.id} className="cde-mini"><b className="mono">{o.fecha}</b> {o.titulo}<small>{o.activo} · {o.estado}</small></div>)}
        </div>
      </div>
      <h3>Sensores en tiempo real</h3>
      <div className="cde-sensors">{cde.sensores.map((s) => <div key={s.codigo} className={s.alerta ? 'bad' : ''}><b>{s.codigo}</b><span>{s.nombre}</span><strong>{String(s.temp).replace('.', ',')} °C</strong><span>{s.hum} % HR · {s.co2} ppm CO₂</span>{s.alerta && <em>{s.alerta}</em>}</div>)}</div>
      <p className="muted">Lecturas simuladas cada 5 s. Cada sensor está en el IFC como IfcSensor con su IdSensor: con un broker real (FIWARE, MQTT) basta con cambiar la fuente.</p>
    </div>
  )
}

// ---------- SharePoint (simulado)
function SharePoint({ cde }) {
  const pend = cde.plan.filter((p) => p.accion !== 'al día').length
  return (
    <div className="cde-page">
      <div className="cde-note warn">Modo <b>simulación</b>: así funcionaría la sincronización con una biblioteca de SharePoint. La conexión real necesita registrar una aplicación en Microsoft Entra ID de la empresa (permiso Sites.Selected) y usa Microsoft Graph.</div>
      <div className="cde-form inline">
        <label>Sitio de SharePoint<input value={cde.sp.cfg.sitio} onChange={(e) => cde.spCfg({ sitio: e.target.value })} /></label>
        <label>Biblioteca<input value={cde.sp.cfg.biblioteca} onChange={(e) => cde.spCfg({ biblioteca: e.target.value })} /></label>
        <button className="btn primary" onClick={cde.spSync}>Sincronizar ({pend} pendientes)</button>
      </div>
      <p className="muted">Una carpeta por estado ISO 19650: {Object.values(SP_CARPETAS).join(' · ')}. Al cambiar de estado, el fichero se mueve de carpeta; al cambiar de revisión, se sube la nueva.</p>
      <table className="cde-t">
        <thead><tr><th>Contenedor</th><th>Destino en SharePoint</th><th>Acción</th><th>Llamada de Microsoft Graph</th></tr></thead>
        <tbody>{cde.plan.map((p) => <tr key={p.id}><td className="mono">{p.nombre}</td><td className="mono small">{p.ruta}</td><td><span className={`tag ${p.accion === 'al día' ? 'ok' : 'warn'}`}>{p.accion}</span></td><td className="mono small">{p.graph || '—'}</td></tr>)}</tbody>
      </table>
      {cde.sp.log.length > 0 && <><h3>Sincronizaciones</h3>{cde.sp.log.map((l, i) => <div key={i} className="cde-mini"><b className="mono">{fecha(l.t)}</b> {l.n} fichero(s)</div>)}</>}
    </div>
  )
}

function Actividad({ cde }) {
  return (
    <div className="cde-page">
      <p className="muted">Registro de auditoría: quién hizo qué y cuándo. No se borra.</p>
      <ol className="cde-log">{cde.actividad.map((a, i) => <li key={i}><span className="mono">{fecha(a.t)}</span><b>{a.quien}</b><span>{a.txt}</span></li>)}</ol>
    </div>
  )
}

function Proyecto({ cde }) {
  const P = PROYECTO
  return (
    <div className="cde-page">
      <div className="cde-two">
        <dl className="cde-kv big">
          {[['Código', P.codigo], ['Nombre', P.nombre], ['Tipo', P.tipo], ['Cliente', P.cliente], ['Ubicación', P.direccion], ['Fase', P.fase], ['Sistema de referencia', P.srs], ['Creado', `${P.creado} por ${P.creadoPor}`], ['Modelos vinculados', cde.docs.filter((d) => d.url).map((d) => `${d.nombre} (${d.revision})`).join(' · ')], ['Personas autorizadas', Object.values(ROLES).map((r) => `${r.quien} — ${r.nom}`).join(' · ')]].map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
        </dl>
        <div>
          <h3>Cómo funciona</h3>
          <ol className="cde-steps">
            <li><b>En curso:</b> el autor trabaja y sube versiones (P01.01, P01.02…). Solo lo ve su equipo.</li>
            <li><b>Compartido:</b> pasa la comprobación de nomenclatura y se comparte con idoneidad S1–S3 (P01). El coordinador revisa, devuelve con motivo o pide la autorización (S4).</li>
            <li><b>Publicado:</b> el cliente autoriza (A1, C01). Es la referencia para obra y explotación.</li>
            <li><b>Archivado:</b> versiones sustituidas, intactas, para auditoría.</li>
          </ol>
          <p className="muted">Proyecto, edificio y modelos de ejemplo. Los IFC se generan con <code>scripts/build-cde-ifc.mjs</code> y están georreferenciados en el IfcSite.</p>
        </div>
      </div>
    </div>
  )
}
