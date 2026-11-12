import React from 'react'
import { GRUPS, GRUP, grupDe, clauDe } from './urbanisme.js'

const n = (x, d = 0) => Number(x || 0).toLocaleString('es-ES', { maximumFractionDigits: d })
const ha = (m2) => `${n(m2 / 10000)} ha`

// Panel de urbanismo: leyenda/filtros de la calificación del suelo, reparto de la ciudad
// y ficha de la parcela seleccionada (Catastro + MUC), al estilo de los mapas de zonificación.
export default function UrbanismePanel({ urb, enabled, onEnable, onFocus }) {
  if (!urb) return null
  const s = urb.sel
  const z = s?.zona
  const g = z ? GRUP[grupDe(z.q)] : null
  const c = z ? clauDe(z.d) : null
  const f = s?.fitxa

  return (
    <div className="panel-body urb">
      <h2>Urbanismo</h2>
      <p className="muted">Qué se puede construir en cada manzana de Barcelona y qué hay construido. Haz clic en un edificio del mapa para ver su ficha.</p>

      {!enabled && (
        <div className="res-mode">La capa de urbanismo está apagada. <button className="btn primary" onClick={onEnable}>Mostrar en el mapa</button></div>
      )}
      {urb.err && <p className="err">{urb.err}</p>}

      {s && (
        <div className="urb-fitxa">
          <div className="urb-fitxa-h">
            <div>
              <b>{f?.adreca || (s.estat === 'carregant' ? 'Consultando el Catastro…' : 'Parcela')}</b>
              {f && <small className="muted"> · ref. catastral {f.rc}</small>}
            </div>
            <button className="sheet-x2" onClick={urb.tanca} aria-label="Cerrar ficha">✕</button>
          </div>

          {z ? (
            <div className="urb-zona" style={{ borderColor: g.color }}>
              <div><i className="dotf" style={{ background: g.color }} /><b>{z.d || g.nom}</b>{c.clau && <span className="urb-clau">clave {c.clau}</span>}</div>
              {c.que && <p>{c.que}</p>}
              <small className="muted">{g.nom} · {ha(z.m2)} en este ámbito</small>
            </div>
          ) : (
            <p className="muted small">Sin calificación en este punto (activa más grupos o acerca el mapa).</p>
          )}

          {s.estat === 'carregant' && <p className="muted small">Buscando la parcela en el Catastro…</p>}
          {s.estat === 'buit' && <p className="muted small">El Catastro no tiene ninguna parcela a menos de 50 m de este punto (seguramente es calle o parque).</p>}
          {s.estat === 'error' && <p className="err small">No se pudo consultar el Catastro ({s.error}).</p>}

          {f && (
            <>
              <div className="res-kpis urb-kpis">
                <div><b>{f.any || '—'}</b><small>año de construcción</small></div>
                <div><b>{f.plantes ? `${f.plantes}${f.soterranis ? ` + ${f.soterranis}` : ''}` : '—'}</b><small>plantas{f.soterranis ? ' (+ sótanos)' : ''}</small></div>
                <div className="urb-us"><b>{f.us || '—'}</b><small>uso principal</small></div>
                <div><b>{n(f.sup)} m²</b><small>construidos</small></div>
                <div><b>{f.sol ? `${n(f.sol)} m²` : '—'}</b><small>solar</small></div>
                <div><b>{f.edificabilitat != null ? n(f.edificabilitat, 2) : '—'}</b><small>m² techo / m² suelo</small></div>
              </div>
              <table className="board urb-t">
                <tbody>
                  <tr><td>Tipo</td><td>{f.tipus}</td></tr>
                  {f.inmobles != null && <tr><td>Inmuebles</td><td>{n(f.inmobles)}{f.habitatges ? ` · ${n(f.habitatges)} viviendas` : ''}</td></tr>}
                  {f.inmobles == null && f.habitatges > 0 && <tr><td>Viviendas</td><td>{n(f.habitatges)}</td></tr>}
                  {f.usos?.length > 0 && <tr><td>Superficie por uso</td><td>{f.usos.map(([u, m]) => `${u.toLowerCase()} ${n(m)} m²`).join(' · ')}</td></tr>}
                  {f.usosN?.length > 0 && <tr><td>Inmuebles por uso</td><td>{f.usosN.map(([u, k]) => `${u.toLowerCase()} ${n(k)}`).join(' · ')}</td></tr>}
                  {s.alturaOsm != null && <tr><td>Altura del volumen 3D</td><td>{n(s.alturaOsm)} m (OpenStreetMap)</td></tr>}
                  {f.dist > 1 && <tr><td>Parcela más cercana</td><td>a {n(f.dist)} m del clic</td></tr>}
                </tbody>
              </table>
              {f.inmobles != null && <p className="muted small">Edificio dividido en pisos: la superficie es la suma de los inmuebles y el Catastro no da la del solar en esta consulta.</p>}
              <div className="urb-actions">
                <a className="btn" href={f.link} target="_blank" rel="noopener">Ver en la Sede del Catastro</a>
                <button className="btn" onClick={() => onFocus({ lon: s.lon, lat: s.lat, zoom: 17.5 })}>Centrar</button>
              </div>
            </>
          )}
        </div>
      )}

      <h3>Calificación del suelo</h3>
      <div className="urb-legend">
        {GRUPS.map((x) => {
          const r = urb.resum?.perGrup.find((p) => p.k === x.k)
          return (
            <button key={x.k} className={`urb-lg ${urb.on[x.k] ? 'on' : ''}`} onClick={() => urb.toggle(x.k)} title={urb.on[x.k] ? 'Ocultar' : 'Mostrar'}>
              <i style={{ background: x.color }} />
              <span>{x.nom}</span>
              {r && <small>{n(r.pct, 1)} %</small>}
            </button>
          )
        })}
      </div>
      {urb.resum && <p className="muted small">Porcentaje de la superficie calificada de la ciudad ({ha(urb.resum.total)}, {n(urb.geo.features.length)} ámbitos). Pulsa un grupo para mostrarlo u ocultarlo.</p>}
      {enabled && !urb.geo && !urb.err && <p className="muted small">Cargando la calificación urbanística…</p>}

      <p className="note">Real: calificación urbanística de cada ámbito (Mapa Urbanístic de Catalunya, Generalitat, enero 2023) y datos de cada parcela (Dirección General del Catastro, consulta en directo). Los límites de parcela se dibujan desde el servicio de mapas del Catastro con zoom alto. La clave del PGM y su explicación son orientativas: la normativa exacta de cada solar está en el planeamiento vigente.</p>
    </div>
  )
}
