import React from 'react'
import { hhmm } from '../shared/flota.js'
import { SPEEDS } from './useFlota.js'
import { toHex } from '../shared/lorawan.js'

const n = (x, d = 0) => Number(x || 0).toLocaleString('es-ES', { maximumFractionDigits: d })
const FASE = { base: 'En la base', ruta: 'En ruta', descarga: 'Descargando', espera: 'Esperando ventana', vuelta: 'Volviendo', fin: 'Terminado' }

// Panel de la flota: reloj de la simulación, ahorro del plan optimizado, tablero de camiones,
// detalle del camión elegido (paradas y último mensaje LoRaWAN) y registro de eventos.
export default function FlotaPanel({ fl, onFocus, enabled, onEnable }) {
  if (!fl) return null
  const v = fl.view
  if (!enabled) {
    return (
      <div className="panel-body fl">
        <h2>Flota de camiones</h2>
        <p className="muted">Rutas optimizadas para una empresa de reparto y seguimiento de cada camión en directo por LoRaWAN.</p>
        <button className="btn primary" onClick={onEnable}>Mostrar la flota en el mapa</button>
      </div>
    )
  }
  if (!v) return <div className="panel-body fl"><h2>Flota de camiones</h2><div className="calm">{fl.err || 'Cargando la matriz de distancias y planificando el día…'}</div></div>
  const sel = fl.sel
  const verFlota = () => {
    const pts = [[v.depot.lon, v.depot.lat], ...v.trucks.flatMap((t) => t.stops.map((o) => [o.lon, o.lat]))]
    onFocus({ bounds: [[Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))], [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]] })
  }
  const pick = (t) => {
    fl.setSelId(t.id === fl.selId ? null : t.id)
    if (t.pos) onFocus({ lon: t.pos[0], lat: t.pos[1], zoom: 13.5, pitch: 45 })
  }
  const estado = (t) => {
    if (t.phase === 'ruta' && t.next) return `→ ${t.next.id} · ${hhmm(t.next.eta)}`
    if (t.phase === 'descarga' || t.phase === 'espera') return `${FASE[t.phase]} en ${t.stops.find((o) => o.current)?.id || ''}`
    if (t.phase === 'base') return t.stops.length ? `Sale a las ${hhmm(t.depart)}` : 'Sin ruta hoy'
    if (t.phase === 'vuelta') return `Vuelve · ${hhmm(t.back)}`
    return 'En la base'
  }

  return (
    <div className="panel-body fl urg">
      <h2>Flota de camiones · reparto</h2>
      <p className="muted">Una empresa de transporte con base en la ZAL del Puerto reparte los pedidos del día con {v.trucks.length} camiones de {n(v.trucks[0]?.cap)} kg. El gemelo calcula las mejores rutas (distancias reales por carretera, capacidad y horario de cada cliente) y sigue cada camión en directo por LoRaWAN.</p>

      <div className="fl-clock">
        <div><b>{hhmm(v.now)}</b><small>{fl.live ? 'hora real' : `simulación ×${fl.speed}`} · {v.key.split('-').reverse().join('/')}</small></div>
        <div className="fl-speeds">
          {SPEEDS.filter((s) => s > 1).map((s) => <button key={s} className={`chip ${!fl.live && fl.speed === s ? 'on' : ''}`} onClick={() => fl.goSim(s)}>×{s}</button>)}
          <button className={`chip ${fl.live ? 'on' : ''}`} onClick={fl.goLive} title="Pone la simulación a la hora real y avanza a velocidad normal">En directo</button>
          <button className="chip" onClick={() => fl.setPaused(!fl.paused)}>{fl.paused ? '▶' : '❚❚'}</button>
        </div>
      </div>

      {fl.live && v.allDone && <div className="calm">El reparto de hoy ya ha terminado (último camión en la base a las {hhmm(v.lastBack)}). Mañana salen a las 06:45; para verlo ahora, elige una velocidad de simulación.</div>}

      <div className="res-kpis">
        <div><b>{n(v.plan.km, 1)} km</b><small>plan optimizado ({v.plan.trucksUsed} camiones)</small></div>
        <div><b>{n(v.naive.km, 1)} km</b><small>por orden de llegada{v.naive.late ? ` · ${v.naive.late} tarde` : ''}</small></div>
        <div className="good"><b>−{v.savePct} %</b><small>{n(v.saveKm, 1)} km · {n(v.co2)} kg CO₂ menos</small></div>
        <div><b>{v.done}/{v.orders}</b><small>paradas hechas</small></div>
        <div className={v.done && v.onTime < v.done ? 'bad' : ''}><b>{v.done ? Math.round((v.onTime / v.done) * 100) : 100} %</b><small>a tiempo</small></div>
        <div className={v.predictedLate ? 'bad' : ''}><b>{v.predictedLate}</b><small>retrasos previstos</small></div>
      </div>

      <div className="urg-actions">
        <button className="btn" onClick={fl.replan} title="Reordena las paradas pendientes de cada camión con el tráfico de ahora">Recalcular rutas</button>
        <button className="btn" onClick={fl.urgent} title="Entra un pedido de recogida urgente: se asigna al camión que menos se desvía">Recogida urgente</button>
        <button className="btn" onClick={fl.jam} title="Pone un atasco en la ruta de un camión para ver cómo cambia su hora de llegada">Simular atasco</button>
        {fl.incidents.length > 0 && <button className="btn" onClick={fl.clearIncidents}>Quitar atascos</button>}
        <button className="btn" onClick={verFlota}>Ver toda la flota</button>
        <button className="btn" onClick={fl.newDay}>Día siguiente</button>
      </div>
      {fl.geoState === 'fallback' && <p className="muted small">No se pudo pedir el trazado a OSRM: los camiones van en línea recta entre paradas (los tiempos siguen siendo los reales por carretera).</p>}

      <h3>Camiones</h3>
      <table className="board">
        <thead><tr><th>Camión</th><th>Estado</th><th>Carga</th><th>Paradas</th></tr></thead>
        <tbody>
          {v.trucks.map((t) => (
            <tr key={t.id} className={`${fl.selId === t.id ? 'sel' : ''} ${t.lateNext.length ? 'late' : ''}`} onClick={() => pick(t)}>
              <td><i className="dotf" style={{ background: t.color }} /> <b>{t.id}</b>{t.speedKmh > 1 && <small className="muted"> {Math.round(t.speedKmh)} km/h</small>}</td>
              <td>{estado(t)}{t.slow > 1.15 && (t.phase === 'ruta' || t.phase === 'vuelta') && <small className="warn-t"> · tráfico</small>}{t.lateNext.length > 0 && <small className="bad-t"> · {t.lateNext.length} tarde</small>}</td>
              <td><div className="mbar"><i style={{ width: `${t.loadPct}%`, background: t.color }} /></div>{n(t.load)} kg</td>
              <td>{t.done}/{t.stops.length}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {sel && (
        <div className="fl-sel">
          <h3><i className="dotf" style={{ background: sel.color }} /> {sel.id} <small className="muted">{FASE[sel.phase]} · {n(sel.km, 1)} km hechos{sel.delayMin ? ` · +${sel.delayMin} min por incidencias` : ''}</small></h3>
          <table className="board">
            <thead><tr><th>#</th><th>Cliente</th><th>Ventana</th><th>Hora</th></tr></thead>
            <tbody>
              {sel.stops.map((o, i) => (
                <tr key={o.id} className={`${o.current ? 'sel' : ''}`} onClick={() => onFocus({ lon: o.lon, lat: o.lat, zoom: 15, pitch: 45 })}>
                  <td>{i + 1}</td>
                  <td><b>{o.id}</b> {o.nom}<br /><small className="muted">{o.kind === 'recogida' ? 'recogida' : o.tipo} · {n(o.kg)} kg · {o.svc} min</small></td>
                  <td>{hhmm(o.win[0])}–{hhmm(o.win[1])}</td>
                  <td>
                    {o.status === 'pendiente'
                      ? <><b className={o.lateEta > 0.5 ? 'bad-t' : ''}>{o.eta != null ? hhmm(o.eta) : '—'}</b><br /><small className="muted">{o.lateEta > 0.5 ? `+${Math.round(o.lateEta)} min tarde` : 'prevista'}</small></>
                      : <><b className={o.status === 'tarde' ? 'bad-t' : 'ok-t'}>{hhmm(o.doneAt - o.svc)}</b><br /><small className="muted">{o.status === 'tarde' ? `+${o.late} min` : 'hecha'}</small></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Último mensaje LoRaWAN</h3>
          {sel.uplink ? (
            <div className="fl-lora">
              <div className="fl-kv">
                <span>DevEUI</span><b>{sel.devEui}</b>
                <span>Contador</span><b>f_cnt {sel.fCnt}</b>
                <span>Pasarela</span><b>{sel.gw.id} · {n(sel.gw.km, 1)} km</b>
                <span>Radio</span><b>RSSI {sel.gw.rssi} dBm · SNR {String(sel.gw.snr).replace('.', ',')} dB · SF{sel.gw.sf}</b>
                <span>Payload</span><b className="mono">{toHex(sel.bytes)}</b>
                <span>Base64</span><b className="mono">{sel.uplink.uplink_message.frm_payload}</b>
                <span>Batería</span><b>{sel.battery} %</b>
              </div>
              <pre className="fl-json">{JSON.stringify(sel.uplink.uplink_message.decoded_payload, null, 1)}</pre>
            </div>
          ) : <div className="calm">Todavía en la base: empieza a enviar al salir.</div>}
        </div>
      )}
      {!sel && <p className="muted small">Pulsa un camión para ver sus paradas y su último mensaje LoRaWAN.</p>}

      <h3>Radio LoRaWAN</h3>
      <p className="muted small">Cada camión manda 13 bytes (posición, velocidad, rumbo, carga, estado y batería) cada 2 min. En el aire dura {String(v.radio.toa7).replace('.', ',')} ms con SF7 y {String(v.radio.toa).replace('.', ',')} ms con SF9: con el 1 % de ciclo de trabajo de la banda de 868 MHz podría enviar cada {v.radio.minS} s, así que va sobrado. Las pasarelas reciben el mensaje y The Things Stack lo decodifica con el decodificador del rastreador.</p>

      <h3>Registro</h3>
      <div className="fl-log">
        {v.events.map((e) => <div key={e.id} className={`fl-ev ${e.kind}`}><small>{hhmm(e.t)}</small> {e.txt}</div>)}
      </div>

      <p className="note">Real: distancias y tiempos por carretera entre la base y los clientes (OSRM sobre OpenStreetMap), trazado de las rutas, tráfico de los sensores del gemelo y balizas V16 de la DGT. Simulado: la empresa, los camiones, los pedidos y su horario, y los mensajes LoRaWAN (con el formato real de un uplink de The Things Stack). Planificación: inserción más barata con capacidad y ventanas horarias, mejorada con reubicación entre camiones y 2-opt ({v.ms} ms en el navegador).</p>
    </div>
  )
}
