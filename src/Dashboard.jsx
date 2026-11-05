import React, { useMemo, useState } from 'react'
import { SEV_LABEL } from './stats.js'

const fmt = (n, d = 0) => Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' })
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const SEV_COLOR = { leve: '#ffd166', moderado: '#ff9f1c', grave: '#ff4d6d' }
const STATUS = { ok: 'En línea', degraded: 'Degradado', idle: 'Sin configurar', down: 'Caído' }
const tone = (r) => (r < 0.6 ? 'bad' : r < 0.85 ? 'warn' : 'ok')

function Card({ title, sub, right, children, span = 1, className = '' }) {
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
    </section>
  )
}

function Stat({ label, value, unit, sub, tone: t, accent }) {
  return (
    <div className={`ds ${accent ? 'accent' : ''}`}>
      <div className="ds-l">{label}</div>
      <div className={`ds-v ${t || ''}`}>{value}{unit && <small>{unit}</small>}</div>
      <div className="ds-s">{sub}</div>
    </div>
  )
}

const Tag = ({ children, kind }) => <span className={`dtag ${kind || ''}`}>{children}</span>

// ---------------------------------------------------------------- gráficos SVG
function HBars({ rows, color = 'var(--acc)', max, fmtv = (v) => fmt(v) }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hb">
          <span className="hb-l" title={r.label}>{r.label}</span>
          <span className="hb-t"><i style={{ width: `${Math.max(2, (r.value / m) * 100)}%`, background: r.color || color }} /></span>
          <b>{fmtv(r.value)}</b>
        </div>
      ))}
    </div>
  )
}

function Months({ perMonth, rainMonth }) {
  const W = 560, H = 190, pl = 30, pb = 22
  const maxA = Math.max(...perMonth)
  const maxR = rainMonth ? Math.max(...rainMonth) : 1
  const bw = (W - pl) / 12
  const y = (v, m) => H - pb - (v / m) * (H - pb - 14)
  const line = rainMonth && rainMonth.map((v, i) => `${i ? 'L' : 'M'}${pl + i * bw + bw / 2},${y(v, maxR)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart2" role="img" aria-label="Accidentes por mes">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pl} x2={W} y1={y(maxA * t, maxA)} y2={y(maxA * t, maxA)} stroke="#23272e" />
          <text x={pl - 6} y={y(maxA * t, maxA) + 3} textAnchor="end">{Math.round(maxA * t)}</text>
        </g>
      ))}
      {perMonth.map((v, i) => (
        <g key={i}>
          <rect x={pl + i * bw + 6} y={y(v, maxA)} width={bw - 12} height={H - pb - y(v, maxA)} rx="3" fill="#ffd400" opacity="0.9"><title>{MONTHS[i]}: {v} accidentes</title></rect>
          <text x={pl + i * bw + bw / 2} y={H - 6} textAnchor="middle">{MONTHS[i]}</text>
        </g>
      ))}
      {line && <path d={line} fill="none" stroke="#4c9dff" strokeWidth="2" />}
      {rainMonth && rainMonth.map((v, i) => <circle key={i} cx={pl + i * bw + bw / 2} cy={y(v, maxR)} r="3" fill="#4c9dff"><title>{MONTHS[i]}: {Math.round(v)} mm</title></circle>)}
    </svg>
  )
}

function Heat({ grid }) {
  const max = Math.max(1, ...grid.flat())
  const cw = 20, ch = 24, pl = 34, pt = 4
  return (
    <svg viewBox={`0 0 ${pl + 24 * cw} ${pt + 7 * ch + 18}`} className="chart2" role="img" aria-label="Accidentes por hora y día de la semana">
      {grid.map((row, d) => (
        <g key={d}>
          <text x={pl - 6} y={pt + d * ch + ch / 2 + 3} textAnchor="end">{DAYS[d]}</text>
          {row.map((v, h) => (
            <rect key={h} x={pl + h * cw + 1} y={pt + d * ch + 1} width={cw - 2} height={ch - 2} rx="3" fill="#ffd400" opacity={v ? 0.12 + 0.88 * (v / max) : 0.04}>
              <title>{DAYS[d]} {String(h).padStart(2, '0')}:00 · {v} accidentes</title>
            </rect>
          ))}
        </g>
      ))}
      {[0, 6, 12, 18, 23].map((h) => <text key={h} x={pl + h * cw + cw / 2} y={pt + 7 * ch + 13} textAnchor="middle">{String(h).padStart(2, '0')}h</text>)}
    </svg>
  )
}

function Donut({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  const R = 52, C = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" width="140" height="140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#1a1d23" strokeWidth="16" />
        {parts.map((p) => {
          const len = (p.value / total) * C
          const el = <circle key={p.label} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)"><title>{p.label}: {fmt(p.value)}</title></circle>
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

function Bullet({ z }) {
  const max = 60
  return (
    <div className="bl">
      <div className="bl-top"><span>{z.name}</span><b className={tone(z.ratio)}>{Math.round(z.speed)} km/h</b></div>
      <div className="bl-track">
        <i className={`fill ${tone(z.ratio)}`} style={{ width: `${Math.min(100, (z.speed / max) * 100)}%` }} />
        <u style={{ left: `${Math.min(100, (z.baseline / max) * 100)}%` }} title={`habitual ${Math.round(z.baseline)} km/h`} />
      </div>
      <div className="bl-s">habitual {Math.round(z.baseline)} km/h · {z.acc2024} accidentes reales en 2024</div>
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
          right={<Tag kind="acc">7 protocolos</Tag>}>
          <div className="dtw"><table className="dt">
            <thead><tr><th>Fuente</th><th>Protocolo</th><th>Estado</th><th>Mensajes/min</th><th>Latencia</th><th>Último</th></tr></thead>
            <tbody>
              {live.sources.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.label}</b>{s.simulated && <Tag>simulado</Tag>}</td>
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

        <Card title="Tráfico por zona" sub="Velocidad actual frente a la habitual (marca blanca)" span={2}>
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
        <Card title="Accidentes por mes" sub={agg.rainMonth ? 'Barras: accidentes · Línea azul: lluvia acumulada (mm)' : 'Barras: accidentes (la lluvia no se pudo cargar)'} span={2}>
          <Months perMonth={agg.perMonth} rainMonth={agg.rainMonth} />
        </Card>
        <Card title="Gravedad" sub="Según el parte de la Guàrdia Urbana">
          <Donut parts={[
            { label: SEV_LABEL.leve, value: agg.sev.leve, color: SEV_COLOR.leve },
            { label: SEV_LABEL.moderado, value: agg.sev.moderado, color: SEV_COLOR.moderado },
            { label: 'graves o fallecidos', value: agg.sev.grave, color: SEV_COLOR.grave },
          ]} />
        </Card>

        <Card title="Mapa de calor: hora × día de la semana" sub="Capa seleccionada" span={2}
          right={
            <div className="seg">
              {[['todos', 'Todos'], ['graves', 'Graves'], ['lluvia', 'Con lluvia']].map(([k, l]) => (
                <button key={k} className={layer === k ? 'on' : ''} onClick={() => setLayer(k)} disabled={k === 'lluvia' && !data.rainOk}>{l}</button>
              ))}
            </div>
          }>
          <Heat grid={grid} />
        </Card>
        <Card title="Barrios con más accidentes" sub="Total 2024">
          <HBars rows={agg.topBarris} />
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
