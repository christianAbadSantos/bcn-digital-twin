import React from 'react'
import { RULES } from '../shared/engine.js'

const SEV = { crit: 'Crítica', warn: 'Aviso', info: 'Info' }

export default function AlertsPanel({ live, onFocus }) {
  if (!live) return <div className="panel-body">Cargando alertas…</div>
  const short = Object.fromEntries(live.sources.map((s) => [s.id, s.protocol]))

  return (
    <div className="panel-body">
      <h2>Alertas</h2>
      <p className="muted">Se calculan cruzando varias fuentes. Ninguna de ellas, sola, daría estos avisos.</p>

      {live.alerts.length === 0 && <div className="calm">Todo en calma: ninguna regla se ha activado.</div>}

      {live.alerts.map((a) => (
        <div className={`alert ${a.sev}`} key={a.id}>
          <div className="alert-top">
            <span className={`sev ${a.sev}`}>{SEV[a.sev]}</span>
            <span className="rule">{a.rule}</span>
          </div>
          <div className="alert-title">{a.title}</div>
          <div className="alert-detail">{a.detail}</div>
          <div className="chips2">
            {a.sources.map((s) => (
              <span className="chip2" key={s}>{short[s] || s}</span>
            ))}
          </div>
          <button className="btn small" onClick={() => onFocus({ lon: a.lon, lat: a.lat, k: Date.now() })}>Ver en el mapa</button>
        </div>
      ))}

      <details className="rules">
        <summary>Reglas activas ({RULES.length})</summary>
        {RULES.map((r) => (
          <div className="rule-row" key={r.id}>
            <b>{r.id} · {r.name}</b> <span className={`sev ${r.sev}`}>{SEV[r.sev]}</span>
            <div className="muted">{r.desc}</div>
            <div className="chips2">{r.sources.map((s) => <span className="chip2" key={s}>{short[s] || s}</span>)}</div>
          </div>
        ))}
      </details>
    </div>
  )
}
