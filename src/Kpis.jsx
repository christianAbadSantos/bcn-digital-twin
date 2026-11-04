import React from 'react'

const fmt = (n, d = 0) => Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' })

function Kpi({ label, value, unit, sub, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-l">{label}</div>
      <div className={`kpi-v ${tone || ''}`}>{value}{unit && <small>{unit}</small>}</div>
      <div className="kpi-s">{sub}</div>
    </div>
  )
}

export default function Kpis({ live, data }) {
  if (!live) return <section className="kpis"><Kpi label="Conectando" value="—" sub="fuentes de datos" /></section>
  const zs = live.zones
  const avg = zs.reduce((s, z) => s + z.speed, 0) / zs.length
  const base = zs.reduce((s, z) => s + z.baseline, 0) / zs.length
  const crit = live.alerts.filter((a) => a.sev === 'crit').length
  const online = live.sources.filter((s) => s.status === 'ok').length
  const sim = live.sources.filter((s) => s.simulated).length
  const w = live.weather
  return (
    <section className="kpis">
      <Kpi label="Velocidad media" value={fmt(avg, 1)} unit="km/h" sub={`habitual ${fmt(base, 1)} · ${fmt((avg / base) * 100)} %`} tone={avg / base < 0.6 ? 'bad' : avg / base < 0.85 ? 'warn' : ''} />
      <Kpi label="Alertas abiertas" value={live.alerts.length} sub={`${crit} críticas`} tone={crit ? 'bad' : live.alerts.length ? 'warn' : ''} />
      <Kpi label="Incidentes abiertos" value={live.incidents.length} sub="tiempo real (simulado)" />
      <Kpi label="Fuentes en línea" value={`${online}/${live.sources.length}`} sub={`${sim} simuladas · ${live.sources.length - sim} reales`} />
      <Kpi label="Lluvia ahora" value={fmt(w.rain, 1)} unit="mm/h" sub={`viento ${fmt(w.wind)} km/h · ${fmt(w.temp)} °C${w.scenario ? ' · escenario' : ''}`} tone={w.rain >= 2 ? 'warn' : ''} />
      <Kpi label="Accidentes 2024" value={data?.accidents ? fmt(data.accidents.length) : '—'} sub="reales · Guàrdia Urbana" />
    </section>
  )
}
