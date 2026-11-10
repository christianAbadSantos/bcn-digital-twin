using Microsoft.EntityFrameworkCore;
using Residus.Api.Data;
using Residus.Api.Domain;

namespace Residus.Api.Services;

public record KpiFraccio(Fraccio Fraccio, int Contenidors, double NivellMitja, int PlensMes80, int Desbordats, double KgEstimats);

public record Kpis(int Contenidors, int Plens, int Desbordats, int BateriaBaixa, int LecturesUltimaHora, int RecollidesAvui, double KgRecollitsAvui, IReadOnlyList<KpiFraccio> PerFraccio, DateTimeOffset Ts);

/// <summary>Indicadores de operación (los usan la API JSON y el panel MVC).</summary>
public class Indicadors(ResidusDb db)
{
    public async Task<Kpis> CalculaAsync(CancellationToken ct = default)
    {
        var ara = DateTimeOffset.UtcNow;
        var per = await db.Contenidors.AsNoTracking()
            .GroupBy(c => c.Fraccio)
            .Select(g => new
            {
                Fraccio = g.Key,
                N = g.Count(),
                Mitja = g.Average(c => c.NivellPct),
                Plens = g.Count(c => c.NivellPct >= 80),
                Desb = g.Count(c => c.NivellPct >= 100),
                Litres = g.Sum(c => c.CapacitatLitres * c.NivellPct / 100),
            })
            .ToListAsync(ct);
        var perFraccio = per
            .OrderBy(x => x.Fraccio)
            .Select(x => new KpiFraccio(x.Fraccio, x.N, Math.Round(x.Mitja, 1), x.Plens, x.Desb, Math.Round(OmplimentModel.Kg(x.Fraccio, (int)Math.Round(x.Litres), 100))))
            .ToList();
        var avui = new DateTimeOffset(ara.UtcDateTime.Date, TimeSpan.Zero);
        var rec = await db.Recollides.AsNoTracking().Where(r => r.Inici >= avui).ToListAsync(ct);
        return new Kpis(
            perFraccio.Sum(x => x.Contenidors),
            perFraccio.Sum(x => x.PlensMes80),
            perFraccio.Sum(x => x.Desbordats),
            await db.Contenidors.CountAsync(c => c.BateriaPct < 20, ct),
            await db.Lectures.CountAsync(l => l.Ts >= ara.AddHours(-1), ct),
            rec.Count,
            Math.Round(rec.Sum(r => r.Kg)),
            perFraccio,
            ara);
    }

    /// <summary>Los contenedores más llenos (para el panel).</summary>
    public Task<List<Contenidor>> MesPlensAsync(int n, CancellationToken ct = default) =>
        db.Contenidors.AsNoTracking().OrderByDescending(c => c.NivellPct).ThenBy(c => c.Id).Take(n).ToListAsync(ct);
}
