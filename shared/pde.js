// Guía BIM de Puertos del Estado (PdE, junio de 2019): lo que se puede aplicar en código.
//   · Tipologías de proyecto y disciplinas (5.1.2)          · Usos BIM del Sistema Portuario (4.6, tabla 5)
//   · Niveles de desarrollo LOD (5.2.1, tabla 25)           · Set de propiedades PdE / LOI (5.2.2, tabla 26)
//   · Clasificación de elementos portuarios PT (anexo II)   · Epígrafes de activo contable (anexo III)
//   · Codificación de archivos (anexo IV)                   · Flujo del CDE y checklist de auditoría (7.1, 9.2.3)
// Fuente: https://www.puertos.es/system/files/2024-02/Guia%20BIM%2009.pdf

export const GUIA = { titulo: 'Guía BIM · Puertos del Estado', fecha: 'junio de 2019', url: 'https://www.puertos.es/system/files/2024-02/Guia%20BIM%2009.pdf' }

// 5.1.2 · tipologías de proyecto y sus disciplinas
export const TIPOLOGIAS = {
  OM: { nom: 'Obras marítimas', disciplinas: ['Batimetría', 'Topografía', 'Geotecnia', 'Dragados', 'Movimientos de tierras', 'Tratamiento del terreno', 'Estructuras', 'Superestructura', 'Equipamiento portuario', 'Instalaciones', 'Pavimentación', 'Drenaje', 'Servicios afectados', 'Demoliciones'] },
  UR: { nom: 'Urbanización', disciplinas: ['Topografía', 'Geotecnia', 'Movimientos de tierras', 'Pavimentación', 'Instalaciones', 'Equipamiento', 'Drenaje', 'Servicios afectados', 'Demoliciones'] },
  AT: { nom: 'Accesos terrestres', disciplinas: ['Topografía', 'Geotecnia', 'Movimientos de tierras', 'Superestructura', 'Instalaciones', 'Estructuras', 'Drenaje', 'Servicios afectados', 'Demoliciones'] },
  ED: { nom: 'Edificación', disciplinas: ['Topografía', 'Geotecnia', 'Movimientos de tierras', 'Instalaciones', 'Estructuras', 'Arquitectura', 'Servicios afectados', 'Demoliciones'] },
  EI: { nom: 'Edificación industrial', disciplinas: ['Topografía', 'Geotecnia', 'Movimientos de tierras', 'Instalaciones', 'Estructuras', 'Arquitectura', 'Equipamiento industrial', 'Servicios afectados', 'Demoliciones'] },
}

// 4.6 · usos BIM (D = diseño, C = construcción, M = conservación y mantenimiento) y dónde se aplican aquí
export const USOS = [
  { uso: 'Información centralizada', fases: 'DCM', aqui: 'CDE: un único repositorio con estados ISO 19650, revisiones y registro', donde: 'cde' },
  { uso: 'Diseño y visualización 3D', fases: 'DCM', aqui: 'Visor IFC con That Open Components en el CDE y en el gemelo del edificio', donde: 'cde' },
  { uso: 'Documentación 2D', fases: 'DCM', aqui: 'Planos de corte horizontal y vertical sobre el modelo', donde: 'cde' },
  { uso: 'Coordinación 3D y gestión de colisiones', fases: 'DCM', aqui: 'Detección de colisiones entre disciplinas y temas BCF', donde: 'cde' },
  { uso: 'Mediciones', fases: 'DC', aqui: 'Longitud, espesor, área y volumen de cada elemento en 02_PdE_Cantidades', donde: 'cde' },
  { uso: 'Simulaciones constructivas', fases: 'DC', aqui: null },
  { uso: 'Logística y acopios', fases: 'CM', aqui: null },
  { uso: 'Seguimiento de obra (producción y certificación)', fases: 'C', aqui: 'Decisiones de obra enlazadas al modelo y certificados SHA-256 de lo publicado', donde: 'cde' },
  { uso: 'Representación de obra ejecutada (As Built)', fases: 'CM', aqui: 'Enlaces del modelo a los documentos de obra (04_PdE_Obra)', donde: 'cde' },
  { uso: 'Inventariado', fases: 'CM', aqui: 'Activos del modelo con código de inventario y epígrafe contable (05_PdE_EOM)', donde: 'cde' },
  { uso: 'Mantenimiento y explotación', fases: 'M', aqui: 'Plan preventivo GMAO y supervisión de instalaciones (BMS) sobre el modelo', donde: 'edificio' },
  { uso: 'Infografías y recorridos virtuales', fases: 'DCM', aqui: 'Gemelo de Barcelona en 3D con los edificios publicados', donde: 'gemelo' },
  { uso: 'Alimentación de sistema de gestión', fases: 'M', aqui: 'El CDE publica sus modelos al GIS del gemelo y exporta órdenes al GMAO', donde: 'gemelo' },
]

// 5.2.1 · niveles de desarrollo geométrico
export const LOD = {
  100: 'Conceptual: reserva de espacio, poco detallada',
  200: 'Genérico: tipo y componentes, dimensiones aproximadas',
  300: 'Específico: dimensiones exactas y materiales (recomendado para proyecto constructivo)',
  350: 'Específico con detalles de fabricación',
  400: 'Para fabricación',
  500: 'As Built: forma ejecutada real a partir de datos de campo',
}

// 5.2.2 · set de propiedades PdE (LOI): grupo → [propiedad, tipo]
export const PSET = {
  '01_PdE_Identificación': [['01_01_PdE_Proyecto', 'texto'], ['01_02_PdE_Localizador', 'texto'], ['01_03_PdE_Estado', 'texto'], ['01_04_PdE_Clasificación', 'texto'], ['01_05_PdE_Tipología', 'texto'], ['01_06_PdE_Disciplina', 'texto'], ['01_07_PdE_Subdisciplina', 'texto'], ['01_08_PdE_Material', 'texto']],
  '02_PdE_Cantidades': [['02_01_PdE_Unidad', 'ud'], ['02_02_PdE_Longitud', 'm'], ['02_03_PdE_Espesor', 'm'], ['02_04_PdE_Area', 'm2'], ['02_05_PdE_Volumen', 'm3']],
  '03_PdE_Proyecto': [['03_01_PdE_Fase Obra', 'texto'], ['03_02_PdE_Planos', 'url'], ['03_03_PdE_PPTP', 'url'], ['03_04_01_PdE_Ud Medición 01', 'texto']],
  '04_PdE_Obra': [['04_01_PdE_Controles de Calidad', 'url'], ['04_02_PdE_Fotografías', 'url'], ['04_03_PdE_Seguridad y Salud', 'url'], ['04_04_PdE_Informes de Aprobación', 'url'], ['04_05_PdE_Certificaciones', 'url'], ['04_06_PdE_Planos As Built', 'url'], ['04_07_PdE_MedioAmbiente', 'url']],
  '05_PdE_EOM': [['05_01_01_PdE_Cod Mantenimiento', 'texto'], ['05_01_02_PdE_Aux Mantenimiento', 'url'], ['05_02_01_PdE_Cod Explotación', 'texto'], ['05_02_02_PdE_Aux Explotación', 'url'], ['05_03_01_PdE_Cod Contable', 'texto'], ['05_03_02_PdE_AuxContable', 'url']],
}
export const ESTADOS_PDE = ['Existente', 'Proyecto Básico', 'Proyecto Constructivo', 'Obra']
// grupos obligatorios según la fase (los de obra solo cuando el activo está en obra o existe)
export const GRUPOS_FASE = { 'Proyecto Básico': ['01_PdE_Identificación', '02_PdE_Cantidades'], 'Proyecto Constructivo': ['01_PdE_Identificación', '02_PdE_Cantidades', '03_PdE_Proyecto'], Obra: ['01_PdE_Identificación', '02_PdE_Cantidades', '03_PdE_Proyecto', '04_PdE_Obra'], Existente: ['01_PdE_Identificación', '02_PdE_Cantidades', '05_PdE_EOM'] }

// anexo II · clasificación de elementos portuarios (extracto: niveles 1 a 3 más usados)
export const CLASIFICACION_PT = {
  'PT.010': 'Topografía', 'PT.020': 'Batimetría', 'PT.020.020': 'Nivel del mar', 'PT.030': 'Geotecnia', 'PT.040': 'Dragados',
  'PT.050': 'Movimiento de tierras', 'PT.050.010': 'Todo uno', 'PT.050.020': 'Escolleras', 'PT.050.030': 'Rellenos', 'PT.050.060': 'Excavaciones',
  'PT.060': 'Tratamientos del terreno', 'PT.060.040': 'Pilotes',
  'PT.070': 'Estructuras', 'PT.070.010': 'Dique en talud', 'PT.070.020': 'Dique vertical', 'PT.070.020.010': 'Cajones (dique vertical)', 'PT.070.030': 'Muelle de gravedad', 'PT.070.030.010': 'Cajones (muelle de gravedad)', 'PT.070.040': 'Muelle de pilotes',
  'PT.080': 'Superestructuras', 'PT.080.010.010': 'Espaldón',
  'PT.090': 'Equipamiento portuario', 'PT.090.010.010': 'Bolardo', 'PT.090.030': 'Defensa', 'PT.090.040.030': 'Escalas', 'PT.090.050': 'Carril de grúa / ferrocarril', 'PT.090.060.010': 'Galería de servicios',
  'PT.110': 'Pavimentación', 'PT.120': 'Drenaje', 'PT.130': 'Servicios afectados', 'PT.140': 'Demoliciones',
}

// anexo III · epígrafes de activo contable (extracto: los que aparecen en edificios e instalaciones portuarias)
export const EPIGRAFES = {
  '0301': 'Obras de abrigo y defensa: diques', '0401': 'Obras de atraque: muelles de fábrica', '0402': 'Obras de atraque: muelles de hormigón y metal', '0403': 'Obras de atraque: defensas y amarres',
  '0601': 'Edificaciones: tinglados, almacenes y depósitos de mercancías', '0602': 'Edificaciones: estaciones marítimas, naves y lonjas', '0603': 'Edificaciones: almacenes, talleres, garajes y oficinas',
  '0604': 'Edificaciones: viviendas y otros edificios', '0605': 'Edificaciones: edificaciones menores', '0607': 'Edificaciones: elementos fijos, soporte ayuda a la navegación',
  '0702': 'Inst. generales: cerramientos', '0704': 'Inst. generales: instalación eléctrica', '0705': 'Inst. generales: fontanería', '0706': 'Inst. generales: carpintería y vidrio',
  '0707': 'Inst. generales: conducciones de saneamiento', '0708': 'Inst. generales: instalaciones especiales', '0709': 'Inst. generales: climatización', '0713': 'Inst. generales: contra incendios',
  '0802': 'Pavimentos: muelles y zonas de manipulación', '0805': 'Pavimentos, calzadas y vías: puentes metálicos', '0807': 'Pavimentos: carriles de apoyo de grúas de muelle',
}

// anexo IV · codificación de archivos. Contratos: AÑO_XXPR_Nombre · documentos: AÑO_XXPRZZ_Nombre_ED.ext
// planos y modelos: AÑO_XXPR_PL00_Nombre.ext (sin edición, para no romper referencias externas)
export const TIPOS_CONTRATO = { PR: 'Expediente de obras', PY: 'Expediente de redacción de proyecto', PB: 'Pliego de bases', SA: 'Contrato menor' }
const RE_CARPETA = /^(\d{2})_(\d{2})(PR|PY|PB|SA)_([A-Za-z0-9]+)$/
const RE_DOC = /^(\d{2})_(\d{2})(PR|PY|PB|SA)(\d{2})?(\d{2})_([A-Za-z0-9]+)_(\d{1,2})\.([a-z0-9]+)$/i
const RE_MODELO = /^(\d{2})_(\d{2})(PR|PY|PB|SA)(\d{2})?_(PL\d{2,3}|M\d{2,3}[A-Z]?)(?:_([A-Za-z0-9]+))?\.([a-z0-9]+)$/i

export function checkCodigoPdE(nombre) {
  let m
  if ((m = nombre.match(RE_CARPETA))) return { ok: true, tipo: 'carpeta', partes: { anio: m[1], contrato: m[2], tipoContrato: m[3], nombre: m[4] } }
  if ((m = nombre.match(RE_MODELO))) return { ok: true, tipo: 'plano o modelo', partes: { anio: m[1], contrato: m[2], tipoContrato: m[3], subcarpeta: m[4] || null, codigo: m[5], nombre: m[6] || null, ext: m[7] } }
  if ((m = nombre.match(RE_DOC))) return { ok: true, tipo: 'documento', partes: { anio: m[1], contrato: m[2], tipoContrato: m[3], subcarpeta: m[4] || null, contador: m[5], nombre: m[6], edicion: m[7], ext: m[8] } }
  const errores = []
  if (!/^\d{2}_/.test(nombre)) errores.push('Debe empezar por el año con dos dígitos y «_» (p. ej. 26_)')
  else if (!/^\d{2}_\d{2}(PR|PY|PB|SA)/.test(nombre)) errores.push('Tras el año va el nº de contrato (2 dígitos) y su tipo: PR, PY, PB o SA')
  else errores.push('Formato: AÑO_XXPRZZ_Nombre_ED.ext (documentos) o AÑO_XXPR_PL00_Nombre.ext (planos y modelos)')
  return { ok: false, errores }
}

// equivalencia del nombre ISO 19650 del CDE (Proyecto-Originador-Volumen-Nivel-Tipo-Rol-Número) al código del anexo IV
export function aCodigoPdE(doc, { anio = '26', contrato = '01', tipoContrato = 'PR', contador } = {}) {
  const base = doc.nombre.replace(/\.[^.]+$/, ''), ext = (doc.nombre.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase()
  const p = base.split('-')
  const amigable = (doc.titulo || base).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('').slice(0, 40)
  if (p.length === 7 && /^(M3|M2|DR)$/.test(p[4])) {
    const cod = p[4] === 'DR' ? `PL${p[6].slice(-2)}` : `M${p[6].slice(-2)}${p[5]}`
    return `${anio}_${contrato}${tipoContrato}_${cod}_${amigable}.${ext}`
  }
  const n = String(contador ?? (Number((p[6] || '1').replace(/\D/g, '')) % 100)).padStart(2, '0')
  const ed = (doc.revision || 'P01').match(/(\d+)/)?.[1] || '1'
  return `${anio}_${contrato}${tipoContrato}${n}_${amigable}_${Number(ed)}.${ext}`
}

// nivel de información: qué parte del set de propiedades PdE tiene cada elemento
const vacio = (v) => v == null || v === '' || v === '-'
export function loi(elementos, grupos = Object.keys(PSET)) {
  const fisicos = elementos.filter((e) => e.clase !== 'IFCSPACE' || e.psets?.['01_PdE_Identificación'])
  let total = 0, llenas = 0
  const faltan = new Map()
  for (const e of fisicos) for (const g of grupos) for (const [n] of PSET[g]) {
    total++
    if (!vacio(e.psets?.[g]?.[n])) llenas++
    else faltan.set(`${g} · ${n}`, (faltan.get(`${g} · ${n}`) || 0) + 1)
  }
  return { elementos: fisicos.length, total, llenas, pct: total ? Math.round((llenas / total) * 1000) / 10 : 0, faltan: [...faltan].sort((a, b) => b[1] - a[1]) }
}

// 9.2.3 · checklist de auditoría de un modelo, rellenada con lo que el CDE puede comprobar solo
export function checklist({ doc, elementos = [], ids, colisiones, georref }) {
  const id = elementos.map((e) => e.psets?.['01_PdE_Identificación']).filter(Boolean)
  const clas = id.filter((p) => !vacio(p['01_04_PdE_Clasificación'])).length
  const L = loi(elementos, ['01_PdE_Identificación', '02_PdE_Cantidades', '03_PdE_Proyecto', '05_PdE_EOM'])
  const fila = (bloque, req, ok, nota) => ({ bloque, req, ok, nota })
  return [
    fila('A · Información del proyecto', 'Formato abierto IFC (7.3)', /\.ifc$/i.test(doc.nombre), doc.nombre),
    fila('A · Información del proyecto', 'Nombre del fichero codificado (7.2 / anexo IV)', true, `ISO 19650 ${doc.nombre} → PdE ${aCodigoPdE(doc)}`),
    fila('A · Información del proyecto', 'Modelo georreferenciado para su paso al GIS (3.7)', georref == null ? null : !!georref, georref ? 'IfcSite con latitud, longitud y cota' : 'Sin comprobar'),
    fila('B · Estructura del modelo', 'Elementos con código de clasificación (5.3)', elementos.length ? clas === id.length && id.length > 0 : null, `${clas} de ${id.length} elementos`),
    fila('B · Estructura del modelo', 'Set de propiedades PdE completo (LOI, 5.2.2)', elementos.length ? L.pct >= 95 : null, `${String(L.pct).replace('.', ',')} % de ${L.total} propiedades`),
    fila('B · Estructura del modelo', 'Tamaño por debajo de 200 MB por fichero (5.1.2)', (doc.tamano || 0) < 200e6, `${Math.round((doc.tamano || 0) / 1024)} kB`),
    fila('C · Coordinación', 'Revisión automatizada de requisitos (IDS)', ids == null ? null : ids.ok, ids ? (ids.ok ? 'Cumple' : `${ids.malos} elementos con fallos`) : 'Sin validar'),
    fila('C · Coordinación', 'Interferencias revisadas (9.2.2)', colisiones == null ? null : colisiones.abiertas === 0, colisiones ? `${colisiones.total} detectadas · ${colisiones.abiertas} sin tema BCF` : 'Sin comprobar'),
    fila('D · Flujo del CDE', 'Publicado tras control de calidad nivel 2 (7.1.5)', doc.estado === 'PUBLISHED' || doc.estado === 'ARCHIVED', doc.estado),
  ]
}
