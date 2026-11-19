// Entorno común de datos (CDE) del gemelo digital · lógica pura (sin navegador), probada con Vitest.
//
// Sigue la UNE-EN ISO 19650-1/2 y su anexo nacional:
//   - Estados del contenedor: En curso (WIP) → Compartido → Publicado → Archivado
//   - Códigos de idoneidad: S0 (en curso), S1–S4 (compartido), A1–A3 / B1 (publicado), CR (registro final)
//   - Revisiones: P01.01 (en curso) · P01 (compartido) · C01 (publicado)
//   - Nomenclatura: Proyecto-Originador-Volumen-Nivel-Tipo-Rol-Número  (BCN01-CAB-ZZ-XX-M3-A-0001)
// Las decisiones de obra se enlazan a elementos del IFC por su GlobalId y se exportan en BCF 2.1.

// ---- estados e idoneidad
export const ESTADOS = {
  WIP: { nom: 'En curso', corto: 'WIP', color: '#a16207', desc: 'Trabajo del equipo autor. Solo lo ve su equipo.' },
  SHARED: { nom: 'Compartido', corto: 'Compartido', color: '#2563eb', desc: 'Revisado por el autor y compartido para coordinación con el resto de equipos.' },
  PUBLISHED: { nom: 'Publicado', corto: 'Publicado', color: '#047857', desc: 'Autorizado por el cliente. Es la información de referencia para construir u operar.' },
  ARCHIVED: { nom: 'Archivado', corto: 'Archivado', color: '#64748b', desc: 'Versiones sustituidas y registro histórico. No se modifica.' },
}
export const IDONEIDAD = {
  S0: { estado: 'WIP', nom: 'Trabajo en curso' },
  S1: { estado: 'SHARED', nom: 'Apto para coordinación' },
  S2: { estado: 'SHARED', nom: 'Apto para información' },
  S3: { estado: 'SHARED', nom: 'Apto para revisión y comentarios' },
  S4: { estado: 'SHARED', nom: 'Apto para revisión y autorización' },
  A1: { estado: 'PUBLISHED', nom: 'Autorizado y aceptado · fase 1' },
  A2: { estado: 'PUBLISHED', nom: 'Autorizado y aceptado · fase 2' },
  A3: { estado: 'PUBLISHED', nom: 'Autorizado y aceptado · fase 3' },
  B1: { estado: 'PUBLISHED', nom: 'Autorizado con comentarios' },
  CR: { estado: 'PUBLISHED', nom: 'Registro final (as built)' },
}

// ---- roles (quién puede hacer cada paso)
export const ROLES = {
  autor: { nom: 'Autor', quien: 'Christian Abad · CAB (modelador BIM)', puede: ['subir', 'compartir', 'nuevaVersion'] },
  coordinador: { nom: 'Coordinador BIM', quien: 'Coordinación BIM (revisor)', puede: ['devolver', 'pedirAutorizacion', 'comentar'] },
  cliente: { nom: 'Cliente / aprobador', quien: 'Ajuntament de Barcelona (ejemplo)', puede: ['publicar', 'rechazar', 'archivar'] },
}

// ---- nomenclatura UNE-EN ISO 19650-2 (anexo nacional): campos y códigos admitidos
export const CAMPOS = [
  { k: 'proyecto', nom: 'Proyecto', re: /^[A-Z0-9]{2,6}$/, ej: 'BCN01' },
  { k: 'originador', nom: 'Originador', re: /^[A-Z]{3,6}$/, ej: 'CAB' },
  { k: 'volumen', nom: 'Volumen o sistema', re: /^([A-Z0-9]{2}|ZZ)$/, ej: 'ZZ' },
  { k: 'nivel', nom: 'Nivel o ubicación', re: /^([0-9]{2}|B[0-9]|M[0-9]|RF|XX|ZZ)$/, ej: 'XX' },
  { k: 'tipo', nom: 'Tipo de información', re: null, ej: 'M3' },
  { k: 'rol', nom: 'Rol', re: null, ej: 'A' },
  { k: 'numero', nom: 'Número', re: /^[0-9]{4,6}$/, ej: '0001' },
]
export const TIPOS = { M3: 'Modelo 3D', M2: 'Modelo 2D', DR: 'Plano', SP: 'Especificación', RP: 'Informe', SH: 'Planificación', CA: 'Cálculo', CO: 'Correspondencia', MI: 'Acta de reunión', SA: 'Programa de mantenimiento', PP: 'Presentación' }
export const ROLES_DOC = { A: 'Arquitectura', B: 'Topografía', C: 'Ingeniería civil', D: 'Drenaje', E: 'Electricidad', F: 'Gestión de instalaciones', G: 'Geotecnia', H: 'Climatización', I: 'Diseño de interiores', K: 'Cliente', L: 'Paisajismo', M: 'Instalaciones mecánicas', P: 'Fontanería', Q: 'Costes', S: 'Estructura', W: 'Contratista', X: 'Subcontratista', Y: 'Especialista', Z: 'General' }

// comprueba un nombre de contenedor: devuelve { ok, partes, errores }
export function checkName(nombre) {
  const base = String(nombre || '').replace(/\.[a-z0-9]+$/i, '')
  const partes = base.split('-')
  const errores = []
  if (partes.length !== CAMPOS.length) {
    return { ok: false, partes: {}, errores: [`Tiene ${partes.length} campos separados por guiones y la norma pide ${CAMPOS.length}: ${CAMPOS.map((c) => c.nom).join(' - ')}`] }
  }
  const out = {}
  CAMPOS.forEach((c, i) => {
    const v = partes[i]
    out[c.k] = v
    if (c.k === 'tipo') { if (!TIPOS[v]) errores.push(`${c.nom}: «${v}» no es un código de tipo (${Object.keys(TIPOS).join(', ')})`) }
    else if (c.k === 'rol') { if (!ROLES_DOC[v]) errores.push(`${c.nom}: «${v}» no es un código de rol (${Object.keys(ROLES_DOC).join(', ')})`) }
    else if (!c.re.test(v)) errores.push(`${c.nom}: «${v}» no cumple el formato (ejemplo: ${c.ej})`)
  })
  return { ok: !errores.length, partes: out, errores }
}

// ---- revisiones
// En curso: P01.01, P01.02… · Compartido: P01 · Publicado: C01 · Nueva versión tras publicar: P02.01
export function parseRev(rev) {
  const m = String(rev).match(/^([PC])(\d{2})(?:\.(\d{2}))?$/)
  return m ? { tipo: m[1], mayor: Number(m[2]), menor: m[3] != null ? Number(m[3]) : null } : null
}
const pad = (n) => String(n).padStart(2, '0')
export const nextRev = {
  shared: (rev) => `P${pad(parseRev(rev)?.mayor || 1)}`,
}

// ---- transiciones: acción → [estado de origen, estado destino, rol que puede]
export const ACCIONES = {
  compartir: { de: 'WIP', a: 'SHARED', rol: 'autor', nom: 'Compartir', pide: 'idoneidad S1–S4 y nombre conforme' },
  devolver: { de: 'SHARED', a: 'WIP', rol: 'coordinador', nom: 'Devolver al autor', pide: 'motivo' },
  pedirAutorizacion: { de: 'SHARED', a: 'SHARED', rol: 'coordinador', nom: 'Pedir autorización', pide: 'cambia la idoneidad a S4' },
  publicar: { de: 'SHARED', a: 'PUBLISHED', rol: 'cliente', nom: 'Autorizar y publicar', pide: 'idoneidad S4 previa' },
  rechazar: { de: 'SHARED', a: 'WIP', rol: 'cliente', nom: 'Rechazar', pide: 'motivo' },
  nuevaVersion: { de: 'PUBLISHED', a: 'WIP', rol: 'autor', nom: 'Nueva versión', pide: '' },
  archivar: { de: 'PUBLISHED', a: 'ARCHIVED', rol: 'cliente', nom: 'Archivar', pide: '' },
}

// ¿puede este rol hacer esta acción con este contenedor? → null si sí; si no, el motivo
export function canDo(doc, accion, rol) {
  const A = ACCIONES[accion]
  if (!A) return 'Acción desconocida'
  if (A.rol !== rol) return `Solo puede hacerlo el ${ROLES[A.rol].nom.toLowerCase()}`
  if (doc.estado !== A.de) return `El contenedor está ${ESTADOS[doc.estado].nom.toLowerCase()}`
  if (accion === 'compartir' && !checkName(doc.nombre).ok) return 'El nombre no cumple la nomenclatura ISO 19650'
  if (accion === 'publicar' && doc.idoneidad !== 'S4') return 'Antes hay que pedir la autorización (idoneidad S4)'
  return null
}

// aplica una acción y devuelve el contenedor nuevo (no modifica el original) más la entrada del registro
export function applyAction(doc, accion, { rol, quien, idoneidad, motivo, ahora = new Date().toISOString() } = {}) {
  const err = canDo(doc, accion, rol)
  if (err) throw new Error(err)
  const d = { ...doc, versiones: [...(doc.versiones || [])] }
  const antes = { estado: doc.estado, idoneidad: doc.idoneidad, revision: doc.revision }
  switch (accion) {
    case 'compartir': {
      const s = idoneidad || 'S1'
      if (!['S1', 'S2', 'S3'].includes(s)) throw new Error('Para compartir se usa S1, S2 o S3')
      Object.assign(d, { estado: 'SHARED', idoneidad: s, revision: nextRev.shared(doc.revision) })
      break
    }
    case 'devolver': case 'rechazar': {
      if (!motivo) throw new Error('Indica el motivo')
      const may = parseRev(doc.revision)?.mayor || 1
      Object.assign(d, { estado: 'WIP', idoneidad: 'S0', revision: `P${pad(may)}.${pad(lastMinor(doc) + 1)}` })
      break
    }
    case 'pedirAutorizacion': d.idoneidad = 'S4'; break
    case 'publicar': {
      const veces = (doc.historial || []).filter((h) => h.accion === 'publicar').length
      Object.assign(d, { estado: 'PUBLISHED', idoneidad: idoneidad && IDONEIDAD[idoneidad]?.estado === 'PUBLISHED' ? idoneidad : 'A1', revision: `C${pad(veces + 1)}` })
      break
    }
    case 'nuevaVersion': Object.assign(d, { estado: 'WIP', idoneidad: 'S0', revision: `P${pad((parseRev(doc.revision)?.mayor || 0) + 1)}.01` }); break
    case 'archivar': d.estado = 'ARCHIVED'; break
  }
  const entrada = { t: ahora, accion, nom: ACCIONES[accion].nom, quien: quien || ROLES[rol].quien, rol, antes, despues: { estado: d.estado, idoneidad: d.idoneidad, revision: d.revision }, motivo: motivo || null }
  d.historial = [entrada, ...(doc.historial || [])]
  return { doc: d, entrada }
}
// menor revisión usada en curso (para seguir numerando tras una devolución)
function lastMinor(doc) {
  let m = 0
  for (const h of doc.historial || []) for (const r of [h.antes?.revision, h.despues?.revision]) { const p = parseRev(r || ''); if (p?.menor != null) m = Math.max(m, p.menor) }
  return m
}

// ---- decisiones de obra / incidencias enlazadas al IFC
export const TIPOS_DEC = ['Decisión de obra', 'Incidencia', 'Consulta (RFI)', 'Colisión']
export const ESTADOS_DEC = ['Abierta', 'En curso', 'Resuelta', 'Cerrada']

// GUID de BCF (UUID v4) a partir de una semilla, para que el export sea estable
export function uuidFrom(seed) {
  let h = 2166136261
  const bytes = []
  for (let i = 0; i < 16; i++) { for (const c of `${seed}:${i}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; bytes.push(h & 255) }
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const x = bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}
const xml = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])

// ficheros de un BCF 2.1: bcf.version y una carpeta por tema con markup.bcf y viewpoint.bcfv
export function bcfFiles(decisiones, { proyecto = 'BCN01' } = {}) {
  const files = [{ path: 'bcf.version', text: '<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DetailedVersion>2.1</DetailedVersion></Version>\n' }]
  files.push({ path: 'project.bcfp', text: `<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension><Project ProjectId="${uuidFrom(proyecto)}"><Name>${xml(proyecto)}</Name></Project><ExtensionSchema></ExtensionSchema></ProjectExtension>\n` })
  for (const d of decisiones) {
    const g = uuidFrom(d.id)
    const vp = uuidFrom(d.id + 'vp')
    const comments = (d.comentarios || []).map((c, i) => `<Comment Guid="${uuidFrom(d.id + 'c' + i)}"><Date>${xml(c.t)}</Date><Author>${xml(c.quien)}</Author><Comment>${xml(c.texto)}</Comment><Viewpoint Guid="${vp}"/></Comment>`).join('')
    files.push({
      path: `${g}/markup.bcf`,
      text: `<?xml version="1.0" encoding="UTF-8"?>\n<Markup><Header>${d.modelo ? `<File IfcProject="" isExternal="true"><Filename>${xml(d.modelo)}</Filename></File>` : ''}</Header><Topic Guid="${g}" TopicType="${xml(d.tipo)}" TopicStatus="${xml(d.estado)}"><Title>${xml(d.titulo)}</Title><Priority>${xml(d.prioridad || 'Normal')}</Priority><CreationDate>${xml(d.creada)}</CreationDate><CreationAuthor>${xml(d.autor)}</CreationAuthor>${d.asignada ? `<AssignedTo>${xml(d.asignada)}</AssignedTo>` : ''}<Description>${xml(d.descripcion)}</Description></Topic>${comments}<Viewpoints Guid="${vp}"><Viewpoint>viewpoint.bcfv</Viewpoint></Viewpoints></Markup>\n`,
    })
    const cam = d.camara || { pos: [30, -30, 25], dir: [-0.6, 0.6, -0.5], up: [0, 0, 1] }
    const v3 = (k, a) => `<${k}><X>${a[0]}</X><Y>${a[1]}</Y><Z>${a[2]}</Z></${k}>`
    files.push({
      path: `${g}/viewpoint.bcfv`,
      text: `<?xml version="1.0" encoding="UTF-8"?>\n<VisualizationInfo Guid="${vp}"><Components><Selection>${d.guid ? `<Component IfcGuid="${xml(d.guid)}"/>` : ''}</Selection><Visibility DefaultVisibility="true"/></Components><PerspectiveCamera>${v3('CameraViewPoint', cam.pos)}${v3('CameraDirection', cam.dir)}${v3('CameraUpVector', cam.up)}<FieldOfView>60</FieldOfView></PerspectiveCamera></VisualizationInfo>\n`,
    })
  }
  return files
}

// ZIP sin compresión (método «stored»): suficiente para BCF y no necesita librerías
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
export const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
export function zip(files) {
  const enc = new TextEncoder()
  const parts = [], central = []
  let off = 0
  for (const f of files) {
    const name = enc.encode(f.path), data = f.bytes || enc.encode(f.text), crc = crc32(data)
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true)
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true)
    parts.push(new Uint8Array(h.buffer), name, data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true)
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true)
    central.push(new Uint8Array(c.buffer), name)
    off += 30 + name.length + data.length
  }
  const size = central.reduce((s, p) => s + p.length, 0)
  const e = new DataView(new ArrayBuffer(22))
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true)
  const all = [...parts, ...central, new Uint8Array(e.buffer)]
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0))
  let p = 0
  for (const a of all) { out.set(a, p); p += a.length }
  return out
}

// ---- mantenimiento (GMAO): plan preventivo a partir de las propiedades del IFC
const MESES = { Mensual: 1, Trimestral: 3, Semestral: 6, Anual: 12 }
export function planPreventivo(activos, desde = '2026-11-19', meses = 12) {
  const out = []
  const d0 = new Date(`${desde}T08:00:00Z`)
  for (const a of activos) {
    const cada = MESES[a.frecuencia]
    if (!cada) continue
    for (let m = cada; m <= meses; m += cada) {
      const d = new Date(d0); d.setUTCMonth(d.getUTCMonth() + m)
      out.push({ id: `OT-P-${a.codigo}-${m}`, tipo: 'Preventivo', activo: a.codigo, guid: a.guid, titulo: `Revisión ${a.frecuencia.toLowerCase()} · ${a.nombre}`, fecha: d.toISOString().slice(0, 10), estado: 'Programada', criticidad: a.criticidad })
    }
  }
  return out.sort((x, y) => x.fecha.localeCompare(y.fecha))
}

// ---- sensores en tiempo real (simulados, deterministas por hora): temperatura, humedad, CO2
export function lecturaSensor(id, t = Date.now()) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const fase = (h % 360) * (Math.PI / 180)
  const hora = ((t / 3600000) % 24 + 24) % 24
  const ocup = hora >= 9 && hora <= 20 ? Math.sin(((hora - 9) / 11) * Math.PI) : 0 // aforo de la biblioteca
  const ruido = (k) => Math.sin(t / 47000 + fase * k) * 0.3
  const temp = 21 + ocup * 2.2 + Math.sin(fase) * 0.6 + ruido(1)
  const hum = 45 + ocup * 6 + Math.cos(fase) * 3 + ruido(2) * 4
  const co2 = 420 + ocup * (520 + (h % 5) * 90) + ruido(3) * 40
  const alerta = co2 > 1000 ? 'CO₂ alto: ventilar' : temp > 25 ? 'Temperatura alta' : null
  return { id, t, temp: Math.round(temp * 10) / 10, hum: Math.round(hum), co2: Math.round(co2), alerta }
}

// ---- SharePoint (simulado): carpeta de cada estado y la llamada de Microsoft Graph que haría
export const SP_CARPETAS = { WIP: '01 En curso', SHARED: '02 Compartido', PUBLISHED: '03 Publicado', ARCHIVED: '04 Archivado' }
export function spPlan(docs, cfg) {
  return docs.map((d) => {
    const ruta = `${cfg.biblioteca}/${SP_CARPETAS[d.estado]}/${d.nombre}`
    const al = d.sp?.ruta === ruta && d.sp?.revision === d.revision
    return { id: d.id, nombre: d.nombre, ruta, accion: al ? 'al día' : d.sp ? (d.sp.ruta !== ruta ? 'mover' : 'actualizar') : 'subir', graph: al ? null : `PUT https://graph.microsoft.com/v1.0/sites/{site-id}/drives/{drive-id}/root:/${encodeURI(ruta)}:/content` }
  })
}
