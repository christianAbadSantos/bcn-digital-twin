// Flota de camiones en el gemelo: planificador de rutas (reparto con capacidad y ventanas horarias,
// "CVRPTW") y simulación del día de reparto con seguimiento en vivo.
// Funciones puras (sin navegador): se prueban con Vitest.
//
//   1. Pedidos del día     → ordersForDay()
//   2. Plan optimizado     → planRoutes()   inserción más barata + reubicación entre camiones + 2-opt
//      Plan de referencia  → naivePlan()    por orden de llegada de los pedidos (lo que se haría a mano)
//   3. Día en marcha       → initFleet() + stepTruck() cada segundo, etas() para las horas previstas
//   4. Imprevistos         → resequence() (reordenar lo pendiente) e insertUrgent() (recogida urgente)

const rad = (d) => (d * Math.PI) / 180
export function distM(a, b) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0])
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(x))
}

export const TRUCK_FACTOR = 1.15 // camión rígido: ~15 % más lento que el perfil de coche de OSRM
export const ROAD_FACTOR = 1.35 // km por carretera / km en línea recta (para puntos fuera de la matriz)
export const FALLBACK_KMH = 26
export const CO2_KG_KM = 0.82 // camión rígido diésel de 12 t, kg de CO2 por km (aprox.)
export const DAY_START = 6 * 60 + 45 // primera salida de la base, 06:45
const LATE_W = 5 // penalización por minuto de retraso sobre la ventana horaria (en "km equivalentes")
const WAIT_W = 0.02

export const hhmm = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// ---- coste entre dos puntos: matriz real de OSRM si ambos están en ella, si no, estimación
export function makeCost(data) {
  const idx = new Map(data.ids.map((id, i) => [id, i]))
  const key = (n) => n.site ?? n.id
  return (a, b) => {
    const i = idx.get(key(a)), j = idx.get(key(b))
    if (i != null && j != null && !a.free && !b.free) return { km: data.km[i][j], min: data.min[i][j] * TRUCK_FACTOR }
    const km = (distM([a.lon, a.lat], [b.lon, b.lat]) / 1000) * ROAD_FACTOR
    return { km, min: (km / FALLBACK_KMH) * 60 }
  }
}

// ---- pedidos del día (deterministas por fecha: el mismo día salen los mismos)
const PROFILE = {
  tienda: { kg: [180, 600], win: [450, 660] },
  restaurante: { kg: [150, 420], win: [480, 690] },
  farmacia: { kg: [80, 220], win: [480, 720] },
  cafetería: { kg: [100, 260], win: [450, 630] },
  supermercado: { kg: [600, 1400], win: [420, 780] },
  'centro comercial': { kg: [900, 1800], win: [420, 630] },
  almacén: { kg: [800, 2200], win: [480, 1020] },
  mayorista: { kg: [1200, 2400], win: [420, 900] },
}
const rnd = (seed) => {
  let h = 2166136261
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296 // en [0, 1)
}
export const svcMin = (kg) => Math.round(Math.min(30, 8 + kg / 110))
export function ordersForDay(sites, dayKey, n = 22) {
  const pick = [...sites].map((s) => ({ s, r: rnd(dayKey + s.id) })).sort((a, b) => a.r - b.r).slice(0, n).map((x) => x.s)
  // orden de llegada de los pedidos (el día anterior, por la tarde)
  return pick
    .map((s, i) => {
      const p = PROFILE[s.tipo] || PROFILE.tienda
      const r = rnd(dayKey + s.id + 'kg')
      const kg = Math.round((p.kg[0] + (p.kg[1] - p.kg[0]) * r) / 10) * 10
      return { id: `P-${String(i + 1).padStart(2, '0')}`, site: s.id, nom: s.nom, tipo: s.tipo, lon: s.lon, lat: s.lat, kg, win: [...p.win], svc: svcMin(kg), kind: 'entrega', recibido: rnd(dayKey + s.id + 't') }
    })
    .sort((a, b) => a.recibido - b.recibido)
    .map((o, i) => ({ ...o, id: `P-${String(i + 1).padStart(2, '0')}` }))
}

// ---- horario de una ruta: llegada, espera, retraso y vuelta a la base
export function schedule(stops, cost, depot, startMin, from = depot) {
  let t = startMin, cur = from, km = 0, late = 0, wait = 0, kg = 0
  const legs = []
  for (const o of stops) {
    const c = cost(cur, o)
    km += c.km
    t += c.min
    const start = Math.max(t, o.win[0])
    const l = Math.max(0, start - o.win[1])
    legs.push({ id: o.id, arrive: t, start, end: start + o.svc, late: l, wait: start - t })
    wait += start - t
    late += l
    t = start + o.svc
    kg += o.kg
    cur = o
  }
  const back = cost(cur, depot)
  return { legs, km: km + back.km, end: t + back.min, late, wait, kg }
}
const objective = (s) => s.km + LATE_W * s.late + WAIT_W * s.wait
const loadOf = (stops) => stops.reduce((s, o) => s + o.kg, 0)

// 2-opt dentro de una ruta (con ventanas horarias, evaluando el horario completo)
function twoOpt(stops, evalFn) {
  let best = stops, bestV = evalFn(stops), improved = true
  for (let pass = 0; improved && pass < 25; pass++) {
    improved = false
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)]
        const v = evalFn(cand)
        if (v + 1e-6 < bestV) { best = cand; bestV = v; improved = true }
      }
    }
  }
  return best
}

// ---- plan optimizado: inserción más barata (pedidos con ventana más temprana primero),
// después reubicación de pedidos entre camiones y 2-opt dentro de cada ruta, hasta que no mejora
export function planRoutes(orders, trucks, cost, depot) {
  const routes = trucks.map((t, i) => ({ truck: t.id, cap: t.cap, start: DAY_START + i * 5, stops: [] }))
  const val = (r, stops = r.stops) => objective(schedule(stops, cost, depot, r.start))
  const unassigned = []
  const sorted = [...orders].sort((a, b) => a.win[1] - b.win[1] || b.kg - a.kg)
  for (const o of sorted) {
    let best = null
    for (const r of routes) {
      if (loadOf(r.stops) + o.kg > r.cap) continue
      const base = val(r)
      for (let p = 0; p <= r.stops.length; p++) {
        const cand = [...r.stops.slice(0, p), o, ...r.stops.slice(p)]
        const d = val(r, cand) - base
        if (!best || d < best.d) best = { r, cand, d }
      }
    }
    if (best) best.r.stops = best.cand
    else unassigned.push(o)
  }
  // mejora: mover cada pedido a la mejor posición de cualquier camión
  for (let round = 0; round < 30; round++) {
    let moved = false
    for (const from of routes) {
      for (const o of [...from.stops]) {
        const rest = from.stops.filter((x) => x !== o)
        const gainFrom = val(from) - val(from, rest)
        let best = null
        for (const to of routes) {
          const toBase = to === from ? rest : to.stops
          if (to !== from && loadOf(to.stops) + o.kg > to.cap) continue
          const base = to === from ? val(from, rest) : val(to)
          for (let p = 0; p <= toBase.length; p++) {
            const cand = [...toBase.slice(0, p), o, ...toBase.slice(p)]
            const d = val(to, cand) - base
            if (!best || d < best.d) best = { to, cand, d }
          }
        }
        if (best && best.d + 1e-6 < gainFrom && !(best.to === from && best.cand.every((x, i) => x === from.stops[i]))) {
          if (best.to !== from) from.stops = rest
          best.to.stops = best.cand
          moved = true
        }
      }
    }
    for (const r of routes) r.stops = twoOpt(r.stops, (s) => val(r, s))
    if (!moved) break
  }
  return summarize(routes, cost, depot, unassigned)
}

// ---- plan de referencia: por orden de llegada, llenando un camión tras otro
export function naivePlan(orders, trucks, cost, depot) {
  const routes = trucks.map((t, i) => ({ truck: t.id, cap: t.cap, start: DAY_START + i * 5, stops: [] }))
  const unassigned = []
  let k = 0
  for (const o of orders) {
    while (k < routes.length && loadOf(routes[k].stops) + o.kg > routes[k].cap) k++
    if (k < routes.length) routes[k].stops.push(o)
    else unassigned.push(o)
  }
  return summarize(routes, cost, depot, unassigned)
}

function summarize(routes, cost, depot, unassigned) {
  const out = routes.map((r) => ({ ...r, ...schedule(r.stops, cost, depot, r.start) }))
  const used = out.filter((r) => r.stops.length)
  return {
    routes: out,
    km: Math.round(used.reduce((s, r) => s + r.km, 0) * 10) / 10,
    lateMin: Math.round(used.reduce((s, r) => s + r.late, 0)),
    lateStops: used.reduce((s, r) => s + r.legs.filter((l) => l.late > 0.5).length, 0),
    hours: Math.round((used.reduce((s, r) => s + (r.end - r.start), 0) / 60) * 10) / 10,
    trucksUsed: used.length,
    unassigned,
  }
}

// ---- simulación del día
// geometría de un tramo: coordenadas y distancia acumulada para colocar el camión a lo largo de la calle
export function makeLeg(coords, durMin, km) {
  const cum = [0]
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distM(coords[i - 1], coords[i]))
  return { coords, cum, len: cum[cum.length - 1] || 1, dur: Math.max(0.5, durMin), km: km ?? cum[cum.length - 1] / 1000 }
}
export function along(leg, f) {
  const d = Math.max(0, Math.min(1, f)) * leg.len
  let lo = 0, hi = leg.cum.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (leg.cum[m] <= d) lo = m; else hi = m }
  const a = leg.coords[lo], b = leg.coords[hi] || a
  const s = leg.cum[hi] - leg.cum[lo] || 1
  const t = (d - leg.cum[lo]) / s
  const heading = (Math.atan2((b[0] - a[0]) * Math.cos(rad(a[1])), b[1] - a[1]) * 180) / Math.PI
  return { pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: (heading + 360) % 360, idx: lo }
}
// tramo recto (mientras llega la geometría real de OSRM o si no hay conexión)
export const straightLeg = (a, b, cost) => {
  const c = cost(a, b)
  return { ...makeLeg([[a.lon, a.lat], [b.lon, b.lat]], c.min, c.km), straight: true }
}

export function initFleet(plan, trucks, depot) {
  return plan.routes.map((r, i) => {
    const t = trucks.find((x) => x.id === r.truck)
    return {
      id: r.truck, cap: r.cap, color: t.color, devEui: t.devEui, depart: r.start,
      stops: r.stops.map((o) => ({ ...o, status: 'pendiente' })),
      k: 0, phase: r.stops.length ? 'base' : 'fin', legT: 0, leg: null, until: 0, slow: 1,
      pos: [depot.lon, depot.lat], heading: 0, kmDone: 0, load: loadOf(r.stops.filter((o) => o.kind !== 'recogida')),
      battery: 96 - i * 3, fCnt: Math.floor(rnd(r.truck) * 900), lastUp: -1e9, v16seen: [], delayMin: 0,
    }
  })
}

const pointOf = (tr, depot) => (tr.k < tr.stops.length ? tr.stops[tr.k] : depot)

// avanza un camión dt minutos de simulación. getLeg(tr, k) devuelve el tramo hacia la parada k (o la base)
export function stepTruck(tr, now, dt, depot, getLeg) {
  let left = dt
  for (let guard = 0; left > 1e-9 && guard < 50; guard++) {
    const t = now - left
    if (tr.phase === 'fin') return
    if (tr.phase === 'base') {
      if (t + left < tr.depart) return
      left -= Math.max(0, tr.depart - t)
      tr.phase = 'ruta'
      tr.legT = 0
      tr.leg = getLeg(tr, tr.k)
      continue
    }
    if (tr.phase === 'ruta' || tr.phase === 'vuelta') {
      if (!tr.leg) tr.leg = getLeg(tr, tr.k)
      const need = (tr.leg.dur - tr.legT) * tr.slow
      const use = Math.min(left, need)
      tr.legT += use / tr.slow
      left -= use
      const p = along(tr.leg, tr.legT / tr.leg.dur)
      tr.pos = p.pos
      tr.heading = p.heading
      tr.legIdx = p.idx
      if (tr.legT >= tr.leg.dur - 1e-9) {
        tr.kmDone += tr.leg.km
        if (tr.phase === 'vuelta') {
          Object.assign(tr, { phase: 'fin', pos: [depot.lon, depot.lat], leg: null, endedAt: now - left })
          return
        }
        const s = tr.stops[tr.k]
        const at = now - left
        s.arrivedAt = at
        tr.pos = [s.lon, s.lat]
        tr.leg = null
        if (at < s.win[0]) Object.assign(tr, { phase: 'espera', until: s.win[0] })
        else Object.assign(tr, { phase: 'descarga', until: at + s.svc })
      }
      continue
    }
    if (tr.phase === 'espera' || tr.phase === 'descarga') {
      const need = tr.until - t
      if (left < need) return
      left -= Math.max(0, need)
      const s = tr.stops[tr.k]
      if (tr.phase === 'espera') {
        Object.assign(tr, { phase: 'descarga', until: tr.until + s.svc })
        continue
      }
      s.doneAt = tr.until
      const startedAt = tr.until - s.svc
      s.late = Math.max(0, Math.round(startedAt - s.win[1]))
      s.status = s.late > 0 ? 'tarde' : 'entregado'
      tr.load += s.kind === 'recogida' ? s.kg : -s.kg
      tr.k++
      tr.legT = 0
      tr.leg = getLeg(tr, tr.k)
      tr.phase = tr.k < tr.stops.length ? 'ruta' : 'vuelta'
      continue
    }
    return
  }
}

// horas previstas de llegada a lo que queda, con el factor de lentitud actual y los retrasos conocidos
export function etas(tr, now, cost, depot) {
  if (tr.phase === 'fin') return { stops: [], back: tr.endedAt ?? now }
  let t = now, cur
  const out = []
  let k = tr.k
  if (tr.phase === 'base') { t = Math.max(now, tr.depart); cur = depot }
  else if (tr.phase === 'ruta' || tr.phase === 'vuelta') {
    const leg = tr.leg
    t = now + (leg ? (leg.dur - tr.legT) * tr.slow : 0)
    if (tr.phase === 'vuelta') return { stops: [], back: t }
  } else {
    t = tr.until + (tr.phase === 'espera' ? tr.stops[k].svc : 0)
    out.push({ id: tr.stops[k].id, eta: tr.stops[k].arrivedAt, late: Math.max(0, Math.max(tr.stops[k].arrivedAt, tr.stops[k].win[0]) - tr.stops[k].win[1]) })
    cur = tr.stops[k]
    k++
  }
  if (tr.phase === 'ruta') {
    const s = tr.stops[k]
    const start = Math.max(t, s.win[0])
    out.push({ id: s.id, eta: t, late: Math.max(0, start - s.win[1]) })
    t = start + s.svc
    cur = s
    k++
  }
  for (; k < tr.stops.length; k++) {
    const s = tr.stops[k]
    t += cost(cur, s).min * tr.slow
    const start = Math.max(t, s.win[0])
    out.push({ id: s.id, eta: t, late: Math.max(0, start - s.win[1]) })
    t = start + s.svc
    cur = s
  }
  return { stops: out, back: t + cost(cur || depot, depot).min * tr.slow }
}

// índice desde el que la ruta todavía se puede cambiar (la parada a la que va o en la que está queda fija)
const firstFree = (tr) => (tr.phase === 'base' ? 0 : tr.phase === 'fin' ? tr.stops.length : tr.phase === 'vuelta' ? tr.stops.length : tr.k + 1)
// punto y hora desde los que se replanifica
function anchor(tr, now, cost, depot) {
  const i = firstFree(tr)
  if (tr.phase === 'base') return { i, node: depot, t: Math.max(now, tr.depart) }
  if (tr.phase === 'vuelta' || tr.phase === 'fin') return { i, node: { id: 'gps', free: true, lon: tr.pos[0], lat: tr.pos[1] }, t: now }
  const e = etas(tr, now, cost, depot).stops[0]
  const s = tr.stops[tr.k]
  return { i, node: s, t: Math.max(e?.eta ?? now, s.win[0]) + s.svc }
}

// reordena lo que le queda a un camión (p. ej. tras un atasco). Devuelve true si ha cambiado el orden
export function resequence(tr, now, cost, depot) {
  const a = anchor(tr, now, cost, depot)
  const rest = tr.stops.slice(a.i)
  if (rest.length < 2) return false
  const evalFn = (s) => objective(schedule(s, (x, y) => ({ ...cost(x, y), min: cost(x, y).min * tr.slow }), depot, a.t, a.node))
  const best = twoOpt(rest, evalFn)
  if (best.every((x, i) => x === rest[i])) return false
  tr.stops = [...tr.stops.slice(0, a.i), ...best]
  return true
}

// recogida urgente: se mete en el camión y la posición que menos coste añaden (con capacidad libre)
export function insertUrgent(fleet, order, now, cost, depot) {
  let best = null
  for (const tr of fleet) {
    if (tr.load + order.kg > tr.cap) continue
    const a = anchor(tr, now, cost, depot)
    const rest = tr.stops.slice(a.i)
    const c = (x, y) => ({ ...cost(x, y), min: cost(x, y).min * tr.slow })
    const base = objective(schedule(rest, c, depot, a.t, a.node))
    for (let p = 0; p <= rest.length; p++) {
      const cand = [...rest.slice(0, p), order, ...rest.slice(p)]
      const d = objective(schedule(cand, c, depot, a.t, a.node)) - base
      if (!best || d < best.d) best = { tr, i: a.i + p, d }
    }
  }
  if (!best) return null
  const tr = best.tr
  tr.stops.splice(best.i, 0, { ...order, status: 'pendiente' })
  // si volvía a la base (o ya había acabado) sale de nuevo hacia la recogida
  if (tr.phase === 'vuelta' || tr.phase === 'fin') Object.assign(tr, { phase: 'ruta', k: best.i, legT: 0, leg: null, fromGps: true })
  return { truck: tr.id, addKm: Math.round(best.d * 10) / 10 }
}

export { pointOf, firstFree }
