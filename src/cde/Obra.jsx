// Obra 4D/5D: el modelo IFC se construye en el tiempo (4D), el coste se sigue por valor ganado (5D) y los
// sensores de obra se leen en la misma vista. Plan, precios y sensores: shared/obra.js (spec docs/specs/obra-4d5d.md).
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { HOY, TAREAS, estadoEn, planificar, sensoresObra, valorGanado } from '../../shared/obra.js'

const CdeViewer = lazy(() => import('./CdeViewer.jsx'))
const DIA = 864e5
const eur = (x) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(x)
const dd = (t) => new Date(t).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' })
const n2 = (x) => String(Math.round(x * 100) / 100).replace('.', ',')
const pct = (x) => `${String(Math.round(x * 1000) / 10).replace('.', ',')} %`

export default function Obra({ modelos, meta }) {
  const elementos = useMemo(() => Object.values(meta).flatMap((m) => m.elementos || []), [meta])
  const listos = modelos.length > 0 && modelos.every((m) => meta[m.file]?.estado === 'ok')
  const plan = useMemo(() => (listos ? planificar(elementos) : null), [listos, elementos])
  const [t, setT] = useState(HOY)
  const [modo, setModo] = useState('real')
  const [play, setPlay] = useState(false)
  const fin = plan ? Math.max(plan.fin, plan.finR) : HOY

  // reproducir: un día cada 120 ms; se para al final
  useEffect(() => {
    if (!play || !plan) return
    const id = setInterval(() => setT((x) => { const n = x + DIA; if (n >= fin) { setPlay(false); return fin } return n }), 120)
    return () => clearInterval(id)
  }, [play, plan, fin])

  const est = useMemo(() => (plan ? estadoEn(plan, t, modo) : {}), [plan, t, modo])
  const estPlan = useMemo(() => (plan ? estadoEn(plan, t, 'plan') : {}), [plan, t])
  const ev = useMemo(() => (plan ? valorGanado(plan, t) : null), [plan, Math.floor(t / DIA)]) // eslint-disable-line react-hooks/exhaustive-deps
  const sen = useMemo(() => (plan ? sensoresObra(plan, t) : null), [plan, t])

  // lo que no ha empezado no se ve; en curso, naranja (rojo si va por detrás del plan); hecho, con su material
  const ocultos = useMemo(() => new Set([...elementos.filter((e) => e.clase === 'IFCSPACE').map((e) => e.guid), ...Object.entries(est).filter(([, s]) => s.estado === 'pendiente').map(([g]) => g)]), [elementos, est])
  const marcas = useMemo(() => {
    const m = {}
    for (const [g, s] of Object.entries(est)) if (s.estado === 'en curso') m[g] = modo === 'real' && estPlan[g]?.estado === 'hecho' ? '#ff4d5e' : '#ff9f1c'
    return m
  }, [est, estPlan, modo])
  const visibles = useMemo(() => modelos.map((m) => ({ ...m, visible: true })), [modelos])

  if (!plan) return <div className="cde-page"><div className="calm">Leyendo los modelos para montar el plan de obra…</div></div>
  const n = { hecho: 0, 'en curso': 0, pendiente: 0 }
  for (const s of Object.values(est)) n[s.estado]++

  return (
    <div className="obra">
      <div className="obra-main">
        <div className="obra-view">
          <Suspense fallback={<div className="cde-msg">Cargando el visor…</div>}>
            <CdeViewer modelos={visibles} colorPor="natural" marcas={marcas} ocultos={ocultos} seleccion={null} onSelect={() => {}} corte={null} />
          </Suspense>
          <div className="obra-fecha"><b>{dd(t)}</b><span>{t > HOY ? 'previsión' : t === HOY ? 'hoy · fecha de corte' : 'histórico'}</span></div>
          <div className="obra-ley"><span><i style={{ background: '#ff9f1c' }} />En curso</span><span><i style={{ background: '#ff4d5e' }} />En curso con retraso</span><span><i style={{ background: '#c9ced6' }} />Terminado</span></div>
        </div>
        <div className="obra-time">
          <div className="cde-row">
            <button className="btn sm" onClick={() => { if (t >= fin) setT(plan.inicio); setPlay((p) => !p) }}>{play ? '❚❚ Pausa' : '▶ Reproducir'}</button>
            <button className="btn sm" onClick={() => { setPlay(false); setT(plan.inicio) }}>Inicio</button>
            <button className="btn sm" onClick={() => { setPlay(false); setT(HOY) }}>Hoy</button>
            <button className="btn sm" onClick={() => { setPlay(false); setT(fin) }}>Final</button>
            <label className="muted">Ver <select value={modo} onChange={(e) => setModo(e.target.value)}><option value="real">Avance real</option><option value="plan">Plan de obra</option></select></label>
            <span className="muted">{n.hecho} terminados · {n['en curso']} en curso · {n.pendiente} pendientes</span>
          </div>
          <input type="range" className="obra-slider" min={plan.inicio} max={fin} step={DIA / 4} value={t} onChange={(e) => { setPlay(false); setT(Number(e.target.value)) }} aria-label="Fecha de obra" />
          <Gantt plan={plan} t={t} fin={fin} />
        </div>
      </div>

      <aside className="obra-side">
        <h3>Coste · valor ganado (5D)</h3>
        <div className="obra-kpis">
          <K t="Avance previsto" v={pct(ev.pv / plan.bac)} />
          <K t="Avance real" v={pct(ev.ev / plan.bac)} s={t > HOY ? 'a fecha de corte' : null} />
          <K t="Presupuesto (BAC)" v={eur(plan.bac)} />
          <K t="Coste real (AC)" v={eur(ev.ac)} bad={ev.ac > ev.ev} />
          <K t="SPI · plazo" v={n2(ev.spi)} bad={ev.spi < 0.95} s={ev.spi < 1 ? 'con retraso' : 'en plazo'} />
          <K t="CPI · coste" v={n2(ev.cpi)} bad={ev.cpi < 0.98} s={ev.cpi < 1 ? 'sobrecoste' : 'en coste'} />
        </div>
        <CurvaS ev={ev} t={t} bac={plan.bac} />
        <p className="muted">Coste estimado al final (EAC = BAC / CPI): <b>{eur(ev.eac)}</b>, {eur(ev.eac - plan.bac)} sobre presupuesto. PV, EV y AC salen de las mediciones del modelo (02_PdE_Cantidades) por los precios de cada unidad de obra.</p>

        <h3>Sensores de obra</h3>
        <div className="obra-sens">
          <K t="Temperatura ambiente" v={`${n2(sen.ambiente)} °C`} />
          <K t="Vibración (pico)" v={`${n2(sen.vibracion)} mm/s`} bad={sen.vibracion > 5} s="umbral 5 mm/s" />
          <K t="Lluvia del día" v={`${n2(sen.lluvia)} mm`} bad={sen.lluvia > 10} />
        </div>
        {sen.curado.length > 0 && (
          <table className="cde-t">
            <thead><tr><th>Curado del hormigón</th><th>Edad</th><th>Temperatura</th></tr></thead>
            <tbody>{sen.curado.map((c) => <tr key={c.codigo}><td className="mono">{c.codigo}</td><td>{c.horas < 48 ? `${c.horas} h` : `${c.dias} días`}</td><td><b>{n2(c.temp)} °C</b></td></tr>)}</tbody>
          </table>
        )}
        {sen.alertas.length ? <div className="obra-alertas">{sen.alertas.map((a) => <div key={a}>⚠ {a}</div>)}</div> : <p className="muted ok">Sin alertas de obra en esta fecha.</p>}
        <p className="muted">Tareas activas: {sen.activas.length ? sen.activas.map((x) => x.nom).join(' · ') : 'ninguna'}.</p>
        <p className="muted">Plan, precios, retrasos y sensores son de ejemplo (simulados). Con un planificador real (P6, MS Project) y sensores IoT se cambia la fuente manteniendo los mismos datos. La lluvia en directo está en el radar del gemelo de Barcelona.</p>
      </aside>
    </div>
  )
}

const K = ({ t, v, s, bad }) => <div className={`obra-k ${bad ? 'bad' : ''}`}><small>{t}</small><b>{v}</b>{s && <em>{s}</em>}</div>

// diagrama de barras: plan (gris) y real (azul) de cada tarea, con la fecha actual y la de corte
function Gantt({ plan, t, fin }) {
  const x = (v) => `${((v - plan.inicio) / (fin - plan.inicio)) * 100}%`
  return (
    <div className="obra-gantt">
      {TAREAS.map((ta) => {
        const els = plan.elementos.filter((e) => e.tarea === ta.id)
        if (!els.length) return null
        const p0 = Math.min(...els.map((e) => e.inicio)), p1 = Math.max(...els.map((e) => e.fin)), r1 = Math.max(...els.map((e) => e.finR))
        return (
          <div key={ta.id} className="obra-fila">
            <span title={ta.nom}>{ta.nom}</span>
            <div className="obra-bars">
              <i className="pl" style={{ left: x(p0), width: `calc(${x(p1)} - ${x(p0)})` }} />
              <i className="re" style={{ left: x(p0), width: `calc(${x(r1)} - ${x(p0)})` }} title={ta.retraso ? `${ta.retraso} días de retraso${ta.causa ? ` (${ta.causa})` : ''}` : 'en plazo'} />
            </div>
          </div>
        )
      })}
      <div className="obra-lineas"><b style={{ left: x(HOY) }} title="Hoy (fecha de corte)" /><s style={{ left: x(t) }} /></div>
    </div>
  )
}

// curva S: PV (previsto), EV (ganado) y AC (coste real)
function CurvaS({ ev, t, bac }) {
  const W = 320, H = 150, s = ev.serie, t0 = s[0].t, t1 = s.at(-1).t, max = Math.max(bac, ...s.map((p) => p.ac || 0)) * 1.05
  const X = (v) => ((v - t0) / (t1 - t0)) * W, Y = (v) => H - (v / max) * H
  const linea = (k) => s.filter((p) => p[k] != null).map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p[k]).toFixed(1)}`).join('')
  return (
    <svg className="obra-curva" viewBox={`-4 -6 ${W + 8} ${H + 22}`} role="img" aria-label="Curva S de valor planificado, ganado y coste real">
      <line x1={0} x2={W} y1={Y(bac)} y2={Y(bac)} className="bac" />
      <text x={2} y={Y(bac) - 3} className="lbl">BAC</text>
      <path d={linea('pv')} className="pv" />
      <path d={linea('ac')} className="ac" />
      <path d={linea('ev')} className="ev" />
      <line x1={X(HOY)} x2={X(HOY)} y1={0} y2={H} className="hoy" />
      <line x1={X(Math.min(Math.max(t, t0), t1))} x2={X(Math.min(Math.max(t, t0), t1))} y1={0} y2={H} className="cur" />
      <g className="ley" transform={`translate(0 ${H + 14})`}><text x={0} className="pv">— PV previsto</text><text x={95} className="ev">— EV ganado</text><text x={185} className="ac">— AC coste real</text></g>
    </svg>
  )
}
