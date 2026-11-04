import React from 'react'
import { PLACES } from './geo.js'

export default function RoutePanel({ sel, setSel, route, live }) {
  const set = (k) => (e) => setSel({ ...sel, [k]: e.target.value })
  const min = (o) => (o.minutes == null ? '–' : `${o.minutes} min`)

  return (
    <div className="panel-body">
      <h2>Mejor ruta de A a B</h2>
      <p className="muted">Compara coche, bus, metro, bici y a pie con el tráfico, los incidentes, el metro y la meteo de ahora mismo.</p>

      <div className="sel2">
        <label>De <select value={sel.from} onChange={set('from')}>{PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>A <select value={sel.to} onChange={set('to')}>{PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      </div>

      {!live && <div className="calm">Esperando datos…</div>}
      {live && !route && <div className="calm">Elige dos lugares distintos.</div>}

      {route && (
        <>
          <div className={`verdict ${route.changed ? 'changed' : ''}`}>
            <div>Sin datos en vivo: <b>{route.baseBest.label} · {min(route.baseBest)}</b></div>
            <div>Con datos en vivo: <b>{route.best.label} · {min(route.best)}</b></div>
            {route.changed ? (
              <div className="why">La ingesta de datos cambia la decisión: sin ella se recomendaría {route.baseBest.label.toLowerCase()}.</div>
            ) : (
              <div className="why">Con las condiciones actuales la mejor opción no cambia.</div>
            )}
          </div>

          {route.live.map((o, i) => (
            <div className={`opt ${i === 0 ? 'best' : ''}`} key={o.mode}>
              <div className="opt-top"><b>{o.label}</b><span>{min(o)}</span></div>
              <div className="muted">{o.reasons.join(' · ')}</div>
            </div>
          ))}
          <p className="note">Distancias en línea recta con factores de rodeo; metro con red esquemática. Es una demo, no un planificador real.</p>
        </>
      )}
    </div>
  )
}
