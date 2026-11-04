-- Esquema de D1 (opcional). Se pega una vez en: Cloudflare → Storage & Databases → D1 → tu base → Console.
CREATE TABLE IF NOT EXISTS readings (
  minute         INTEGER PRIMARY KEY,   -- minutos desde 1970 (1 fila por minuto)
  rain           REAL,
  wind           REAL,
  alerts         INTEGER,
  open_incidents INTEGER,
  avg_kmh        REAL,
  data           TEXT                   -- JSON con las alertas de ese minuto
);
