import React, { useEffect, useMemo, useRef, useState } from 'react'
import { SEV_LABEL } from './stats.js'

const fmt = (n, d = 0) => Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' })
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
// gravedad = escala de estado (aviso → serio → crítico), siempre con su etiqueta
const SEV_COLOR = { leve: '#fab219', moderado: '#ec835a', grave: '#d03b3b' }
const TONE_TXT = { bad: 'Crítico', warn: 'Atención', ok: 'Normal' }
const STATUS = { ok: 'En línea', degraded: 'Degradado', idle: 'Sin configurar', down: 'Caído' }
const tone = (r) => (r < 0.6 ? 'bad' : r < 0.85 ? 'warn' : 'ok')

function Card({ title, sub, right, children, span = 1, className = '', tip }) {
  return (
    <section className={`dc ${className}`} style={{ gridColumn: `span ${span}` }}>
      <header className="dc-h">
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {right}
      </header>
      {children}
      {tip?.node}
    </section>
  )
}

function Stat({ label, value, unit, sub, tone: t, accent }) {
  return (
    <div className={`ds ${accent ? 'accent' : ''}`}>
      <div className="ds-l">{label}</div>
      <div className="ds-v">{value}{unit && <small>{unit}</small>}</div>
      <div className="ds-s">{t && <span className={`pill ${t}`}>{TONE_TXT[t]}</span>}{sub}</div>
    </div>
  )
}

const Tag = ({ children, kind }) => <span className={`dtag ${kind || ''}`}>{children}</span>

// ---------------------------------------------------------------- gráficos SVG
// Paleta del panel (tema claro): un solo azul para magnitudes, aqua para la lluvia,
// colores de estado reservados (bien / aviso / serio / crítico) siempre con etiqueta.
const C = { blue: '#2a78d6', aqua: '#1baf7a', grid: '#e7e8ec', axis: '#c9cbd2', ink: '#101828', mut: '#6b7280' }
const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'] // azul secuencial claro→oscuro

// Tooltip compartido: los gráficos llaman a show(e, texto) al pasar por una marca
function useTip() {
  const [tip, setTip] = useState(null)
  const show = (e, text) => {
    const box = e.currentTarget.closest('.dc').getBoundingClientRect()
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text })
  }
  const hide = () => setTip(null)
  const node = tip && <div className="dtip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>
  return { show, hide, node }
}

// ancho real en píxeles: el SVG se dibuja a 1:1 (texto y barras no se deforman al cambiar el ancho)
function useWidth(fallback = 560) {
  const ref = useRef(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// ticks redondos (0, 200, 400…)
function niceTicks(max, n = 4) {
  const raw = max / n
  const p = 10 ** Math.floor(Math.log10(raw || 1))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) || p
  const top = Math.ceil(max / step) * step || step
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) }
}

// barra vertical con extremo redondeado (4 px) y base recta
const colPath = (x, y, w, h, r = 4) => {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

function HBars({ rows, color = C.blue, max, fmtv = (v) => fmt(v), tip }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hb" onMouseMove={(e) => tip?.show(e, `${r.label}: ${fmtv(r.value)} accidentes`)} onMouseLeave={tip?.hide}>
          <span className="hb-l" title={r.label}>{r.label}</span>
          <span className="hb-t"><i style={{ width: `${Math.max(2, (r.value / m) * 100)}%`, background: r.color || color }} /></span>
          <b>{fmtv(r.value)}</b>
        </div>
      ))}
    </div>
  )
}

// Columnas por mes (una serie). Se usa dos veces: accidentes y lluvia, cada una con su eje.
function MonthCols({ values, color, unit, label, tip, H = 170, fmtv = (v) => fmt(v) }) {
  const [box, W] = useWidth()
  const pl = 40, pb = 22, pt = 16
  const { top, ticks } = niceTicks(Math.max(...values))
  const bw = (W - pl) / 12
  const w = Math.min(24, bw - 10)
  const y = (v) => H - pb - (v / top) * (H - pb - pt)
  const iMax = values.indexOf(Math.max(...values))
  return (
    <div ref={box} className="cbox"><svg viewBox={`0 0 ${W} ${H}`} height={H} className="chart2" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pl} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.axis : C.grid} />
          <text x={pl - 8} y={y(t) + 3} textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      {values.map((v, i) => {
        const x = pl + i * bw + (bw - w) / 2
        return (
          <g key={i} className="mk" onMouseMove={(e) => tip.show(e, `${MONTHS[i]} 2024 · ${fmtv(v)} ${unit}`)} onMouseLeave={tip.hide}>
            <rect x={pl + i * bw} y={pt} width={bw} height={H - pb - pt} fill="transparent" />
            <path d={colPath(x, y(v), w, H - pb - y(v))} fill={color} />
            <text x={pl + i * bw + bw / 2} y={H - 6} textAnchor="middle">{MONTHS[i]}</text>
            {i === iMax && <text className="lbl" x={pl + i * bw + bw / 2} y={y(v) - 5} textAnchor="middle">{fmtv(v)}</text>}
          </g>
        )
      })}
    </svg></div>
  )
}

function Heat({ grid, tip }) {
  const max = Math.max(1, ...grid.flat())
  const [box, W] = useWidth()
  const pl = 34, pt = 2, gap = 2, cw = (W - pl) / 24, ch = Math.min(26, Math.max(18, cw))
  const color = (v) => (v ? SEQ[Math.min(SEQ.length - 1, Math.floor((v / max) * (SEQ.length - 0.001)))] : '#f1f2f5')
  return (
    <div ref={box} className="cbox">
      <svg viewBox={`0 0 ${W} ${pt + 7 * ch + 18}`} height={pt + 7 * ch + 18} className="chart2" role="img" aria-label="Accidentes por hora y día de la semana">
        {grid.map((row, d) => (
          <g key={d}>
            <text x={pl - 6} y={pt + d * ch + ch / 2 + 3} textAnchor="end">{DAYS[d]}</text>
            {row.map((v, h) => (
              <rect key={h} className="mk" x={pl + h * cw + gap / 2} y={pt + d * ch + gap / 2} width={cw - gap} height={ch - gap} rx="3" fill={color(v)}
                onMouseMove={(e) => tip.show(e, `${DAYS[d]} ${String(h).padStart(2, '0')}:00 · ${v} accidentes`)} onMouseLeave={tip.hide} />
            ))}
          </g>
        ))}
        {[0, 6, 12, 18, 23].map((h) => <text key={h} x={pl + h * cw + cw / 2} y={pt + 7 * ch + 13} textAnchor="middle">{String(h).padStart(2, '0')}h</text>)}
      </svg>
      <div className="scale"><span>0</span>{SEQ.map((c) => <i key={c} style={{ background: c }} />)}<span>{fmt(max)} accidentes / celda</span></div>
    </div>
  )
}

function Donut({ parts, tip }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  const R = 52, Cc = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" width="140" height="140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f2f5" strokeWidth="16" />
        {parts.map((p) => {
          const len = (p.value / total) * Cc
          const el = <circle key={p.label} className="mk" cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${Cc}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)"
            onMouseMove={(e) => tip.show(e, `${p.label}: ${fmt(p.value)} (${((p.value / total) * 100).toFixed(1)} %)`)} onMouseLeave={tip.hide} />
          acc += len
          return el
        })}
        <text x="70" y="68" textAnchor="middle" className="dn-v">{fmt(total)}</text>
        <text x="70" y="84" textAnchor="middle" className="dn-l">accidentes</text>
      </svg>
      <ul>
        {parts.map((p) => (
          <li key={p.label}><i style={{ background: p.color }} />{p.label}<b>{fmt(p.value)}</b><em>{((p.value / total) * 100).toFixed(1)} %</em></li>
        ))}
      </ul>
    </div>
  )
}

const TONE_LABEL = { ok: 'fluido', warn: 'denso', bad: 'congestionado' }
function Bullet({ z }) {
  const max = 60
  const t = tone(z.ratio)
  return (
    <div className="bl">
      <div className="bl-top"><span>{z.name}</span><b>{Math.round(z.speed)} km/h</b></div>
      <div className="bl-track">
        <i className={`fill ${t}`} style={{ width: `${Math.min(100, (z.speed / max) * 100)}%` }} />
        <u style={{ left: `${Math.min(100, (z.baseline / max) * 100)}%` }} title={`habitual ${Math.round(z.baseline)} km/h`} />
      </div>
      <div className="bl-s"><span className={`pill ${t}`}>{TONE_LABEL[t]}</span> habitual {Math.round(z.baseline)} km/h · {z.acc2024} accidentes reales en 2024</div>
    </div>
  )
}

// ---------------------------------------------------------------- vista en vivo
function Live({ live, mode }) {
  if (!live) return <div className="dc-empty">Conectando con las fuentes…</div>
  const zs = live.zones
  const avg = zs.reduce((s, z) => s + z.speed, 0) / zs.length
  const base = zs.reduce((s, z) => s + z.baseline, 0) / zs.length
  const crit = live.alerts.filter((a) => a.sev === 'crit').length
  const msgs = live.sources.reduce((s, x) => s + x.msgPerMin, 0)
  const online = live.sources.filter((s) => s.status === 'ok').length
  const delayed = live.metro.filter((l) => l.status === 'retraso').length
  const maxMsg = Math.max(1, ...live.sources.map((s) => s.msgPerMin))
  const w = live.weather
  const ago = (ts) => { const s = Math.max(0, Math.round((live.ts - ts) / 1000)); return s < 100 ? `${s} s` : `${Math.round(s / 60)} min` }
  return (
    <>
      <div className="d-stats">
        <Stat accent label="Fuentes transmitiendo" value={`${online}/${live.sources.length}`} sub={live.sources.length - online ? 'alguna fuente sin configurar o degradada' : 'todas operativas'} />
        <Stat label="Mensajes por minuto" value={fmt(msgs)} sub="suma de todos los conectores" />
        <Stat label="Velocidad media" value={fmt(avg, 1)} unit="km/h" sub={`habitual ${fmt(base, 1)} km/h`} tone={avg / base < 0.6 ? 'bad' : avg / base < 0.85 ? 'warn' : ''} />
        <Stat label="Alertas abiertas" value={live.alerts.length} sub={`${crit} críticas`} tone={crit ? 'bad' : live.alerts.length ? 'warn' : ''} />
        <Stat label="Incidentes abiertos" value={live.incidents.length} sub="Guàrdia Urbana · simulado" />
        <Stat label="Metro con retraso" value={`${delayed}/${live.metro.length}`} sub="líneas" tone={delayed ? 'warn' : ''} />
      </div>

      <div className="d-grid">
        <Card title="Fuentes de datos" sub={mode === 'backend' ? 'Backend Cloudflare Functions' : 'Motor local en el navegador'} span={2}
          right={<Tag kind="acc">{live.sources.length} conectores</Tag>}>
          <div className="dtw"><table className="dt">
            <thead><tr><th>Fuente</th><th>Protocolo</th><th>Estado</th><th>Mensajes/min</th><th>Latencia</th><th>Último</th></tr></thead>
            <tbody>
              {live.sources.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.label}</b>{s.simulated && s.status !== 'idle' && <Tag>simulado</Tag>}</td>
                  <td className="mono">{s.protocol}</td>
                  <td><span className={`st ${s.status}`}><i />{STATUS[s.status]}</span></td>
                  <td><span className="mini"><i style={{ width: `${(s.msgPerMin / maxMsg) * 100}%` }} /></span>{fmt(s.msgPerMin)}</td>
                  <td className="mono">{s.latencyMs} ms</td>
                  <td className="mono">{s.lastTs ? `hace ${ago(s.lastTs)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>

        <Card title="Alertas" sub="Reglas que cruzan varias fuentes" right={<Tag kind={crit ? 'bad' : ''}>{live.alerts.length} abiertas</Tag>}>
          <div className="feed">
            {live.alerts.length === 0 && <div className="dc-empty">Sin alertas activas</div>}
            {live.alerts.slice(0, 5).map((a, i) => (
              <div key={i} className={`fi ${a.sev}`}>
                <div className="fi-t"><span className={`sev ${a.sev}`}>{a.sev === 'crit' ? 'Crítica' : a.sev === 'warn' ? 'Alta' : 'Info'}</span><em>{a.rule}</em></div>
                <b>{a.title}</b>
                <p>{a.detail}</p>
                <div className="chips2">{a.sources.map((s) => <span key={s} className="chip2">{s}</span>)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Tráfico por zona" sub="Barra: velocidad actual · marca oscura: velocidad habitual" span={2}>
          <div className="bls">{zs.map((z) => <Bullet key={z.id} z={z} />)}</div>
        </Card>

        <Card title="Metro" sub="Telemetría de trenes (simulada)">
          <div className="rows">
            {live.metro.map((l) => {
              const load = Math.round(l.trains.reduce((s, t) => s + t.load, 0) / l.trains.length)
              return (
                <div key={l.id} className="row">
                  <i className="dotc" style={{ background: l.color }} />
                  <span>{l.name}</span>
                  <span className="mini"><i style={{ width: `${load}%`, background: l.color }} /></span>
                  <em>{load} % carga</em>
                  <Tag kind={l.status === 'retraso' ? 'bad' : 'ok'}>{l.status === 'retraso' ? 'retraso' : 'normal'}</Tag>
                </div>
              )
            })}
          </div>
        </Card>

        <Card title="Puerto" sub="Grúas STS (PROFINET, simulado)">
          <div className="rows">
            {live.port.map((c) => (
              <div key={c.device} className="row">
                <i className={`dotc ${c.state === 'RUN' ? 'okc' : 'badc'}`} />
                <span>{c.device}</span>
                <em>{c.state === 'RUN' ? `${c.boxesPerHour} cont/h` : c.reason || c.state}</em>
                <Tag kind={c.state === 'RUN' ? 'ok' : 'bad'}>{c.state}</Tag>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Tiempo" sub="Open-Meteo (real)">
          <div className="wx">
            <div><b>{fmt(w.rain, 1)}</b><small>mm/h lluvia</small></div>
            <div><b>{fmt(w.wind)}</b><small>km/h viento</small></div>
            <div><b>{fmt(w.temp)}°</b><small>temperatura</small></div>
          </div>
          {w.scenario && <p className="dc-note">Valores forzados por el escenario seleccionado.</p>}
        </Card>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- vista histórica (real)
function History({ data }) {
  const [layer, setLayer] = useState('todos')
  const agg = useMemo(() => {
    const times = data.times
    const dayDow = Array.from({ length: 366 }, (_, d) => (new Date(Date.UTC(2024, 0, 1 + d)).getUTCDay() + 6) % 7)
    const perMonth = new Array(12).fill(0)
    const sev = { leve: 0, moderado: 0, grave: 0 }
    const barri = {}
    let victims = 0
    const hourTot = new Array(24).fill(0)
    data.accidents.forEach((a) => {
      perMonth[Number(times[a.hourIdx].slice(5, 7)) - 1]++
      sev[a.sev]++
      victims += a.victims || 0
      barri[a.barri] = (barri[a.barri] || 0) + 1
      hourTot[a.hourIdx % 24]++
    })
    const rainMonth = data.rainOk ? new Array(12).fill(0) : null
    if (rainMonth) data.rain.forEach((r, i) => (rainMonth[Number(times[i].slice(5, 7)) - 1] += r))
    const topBarris = Object.entries(barri).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }))
    const peak = hourTot.indexOf(Math.max(...hourTot))
    return { dayDow, perMonth, sev, victims, rainMonth, topBarris, peak }
  }, [data])

  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => new Array(24).fill(0))
    data.accidents.forEach((a) => {
      if (layer === 'graves' && a.sev !== 'grave') return
      if (layer === 'lluvia' && !(data.rainOk && data.rain[a.hourIdx] >= 0.2)) return
      g[agg.dayDow[Math.floor(a.hourIdx / 24)]][a.hourIdx % 24]++
    })
    return g
  }, [data, layer, agg])

  const st = data.stats
  const mh = st?.mh
  const tipM = useTip(), tipH = useTip(), tipD = useTip(), tipB = useTip()
  return (
    <>
      <div className="d-stats">
        <Stat accent label="Accidentes en 2024" value={fmt(data.accidents.length)} sub="gestionados por la Guàrdia Urbana" />
        <Stat label="Víctimas" value={fmt(agg.victims)} sub="heridos y fallecidos" />
        <Stat label="Graves o mortales" value={fmt(agg.sev.grave)} sub={`${((agg.sev.grave / data.accidents.length) * 100).toFixed(1)} % del total`} tone="bad" />
        <Stat label="Hora con más accidentes" value={`${String(agg.peak).padStart(2, '0')}:00`} sub="suma de todo el año" />
        <Stat label="Efecto de la lluvia" value={mh ? `×${fmt(mh.rr, 2)}` : '—'} sub={mh ? `IC 95 %: ${fmt(mh.lo, 2)}–${fmt(mh.hi, 2)} · ajustado` : 'sin datos de lluvia'} />
        <Stat label="Horas con lluvia" value={st?.wetHours != null ? fmt(st.wetHours) : '—'} sub="≥ 0,2 mm/h en 2024" />
      </div>

      <div className="d-grid">
        <Card title="Accidentes por mes" sub="Total mensual de 2024 · cada gráfico con su propia escala" span={2} tip={tipM}>
          <MonthCols values={agg.perMonth} color={C.blue} unit="accidentes" label="Accidentes por mes" tip={tipM} />
          <h4 className="dc-sub">Lluvia acumulada por mes (mm)</h4>
          {agg.rainMonth
            ? <MonthCols values={agg.rainMonth.map((v) => Math.round(v))} color={C.aqua} unit="mm de lluvia" label="Lluvia por mes" tip={tipM} H={120} />
            : <div className="dc-empty">No se pudo cargar la lluvia de Open-Meteo.</div>}
        </Card>
        <Card title="Gravedad" sub="Según el parte de la Guàrdia Urbana" tip={tipD}>
          <Donut tip={tipD} parts={[
            { label: SEV_LABEL.leve, value: agg.sev.leve, color: SEV_COLOR.leve },
            { label: SEV_LABEL.moderado, value: agg.sev.moderado, color: SEV_COLOR.moderado },
            { label: 'graves o fallecidos', value: agg.sev.grave, color: SEV_COLOR.grave },
          ]} />
        </Card>

        <Card title="Mapa de calor: hora × día de la semana" sub="Más oscuro = más accidentes" span={2} tip={tipH}
          right={
            <div className="seg">
              {[['todos', 'Todos'], ['graves', 'Graves'], ['lluvia', 'Con lluvia']].map(([k, l]) => (
                <button key={k} className={layer === k ? 'on' : ''} onClick={() => setLayer(k)} disabled={k === 'lluvia' && !data.rainOk}>{l}</button>
              ))}
            </div>
          }>
          <Heat grid={grid} tip={tipH} />
        </Card>
        <Card title="Barrios con más accidentes" sub="Total 2024" tip={tipB}>
          <HBars rows={agg.topBarris} tip={tipB} />
        </Card>

        {mh && (
          <Card title="¿Llueve más → más accidentes?" sub="Razón de tasas ajustada por hora del día y tipo de día (Mantel-Haenszel)" span={3}>
            <div className="rain-row">
              <div><small>Media con lluvia</small><b>{fmt(st.avgWet, 3)}</b><em>accidentes/hora</em></div>
              <div><small>Media sin lluvia</small><b>{fmt(st.avgDry, 3)}</b><em>accidentes/hora</em></div>
              <div className="big"><small>Razón ajustada</small><b>×{fmt(mh.rr, 2)}</b><em>IC 95 %: {fmt(mh.lo, 2)}–{fmt(mh.hi, 2)}</em></div>
              <p>No ajusta por volumen de tráfico y correlación no es causa. La media simple engaña porque llueve más a ciertas horas y estaciones.</p>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}

export default function Dashboard({ data, live, mode, scenarioLabel }) {
  const [tab, setTab] = useState('live')
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="dash">
      <div className="d-head">
        <div>
          <div className="d-kicker">Gemelo digital de Barcelona · datos abiertos y simulados</div>
          <h2>Panel de control</h2>
          <p><span className="live-dot" />{tab === 'live' ? 'En vivo' : 'Histórico'} · {today} · {scenarioLabel}</p>
        </div>
        <div className="seg big">
          <button className={tab === 'live' ? 'on' : ''} onClick={() => setTab('live')}>Operaciones en vivo</button>
          <button className={tab === 'hist' ? 'on' : ''} onClick={() => setTab('hist')}>Accidentes 2024</button>
        </div>
      </div>
      {tab === 'live' ? <Live live={live} mode={mode} /> : <History data={data} />}
      <p className="d-foot">{tab === 'live'
        ? 'Fuentes, tráfico, incidentes, metro y grúas: simulados con la forma del protocolo real. El tiempo es real.'
        : 'Datos reales: accidentes de la Guàrdia Urbana (Open Data BCN, 2024) y lluvia horaria de Open-Meteo.'}</p>
    </div>
  )
}
