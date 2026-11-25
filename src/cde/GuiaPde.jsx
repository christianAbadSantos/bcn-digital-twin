// Guía BIM de Puertos del Estado aplicada al CDE: usos BIM, codificación de archivos (anexo IV), nivel de
// información (set de propiedades PdE), mediciones por unidad de obra, epígrafes contables y checklist de
// auditoría con su informe de cumplimiento (9.2.3 y 9.3).
import React, { useEffect, useMemo, useState } from 'react'
import { parseIds, validate } from '../../shared/ids.js'
import { EPIGRAFES, GUIA, LOD, TIPOLOGIAS, USOS, aCodigoPdE, checkCodigoPdE, checklist, loi } from '../../shared/pde.js'

const DONDE = { cde: ['CDE', null], edificio: ['Gemelo del edificio', '/edificio/'], gemelo: ['Gemelo de Barcelona', '/'] }
const FASE = { D: 'Diseño', C: 'Construcción', M: 'Mantenimiento' }
const n1 = (x) => String(Math.round(x * 10) / 10).replace('.', ',')
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export default function GuiaPde({ cde, meta, choques }) {
  const [ids, setIds] = useState(null)
  useEffect(() => { fetch('/data/cde/PdE-guia-bim.ids').then((r) => r.text()).then((t) => setIds(parseIds(t))).catch(() => {}) }, [])
  const modelos = cde.docs.filter((d) => d.url && d.estado !== 'ARCHIVED')
  const [prueba, setPrueba] = useState('26_01PR_PL01_PlantaBaja.pdf')
  const cp = checkCodigoPdE(prueba.trim())
  const abiertas = choques.filter((c) => !cde.decisiones.some((d) => d.colision === c.id)).length

  return (
    <div className="cde-page">
      <p className="muted">
        La <a href={GUIA.url} target="_blank" rel="noreferrer">{GUIA.titulo}</a> ({GUIA.fecha}) fija cómo deben entregarse los modelos BIM en el Sistema Portuario: usos BIM, niveles de desarrollo (LOD) y de información (LOI), un set de propiedades común, clasificación de elementos, epígrafes contables, codificación de archivos, flujo del CDE y checklist de auditoría. Aquí se comprueba todo eso sobre los modelos del proyecto.
      </p>

      <h3>Modelos y checklist de auditoría</h3>
      <div className="pde-modelos">
        {modelos.map((d) => <Modelo key={d.id} d={d} m={meta[d.nombre]} ids={ids} choques={{ total: choques.length, abiertas }} georref={!!cde.indice?.origen} />)}
      </div>

      <h3>Usos BIM del Sistema Portuario (apartado 4.6)</h3>
      <table className="cde-t">
        <thead><tr><th>Uso BIM</th><th>Fases</th><th>Cómo se aplica aquí</th></tr></thead>
        <tbody>{USOS.map((u) => (
          <tr key={u.uso}>
            <td><b>{u.uso}</b></td>
            <td>{[...u.fases].map((f) => <span key={f} className="tag" title={FASE[f]}>{f}</span>)}</td>
            <td>{u.aqui ? <><span className="ok">✓</span> {u.aqui}{u.donde && DONDE[u.donde][1] && <> · <a href={DONDE[u.donde][1]}>{DONDE[u.donde][0]} ↗</a></>}</> : <span className="muted">No aplicado en este proyecto</span>}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="muted">D: diseño · C: construcción · M: conservación y mantenimiento. {USOS.filter((u) => u.aqui).length} de {USOS.length} usos aplicados.</p>

      <div className="cde-two">
        <div>
          <h3>Flujo del CDE según la guía (7.1.5)</h3>
          <ol className="cde-steps">
            <li><b>Aprobado</b> · En curso → Compartido, tras el control de calidad de nivel 1 del responsable del modelo parcial ({cde.docs.filter((d) => d.estado === 'SHARED').length} compartidos).</li>
            <li><b>Autorizado</b> · Compartido → Publicado, tras el control de calidad de nivel 2 del responsable BIM del proyecto ({cde.docs.filter((d) => d.estado === 'PUBLISHED').length} publicados).</li>
            <li><b>Verificado</b> · Publicado → Archivado, cuando la Autoridad Portuaria lo aprueba como modelo de registro ({cde.docs.filter((d) => d.estado === 'ARCHIVED').length} archivados).</li>
          </ol>
          <p className="muted">Es el mismo flujo WIP · SHARED · PUBLISHED · ARCHIVE de la PAS 1192-2 y la ISO 19650 que sigue este CDE.</p>
          <h3>Niveles de desarrollo (LOD, 5.2.1)</h3>
          <dl className="cde-kv">{Object.entries(LOD).map(([k, v]) => <React.Fragment key={k}><dt>LOD {k}</dt><dd>{v}{k === '300' ? ' · nivel de los modelos de este proyecto' : ''}</dd></React.Fragment>)}</dl>
        </div>
        <div>
          <h3>Codificación de archivos (anexo IV)</h3>
          <p className="muted">Carpetas <code>AÑO_XXPR_Nombre</code>, documentos <code>AÑO_XXPRZZ_Nombre_ED.ext</code>, planos y modelos <code>AÑO_XXPR_PL00_Nombre.ext</code>. Tipo de contrato: PR obras, PY proyecto, PB pliego, SA contrato menor.</p>
          <label className="pde-prueba">Comprobar un nombre<input value={prueba} onChange={(e) => setPrueba(e.target.value)} spellCheck={false} /></label>
          <div className={`cde-ids ${cp.ok ? 'ok' : 'bad'}`}>{cp.ok ? <><b>✓ Conforme · {cp.tipo}</b><span>{Object.entries(cp.partes).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span></> : <><b>✗ No conforme</b><span>{cp.errores[0]}</span></>}</div>
          <table className="cde-t">
            <thead><tr><th>Nombre ISO 19650 en el CDE</th><th>Código según la guía PdE</th></tr></thead>
            <tbody>{cde.docs.map((d, i) => <tr key={d.id}><td className="mono">{d.nombre}</td><td className="mono">{aCodigoPdE(d, { contador: i + 1 })}</td></tr>)}</tbody>
          </table>
          <p className="muted">El CDE mantiene el nombre ISO 19650 y da su equivalente PdE (contrato 26_01PR de ejemplo), como pide la guía a las Autoridades Portuarias sin codificación propia.</p>
        </div>
      </div>

      <Mediciones meta={meta} />

      <h3>Tipologías de proyecto (5.1.2)</h3>
      <dl className="cde-kv">{Object.values(TIPOLOGIAS).map((t) => <React.Fragment key={t.nom}><dt>{t.nom}</dt><dd>{t.disciplinas.join(' · ')}</dd></React.Fragment>)}</dl>
    </div>
  )
}

function Modelo({ d, m, ids, choques, georref }) {
  const els = m?.elementos || []
  const r = useMemo(() => (ids && els.length ? validate(ids, els) : null), [ids, els])
  const L = useMemo(() => loi(els, ['01_PdE_Identificación', '02_PdE_Cantidades', '03_PdE_Proyecto', '05_PdE_EOM']), [els])
  const filas = checklist({ doc: d, elementos: els, ids: r, colisiones: choques, georref })
  const ok = filas.filter((f) => f.ok === true).length, no = filas.filter((f) => f.ok === false).length
  const informe = () => {
    const html = `<!doctype html><meta charset="utf-8"><title>Informe de cumplimiento · ${esc(d.nombre)}</title>
<style>body{font:14px system-ui;margin:32px;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f1f3f5}.si{color:#0a7a3e}.no{color:#c1121f}</style>
<h1>Informe de cumplimiento de requerimientos BIM</h1>
<p>${esc(GUIA.titulo)} (${esc(GUIA.fecha)}), apartados 9.2.3 y 9.3 · generado por el CDE el ${new Date().toLocaleString('es-ES')}</p>
<p><b>Modelo:</b> ${esc(d.nombre)} · ${esc(d.titulo)} · revisión ${esc(d.revision)} · ${esc(d.estado)}<br><b>Código PdE:</b> ${esc(aCodigoPdE(d))}<br><b>Nivel de información:</b> ${L.pct} % (${L.llenas} de ${L.total} propiedades en ${L.elementos} elementos)</p>
<table><tr><th>Bloque</th><th>Requerimiento</th><th>Cumple</th><th>Comentario</th></tr>${filas.map((f) => `<tr><td>${esc(f.bloque)}</td><td>${esc(f.req)}</td><td class="${f.ok ? 'si' : f.ok === false ? 'no' : ''}">${f.ok == null ? '—' : f.ok ? 'SÍ' : 'NO'}</td><td>${esc(f.nota)}</td></tr>`).join('')}</table>
${r && !r.ok ? `<h2>Elementos con fallos en el set de propiedades PdE</h2><ul>${r.resultados.flatMap((s) => s.fallos.map((f) => `<li><b>${esc(f.tag || f.nombre)}</b> (${esc(f.clase)}): ${esc(f.motivos.join('; '))}</li>`)).join('')}</ul>` : ''}
${L.faltan.length ? `<h2>Propiedades que faltan</h2><ul>${L.faltan.map(([k, n]) => `<li>${esc(k)}: ${n} elementos</li>`).join('')}</ul>` : ''}
<p>Firma del responsable BIM: ______________________</p>`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    a.download = `informe-cumplimiento-${d.nombre.replace(/\.[^.]+$/, '')}.html`
    a.click()
  }
  return (
    <div className="pde-modelo">
      <div className="cde-row"><b className="mono">{d.nombre}</b><span className="muted">{d.titulo} · {d.revision}</span></div>
      <div className="pde-kpis">
        <span><small>Código PdE</small><b className="mono">{aCodigoPdE(d)}</b></span>
        <span><small>LOD</small><b>300</b></span>
        <span><small>Nivel de información</small><b className={L.pct >= 95 ? 'ok' : 'bad'}>{m ? `${n1(L.pct)} %` : '…'}</b></span>
        <span><small>IDS de la guía</small><b className={r ? (r.ok ? 'ok' : 'bad') : ''}>{r ? (r.ok ? 'Cumple' : `${r.malos} con fallos`) : '…'}</b></span>
      </div>
      <table className="cde-t pde-check">
        <thead><tr><th>Checklist de auditoría (9.2.3)</th><th>Cumple</th><th>Comentario</th></tr></thead>
        <tbody>{filas.map((f) => <tr key={f.req}><td><small>{f.bloque}</small>{f.req}</td><td className={f.ok ? 'ok' : f.ok === false ? 'bad' : 'muted'}>{f.ok == null ? '—' : f.ok ? 'Sí' : 'No'}</td><td><small>{f.nota}</small></td></tr>)}</tbody>
      </table>
      {r && !r.ok && <p className="bad pde-fallo">{r.resultados.flatMap((s) => s.fallos.map((f) => `${f.tag || f.nombre}: ${f.motivos[0]}`)).slice(0, 3).join(' · ')}</p>}
      <div className="cde-row"><span className="muted">{ok} sí · {no} no · {filas.length - ok - no} sin comprobar</span><button className="btn sm" disabled={!m} onClick={informe}>Descargar informe de cumplimiento</button></div>
    </div>
  )
}

// uso BIM «Mediciones»: cantidades del set 02_PdE_Cantidades agrupadas por unidad de obra, con su epígrafe contable
function Mediciones({ meta }) {
  const filas = useMemo(() => {
    const g = new Map()
    for (const m of Object.values(meta)) for (const e of m.elementos || []) {
      const id = e.psets?.['01_PdE_Identificación'], q = e.psets?.['02_PdE_Cantidades']
      if (!id || !q || e.clase === 'IFCSPACE') continue
      const uo = e.psets?.['03_PdE_Proyecto']?.['03_04_01_PdE_Ud Medición 01'] || '—'
      const k = `${uo}|${id['01_07_PdE_Subdisciplina']}`
      const x = g.get(k) || { uo, dis: id['01_06_PdE_Disciplina'], sub: id['01_07_PdE_Subdisciplina'], ud: q['02_01_PdE_Unidad'], n: 0, long: 0, area: 0, vol: 0, epi: new Set() }
      x.n++; x.long += Number(q['02_02_PdE_Longitud']) || 0; x.area += Number(q['02_04_PdE_Area']) || 0; x.vol += Number(q['02_05_PdE_Volumen']) || 0
      x.epi.add(e.psets?.['05_PdE_EOM']?.['05_03_01_PdE_Cod Contable'] || 'sin epígrafe')
      g.set(k, x)
    }
    return [...g.values()].sort((a, b) => a.dis.localeCompare(b.dis) || a.uo.localeCompare(b.uo))
  }, [meta])
  if (!filas.length) return null
  const med = (x) => (x.ud === 'm2' ? `${n1(x.area)} m²` : x.ud === 'm3' ? `${n1(x.vol)} m³` : x.ud === 'm' ? `${n1(x.long)} m` : `${x.n} ud`)
  return (
    <>
      <h3>Mediciones por unidad de obra y epígrafe contable (5.2.2 y anexo III)</h3>
      <table className="cde-t">
        <thead><tr><th>Unidad de obra</th><th>Disciplina · subdisciplina</th><th>Elementos</th><th>Medición</th><th>Epígrafe de activo contable</th></tr></thead>
        <tbody>{filas.map((x) => (
          <tr key={x.uo + x.sub}>
            <td className="mono">{x.uo}</td><td>{x.dis} · {x.sub}</td><td>{x.n}</td><td className="mono">{med(x)}</td>
            <td>{[...x.epi].map((c) => <small key={c} className={EPIGRAFES[c] ? '' : 'bad'}>{c}{EPIGRAFES[c] ? ` · ${EPIGRAFES[c]}` : ''}</small>)}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="muted">Salen directamente de las propiedades 02_PdE_Cantidades y 05_03_01_PdE_Cod Contable de cada elemento IFC. Un elemento sin epígrafe aparece en rojo: es lo que hay que completar antes de pasar el activo a explotación.</p>
    </>
  )
}
