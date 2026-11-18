import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { DAY_START, etas, initFleet, insertUrgent, makeCost, naivePlan, ordersForDay, planRoutes, resequence, schedule, stepTruck, straightLeg } from '../shared/flota.js'
import { decodeUplink, encodeTracker, gatewayFor, minIntervalS, timeOnAirMs, toBase64, ttnUplink } from '../shared/lorawan.js'

const data = JSON.parse(fs.readFileSync(new URL('../public/data/flota.json', import.meta.url), 'utf8'))
const cost = makeCost(data)
const depot = data.depot
const TRUCKS = [1, 2, 3, 4, 5].map((i) => ({ id: `CAM-0${i}`, cap: 6000, color: '#000', devEui: `X${i}` }))
const orders = ordersForDay(data.sites, '2026-11-18')

// avanza el día entero en pasos de medio minuto
function runDay(fleet) {
  const getLeg = (tr, k) => straightLeg(k === 0 ? depot : tr.fromGps && k === tr.k ? { lon: tr.pos[0], lat: tr.pos[1], free: true } : tr.stops[k - 1], k < tr.stops.length ? tr.stops[k] : depot, cost)
  let now = DAY_START - 5
  for (let i = 0; i < 3000 && fleet.some((t) => t.phase !== 'fin'); i++) {
    now += 0.5
    for (const tr of fleet) stepTruck(tr, now, 0.5, depot, getLeg)
  }
  return now
}

describe('flota: datos', () => {
  it('la matriz es cuadrada y cubre la base y todos los clientes', () => {
    expect(data.ids.length).toBe(data.sites.length + 1)
    expect(data.km.length).toBe(data.ids.length)
    expect(data.km.every((r) => r.length === data.ids.length)).toBe(true)
    expect(data.km[0][0]).toBe(0)
  })
  it('los pedidos del día son deterministas y tienen ventana y kilos', () => {
    expect(ordersForDay(data.sites, '2026-11-18')).toEqual(orders)
    expect(ordersForDay(data.sites, '2026-11-19').map((o) => o.site)).not.toEqual(orders.map((o) => o.site))
    for (const o of orders) {
      expect(o.win[0]).toBeLessThan(o.win[1])
      expect(o.kg).toBeGreaterThanOrEqual(80) // el mínimo de cualquier tipo de cliente
    }
    // varios días seguidos: siempre dentro de los rangos
    for (let d = 1; d <= 28; d++) for (const o of ordersForDay(data.sites, `2026-02-${String(d).padStart(2, '0')}`)) expect(o.kg).toBeGreaterThanOrEqual(80)
  })
})

describe('flota: planificador', () => {
  const plan = planRoutes(orders, TRUCKS, cost, depot)
  const naive = naivePlan(orders, TRUCKS, cost, depot)

  it('asigna todos los pedidos una sola vez', () => {
    const ids = plan.routes.flatMap((r) => r.stops.map((o) => o.id)).sort()
    expect(ids).toEqual(orders.map((o) => o.id).sort())
    expect(plan.unassigned).toHaveLength(0)
  })
  it('respeta la capacidad de cada camión', () => {
    for (const r of plan.routes) expect(r.kg).toBeLessThanOrEqual(r.cap)
  })
  it('recorre menos km que repartir por orden de llegada y no llega tarde', () => {
    expect(plan.km).toBeLessThan(naive.km * 0.8)
    expect(plan.lateStops).toBe(0)
  })
  it('el horario espera si llega antes de que abra el cliente', () => {
    const o = { ...orders[0], win: [DAY_START + 300, DAY_START + 400] }
    const s = schedule([o], cost, depot, DAY_START)
    expect(s.legs[0].start).toBe(DAY_START + 300)
    expect(s.wait).toBeGreaterThan(0)
  })
})

describe('flota: simulación del día', () => {
  it('todos los camiones entregan todo y vuelven a la base', () => {
    const fleet = initFleet(planRoutes(orders, TRUCKS, cost, depot), TRUCKS, depot)
    runDay(fleet)
    for (const tr of fleet) {
      expect(tr.phase).toBe('fin')
      expect(tr.stops.every((s) => s.status !== 'pendiente')).toBe(true)
      expect(tr.load).toBeCloseTo(0, 6)
    }
    expect(fleet.flatMap((t) => t.stops).filter((s) => s.status === 'tarde')).toHaveLength(0)
  })
  it('las horas previstas avanzan y un atasco las retrasa', () => {
    const fleet = initFleet(planRoutes(orders, TRUCKS, cost, depot), TRUCKS, depot)
    const tr = fleet.find((t) => t.stops.length >= 3)
    const e1 = etas(tr, DAY_START - 5, cost, depot).stops
    for (let i = 1; i < e1.length; i++) expect(e1[i].eta).toBeGreaterThan(e1[i - 1].eta)
    tr.slow = 2
    const e2 = etas(tr, DAY_START - 5, cost, depot).stops
    expect(e2.at(-1).eta).toBeGreaterThan(e1.at(-1).eta)
  })
  it('una recogida urgente entra en un camión con sitio y se completa', () => {
    const fleet = initFleet(planRoutes(orders, TRUCKS, cost, depot), TRUCKS, depot)
    const site = data.sites.find((s) => !orders.some((o) => o.site === s.id))
    const r = insertUrgent(fleet, { id: 'U-01', site: site.id, nom: site.nom, lon: site.lon, lat: site.lat, kg: 300, win: [DAY_START, DAY_START + 600], svc: 10, kind: 'recogida' }, DAY_START, cost, depot)
    expect(r).not.toBeNull()
    runDay(fleet)
    const u = fleet.flatMap((t) => t.stops).find((s) => s.id === 'U-01')
    expect(u.status).not.toBe('pendiente')
  })
  it('reordenar lo pendiente no pierde paradas', () => {
    const fleet = initFleet(planRoutes(orders, TRUCKS, cost, depot), TRUCKS, depot)
    const tr = fleet.find((t) => t.stops.length >= 4)
    const before = tr.stops.map((s) => s.id).sort()
    tr.stops.reverse()
    resequence(tr, DAY_START - 5, cost, depot)
    expect(tr.stops.map((s) => s.id).sort()).toEqual(before)
  })
})

describe('LoRaWAN', () => {
  it('el payload de 13 bytes se codifica y decodifica igual', () => {
    const msg = { lat: 41.403581, lon: 2.187326, speedKmh: 47, heading: 271, loadPct: 63, estado: 'ruta', battery: 88 }
    const b = encodeTracker(msg)
    expect(b).toHaveLength(13)
    const d = decodeUplink({ bytes: b }).data
    expect(d.lat).toBeCloseTo(msg.lat, 5)
    expect(d.lon).toBeCloseTo(msg.lon, 5)
    expect(d).toMatchObject({ speed_kmh: 47, carga_pct: 63, estado: 'ruta', bateria_pct: 88 })
    expect(Math.abs(d.heading - 271)).toBeLessThanOrEqual(2)
  })
  it('coordenadas negativas (oeste/sur) también', () => {
    const d = decodeUplink({ bytes: encodeTracker({ lat: -33.45, lon: -70.66 }) }).data
    expect(d.lat).toBeCloseTo(-33.45, 5)
    expect(d.lon).toBeCloseTo(-70.66, 5)
  })
  it('tiempo en el aire según la fórmula de Semtech', () => {
    // 13 + 13 bytes, 125 kHz: SF7 → (12,25 + 48 símbolos) × 1,024 ms = 61,7 ms
    //                        SF12 → (12,25 + 38 símbolos) × 32,768 ms = 1646,6 ms (con optimización de baja velocidad)
    expect(timeOnAirMs(13, 7)).toBeCloseTo(61.7, 1)
    expect(timeOnAirMs(13, 12)).toBeCloseTo(1646.6, 1)
    expect(minIntervalS(13, 7)).toBeLessThan(120) // cada 2 min cumple el 1 % de ciclo de trabajo
  })
  it('el uplink tiene la forma de The Things Stack', () => {
    const bytes = encodeTracker({ lat: 41.39, lon: 2.16 })
    const u = ttnUplink({ deviceId: 'cam-01', devEui: 'ABC', fCnt: 5, bytes, gateway: gatewayFor([2.16, 41.39]) })
    expect(u.uplink_message.frm_payload).toBe(toBase64(bytes))
    expect(u.uplink_message.decoded_payload.lat).toBeCloseTo(41.39, 5)
    expect(u.uplink_message.rx_metadata[0].gateway_ids.gateway_id).toBe('bcn-gw-eixample')
  })
})
