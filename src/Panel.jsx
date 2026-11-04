import React from 'react'
import { SEV_LABEL } from './stats.js'

const W = 320
const H = 120
const WINDOW = 168 // una semana de horas alrededor de la hora elegida

// Lluvia (barras azules) y accidentes por hora (línea roja) en la semana alrededor del cursor
function Chart({ data, hour, onPick }) {
  const n = data.times.length
  const start = Math.max(0, Math.min(n - WINDOW, hour - WINDOW / 2))
  const idx = Array.from({ length: WINDOW }, (_, k) => start + k)
  const rain = idx.map((i) => data.rain[i])
  const acc = idx.map((i) => data.perHour[i])
  const maxRain = Math.max(2, ...rain)
  const maxAcc = Math.max(3, ...acc)
  const bw = W / WINDOW
  const pts = acc.map((v, k) => `${(k + 0.5) * bw},${H - (v / maxAcc) * (H - 8)}`).join(' ')

  const pick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    onPick(start + Math.max(0, Math.min(WINDOW - 1, Math.round(x * WINDOW - 0.5))))
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" onClick={pick} role="img" aria-label="Lluvia y accidentes por hora, semana seleccionada">
      {data.rainOk && rain.map((r, k) => <rect key={k} x={k * bw} y={H - (r / maxRain) * (H - 8)} width={Math.max(bw - 0.3, 0.5)} height={(r / maxRain) * (H - 8)} fill="#4cc9f0" opacity="0.75" />)}
      <polyline points={pts} fill="none" stroke="#ff4d6d" strokeWidth="1.2" />
      <line x1={(hour - start + 0.5) * bw} x2={(hour - start + 0.5) * bw} y1="0" y2={H} stroke="#fff" strokeWidth="1" />
    </svg>
  )
}

const fmt = (n) => n.toLocaleString('es-ES')

function Conclusion({ mh }) {
  if (!mh) return null
  const pct = Math.round((mh.rr - 1) * 100)
  const ci = `IC 95 %: ×${mh.lo.toFixed(2)} a ×${mh.hi.toFixed(2)}`
  if (mh.lo > 1) return <p className="verdict2 up">Con lluvia hay un <b>{pct} % más</b> de accidentes por hora, a igual hora del día y tipo de día ({ci}).</p>
  if (mh.hi < 1) return <p className="verdict2">Con lluvia hay un <b>{Math.abs(pct)} % menos</b> de accidentes por hora, a igual hora del día y tipo de día ({ci}).</p>
  return <p className="verdict2">Con estos datos <b>no se distingue un efecto de la lluvia</b> sobre el número de accidentes por hora ({ci} incluye ×1).</p>
}

export default function Panel({ data, hour, onPick }) {
  if (!data) return <div className="panel-body">Cargando accidentes y lluvia de 2024…</div>
  if (data.error) return <div className="panel-body"><p className="err">No se pudieron cargar los accidentes: {data.error}</p></div>

  const { stats } = data
  const recent = data.accidents.filter((a) => a.hourIdx > hour - 24 && a.hourIdx <= hour)

  return (
    <div className="panel-body">
      <h2>Lluvia vs accidentes · 2024</h2>
      <p className="muted">
        Accidentes: <b>reales</b> (Guàrdia Urbana, Open Data BCN). Lluvia: <b>{data.rainOk ? 'real (Open-Meteo)' : 'no disponible'}</b>.
      </p>

      {!data.rainOk && <p className="err">No se pudo cargar la lluvia histórica de Open-Meteo. Se muestran los accidentes, pero no se calcula ninguna relación con la lluvia.</p>}

      <Chart data={data} hour={hour} onPick={onPick} />
      <div className="legend">
        <span><i style={{ background: '#4cc9f0' }} /> lluvia (mm/h)</span>
        <span><i style={{ background: '#ff4d6d' }} /> accidentes/h</span>
      </div>
      {data.rainOk && <button className="btn small" onClick={() => onPick(stats.rainiestDay * 24 + 12)}>Ir al día más lluvioso ({data.times[stats.rainiestDay * 24].slice(0, 10)}, {Math.round(stats.rainiestMm)} mm)</button>}

      <div className="stats">
        <div><small>Accidentes 2024</small><b>{fmt(stats.totals.accidents)}</b></div>
        <div><small>Víctimas</small><b>{fmt(stats.totals.victims)}</b></div>
        <div><small>Fallecidos</small><b>{stats.totals.fatalities}</b></div>
        <div><small>Heridos graves</small><b>{stats.totals.serious}</b></div>
        {data.rainOk && (
          <>
            <div><small>Horas con lluvia</small><b>{fmt(stats.wetHours)}</b></div>
            <div><small>Media con / sin lluvia</small><b>{stats.avgWet.toFixed(2)} / {stats.avgDry.toFixed(2)}</b></div>
          </>
        )}
      </div>

      {data.rainOk && stats.mh && (
        <>
          <h3>Efecto de la lluvia</h3>
          <div className="rr">×{stats.mh.rr.toFixed(2)} <small>razón ajustada</small></div>
          <Conclusion mh={stats.mh} />
          <p className="muted">
            La media simple con/sin lluvia engaña porque llueve a horas con distinto tráfico. La razón ajustada compara cada hora del día y tipo de día (laborable o fin de semana) consigo misma. Correlación de Pearson horaria: r = {stats.r.toFixed(2)}.
          </p>
        </>
      )}

      <h3>{data.times[hour].replace('T', ' ')} · {data.rainOk ? `${data.rain[hour].toFixed(1)} mm` : 'sin dato de lluvia'}</h3>
      <p className="muted">Accidentes de las últimas 24 h ({recent.length}):</p>
      <ul className="events">
        {recent.length === 0 && <li className="muted">Ninguno en este periodo</li>}
        {recent.slice(-6).reverse().map((a) => (
          <li key={a.id}>
            <i className={`dot ${a.sev}`} /> {a.barri} <small>({SEV_LABEL[a.sev]}{a.victims ? `, ${a.victims} víctima${a.victims > 1 ? 's' : ''}` : ''})</small>
          </li>
        ))}
      </ul>

      <p className="note">
        Un solo punto de lluvia (centro de Barcelona) para toda la ciudad, un solo año y sin ajustar por volumen de tráfico. Que haya o no relación no demuestra causa. Los accidentes son los gestionados por la Guàrdia Urbana, no todos los de la ciudad.
      </p>
    </div>
  )
}
