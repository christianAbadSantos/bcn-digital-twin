// User-Agent propio para todas las peticiones del backend a servicios externos
// (Port de Barcelona, Open-Meteo, Context Broker FIWARE): identifica la app y dónde verla,
// como piden las políticas de uso de los servicios abiertos.
// (El navegador no permite cambiar el User-Agent: esto solo aplica a las Pages Functions.)
export const USER_AGENT = 'bcn-digital-twin/0.5 (+https://bcn-digital-twin.pages.dev)'
