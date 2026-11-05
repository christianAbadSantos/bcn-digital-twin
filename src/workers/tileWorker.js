// Worker de teselas: descarga y procesa FUERA del hilo principal (importante en móviles).
// Por cada tesela z14 genera: malla de relieve (DEM), edificios OSM extruidos (con su altura real
// cuando OSM la tiene), una textura vectorial (calles, parques, agua) y, a demanda, la imagen aérea.
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import earcut from 'earcut'
import { x2lon, y2lat, sceneXZ, SCALE, fill, OSM_TILEJSON, DEM_SOURCES } from '../tileMath.js'

const EXT = 4096
let tilesTpl = null
const vecCache = new Map() // clave -> capas parseadas (LRU sencillo)

async function osmTemplate() {
  if (tilesTpl) return tilesTpl
  const j = await (await fetch(OSM_TILEJSON)).json()
  tilesTpl = j.tiles[0]
  return tilesTpl
}

async function fetchVector(z, x, y) {
  const key = `${z}/${x}/${y}`
  if (vecCache.has(key)) return vecCache.get(key)
  const r = await fetch(fill(await osmTemplate(), z, x, y))
  if (!r.ok) throw new Error(`OSM ${r.status}`)
  const vt = new VectorTile(new Pbf(await r.arrayBuffer()))
  const out = {}
  for (const name of ['building', 'transportation', 'water', 'park', 'landcover', 'landuse']) {
    const l = vt.layers[name]
    if (!l) continue
    const feats = []
    for (let i = 0; i < l.length; i++) {
      const f = l.feature(i)
      feats.push({ type: f.type, props: f.properties, geom: f.loadGeometry() })
    }
    out[name] = feats
  }
  vecCache.set(key, out)
  if (vecCache.size > 80) vecCache.delete(vecCache.keys().next().value)
  return out
}

async function decodePng(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status}`)
  const bmp = await createImageBitmap(await r.blob())
  const c = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  return ctx.getImageData(0, 0, c.width, c.height)
}

// Devuelve rejilla de alturas (m) 257×257 de la tesela, o null
async function fetchDem(z, x, y) {
  for (const src of [DEM_SOURCES.icgc, DEM_SOURCES.terrarium]) {
    try {
      const img = await decodePng(fill(src.url, z, x, y))
      const W = img.width
      const H = img.height
      const h = new Float32Array(W * H)
      const d = img.data
      for (let i = 0; i < W * H; i++) {
        const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2]
        h[i] = src.enc === 'mapbox' ? -10000 + (R * 65536 + G * 256 + B) * 0.1 : R * 256 + G + B / 256 - 32768
        if (!(h[i] > -50 && h[i] < 3000)) h[i] = 0 // sin dato (mar) o valores raros
        if (h[i] < 0) h[i] = 0 // el mar queda a cota 0
      }
      return { h, W, H, src: src.label }
    } catch {
      /* probar la siguiente fuente */
    }
  }
  return null
}

const sampler = (dem) => (u, v) => {
  if (!dem) return 0
  const { h, W, H } = dem
  const fx = Math.min(W - 1.001, Math.max(0, u * (W - 1)))
  const fy = Math.min(H - 1.001, Math.max(0, v * (H - 1)))
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const tx = fx - x0, ty = fy - y0
  const a = h[y0 * W + x0], b = h[y0 * W + x0 + 1], c = h[(y0 + 1) * W + x0], d = h[(y0 + 1) * W + x0 + 1]
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}

// ---- recorte de polígonos al cuadrado de la tesela (Sutherland–Hodgman)
function clipRing(ring) {
  const edges = [
    (p) => p.x >= 0, (p) => p.x <= EXT, (p) => p.y >= 0, (p) => p.y <= EXT,
  ]
  const cut = [
    (a, b) => ({ x: 0, y: a.y + ((b.y - a.y) * (0 - a.x)) / (b.x - a.x) }),
    (a, b) => ({ x: EXT, y: a.y + ((b.y - a.y) * (EXT - a.x)) / (b.x - a.x) }),
    (a, b) => ({ x: a.x + ((b.x - a.x) * (0 - a.y)) / (b.y - a.y), y: 0 }),
    (a, b) => ({ x: a.x + ((b.x - a.x) * (EXT - a.y)) / (b.y - a.y), y: EXT }),
  ]
  let pts = ring
  for (let k = 0; k < 4 && pts.length; k++) {
    const out = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      const ia = edges[k](a), ib = edges[k](b)
      if (ia) out.push(a)
      if (ia !== ib) out.push(cut[k](a, b))
    }
    pts = out
  }
  return pts
}

const signedArea = (r) => {
  let s = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j].x - r[i].x) * (r[i].y + r[j].y)
  return s
}

// anillos MVT -> polígonos [exterior, ...huecos]
function polygons(geom) {
  const polys = []
  let cur = null
  for (const ring of geom) {
    const r = ring.slice(0, ring.length - 1 > 2 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y ? -1 : undefined)
    const a = signedArea(r)
    if (a === 0) continue
    if (a > 0 || !cur) {
      cur = [r]
      polys.push(cur)
    } else cur.push(r)
  }
  return polys
}

const hash = (n) => {
  let x = (n + 1) * 2654435761
  x ^= x >>> 15
  x = Math.imul(x, 2246822519)
  x ^= x >>> 13
  return ((x >>> 0) % 1000) / 1000
}
const hex = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim())
  if (!m) return null
  const v = parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const NAMED = { white: [235, 232, 225], brick: [168, 92, 64], tan: [205, 180, 140], sandstone: [212, 190, 150], black: [60, 60, 62], blue: [90, 120, 160], green: [110, 140, 100], orange: [210, 130, 70], pink: [215, 160, 160], red: [170, 70, 55], brown: [130, 95, 70], grey: [150, 150, 150], gray: [150, 150, 150], beige: [215, 200, 170], yellow: [220, 200, 120] }
const STONE = [[201, 184, 160], [191, 174, 149], [214, 200, 176], [181, 165, 143], [205, 187, 165], [169, 154, 134], [210, 194, 168]]

// ---- edificios
function buildBuildings(feats, z, x, y, dem, exclude, minArea = 0) {
  const samp = sampler(dem)
  const pos = [], nor = [], cT = [], cR = [], idx = []
  let count = 0
  const toScene = (p) => {
    const u = p.x / EXT, v = p.y / EXT
    const lon = x2lon(x + u, z), lat = y2lat(y + v, z)
    const [sx, sz] = sceneXZ(lon, lat)
    return { sx, sz, g: samp(u, v), lon, lat }
  }
  for (let fi = 0; fi < feats.length; fi++) {
    const f = feats[fi]
    if (f.type !== 3 || f.props.hide_3d) continue
    const hgt = Number(f.props.render_height) || 8
    const minH = Number(f.props.render_min_height) || 0
    if (hgt <= minH) continue
    for (const poly of polygons(f.geom)) {
      const rings = poly.map(clipRing).filter((r) => r.length >= 3).map((r) => r.map(toScene))
      if (!rings.length) continue
      if (minArea) {
        // perfil bajo: se omiten las construcciones diminutas (casetas, quioscos…)
        let a = 0
        const r = rings[0]
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].sx * r[i].sz - r[i].sx * r[j].sz
        if (Math.abs(a / 2) * 1e4 < minArea && hgt < 12) continue
      }
      // centroide aproximado para excluir zonas con modelo propio
      const c0 = rings[0].reduce((a, p) => [a[0] + p.lon, a[1] + p.lat], [0, 0]).map((v) => v / rings[0].length)
      if (exclude.some((e) => Math.hypot((c0[0] - e.lon) * 83500, (c0[1] - e.lat) * 111000) < e.r)) continue
      const ground = Math.min(...rings[0].map((p) => p.g))
      const y0 = (ground + minH) * SCALE
      const y1 = (ground + hgt) * SCALE
      // colores: técnico (por altura) y realista (colour de OSM o piedra)
      const k = Math.min(1, hgt / 80)
      const v = (hash(fi) - 0.5) * 14
      // técnico claro: blanco roto, algo más azul-gris cuanto más alto
      const tech = [246 - 52 * k + v, 247 - 44 * k + v, 250 - 30 * k + v]
      const real = hex(f.props.colour) || NAMED[String(f.props.colour || '').toLowerCase()] || STONE[Math.floor(hash(fi * 7) * STONE.length)]
      const pushV = (px, py, pz, nx, ny, nz, shade) => {
        pos.push(px, py, pz)
        nor.push(nx, ny, nz)
        cT.push(tech[0] * shade, tech[1] * shade, tech[2] * shade)
        cR.push(real[0] * shade, real[1] * shade, real[2] * shade)
        return count++
      }
      // paredes: exterior en sentido horario (vista cenital), huecos al revés -> normal (-dz, dx) hacia fuera
      rings.forEach((r, ri) => {
        let a = 0
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].sx * r[i].sz - r[i].sx * r[j].sz
        const wantNeg = ri === 0
        const ring = (a < 0) === wantNeg ? r : [...r].reverse()
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i], q = ring[(i + 1) % ring.length]
          const dx = q.sx - p.sx, dz = q.sz - p.sz
          const L = Math.hypot(dx, dz)
          if (L < 1e-6) continue
          const nx = -dz / L, nz = dx / L
          const a0 = pushV(p.sx, y0, p.sz, nx, 0, nz, 0.82)
          const a1 = pushV(q.sx, y0, q.sz, nx, 0, nz, 0.82)
          const a2 = pushV(q.sx, y1, q.sz, nx, 0, nz, 0.92)
          const a3 = pushV(p.sx, y1, p.sz, nx, 0, nz, 0.92)
          idx.push(a0, a1, a2, a0, a2, a3)
        }
      })
      // cubierta
      const flat = [], holes = []
      rings.forEach((r, ri) => {
        if (ri > 0) holes.push(flat.length / 2)
        r.forEach((p) => flat.push(p.sx, p.sz))
      })
      const tri = earcut(flat, holes.length ? holes : null, 2)
      const base = count
      for (let i = 0; i < flat.length / 2; i++) pushV(flat[i * 2], y1, flat[i * 2 + 1], 0, 1, 0, 1.06)
      for (let t = 0; t < tri.length; t += 3) {
        const A = tri[t], B = tri[t + 1], C = tri[t + 2]
        const ux = flat[B * 2] - flat[A * 2], uz = flat[B * 2 + 1] - flat[A * 2 + 1]
        const vx = flat[C * 2] - flat[A * 2], vz = flat[C * 2 + 1] - flat[A * 2 + 1]
        if (uz * vx - ux * vz >= 0) idx.push(base + A, base + B, base + C)
        else idx.push(base + A, base + C, base + B)
      }
    }
  }
  const u8 = (arr) => Uint8Array.from(arr, (v) => Math.max(0, Math.min(255, Math.round(v))))
  return {
    position: new Float32Array(pos),
    normal: new Float32Array(nor),
    colorTech: u8(cT),
    colorReal: u8(cR),
    index: count > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
    n: count,
  }
}

// ---- relieve
function buildTerrain(z, x, y, dem, N) {
  const samp = sampler(dem)
  const V = N + 1
  const position = new Float32Array(V * V * 3)
  const uv = new Float32Array(V * V * 2)
  const heights = new Float32Array(V * V)
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const u = i / N, v = j / N
      const [sx, sz] = sceneXZ(x2lon(x + u, z), y2lat(y + v, z))
      const g = samp(u, v)
      const k = j * V + i
      position.set([sx, g * SCALE, sz], k * 3)
      uv.set([u, v], k * 2)
      heights[k] = g
    }
  }
  return { position, uv, heights, V }
}

// ---- textura vectorial (estilo técnico o plano claro)
const PAL = {
  tech: { bg: '#eceef1', water: '#d3e3f1', park: '#dde8d9', wood: '#cfdfca', major: '#ffffff', minor: '#fafbfc', rail: '#c3c8d0', path: '#e2e5ea' },
  map: { bg: '#e8e4da', water: '#a9cbe3', park: '#bfd8a4', wood: '#a9c98e', major: '#ffffff', minor: '#f6f3ec', rail: '#b7b2a8', path: '#ddd6c8' },
}
function paint(layers, palette, size) {
  const P = PAL[palette] || PAL.tech
  const c = new OffscreenCanvas(size, size)
  const ctx = c.getContext('2d')
  const s = size / EXT
  ctx.fillStyle = P.bg
  ctx.fillRect(0, 0, size, size)
  const poly = (f) => {
    ctx.beginPath()
    for (const ring of f.geom) {
      ring.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)))
      ctx.closePath()
    }
    ctx.fill('evenodd')
  }
  for (const f of layers.landcover || []) {
    if (f.type !== 3) continue
    const cl = f.props.class
    if (cl === 'wood' || cl === 'forest') ctx.fillStyle = P.wood
    else if (cl === 'grass' || cl === 'farmland' || cl === 'scrub') ctx.fillStyle = P.park
    else continue
    poly(f)
  }
  for (const f of layers.landuse || []) {
    if (f.type === 3 && /cemetery|grass|recreation|pitch|stadium/.test(f.props.class || '')) { ctx.fillStyle = P.park; poly(f) }
  }
  ctx.fillStyle = P.park
  for (const f of layers.park || []) if (f.type === 3) poly(f)
  ctx.fillStyle = P.water
  for (const f of layers.water || []) if (f.type === 3) poly(f)
  const W = { motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 8, minor: 5, service: 3, path: 1.6, track: 1.6, rail: 2.2, transit: 2 }
  const lines = (layers.transportation || []).filter((f) => f.type === 2 && f.props.brunnel !== 'tunnel')
  lines.sort((a, b) => (W[a.props.class] || 2) - (W[b.props.class] || 2))
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const f of lines) {
    const cl = f.props.class
    const w = W[cl]
    if (!w) continue
    ctx.strokeStyle = cl === 'rail' || cl === 'transit' ? P.rail : cl === 'path' || cl === 'track' ? P.path : w >= 10 ? P.major : P.minor
    ctx.lineWidth = w * (size / 1024) * (cl === 'motorway' || cl === 'trunk' ? 1.1 : 1)
    ctx.beginPath()
    for (const ring of f.geom) ring.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)))
    ctx.stroke()
  }
  return c.transferToImageBitmap()
}

// ---- imagen aérea: une 2^(zoom-z) × 2^(zoom-z) teselas en un lienzo
async function imagery(z, x, y, zoom, tpl) {
  const k = 2 ** (zoom - z)
  const px = 256
  const c = new OffscreenCanvas(k * px, k * px)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#3b4036'
  ctx.fillRect(0, 0, c.width, c.height)
  let ok = 0
  const jobs = []
  for (let j = 0; j < k; j++)
    for (let i = 0; i < k; i++)
      jobs.push(
        fetch(fill(tpl, zoom, x * k + i, y * k + j))
          .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
          .then((b) => createImageBitmap(b))
          .then((bmp) => {
            ctx.drawImage(bmp, i * px, j * px, px, px)
            bmp.close()
            ok++
          })
          .catch(() => {}),
      )
  await Promise.all(jobs)
  if (!ok) throw new Error('sin imagen')
  return c.transferToImageBitmap()
}

self.onmessage = async (e) => {
  const m = e.data
  try {
    if (m.type === 'chunk') {
      const [vec, dem] = await Promise.all([fetchVector(m.z, m.x, m.y).catch(() => null), fetchDem(m.z, m.x, m.y)])
      const terrain = buildTerrain(m.z, m.x, m.y, dem, m.verts)
      const bld = vec?.building ? buildBuildings(vec.building, m.z, m.x, m.y, dem, m.exclude || [], m.minArea || 0) : null
      const map = vec ? paint(vec, m.palette, m.texSize) : null
      const tr = [terrain.position.buffer, terrain.uv.buffer, terrain.heights.buffer]
      if (bld) tr.push(bld.position.buffer, bld.normal.buffer, bld.colorTech.buffer, bld.colorReal.buffer, bld.index.buffer)
      if (map) tr.push(map)
      self.postMessage({ id: m.id, ok: true, terrain, bld, map, demSrc: dem?.src || null, osm: Boolean(vec) }, tr)
    } else if (m.type === 'paint') {
      const vec = await fetchVector(m.z, m.x, m.y)
      const map = paint(vec, m.palette, m.texSize)
      self.postMessage({ id: m.id, ok: true, map }, [map])
    } else if (m.type === 'imagery') {
      const img = await imagery(m.z, m.x, m.y, m.zoom, m.tpl)
      self.postMessage({ id: m.id, ok: true, img }, [img])
    }
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String(err?.message || err) })
  }
}
