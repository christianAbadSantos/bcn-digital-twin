using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Residus.Api.Domain;
using Residus.Api.Services;

namespace Residus.Api.Data;

/// <summary>
/// Carga los contenedores reales (posiciones de OpenStreetMap) la primera vez que arranca la API:
/// un contenedor por cada fracción de cada punto. El nivel inicial es simulado.
/// </summary>
public class Seeder(ResidusDb db, IOptions<OpcionsDades> opcions, IWebHostEnvironment env, ILogger<Seeder> log)
{
    public static int Capacitat(Fraccio f, bool soterrat) => soterrat ? 3000 : f switch
    {
        Fraccio.Envasos or Fraccio.Paper => 3200,
        Fraccio.Vidre => 2500,
        _ => 2200,
    };

    /// <summary>Número pseudoaleatorio estable entre 0 y 1 a partir de un entero.</summary>
    public static double Hash(long x)
    {
        unchecked
        {
            var h = (ulong)x * 0x9E3779B97F4A7C15UL;
            h ^= h >> 31;
            h *= 0xBF58476D1CE4E5B9UL;
            h ^= h >> 29;
            return (h % 10_000) / 10_000.0;
        }
    }

    public async Task SeedAsync(CancellationToken ct = default)
    {
        if (await db.Contenidors.AnyAsync(ct)) return;
        var ruta = Path.GetFullPath(Path.Combine(env.ContentRootPath, opcions.Value.Fitxer));
        if (!File.Exists(ruta))
        {
            log.LogWarning("No se encuentra {Ruta}: ejecuta 'node scripts/build-residus-data.mjs' en el proyecto del gemelo", ruta);
            return;
        }
        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(ruta, ct));
        var ara = DateTimeOffset.UtcNow;
        var nous = new List<Contenidor>();
        foreach (var p in doc.RootElement.GetProperty("punts").EnumerateArray())
        {
            // [id OSM, lon, lat, fracciones (bits), soterrado]
            var osmId = p[0].GetInt64();
            var mask = p[3].GetInt32();
            var soterrat = p[4].GetInt32() == 1;
            foreach (var f in Enum.GetValues<Fraccio>())
            {
                if ((mask & (1 << (int)f)) == 0) continue;
                nous.Add(new Contenidor
                {
                    OsmId = osmId,
                    Fraccio = f,
                    Lon = p[1].GetDouble(),
                    Lat = p[2].GetDouble(),
                    Soterrat = soterrat,
                    CapacitatLitres = Capacitat(f, soterrat),
                    NivellPct = Math.Round(5 + 80 * Hash(osmId * 7 + (int)f), 1),
                    BateriaPct = Math.Round(55 + 45 * Hash(osmId * 13 + (int)f), 0),
                    UltimaLectura = ara,
                });
            }
        }
        db.Contenidors.AddRange(nous);
        await db.SaveChangesAsync(ct);
        log.LogInformation("Cargados {N} contenedores reales desde {Ruta}", nous.Count, ruta);
    }
}
