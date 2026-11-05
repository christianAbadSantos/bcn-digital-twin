// Perfil del dispositivo para decidir cuánto cargar (radio de teselas, resolución, sombras…).
// Se mira CPU (núcleos), memoria, tamaño de pantalla y la GPU que informa WebGL.
// Después, `adaptTier` lo baja en caliente si los FPS reales no llegan.

const PROFILES = {
  low: { name: 'bajo', dpr: [0.75, 1], shadows: false, osmRadius: 1500, maxTiles: 10, terrainVerts: 48, imgZoom: 15, imgNearZoom: 15, workers: 1, ifcMaxBytes: 1.5e6, lambert: true },
  mid: { name: 'medio', dpr: [1, 1.5], shadows: true, osmRadius: 2600, maxTiles: 24, terrainVerts: 64, imgZoom: 15, imgNearZoom: 16, workers: 2, ifcMaxBytes: 6e6, lambert: false },
  high: { name: 'alto', dpr: [1, 2], shadows: true, osmRadius: 4200, maxTiles: 48, terrainVerts: 96, imgZoom: 16, imgNearZoom: 17, workers: 3, ifcMaxBytes: 12e6, lambert: false },
}

function gpuName() {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return String(name || '')
  } catch {
    return ''
  }
}

export function detectTier() {
  if (typeof window === 'undefined') return { key: 'mid', ...PROFILES.mid, gpu: '' }
  const forced = new URLSearchParams(location.search).get('tier')
  if (PROFILES[forced]) return { key: forced, ...PROFILES[forced], gpu: 'forzado por ?tier=' }
  const cores = navigator.hardwareConcurrency || 4
  const mem = navigator.deviceMemory || 4 // GB (solo Chromium; si no, se asume 4)
  const small = Math.min(screen.width, screen.height) < 600
  const touch = navigator.maxTouchPoints > 1
  const gpu = gpuName()
  const weakGpu = /mali-4|mali-t|adreno \(tm\) [3-5]\d\d|powervr|intel\(r\) (hd|uhd) graphics [2-6]\d{2}\b|swiftshader|llvmpipe|basic render/i.test(gpu)
  const strongGpu = /rtx|radeon rx|apple m\d|geforce gtx 1[0-9]|arc a\d/i.test(gpu)
  let key = 'mid'
  if (weakGpu || cores <= 4 || mem <= 2 || (small && touch && mem <= 4)) key = 'low'
  else if (strongGpu && cores >= 8 && mem >= 8 && !small) key = 'high'
  return { key, ...PROFILES[key], gpu, cores, mem }
}

export function lowerTier(t) {
  const next = t.key === 'high' ? 'mid' : 'low'
  return { ...t, key: next, ...PROFILES[next] }
}
