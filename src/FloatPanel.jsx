import React, { useEffect, useRef, useState } from 'react'

// Panel flotante sobre el mapa: se arrastra por la cabecera, se redimensiona por la esquina,
// se minimiza, se amplía y se cierra. Recuerda su posición y tamaño en este navegador.
// En el móvil (≤ 760 px) no flota: se apila abajo a todo el ancho.
const load = (id) => { try { return JSON.parse(localStorage.getItem(`fp:${id}`) || 'null') } catch { return null } }
const save = (id, v) => { try { localStorage.setItem(`fp:${id}`, JSON.stringify(v)) } catch { /* sin almacenamiento */ } }

export default function FloatPanel({ id, title, sub, def, z = 1, onFocus, onClose, children, actions }) {
  const [box, setBox] = useState(() => ({ ...def, ...(load(id) || {}) }))
  const [min, setMin] = useState(false)
  const [max, setMax] = useState(false)
  const el = useRef(null)
  const drag = useRef(null)

  useEffect(() => save(id, box), [id, box])

  // si no cabe en el mapa (por ejemplo, al abrirlo en una pantalla más estrecha), se recoloca dentro
  useEffect(() => {
    const pw = el.current?.offsetParent?.clientWidth
    if (!pw || pw <= 760) return
    setBox((b) => (b.x + b.w > pw - 184 ? { ...b, x: Math.max(8, pw - 184 - b.w), w: Math.min(b.w, pw - 200) } : b))
  }, [])

  // guardar el tamaño cuando se redimensiona con el tirador nativo
  useEffect(() => {
    const n = el.current
    if (!n || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (min || max || drag.current) return
      const w = Math.round(n.offsetWidth), h = Math.round(n.offsetHeight)
      setBox((b) => (Math.abs(b.w - w) > 2 || Math.abs((b.h || 0) - h) > 2 ? { ...b, w, h } : b))
    })
    ro.observe(n)
    return () => ro.disconnect()
  }, [min, max])

  const down = (e) => {
    if (e.button !== 0 || e.target.closest('button') || max) return
    onFocus?.()
    const parent = el.current.offsetParent?.getBoundingClientRect()
    drag.current = { sx: e.clientX, sy: e.clientY, x: box.x, y: box.y, pw: parent?.width || innerWidth, ph: parent?.height || innerHeight }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    const w = el.current.offsetWidth
    setBox((b) => ({ ...b, x: Math.max(-w + 80, Math.min(d.pw - 80, d.x + e.clientX - d.sx)), y: Math.max(0, Math.min(d.ph - 36, d.y + e.clientY - d.sy)) }))
  }
  const up = () => { drag.current = null }

  const style = max ? { zIndex: 40 + z } : { left: box.x, top: box.y, width: box.w, height: min ? 'auto' : box.h, zIndex: 10 + z }
  return (
    <section ref={el} className={`fpanel ${min ? 'min' : ''} ${max ? 'max' : ''}`} style={style} onPointerDown={onFocus} aria-label={title}>
      <header className="fp-h" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={() => setMax((m) => !m)}>
        <span className="fp-t">{title}{sub && <small>{sub}</small>}</span>
        <span className="fp-b">
          {actions}
          <button type="button" onClick={() => setMax((m) => !m)} title={max ? 'Restaurar' : 'Ampliar'} aria-label={max ? 'Restaurar' : 'Ampliar'}>{max ? '⤡' : '⤢'}</button>
          <button type="button" onClick={() => setMin((m) => !m)} title={min ? 'Desplegar' : 'Minimizar'} aria-label={min ? 'Desplegar' : 'Minimizar'}>{min ? '▢' : '–'}</button>
          {onClose && <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar">✕</button>}
        </span>
      </header>
      {!min && <div className="fp-body">{children}</div>}
    </section>
  )
}
