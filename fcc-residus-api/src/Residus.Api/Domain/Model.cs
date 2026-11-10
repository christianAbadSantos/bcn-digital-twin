namespace Residus.Api.Domain;

/// <summary>Fracciones de la recogida selectiva de Barcelona.</summary>
public enum Fraccio
{
    Rebuig = 0,   // resto
    Envasos = 1,  // envases ligeros
    Paper = 2,    // papel y cartón
    Vidre = 3,    // vidrio
    Organica = 4, // orgánica
}

/// <summary>
/// Un contenedor de una fracción en un punto de la calle. Guarda su último estado (nivel, batería)
/// para consultar rápido el mapa; el histórico va en <see cref="Lectura"/>.
/// </summary>
public class Contenidor
{
    public int Id { get; set; }
    public long OsmId { get; set; }            // punto real de OpenStreetMap
    public Fraccio Fraccio { get; set; }
    public double Lat { get; set; }
    public double Lon { get; set; }
    public bool Soterrat { get; set; }
    public int CapacitatLitres { get; set; }
    public double NivellPct { get; set; }      // 0–100, según el último sensor
    public double BateriaPct { get; set; }
    public DateTimeOffset? UltimaLectura { get; set; }
    public DateTimeOffset? UltimaRecollida { get; set; }
    public List<Lectura> Lectures { get; set; } = [];
}

/// <summary>Lectura de un sensor de llenado (ultrasonidos) recibida por LoRaWAN.</summary>
public class Lectura
{
    public long Id { get; set; }
    public int ContenidorId { get; set; }
    public Contenidor? Contenidor { get; set; }
    public DateTimeOffset Ts { get; set; }
    public double NivellPct { get; set; }
    public double? TemperaturaC { get; set; }
    public double? BateriaPct { get; set; }
    public int? Rssi { get; set; }
    public string Font { get; set; } = "simulador"; // "simulador" | "ttn"
}

/// <summary>Una ruta de recogida realizada (para los indicadores).</summary>
public class Recollida
{
    public int Id { get; set; }
    public Fraccio Fraccio { get; set; }
    public DateTimeOffset Inici { get; set; }
    public int Parades { get; set; }
    public double Km { get; set; }
    public double Kg { get; set; }
}
