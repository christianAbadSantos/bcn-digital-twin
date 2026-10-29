import React from 'react'

const W = 320
const H = 120

// Gráfico lluvia (barras azules) vs accidentes (línea roja) con cursor en la hora seleccionada
function Chart({ data, hour, onPick }) {
  const n = data.times.length
  const maxRain = Math.max(2, ...data.rain)
  const maxAcc = Math.max(3, ...data.perHour)
  const bw = W / n
  const accPts = data.perHour.map((v, i) => `${(i + 0.5) * bw},${H - (v / maxAcc) * (H - 8)}`).join(' ')

  const pick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    onPick(Math.max(0, Math.min(n - 1, Math.round(x * n - 0.5))))
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" onClick={pick} role="img" aria-label="Lluvia y accidentes por hora">
      {data.rain.map((r, i) => (
        <rect key={i} x={i * bw} y={H - (r / maxRain) * (H - 8)} width={Math.max(bw - 0.4, 0.6)} height={(r / maxRain) * (H - 8)} fill="#4cc9f0" opacity="0.75" />
      ))}
      <polyline points={accPts} fill="none" stroke="#ff4d6d" strokeWidth="1.2" />
      <line x1={(hour + 0.5) * bw} x2={(hour + 0.5) * bw} y1="0" y2={H} stroke="#fff" strokeWidth="1" />
    </svg>
  )
}

export default function Panel({ data, hour, onPick }) {
  if (!data) return <aside className="panel">Cargando datos…</aside>
  const { stats } = data
  const t = data.times[hour]
  const recent = data.accidents.filter((a) => a.hourIdx > hour - 7 && a.hourIdx <= hour)

  return (
    <aside className="panel">
      <h2>Lluvia vs accidentes</h2>
      <p className="muted">
        Última semana, por horas. Lluvia: <b>{data.source}</b>. Accidentes: <b>simulados</b>.
      </p>
      <Chart data={data} hour={hour} onPick={onPick} />
      <div className="legend">
        <span><i style={{ background: '#4cc9f0' }} /> lluvia (mm/h)</span>
        <span><i style={{ background: '#ff4d6d' }} /> accidentes/h</span>
      </div>

      <div className="stats">
        <div><small>Correlación (r)</small><b>{stats.r.toFixed(2)}</b></div>
        <div><small>Accidentes</small><b>{stats.total}</b></div>
        <div><small>Media con lluvia</small><b>{stats.avgWet.toFixed(2)}/h</b></div>
        <div><small>Media sin lluvia</small><b>{stats.avgDry.toFixed(2)}/h</b></div>
      </div>

      <h3>{t.replace('T', ' ')} · {data.rain[hour].toFixed(1)} mm</h3>
      <ul className="events">
        {recent.length === 0 && <li className="muted">Sin accidentes en las últimas 6 h</li>}
        {recent.slice(-6).reverse().map((a) => (
          <li key={a.id}>
            <i className={`dot ${a.sev}`} /> {a.place} <small>({a.sev})</small>
          </li>
        ))}
      </ul>

      <p className="note">
        Los accidentes se generan con un modelo en el que la lluvia sube la tasa, así que la correlación
        es ilustrativa. El siguiente paso es cargar los datos reales de Open Data BCN (Guàrdia Urbana).
      </p>
    </aside>
  )
}
