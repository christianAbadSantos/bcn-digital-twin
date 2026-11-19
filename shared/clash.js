// Detección de colisiones entre modelos de distintas disciplinas (arquitectura × instalaciones).
// Primer filtro clásico: intersección de cajas envolventes (AABB) con tolerancia. Para elementos
// alineados con los ejes (como los del modelo de ejemplo) es exacto; en modelos reales sirve de criba
// antes de comprobar las mallas. Cada colisión lleva los GlobalId de los dos elementos para pasarla a BCF.

const VOL = (a) => Math.max(0, a[1][0] - a[0][0]) * Math.max(0, a[1][1] - a[0][1]) * Math.max(0, a[1][2] - a[0][2])

// solape de dos cajas [[min],[max]] → caja de la intersección (o null si solo se tocan)
export function overlap(a, b, tol = 0.01) {
  const lo = [0, 1, 2].map((k) => Math.max(a[0][k], b[0][k]))
  const hi = [0, 1, 2].map((k) => Math.min(a[1][k], b[1][k]))
  return [0, 1, 2].every((k) => hi[k] - lo[k] > tol) ? [lo, hi] : null
}

// elementos: [{ guid, file, clase, nombre, tag, bbox: [[min],[max]] }]
// Solo se cruzan elementos de modelos distintos; los espacios (IfcSpace) no cuentan.
export function detectClashes(elementos, { tol = 0.01 } = {}) {
  const els = elementos.filter((e) => e.bbox && !/IFCSPACE/i.test(e.clase))
  const out = []
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j]
      if (a.file === b.file) continue
      const o = overlap(a.bbox, b.bbox, tol)
      if (!o) continue
      const v = VOL(o)
      const centro = [0, 1, 2].map((k) => Math.round(((o[0][k] + o[1][k]) / 2) * 100) / 100)
      out.push({ a, b, volumen: v, centro, gravedad: v > 0.05 ? 'Alta' : v > 0.005 ? 'Media' : 'Baja' })
    }
  }
  out.sort((x, y) => y.volumen - x.volumen)
  return out.map((c, i) => ({
    id: `COL-${String(i + 1).padStart(3, '0')}`,
    guidA: c.a.guid, guidB: c.b.guid,
    a: { tag: c.a.tag, nombre: c.a.descripcion || c.a.nombre, clase: c.a.clase, file: c.a.file },
    b: { tag: c.b.tag, nombre: c.b.descripcion || c.b.nombre, clase: c.b.clase, file: c.b.file },
    volumen: Math.round(c.volumen * 1000) / 1000, centro: c.centro, gravedad: c.gravedad,
  }))
}
