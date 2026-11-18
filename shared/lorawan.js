// LoRaWAN en el gemelo (simulado, con el formato real): pasarelas, payload binario de un rastreador GPS,
// el "payload formatter" que usaría The Things Stack para decodificarlo y el tiempo en el aire (EU868).
// Funciones puras: se usan en el navegador y en los tests.

const R = 6371000
const rad = (d) => (d * Math.PI) / 180
const distM = (a, b) => {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0])
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

// pasarelas LoRaWAN simuladas repartidas por el área metropolitana
export const GATEWAYS = [
  { id: 'bcn-gw-eixample', lon: 2.1615, lat: 41.3915 },
  { id: 'bcn-gw-poblenou', lon: 2.1985, lat: 41.4035 },
  { id: 'bcn-gw-sants', lon: 2.1375, lat: 41.3765 },
  { id: 'bcn-gw-noubarris', lon: 2.1765, lat: 41.4385 },
  { id: 'bdn-gw-centre', lon: 2.2445, lat: 41.4475 },
  { id: 'prat-gw-aeroport', lon: 2.0785, lat: 41.2975 },
  { id: 'stc-gw-centre', lon: 2.0855, lat: 41.4735 },
  { id: 'lh-gw-granvia', lon: 2.1165, lat: 41.3595 },
  { id: 'bcn-gw-pedralbes', lon: 2.1135, lat: 41.3875 },
  { id: 'zal-gw-port', lon: 2.1455, lat: 41.3445 },
  { id: 'sboi-gw-llobregat', lon: 2.0415, lat: 41.3445 },
  { id: 'cdf-gw-castelldefels', lon: 1.9775, lat: 41.2815 },
  { id: 'rubi-gw-centre', lon: 2.0315, lat: 41.4925 },
  { id: 'mollet-gw-centre', lon: 2.2125, lat: 41.5395 },
  { id: 'cerd-gw-uab', lon: 2.1395, lat: 41.4905 },
]

// pasarela que mejor recibe un punto, con RSSI/SNR/SF estimados por distancia
export function gatewayFor(pos) {
  let best = null
  for (const g of GATEWAYS) {
    const d = distM(pos, [g.lon, g.lat])
    if (!best || d < best.d) best = { ...g, d }
  }
  const km = best.d / 1000
  return { id: best.id, lon: best.lon, lat: best.lat, km: Math.round(km * 10) / 10, rssi: Math.round(-70 - 22 * Math.log10(1 + km * 4)), snr: +(9 - km * 1.8).toFixed(1), sf: km < 1.5 ? 7 : km < 4 ? 8 : km < 7 ? 9 : 10 }
}

// ---- payload del rastreador del camión (13 bytes, big-endian)
//  0-3  latitud  × 1e6 (int32)      4-7  longitud × 1e6 (int32)
//  8    velocidad km/h (uint8)      9    rumbo / 2 (uint8, 0–179 → 0–358°)
//  10   carga % de la capacidad     11   estado (0 base, 1 en ruta, 2 descargando, 3 esperando, 4 volviendo, 5 fin)
//  12   batería % del rastreador
export const ESTADOS = ['base', 'ruta', 'descarga', 'espera', 'vuelta', 'fin']
export function encodeTracker({ lat, lon, speedKmh = 0, heading = 0, loadPct = 0, estado = 'ruta', battery = 100 }) {
  const b = new Uint8Array(13)
  const v = new DataView(b.buffer)
  v.setInt32(0, Math.round(lat * 1e6))
  v.setInt32(4, Math.round(lon * 1e6))
  b[8] = Math.max(0, Math.min(255, Math.round(speedKmh)))
  b[9] = Math.round((((heading % 360) + 360) % 360) / 2) % 180
  b[10] = Math.max(0, Math.min(100, Math.round(loadPct)))
  b[11] = Math.max(0, ESTADOS.indexOf(estado))
  b[12] = Math.max(0, Math.min(100, Math.round(battery)))
  return b
}

// "Uplink payload formatter" (JavaScript) tal como se pega en la consola de The Things Stack
export function decodeUplink({ bytes }) {
  if (!bytes || bytes.length < 13) return { errors: ['payload demasiado corto'] }
  const i32 = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) | 0
  return {
    data: {
      lat: i32(0) / 1e6,
      lon: i32(4) / 1e6,
      speed_kmh: bytes[8],
      heading: bytes[9] * 2,
      carga_pct: bytes[10],
      estado: ESTADOS[bytes[11]] || 'desconocido',
      bateria_pct: bytes[12],
    },
  }
}

export const toBase64 = (bytes) => {
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64')
}
export const toHex = (bytes) => [...bytes].map((x) => x.toString(16).padStart(2, '0')).join(' ').toUpperCase()

// tiempo en el aire de una trama LoRa (fórmula de Semtech, AN1200.13). EU868, 125 kHz, CR 4/5,
// cabecera explícita, CRC y preámbulo de 8. La carga física = payload de aplicación + 13 bytes de LoRaWAN.
export function timeOnAirMs(appBytes, sf, bw = 125000) {
  const pl = appBytes + 13
  const tSym = (2 ** sf / bw) * 1000
  const de = sf >= 11 && bw === 125000 ? 1 : 0
  const nPayload = 8 + Math.max(Math.ceil((8 * pl - 4 * sf + 28 + 16) / (4 * (sf - 2 * de))) * 5, 0)
  return (8 + 4.25) * tSym + nPayload * tSym
}
// intervalo mínimo entre mensajes para cumplir el 1 % de ciclo de trabajo de la banda g (868,1 MHz)
export const minIntervalS = (appBytes, sf) => (timeOnAirMs(appBytes, sf) / 1000) * 99

// uplink completo como lo entrega The Things Stack v3 (webhook / MQTT)
export function ttnUplink({ deviceId, devEui, fCnt, bytes, gateway, receivedAt = new Date() }) {
  return {
    end_device_ids: { device_id: deviceId, dev_eui: devEui, application_ids: { application_id: 'flota-camiones' } },
    received_at: receivedAt.toISOString(),
    uplink_message: {
      f_port: 1,
      f_cnt: fCnt,
      frm_payload: toBase64(bytes),
      decoded_payload: decodeUplink({ bytes }).data,
      rx_metadata: gateway ? [{ gateway_ids: { gateway_id: gateway.id }, rssi: gateway.rssi, snr: gateway.snr }] : [],
      settings: { data_rate: { lora: { spreading_factor: gateway?.sf || 9, bandwidth: 125000, coding_rate: '4/5' } }, frequency: '868100000' },
      consumed_airtime: `${(timeOnAirMs(bytes.length, gateway?.sf || 9) / 1000).toFixed(6)}s`,
    },
  }
}
