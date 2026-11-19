// Datos de los elementos de cada modelo IFC (clase, nombres, propiedades, planta, caja envolvente), sin la
// geometría: los usan la validación IDS, la detección de colisiones y el árbol del modelo.
import { useEffect, useState } from 'react'

export function useModelMeta(modelos) {
  const [meta, setMeta] = useState({}) // file → { elementos, estado }
  const key = modelos.map((m) => `${m.file}@${m.url}`).join('|')
  useEffect(() => {
    const pend = modelos.filter((m) => !meta[m.file])
    if (!pend.length) return
    const w = new Worker(new URL('../workers/cdeIfcWorker.js', import.meta.url), { type: 'module' })
    let n = pend.length
    w.onmessage = (e) => {
      const r = e.data
      setMeta((x) => ({ ...x, [r.file]: r.ok ? { estado: 'ok', elementos: r.elementos.map(({ position, normal, index, ...m }) => ({ ...m, file: r.file })) } : { estado: 'error', error: r.error, elementos: [] } }))
      if (--n === 0) w.terminate()
    }
    pend.forEach((m, i) => w.postMessage({ id: i, url: m.url, file: m.file }))
    return () => w.terminate()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return meta
}
