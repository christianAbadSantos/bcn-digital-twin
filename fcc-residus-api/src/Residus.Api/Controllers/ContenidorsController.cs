using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Residus.Api.Data;
using Residus.Api.Domain;

namespace Residus.Api.Controllers;

/// <summary>Contenedor con su último estado (formato compacto para el mapa).</summary>
public record ContenidorDto(int Id, long OsmId, Fraccio Fraccio, double Lat, double Lon, bool Soterrat, int CapacitatLitres, double NivellPct, double BateriaPct, DateTimeOffset? UltimaLectura);

public record LecturaDto(DateTimeOffset Ts, double NivellPct, double? TemperaturaC, double? BateriaPct, int? Rssi, string Font);

[ApiController]
[Route("api/contenidors")]
public class ContenidorsController(ResidusDb db) : ControllerBase
{
    /// <summary>Contenedores filtrados por fracción, nivel mínimo y zona (sur, oeste, norte, este).</summary>
    [HttpGet]
    public async Task<IEnumerable<ContenidorDto>> Get(
        [FromQuery] Fraccio? fraccio,
        [FromQuery] double? minNivell,
        [FromQuery] string? bbox,
        [FromQuery] int limit = 10000,
        CancellationToken ct = default)
    {
        var q = db.Contenidors.AsNoTracking();
        if (fraccio is not null) q = q.Where(c => c.Fraccio == fraccio);
        if (minNivell is not null) q = q.Where(c => c.NivellPct >= minNivell);
        if (!string.IsNullOrWhiteSpace(bbox))
        {
            var b = bbox.Split(',').Select(x => double.Parse(x, System.Globalization.CultureInfo.InvariantCulture)).ToArray();
            if (b.Length == 4) q = q.Where(c => c.Lat >= b[0] && c.Lon >= b[1] && c.Lat <= b[2] && c.Lon <= b[3]);
        }
        return await q.OrderByDescending(c => c.NivellPct)
            .Take(Math.Clamp(limit, 1, 20000))
            .Select(c => new ContenidorDto(c.Id, c.OsmId, c.Fraccio, c.Lat, c.Lon, c.Soterrat, c.CapacitatLitres, c.NivellPct, c.BateriaPct, c.UltimaLectura))
            .ToListAsync(ct);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ContenidorDto>> GetOne(int id, CancellationToken ct)
    {
        var c = await db.Contenidors.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        return c is null ? NotFound() : new ContenidorDto(c.Id, c.OsmId, c.Fraccio, c.Lat, c.Lon, c.Soterrat, c.CapacitatLitres, c.NivellPct, c.BateriaPct, c.UltimaLectura);
    }

    /// <summary>Histórico de lecturas del sensor de un contenedor.</summary>
    [HttpGet("{id:int}/lectures")]
    public async Task<ActionResult<IEnumerable<LecturaDto>>> Lectures(int id, [FromQuery] int hores = 24, CancellationToken ct = default)
    {
        if (!await db.Contenidors.AnyAsync(c => c.Id == id, ct)) return NotFound();
        var desde = DateTimeOffset.UtcNow.AddHours(-Math.Clamp(hores, 1, 168));
        return await db.Lectures.AsNoTracking()
            .Where(l => l.ContenidorId == id && l.Ts >= desde)
            .OrderBy(l => l.Ts)
            .Select(l => new LecturaDto(l.Ts, l.NivellPct, l.TemperaturaC, l.BateriaPct, l.Rssi, l.Font))
            .ToListAsync(ct);
    }
}
