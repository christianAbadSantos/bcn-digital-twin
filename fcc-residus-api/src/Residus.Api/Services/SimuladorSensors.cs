using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Residus.Api.Data;
using Residus.Api.Domain;

namespace Residus.Api.Services;

/// <summary>
/// Servicio en segundo plano que simula los sensores de llenado: en cada tick avanza el nivel de
/// todos los contenedores (según <see cref="OmplimentModel"/>) y una parte envía su lectura, como
/// harían sensores LoRaWAN reales. Las lecturas antiguas se borran para no llenar la base de datos.
/// </summary>
public class SimuladorSensors(IServiceScopeFactory scopes, IOptions<OpcionsSimulador> opcions, Activitat activitat, ILogger<SimuladorSensors> log) : BackgroundService
{
    private static readonly TimeZoneInfo Bcn = TimeZoneInfo.FindSystemTimeZoneById("Europe/Madrid");

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var o = opcions.Value;
        if (!o.Actiu) return;
        var tick = TimeSpan.FromSeconds(Math.Max(2, o.TickSegons));
        var n = 0L;
        using var timer = new PeriodicTimer(tick);
        while (await timer.WaitForNextTickAsync(ct))
        {
            // sin visitas en un rato → en pausa (la base de datos puede dormirse)
            if (o.PausaSenseUsMinuts > 0 && activitat.DesDeUltima > TimeSpan.FromMinutes(o.PausaSenseUsMinuts)) continue;
            try
            {
                await TickAsync(tick.TotalHours * o.Acceleracio, o, n++, ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Error en el simulador de sensores");
            }
        }
    }

    private async Task TickAsync(double hores, OpcionsSimulador o, long n, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ResidusDb>();
        var ara = DateTimeOffset.UtcNow;
        var hora = TimeZoneInfo.ConvertTime(ara, Bcn).Hour;
        var contenidors = await db.Contenidors.ToListAsync(ct);
        foreach (var c in contenidors)
        {
            var variacio = 0.6 + 0.8 * Seeder.Hash(c.Id);
            c.NivellPct = Math.Round(OmplimentModel.Avanca(c.NivellPct, c.Fraccio, hora, hores, variacio), 1);
            // cada contenedor informa más o menos cada 1/FraccioLectures ticks
            if (Seeder.Hash(c.Id * 31 + n) < o.FraccioLectures)
            {
                c.BateriaPct = Math.Max(5, Math.Round(c.BateriaPct - 0.01, 2));
                c.UltimaLectura = ara;
                db.Lectures.Add(new Lectura
                {
                    ContenidorId = c.Id,
                    Ts = ara,
                    NivellPct = c.NivellPct,
                    BateriaPct = c.BateriaPct,
                    TemperaturaC = Math.Round(16 + 8 * Seeder.Hash(c.Id + n), 1),
                    Rssi = -70 - (int)(45 * Seeder.Hash(c.Id * 3)),
                    Font = "simulador",
                });
            }
        }
        await db.SaveChangesAsync(ct);
        if (n % 40 == 0)
        {
            var limit = ara.AddHours(-o.RetencioHores);
            await db.Lectures.Where(l => l.Ts < limit).ExecuteDeleteAsync(ct);
        }
    }
}
