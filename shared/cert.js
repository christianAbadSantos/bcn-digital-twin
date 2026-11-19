// Certificado de documentos: huella SHA-256 del fichero publicado. Si alguien cambia un solo byte, la
// huella cambia por completo; así cualquiera (un auditor, una ingeniería, la propiedad) puede comprobar
// que tiene exactamente el documento que se autorizó. El registro de certificados no se borra.
// (Paso siguiente posible: anclar las huellas en una cadena de bloques o en un sello de tiempo RFC 3161.)

export async function sha256Hex(bytes) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// código corto de verificación: los 16 primeros caracteres de la huella, en grupos de 4
export const codigoDe = (hash) => hash.slice(0, 16).toUpperCase().match(/.{4}/g).join('-')

export function certificado({ hash, nombre, revision, idoneidad, firmante, proyecto, t = new Date().toISOString() }) {
  return { id: `CERT-${codigoDe(hash).slice(0, 9)}`, codigo: codigoDe(hash), hash, algoritmo: 'SHA-256', nombre, revision, idoneidad, firmante, proyecto, t }
}

// comprobar un fichero contra los certificados emitidos
export async function verificar(bytes, certs) {
  const hash = await sha256Hex(bytes)
  const c = certs.find((x) => x.hash === hash) || null
  return { hash, codigo: codigoDe(hash), certificado: c }
}
