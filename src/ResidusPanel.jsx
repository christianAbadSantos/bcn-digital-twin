import React, { useState } from 'react'
import { FRACCIONS, FRACCIO_NOM, FRACCIO_COLOR } from '../shared/residus.js'

const n = (x) => Number(x || 0).toLocaleString('es-ES')

// Panel de residuos: estado de los contenedores por fracción, planificación de la ruta de recogida
// desde la base de la Zona Franca y origen de los datos (API .NET o simulación en el navegador).
export default function ResidusPanel({ res, fraccio, setFraccio, onFocus }) {
  const [llindar, setLlindar] = useState(80)
  const [busy, setBusy] = useState(false)
  if (!res) return null
  const k = res.kpis
  const ruta = res.ruta
  const fr = fraccio === 'all' ? 'Rebuig' : fraccio

  const planifica = async () => {
    setBusy(true)
    try {
      await res.planificaRuta(fr, llindar)
    } finally {
      setBusy(false)
    }
  }
  const verRuta = () => {
    const pts = ruta.viatges.flatMap((v) => v.parades)
    const lats = [ruta.baseLat, ...pts.map((p) => p.lat)], lons = [ruta.baseLon, ...pts.map((p) => p.lon)]
    onFocus({ bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]] })
  }

  return (
    <div className="panel-body res">
      <h2>Residuos y limpieza</h2>
      <p className="muted">Contenedores reales de Barcelona con un sensor de llenado cada uno. Cuando superan el umbral entran en la ruta de recogida, que sale de la base de la Zona Franca.</p>

      <div className={`res-mode ${res.mode}`}>
        {res.mode === 'api' ? (
          <>Conectado a la <b>API .NET</b> (ASP.NET Core · EF Core · {res.api.includes('localhost') ? 'PostgreSQL' : 'SQL Server'}) · <a href={`${res.api}/panel`} target="_blank" rel="noopener">panel MVC</a> · <a href={`${res.api}/scalar`} target="_blank" rel="noopener">documentación</a></>
        ) : res.mode === 'local' ? (
          <>Simulación en el navegador (la API .NET no responde ahora mismo; se reintenta cada 20 s). Mismo modelo y mismo planificador que la API.</>
        ) : 'Cargando contenedores…'}
      </div>

      <div className="res-chips">
        <button className={`chip ${fraccio === 'all' ? 'on' : ''}`} onClick={() => setFraccio('all')}>Todas</button>
        {FRACCIONS.map((f) => (
          <button key={f} className={`chip ${fraccio === f ? 'on' : ''}`} onClick={() => setFraccio(f)}><i style={{ background: FRACCIO_COLOR[f] }} />{FRACCIO_NOM[f]}</button>
        ))}
      </div>

      <div className="res-kpis">
        <div><b>{n(k.contenidors)}</b><small>contenedores</small></div>
        <div><b>{n(k.plens)}</b><small>por encima del 80 %</small></div>
        <div className={k.desbordats ? 'bad' : ''}><b>{n(k.desbordats)}</b><small>desbordados</small></div>
      </div>

      <table className="board">
        <thead><tr><th>Fracción</th><th>Llenado medio</th><th>&gt; 80 %</th><th>100 %</th></tr></thead>
        <tbody>
          {(k.perFraccio || []).map((x) => (
            <tr key={x.fraccio} className={fraccio === x.fraccio ? 'sel' : ''} onClick={() => setFraccio(x.fraccio)}>
              <td><i className="dotf" style={{ background: FRACCIO_COLOR[x.fraccio] }} />{FRACCIO_NOM[x.fraccio]} <small className="muted">({n(x.contenidors)})</small></td>
              <td><div className="mbar"><i style={{ width: `${x.nivellMitja}%`, background: x.nivellMitja >= 80 ? '#d03b3b' : x.nivellMitja >= 50 ? '#fab219' : '#0ca30c' }} /></div>{x.nivellMitja.toLocaleString('es-ES')} %</td>
              <td>{n(x.plensMes80)}</td>
              <td className={x.desbordats ? 'bad-t' : ''}>{n(x.desbordats)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Ruta de recogida</h3>
      <div className="res-plan">
        <span>{FRACCIO_NOM[fr]}{fraccio === 'all' && <small className="muted"> (elige una fracción)</small>}</span>
        <label>umbral
          <select value={llindar} onChange={(e) => setLlindar(Number(e.target.value))}>
            {[60, 70, 80, 90].map((v) => <option key={v} value={v}>{v} %</option>)}
          </select>
        </label>
        <button className="btn primary" onClick={planifica} disabled={busy || res.mode === 'carregant'}>{busy ? 'Calculando…' : 'Planificar'}</button>
      </div>

      {ruta && (
        <div className="res-ruta">
          <div className="res-kpis">
            <div><b>{ruta.parades}</b><small>paradas</small></div>
            <div><b>{ruta.kmTotal.toLocaleString('es-ES')}</b><small>km</small></div>
            <div><b>{Math.floor(ruta.minuts / 60)} h {ruta.minuts % 60} min</b><small>{ruta.viatges.length} viaje(s)</small></div>
          </div>
          <p className="muted small">{n(Math.round(ruta.kgTotal))} kg de {FRACCIO_NOM[ruta.fraccio].toLowerCase()} · camión de {n(ruta.capacitatCamioKg)} kg · sale y vuelve a {ruta.base}. Orden: vecino más próximo + mejora 2-opt{res.mode === 'api' ? ' (calculado por la API .NET)' : ''}.</p>
          {ruta.viatges.map((v, i) => (
            <div key={i} className="res-viatge"><b>Viaje {i + 1}</b> · {v.parades.length} paradas · {v.km.toLocaleString('es-ES')} km · {n(Math.round(v.kg))} kg</div>
          ))}
          <div className="urg-actions">
            <button className="btn" onClick={verRuta}>Ver en el mapa</button>
            <button className="btn" onClick={res.completaRuta}>Marcar como hecha</button>
            <button className="btn" onClick={() => res.setRuta(null)}>Descartar</button>
          </div>
        </div>
      )}
      {ruta && ruta.parades === 0 && <div className="calm">No hay contenedores de esta fracción por encima del {llindar} %.</div>}

      <p className="note">Real: posición de {n(k.contenidors)} contenedores y sus fracciones (OpenStreetMap), {res.dades?.puntsVerds?.length || 0} puntos verdes y {res.dades?.puntsCritics?.length || 0} puntos críticos de limpieza con su último estado (Open Data BCN, 2018). Simulado: el nivel de llenado (sensores) y la base de la Zona Franca (ubicación aproximada). La ruta une las paradas en orden; no sigue el trazado de las calles.</p>
    </div>
  )
}
