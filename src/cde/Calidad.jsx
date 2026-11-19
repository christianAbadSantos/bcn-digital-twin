// Control de calidad del CDE: validación IDS, detección de colisiones, certificados y árbol del modelo.
import React, { useEffect, useMemo, useState } from 'react'
import { describe as describeReq, parseIds, validate } from '../../shared/ids.js'
import { detectClashes } from '../../shared/clash.js'
import { ESTADOS } from '../../shared/cde.js'
import { PROYECTO } from './useCde.js'

const fecha = (t) => (t ? new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const disciplina = (f) => (/-M-\d{4}/.test(f) ? 'Instalaciones' : /-A-\d{4}/.test(f) ? 'Arquitectura' : f)

// ---- IDS
export function useIds() {
  const [ids, setIds] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { fetch('/data/cde/BCN01-requisitos.ids').then((r) => r.text()).then((t) => setIds({ ...parseIds(t), fichero: 'BCN01-requisitos.ids' })).catch((e) => setErr(e.message)) }, [])
  const cargar = async (file) => { try { setIds({ ...parseIds(await file.text()), fichero: file.name }); setErr(null) } catch (e) { setErr(e.message) } }
  return { ids, err, cargar }
}

export function Validacion({ cde, meta, ids, onVer, onColor }) {
  const modelos = cde.docs.filter((d) => d.url && d.estado !== 'ARCHIVED')
  const [sel, setSel] = useState(modelos[1]?.id || modelos[0]?.id)
  const doc = cde.docs.find((d) => d.id === sel)
  const els = meta[doc?.nombre]?.elementos
  const r = useMemo(() => (ids.ids && els ? validate(ids.ids, els) : null), [ids.ids, els])
  return (
    <div className="cde-page">
      <p className="muted">El cliente define en un fichero <b>IDS</b> (estándar de buildingSMART) qué información tiene que llevar cada elemento del modelo. El CDE comprueba el modelo contra esos requisitos y <b>no deja publicar un modelo IFC que no los cumpla</b>.</p>
      <div className="cde-row">
        <label>Modelo <select value={sel} onChange={(e) => setSel(e.target.value)}>{modelos.map((d) => <option key={d.id} value={d.id}>{disciplina(d.nombre)} · {d.nombre} · {d.revision} ({ESTADOS[d.estado].nom})</option>)}</select></label>
        <span className="muted">Requisitos: <b>{ids.ids?.titulo || '…'}</b> ({ids.ids?.fichero})</span>
        <label className="btn sm">Cargar otro IDS<input type="file" accept=".ids,.xml" hidden onChange={(e) => e.target.files[0] && ids.cargar(e.target.files[0])} /></label>
        {ids.err && <span className="bad">{ids.err}</span>}
      </div>
      {!r ? <div className="calm">Leyendo el modelo…</div> : (
        <>
          <div className={`cde-ids ${r.ok ? 'ok' : 'bad'}`}>
            <b>{r.ok ? '✓ Cumple los requisitos del cliente' : `✗ ${r.malos} de ${r.total} elementos no cumplen`}</b>
            <span>{r.total} elementos comprobados · {r.resultados.length} especificaciones</span>
            {doc.ids && <small>Último sello en el contenedor: {doc.ids.ok ? 'cumple' : `${doc.ids.malos} con fallos`} · {fecha(doc.ids.t)}{doc.ids.titulo ? ` · ${doc.ids.titulo}` : ''}</small>}
            <div className="cde-row">
              <button className="btn primary sm" onClick={() => cde.setIds(doc.id, r, ids.ids.titulo)}>Guardar el resultado en el contenedor</button>
              <button className="btn sm" onClick={() => onColor(r)}>Ver en 3D (verde cumple · rojo no)</button>
            </div>
          </div>
          {r.resultados.map((s) => (
            <section key={s.id} className="cde-spec">
              <header><b>{s.nombre}</b><span className={`tag ${!s.aplicados ? '' : s.fallos.length ? 'warn' : 'ok'}`}>{s.aplicados ? `${s.cumplen}/${s.aplicados} cumplen` : 'no aplica a este modelo'}</span></header>
              <small className="muted">{s.descripcion} · Se aplica a: {s.entidades.join(', ')}</small>
              <ul className="cde-reqs">{s.requisitos.map((q, i) => <li key={i} className="mono">{describeReq(q)}</li>)}</ul>
              {s.fallos.map((f) => <div key={f.guid} className="cde-fallo"><b className="mono">{f.tag || f.nombre}</b> {f.nombre} <button className="link" onClick={() => onVer(f.guid, r)}>ver en el modelo</button><small>{f.motivos.join(' · ')}</small></div>)}
            </section>
          ))}
        </>
      )}
    </div>
  )
}

// ---- colisiones
export function Colisiones({ cde, meta, onVer }) {
  const todos = useMemo(() => Object.values(meta).flatMap((m) => m.elementos || []), [meta])
  const listos = Object.keys(meta).length >= 2
  const cols = useMemo(() => (listos ? detectClashes(todos) : []), [todos, listos])
  const enBcf = (c) => cde.decisiones.find((d) => d.colision === c.id)
  const pasarABcf = (c) => cde.addDecision({
    tipo: 'Colisión', colision: c.id, prioridad: c.gravedad === 'Alta' ? 'Alta' : 'Normal', estado: 'Abierta',
    titulo: `${c.b.tag} atraviesa ${c.a.tag}`, ref: c.b.tag, guid: c.guidB, modelo: c.b.file, asignada: 'Instalaciones',
    descripcion: `${c.b.nombre} (${disciplina(c.b.file)}) interfiere con ${c.a.nombre} (${disciplina(c.a.file)}). Volumen de interferencia ≈ ${String(c.volumen).replace('.', ',')} m³ en (${c.centro.join(', ')}). Elementos: ${c.guidA} × ${c.guidB}.`,
  })
  return (
    <div className="cde-page">
      <p className="muted">Cruza el modelo de <b>arquitectura</b> con el de <b>instalaciones</b> y encuentra los elementos que se atraviesan. Cada interferencia lleva los GlobalId de los dos elementos y se puede pasar a un tema <b>BCF</b> para que se resuelva con trazabilidad, no por correo.</p>
      {!listos ? <div className="calm">Leyendo los modelos…</div> : (
        <>
          <div className={`cde-ids ${cols.length ? 'bad' : 'ok'}`}><b>{cols.length ? `${cols.length} colisiones entre disciplinas` : 'Sin colisiones'}</b><span>{todos.filter((e) => e.bbox).length} elementos con geometría comparados</span></div>
          <table className="cde-t">
            <thead><tr><th>Id</th><th>Elemento de arquitectura</th><th>Elemento de instalaciones</th><th>Gravedad</th><th>Volumen</th><th></th></tr></thead>
            <tbody>{cols.map((c) => {
              const d = enBcf(c)
              return (
                <tr key={c.id}>
                  <td className="mono">{c.id}</td>
                  <td><b className="mono">{c.a.tag}</b><small>{c.a.nombre} · {c.a.clase}</small></td>
                  <td><b className="mono">{c.b.tag}</b><small>{c.b.nombre} · {c.b.clase}</small></td>
                  <td><span className={`tag ${c.gravedad === 'Baja' ? '' : 'warn'}`}>{c.gravedad}</span></td>
                  <td className="mono">{String(c.volumen).replace('.', ',')} m³</td>
                  <td className="acts">
                    <button className="btn sm" onClick={() => onVer(c.guidB, [c.guidA, c.guidB])}>Ver en 3D</button>
                    {d ? <small className="ok">✓ {d.id} · {d.estado}</small> : <button className="btn primary sm" onClick={() => pasarABcf(c)}>Crear tema BCF</button>}
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
          <p className="muted">Método: intersección de cajas envolventes con 1 cm de tolerancia, solo entre disciplinas distintas y sin contar espacios. Es la criba que hacen las herramientas de coordinación antes de comparar las mallas.</p>
        </>
      )}
    </div>
  )
}

// ---- certificados
export function Certificados({ cde }) {
  const [res, setRes] = useState(null)
  const probar = async (e) => { const f = e.target.files[0]; if (!f) return; setRes({ nombre: f.name, ...(await cde.comprobar(f)) }); e.target.value = '' }
  return (
    <div className="cde-page">
      <p className="muted">Al publicar un fichero, el CDE calcula su <b>huella digital SHA-256</b> y emite un certificado con código de verificación, fecha y firmante. Si alguien cambia un solo byte del documento, la huella cambia: cualquiera puede comprobar que tiene exactamente lo que se autorizó.</p>
      <div className="cde-verif">
        <b>Verificar un documento</b>
        <span className="muted">Elige un fichero y se compara con los certificados emitidos. No sale de tu ordenador: la huella se calcula en el navegador.</span>
        <label className="btn primary">Elegir fichero<input type="file" hidden onChange={probar} /></label>
        {res && (res.certificado
          ? <div className="cde-ids ok"><b>✓ Documento auténtico</b><span>{res.nombre} coincide con {res.certificado.nombre} · {res.certificado.revision} ({res.certificado.idoneidad})</span><small className="mono">Código {res.certificado.codigo} · publicado {fecha(res.certificado.t)} por {res.certificado.firmante}</small></div>
          : <div className="cde-ids bad"><b>✗ No coincide con ningún documento certificado</b><span>{res.nombre} · huella {res.codigo}</span><small>O no se ha publicado, o se ha modificado después.</small></div>)}
        <small className="muted">Prueba: descarga el <a href="/data/cde/BCN01-CAB-ZZ-XX-M3-A-0001.ifc" download>modelo de arquitectura publicado</a> y verifícalo; después cambia una letra con el Bloc de notas y vuelve a probar.</small>
      </div>
      <table className="cde-t">
        <thead><tr><th>Certificado</th><th>Documento</th><th>Revisión</th><th>Firmante</th><th>Fecha</th><th>Huella SHA-256</th></tr></thead>
        <tbody>
          {cde.certs.length === 0 && <tr><td colSpan={6} className="muted">Calculando las huellas de los documentos publicados…</td></tr>}
          {cde.certs.map((c) => <tr key={c.id + c.revision}><td className="mono"><b>{c.codigo}</b></td><td className="mono small">{c.nombre}</td><td className="mono">{c.revision} · {c.idoneidad}</td><td>{c.firmante}</td><td>{fecha(c.t)}</td><td className="mono small hash">{c.hash}</td></tr>)}
        </tbody>
      </table>
      <p className="muted">Siguiente paso posible: anclar cada huella en un sello de tiempo cualificado (RFC 3161) o en una cadena de bloques pública, para que la fecha tampoco dependa del propio CDE. Proyecto {PROYECTO.codigo}.</p>
    </div>
  )
}

// ---- árbol del modelo: disciplina → planta → clase → elementos
const CLASE_NOM = { IFCWALL: 'Muros', IFCSLAB: 'Forjados', IFCCOLUMN: 'Pilares', IFCDOOR: 'Puertas', IFCWINDOW: 'Ventanas', IFCROOF: 'Cubierta', IFCSPACE: 'Espacios', IFCUNITARYEQUIPMENT: 'Climatización', IFCPUMP: 'Bombas', IFCELECTRICDISTRIBUTIONBOARD: 'Cuadros eléctricos', IFCSENSOR: 'Sensores', IFCDUCTSEGMENT: 'Conductos', IFCPIPESEGMENT: 'Tuberías' }
export function Arbol({ meta, ocultos, setOcultos, sel, onSel }) {
  const [abiertos, setAbiertos] = useState({})
  const tog = (k) => setAbiertos((a) => ({ ...a, [k]: !a[k] }))
  const visibles = (guids) => guids.every((g) => !ocultos.has(g))
  const cambiar = (guids) => setOcultos((o) => { const n = new Set(o); const on = visibles(guids); for (const g of guids) on ? n.add(g) : n.delete(g); return n })
  return (
    <div className="cde-arbol">
      <b>Árbol del modelo</b>
      {Object.entries(meta).map(([file, m]) => {
        const els = (m.elementos || []).filter((e) => e.clase !== 'IFCSPACE')
        const plantas = [...new Set(els.map((e) => e.planta || 'Sin planta'))].sort()
        return (
          <div key={file} className="nodo">
            <label><input type="checkbox" checked={visibles(els.map((e) => e.guid))} onChange={() => cambiar(els.map((e) => e.guid))} /><button className="link" onClick={() => tog(file)}>{abiertos[file] ? '▾' : '▸'} {disciplina(file)}</button><small>{els.length}</small></label>
            {abiertos[file] && plantas.map((p) => {
              const ep = els.filter((e) => (e.planta || 'Sin planta') === p)
              const clases = [...new Set(ep.map((e) => e.clase))]
              return (
                <div key={p} className="nodo">
                  <label><input type="checkbox" checked={visibles(ep.map((e) => e.guid))} onChange={() => cambiar(ep.map((e) => e.guid))} /><button className="link" onClick={() => tog(file + p)}>{abiertos[file + p] ? '▾' : '▸'} {p}</button><small>{ep.length}</small></label>
                  {abiertos[file + p] && clases.map((c) => {
                    const ec = ep.filter((e) => e.clase === c)
                    return (
                      <div key={c} className="nodo">
                        <label><input type="checkbox" checked={visibles(ec.map((e) => e.guid))} onChange={() => cambiar(ec.map((e) => e.guid))} /><button className="link" onClick={() => tog(file + p + c)}>{abiertos[file + p + c] ? '▾' : '▸'} {CLASE_NOM[c] || c}</button><small>{ec.length}</small></label>
                        {abiertos[file + p + c] && ec.map((e) => <button key={e.guid} className={`hoja ${sel === e.guid ? 'on' : ''}`} onClick={() => onSel(e.guid)}><span className="mono">{e.tag || e.nombre}</span> {e.descripcion}</button>)}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
