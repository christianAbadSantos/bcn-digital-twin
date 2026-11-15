// Módulo "Agua y lluvia": estado (palancas y simulación) y paneles flotantes:
//   lluvia (palancas), balance de caudales, causa → efecto y corte de una calle.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CAPACITAT_DEPOSITS_CIUTAT, DEPOSITS, ESCENARIS, PALANQUES_PER_DEFECTE, cadena, simula } from '../shared/drenaje.js'

const DATA_URL = '/data/drenaje.json'
const n0 = (x) => Math.round(x || 0).toLocaleString('es-ES')
const n1 = (x) => (Math.round((x || 0) * 10) / 10).toLocaleString('es-ES')
const pct = (x) => `${Math.round((x || 0) * 100)} %`
const mil = (m3) => (m3 >= 1e6 ? `${n1(m3 / 1e6)} hm³` : `${n0(m3)} m³`)
export const ESTAT_COLOR = { ok: '#3fa34d', alt: '#e8a317', ple: '#e8833a', inunda: '#d03b3b' }
export const ESTAT_NOM = { ok: 'holgada', alt: 'cerca del límite', ple: 'al límite (va a depósitos)', inunda: 'desborda a la calle' }

export function useAgua(enabled, lluviaReal) {
  const [geo, setGeo] = useState(null)
  const [err, setErr] = useState(null)
  const [p, setP] = useState(PALANQUES_PER_DEFECTE)
  const [esc, setEsc] = useState('avui')
  const [sel, setSel] = useState('02') // distrito del corte (Eixample)
  const real = useRef(false)

  useEffect(() => {
    if (!enabled || geo) return
    fetch(DATA_URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))).then(setGeo).catch((e) => setErr(`drenaje.json: ${e.message}`))
  }, [enabled, geo])

  const districtes = useMemo(() => geo?.features.map((f) => f.properties) || [], [geo])
  const r = useMemo(() => (districtes.length ? simula(districtes, p) : null), [districtes, p])
  const c = useMemo(() => (r ? cadena(r) : null), [r])

  const set = useCallback((k, v) => setP((x) => ({ ...x, [k]: v })), [])
  const escenari = useCallback((k) => {
    setEsc(k)
    setP((x) => ({ ...PALANQUES_PER_DEFECTE, mmh: x.mmh, minuts: x.minuts, ...ESCENARIS[k].p }))
  }, [])
  // usar la lluvia que cae ahora mismo (Open-Meteo)
  const usaReal = useCallback(() => { real.current = true; set('mmh', Math.round((lluviaReal || 0) * 10) / 10) }, [lluviaReal, set])

  return { geo, err, p, set, esc, escenari, r, c, sel, setSel, usaReal, lluviaReal }
}

// ---------------------------------------------------------------- escenarios (pestañas sobre el mapa)
export function AguaEscenaris({ agua }) {
  return (
    <div className="ag-esc" role="tablist" aria-label="Escenario">
      {Object.entries(ESCENARIS).map(([k, e]) => (
        <button key={k} role="tab" aria-selected={agua.esc === k} className={agua.esc === k ? 'on' : ''} onClick={() => agua.escenari(k)}>{e.nom}</button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- palancas
function Slider({ label, val, unit, min, max, step, onChange, hint }) {
  return (
    <label className="ag-sl">
      <span className="ag-sl-h"><span>{label}</span><b>{val}<small> {unit}</small></b></span>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small className="ag-hint">{hint}</small>}
    </label>
  )
}
export function AguaLluvia({ agua }) {
  const { p, set, r } = agua
  const mmh = p.mmh
  const tipus = mmh < 2 ? 'sin lluvia' : mmh < 15 ? 'lluvia moderada' : mmh < 30 ? 'lluvia fuerte' : mmh < 60 ? 'muy fuerte' : 'torrencial'
  return (
    <div className="ag-ll">
      <Slider label="Intensidad de la lluvia" val={mmh} unit="mm/h" min={0} max={150} step={1} onChange={(v) => set('mmh', v)} hint={`${tipus}${r ? ` · escorrentía ${n0(r.total.qTotal)} m³/s` : ''}`} />
      <Slider label="Duración" val={p.minuts} unit="min" min={10} max={180} step={5} onChange={(v) => set('minuts', v)} />
      <details className="ag-more">
        <summary>Más palancas</summary>
        <Slider label="Suelo que se vuelve permeable" val={Math.round(p.verdExtra * 100)} unit="pp" min={0} max={30} step={1} onChange={(v) => set('verdExtra', v / 100)} hint="Parterres, pavimento drenante, cubiertas verdes (SUDS)" />
        <Slider label="Lluvia que aguanta la red" val={p.mmhDisseny} unit="mm/h" min={20} max={100} step={5} onChange={(v) => set('mmhDisseny', v)} hint="Hipótesis: depende de cada colector" />
        <Slider label="Capacidad de los depósitos" val={Math.round(p.diposits / 1000)} unit="mil m³" min={0} max={1500} step={10} onChange={(v) => set('diposits', v * 1000)} hint={`Hoy: más de ${n0(CAPACITAT_DEPOSITS_CIUTAT / 1000)} mil m³ en unos 15 depósitos`} />
        <Slider label="Escenario climático" val={p.clima} unit="× intensidad" min={1} max={1.5} step={0.05} onChange={(v) => set('clima', v)} hint="Hipótesis, no es una proyección oficial" />
      </details>
      <div className="ag-row">
        <button className="btn" onClick={agua.usaReal}>Usar la lluvia de ahora ({n1(agua.lluviaReal)} mm/h)</button>
        <button className="btn" onClick={() => agua.escenari('avui')}>Reiniciar</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- balance de caudales
export function AguaBalance({ agua }) {
  const { r, sel } = agua
  if (!r) return <p className="muted">Cargando distritos…</p>
  const t = r.total
  const d = r.districtes.find((x) => x.codi === sel)
  const rows = [
    ['Agua que cae', mil(t.vPluja), d ? mil((r.mmh / 1000) * (r.p.minuts / 60) * d.km2 * 1e6) : '—'],
    ['Se infiltra', mil(t.infiltrat), d ? mil((r.mmh / 1000) * (r.p.minuts / 60) * d.km2 * 1e6 - d.q * r.p.minuts * 60) : '—'],
    ['Escorrentía (pico)', `${n0(t.qTotal)} m³/s`, d ? `${n1(d.q)} m³/s` : '—'],
    ['Capacidad de la red', `${n0(t.capTotal)} m³/s`, d ? `${n1(d.cap)} m³/s` : '—'],
    ['Uso de la red', pct(t.us), d ? pct(d.us) : '—', t.us >= 1 ? 'bad' : t.us >= 0.8 ? 'warn' : ''],
    ['A depósitos', mil(t.vDiposits), d ? mil(d.vExces - d.vDesborda) : '—'],
    ['Llenado depósitos', pct(t.ompliment), '', t.ompliment >= 1 ? 'bad' : t.ompliment >= 0.7 ? 'warn' : ''],
    ['Agua en la calle', mil(t.vDesborda), d ? mil(d.vDesborda) : '—', t.vDesborda > 0 ? 'bad' : ''],
  ]
  return (
    <div className="ag-bal">
      <table>
        <thead><tr><th /><th>Ciudad</th><th>{d ? d.nom : 'Distrito'}</th></tr></thead>
        <tbody>{rows.map(([k, a, b, s]) => <tr key={k} className={s || ''}><td>{k}</td><td>{a}</td><td>{b}</td></tr>)}</tbody>
      </table>
      <p className="ag-note">Episodio de {r.p.minuts} min a {n0(r.mmh)} mm/h{r.p.clima !== 1 ? ` (×${r.p.clima} por clima)` : ''}. Haz clic en un distrito del mapa para verlo en la columna derecha.</p>
    </div>
  )
}

// ---------------------------------------------------------------- causa → efecto
const SEV = { ok: '#3fa34d', warn: '#e8a317', bad: '#d03b3b' }
export function AguaCausa({ agua }) {
  const { c } = agua
  const prev = useRef({})
  const [flash, setFlash] = useState({})
  useEffect(() => {
    if (!c) return
    const ch = {}
    for (const n of c.nodes) if (prev.current[n.id] !== undefined && prev.current[n.id] !== n.val) ch[n.id] = true
    prev.current = Object.fromEntries(c.nodes.map((n) => [n.id, n.val]))
    if (Object.keys(ch).length) {
      setFlash(ch)
      const t = setTimeout(() => setFlash({}), 900)
      return () => clearTimeout(t)
    }
  }, [c])
  if (!c) return <p className="muted">Cargando…</p>
  const W = 132, H = 44, GX = 30, GY = 16
  const pos = Object.fromEntries(c.nodes.map((n) => [n.id, { x: 8 + n.col * (W + GX), y: 8 + n.fila * (H + GY) }]))
  const vw = 16 + 4 * W + 3 * GX, vh = 16 + 4 * H + 3 * GY
  const lit = new Set(c.arestes.filter(([a]) => flash[a]).flatMap(([a, b]) => [a, b]))
  return (
    <div className="ag-ce">
      <svg viewBox={`0 0 ${vw} ${vh}`} role="img" aria-label="Diagrama causa efecto del drenaje">
        <defs><marker id="ag-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
        {c.arestes.map(([a, b]) => {
          const A = pos[a], B = pos[b]
          const x1 = A.x + W, y1 = A.y + H / 2, x2 = B.x, y2 = B.y + H / 2
          const same = A.x === B.x
          const d = same ? `M${A.x + W / 2} ${A.y + H} L${B.x + W / 2} ${B.y}` : `M${x1} ${y1} C${x1 + GX / 2} ${y1} ${x2 - GX / 2} ${y2} ${x2} ${y2}`
          const on = flash[a]
          return <path key={a + b} d={d} className={`ag-edge ${on ? 'on' : ''}`} markerEnd="url(#ag-arr)" />
        })}
        {c.nodes.map((n) => {
          const P = pos[n.id]
          const col = n.sev ? SEV[n.sev] : 'var(--acc)'
          return (
            <g key={n.id} transform={`translate(${P.x},${P.y})`} className={`ag-node ${flash[n.id] || lit.has(n.id) ? 'on' : ''}`}>
              <rect width={W} height={H} rx="7" style={{ stroke: col }} className={n.palanca ? 'lever' : ''} />
              <text x={W / 2} y="17" textAnchor="middle" className="t">{n.nom}</text>
              <text x={W / 2} y="34" textAnchor="middle" className="v" style={{ fill: n.sev && n.sev !== 'ok' ? col : undefined }}>{n.val}</text>
            </g>
          )
        })}
      </svg>
      <p className="ag-note">Mueve una palanca (recuadro azul) y las flechas se iluminan a lo largo de la cadena de consecuencias.</p>
    </div>
  )
}

// ---------------------------------------------------------------- corte A–A de una calle
export function AguaCorte({ agua }) {
  const { r, sel, setSel } = agua
  if (!r) return <p className="muted">Cargando…</p>
  const d = r.districtes.find((x) => x.codi === sel) || r.districtes[0]
  const nivell = Math.min(1, d.us) // llenado del colector
  const dip = Math.min(1, r.total.ompliment)
  const carrer = d.vDesborda > 0 ? Math.min(14, 4 + Math.log10(1 + d.vDesborda / 1000) * 5) : 0 // lámina en la calle (px, ilustrativa)
  const col = ESTAT_COLOR[d.estat]
  // geometría (unidades SVG)
  const Y0 = 120 // rasante
  return (
    <div className="ag-cut">
      <div className="ag-row">
        <select value={d.codi} onChange={(e) => setSel(e.target.value)} aria-label="Distrito del corte">
          {r.districtes.map((x) => <option key={x.codi} value={x.codi}>{x.nom}</option>)}
        </select>
        <span className="ag-badge" style={{ background: col }}>Red {pct(d.us)} · {ESTAT_NOM[d.estat]}</span>
      </div>
      <svg viewBox="0 0 520 300" role="img" aria-label={`Corte de una calle de ${d.nom}`}>
        <defs>
          <pattern id="ag-soil" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#d9c7a3" /><circle cx="3" cy="3" r="1" fill="#c4ae86" /><circle cx="8" cy="7" r="1" fill="#c4ae86" /></pattern>
          <linearGradient id="ag-water" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#4fa3e0" /><stop offset="1" stopColor="#2a78d6" /></linearGradient>
        </defs>
        {/* cielo con lluvia */}
        <rect x="0" y="0" width="520" height={Y0} fill="var(--ag-sky)" />
        {r.mmh > 0 && Array.from({ length: Math.min(60, Math.round(r.mmh / 2) + 4) }, (_, i) => (
          <line key={i} x1={(i * 53) % 520} y1={(i * 37) % 90} x2={(i * 53) % 520 - 4} y2={(i * 37) % 90 + 10} className="ag-drop" style={{ animationDelay: `${(i % 10) * 0.07}s` }} />
        ))}
        {/* edificios */}
        <rect x="0" y="40" width="70" height={Y0 - 40} fill="#c9ced6" /><rect x="450" y="30" width="70" height={Y0 - 30} fill="#c9ced6" />
        {/* aceras y calzada */}
        <rect x="70" y={Y0 - 6} width="60" height="6" fill="#b8bec8" /><rect x="390" y={Y0 - 6} width="60" height="6" fill="#b8bec8" />
        <rect x="130" y={Y0 - 2} width="260" height="2" fill="#6b7280" />
        {carrer > 0 && <rect x="70" y={Y0 - 6 - carrer} width="380" height={carrer + 4} fill="url(#ag-water)" opacity=".75" className="ag-street" />}
        {/* terreno */}
        <rect x="0" y={Y0} width="520" height={300 - Y0} fill="url(#ag-soil)" />
        {/* imbornal y bajante */}
        <rect x="128" y={Y0 - 1} width="14" height="5" fill="#374151" /><rect x="132" y={Y0 + 4} width="6" height="34" fill="#9aa3b1" />
        {/* colector */}
        <circle cx="260" cy="175" r="34" fill="#eef0f3" stroke="#6b7280" strokeWidth="4" />
        <clipPath id="ag-pipe"><circle cx="260" cy="175" r="32" /></clipPath>
        <rect x="226" y={175 + 32 - 64 * nivell} width="68" height={64 * nivell} fill="url(#ag-water)" clipPath="url(#ag-pipe)" className="ag-fill" />
        <path d="M138 158 L226 168" stroke="#9aa3b1" strokeWidth="6" />
        <text x="260" y="226" textAnchor="middle" className="ag-lbl">colector {pct(d.us)}</text>
        {/* depósito */}
        <rect x="330" y="200" width="150" height="80" rx="4" fill="#eef0f3" stroke="#6b7280" strokeWidth="3" />
        <rect x="332" y={278 - 76 * dip} width="146" height={76 * dip} fill="url(#ag-water)" className="ag-fill" />
        <path d="M294 180 L330 215" stroke="#9aa3b1" strokeWidth="6" />
        <text x="405" y="294" textAnchor="middle" className="ag-lbl">depósitos de la ciudad {pct(r.total.ompliment)}</text>
        {/* flujo en el colector */}
        {nivell > 0.05 && <path d={`M228 ${175 + 32 - 32 * nivell} L292 ${175 + 32 - 32 * nivell}`} className="ag-flow" />}
        <text x="10" y="20" className="ag-lbl strong">{d.nom} · {n0(r.mmh)} mm/h</text>
        {carrer > 0 && <text x="260" y={Y0 - 16 - carrer} textAnchor="middle" className="ag-lbl bad">agua en la calzada</text>}
      </svg>
      <p className="ag-note">Corte esquemático: imbornal → colector → depósito. El llenado sale del modelo; las dimensiones son ilustrativas.</p>
    </div>
  )
}

// ---------------------------------------------------------------- panel lateral (pestaña Agua)
export default function AguaPanel({ agua, onOpen, open, enabled, onEnable }) {
  const r = agua.r
  const PANELS = [['lluvia', 'Lluvia y palancas'], ['balance', 'Balance de caudales'], ['causa', 'Causa → efecto'], ['corte', 'Corte A–A']]
  return (
    <div className="panel-body agua">
      <h2>Agua y lluvia</h2>
      <p className="muted">Qué pasa en el alcantarillado de Barcelona cuando llueve fuerte: escorrentía de cada distrito, uso de la red, depósitos anti-inundación y agua en la calle.</p>
      {!enabled && <div className="res-mode">La capa está apagada. <button className="btn primary" onClick={onEnable}>Mostrar en el mapa</button></div>}
      {agua.err && <p className="err">{agua.err}</p>}
      <h3>Paneles flotantes</h3>
      <div className="ag-open">
        {PANELS.map(([k, t]) => <button key={k} className={`chip ${open[k] ? 'on' : ''}`} onClick={() => onOpen(k)}>{t}</button>)}
      </div>
      {r && (
        <>
          <div className="res-kpis">
            <div className={r.total.us >= 1 ? 'bad' : ''}><b>{pct(r.total.us)}</b><small>uso de la red</small></div>
            <div><b>{pct(r.total.ompliment)}</b><small>depósitos</small></div>
            <div className={r.total.vDesborda > 0 ? 'bad' : ''}><b>{mil(r.total.vDesborda)}</b><small>en la calle</small></div>
          </div>
          <h3>Distritos</h3>
          <table className="board">
            <thead><tr><th>Distrito</th><th>Verde</th><th>Red</th></tr></thead>
            <tbody>
              {[...r.districtes].sort((a, b) => b.us - a.us).map((d) => (
                <tr key={d.codi} className={agua.sel === d.codi ? 'sel' : ''} onClick={() => agua.setSel(d.codi)}>
                  <td><i className="dotf" style={{ background: ESTAT_COLOR[d.estat] }} />{d.nom}</td>
                  <td>{pct(d.verdEf)}</td>
                  <td>{pct(d.us)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="note">Real: límites y superficie de los 10 distritos (Open Data BCN), su suelo permeable calculado con la calificación urbanística (Generalitat), la lluvia de ahora (Open-Meteo) y el volumen de los depósitos de Zona Universitària (105.500 m³), Joan Miró (55.000 m³) y Escola Industrial (27.000 m³), con posición aproximada. Hipótesis: coeficientes de escorrentía (0,9 urbano, 0,2 verde), lluvia que aguanta la red, que la mitad del agua que no traga la red en los distritos de montaña baja por la calle a los de abajo, y el escenario climático. Es un modelo didáctico (método racional), no un modelo hidráulico de la red.</p>
    </div>
  )
}
export { DEPOSITS }
