using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Residus.Api.Data;
using Residus.Api.Domain;
using Residus.Api.Services;

namespace Residus.Api.Controllers;

public record ParadaDto(int Id, double Lat, double Lon, double Kg, double NivellPct);
public record ViatgeDto(IReadOnlyList<ParadaDto> Parades, double Km, double Kg);
public record PropostaDto(Fraccio Fraccio, double LlindarPct, string Base, double BaseLat, double BaseLon, double CapacitatCamioKg, int Parades, double KmTotal, double KgTotal, double Minuts, IReadOnlyList<ViatgeDto> Viatges);
public record Completar(Fraccio Fraccio, IReadOnlyList<int> ContenidorIds, double Km);

/// <summary>Planificación de la recogida: qué contenedores vaciar y en qué orden.</summary>
[ApiController]
[Route("api/rutes")]
public class RutesController(ResidusDb db, IOptions<OpcionsOperacio> opcions) : ControllerBase
{
    /// <summary>
    /// Ruta propuesta para una fracción: contenedores por encima del umbral, desde la base de la Zona
    /// Franca, en tantos viajes como haga falta según la capacidad del camión.
    /// </summary>
    [HttpGet("proposta")]
    public async Task<PropostaDto> Proposta([FromQuery] Fraccio fraccio = Fraccio.Rebuig, [FromQuery] double? llindar = null, [FromQuery] int max = 120, CancellationToken ct = default)
    {
        var o = opcions.Value;
        var ll = llindar ?? o.LlindarPct;
        var cands = await db.Contenidors.AsNoTracking()
            .Where(c => c.Fraccio == fraccio && c.NivellPct >= ll)
            .OrderByDescending(c => c.NivellPct)
            .Take(Math.Clamp(max, 1, 400))
            .ToListAsync(ct);
        var nivells = cands.ToDictionary(c => c.Id, c => c.NivellPct);
        var punts = cands.Select(c => new Punt(c.Id, c.Lat, c.Lon, OmplimentModel.Kg(c.Fraccio, c.CapacitatLitres, c.NivellPct)));
        var pla = PlanificadorRutes.Planifica((o.BaseLat, o.BaseLon), punts, o.CapacitatCamioKg);
        return new PropostaDto(fraccio, ll, o.BaseNom, o.BaseLat, o.BaseLon, o.CapacitatCamioKg, pla.Parades, pla.KmTotal, pla.KgTotal, pla.Minuts,
            pla.Viatges.Select(v => new ViatgeDto(v.Parades.Select(p => new ParadaDto(p.Id, p.Lat, p.Lon, p.Kg, nivells[p.Id])).ToList(), v.Km, v.Kg)).ToList());
    }

    /// <summary>Marca una ruta como hecha: vacía sus contenedores y la guarda para los indicadores.</summary>
    [HttpPost("completar")]
    public async Task<IActionResult> Completa(Completar req, CancellationToken ct)
    {
        if (req.ContenidorIds.Count == 0) return BadRequest(new { error = "La ruta no tiene contenedores" });
        var cs = await db.Contenidors.Where(c => req.ContenidorIds.Contains(c.Id) && c.Fraccio == req.Fraccio).ToListAsync(ct);
        var ara = DateTimeOffset.UtcNow;
        var kg = cs.Sum(c => OmplimentModel.Kg(c.Fraccio, c.CapacitatLitres, c.NivellPct));
        foreach (var c in cs)
        {
            c.NivellPct = 0;
            c.UltimaRecollida = ara;
        }
        db.Recollides.Add(new Recollida { Fraccio = req.Fraccio, Inici = ara, Parades = cs.Count, Km = Math.Round(req.Km, 2), Kg = Math.Round(kg, 1) });
        await db.SaveChangesAsync(ct);
        return Ok(new { buidats = cs.Count, kg = Math.Round(kg, 1) });
    }
}
