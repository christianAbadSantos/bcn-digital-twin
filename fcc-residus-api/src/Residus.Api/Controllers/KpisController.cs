using Microsoft.AspNetCore.Mvc;
using Residus.Api.Services;

namespace Residus.Api.Controllers;

[ApiController]
[Route("api/kpis")]
public class KpisController(Indicadors indicadors) : ControllerBase
{
    /// <summary>Indicadores de la operación: llenado por fracción, desbordes, lecturas, recogidas del día.</summary>
    [HttpGet]
    public Task<Kpis> Get(CancellationToken ct) => indicadors.CalculaAsync(ct);
}

/// <summary>Panel web (MVC con vistas Razor) para el centro de operaciones.</summary>
[ApiExplorerSettings(IgnoreApi = true)]
[Route("")]
public class PanelController(Indicadors indicadors, Residus.Api.Data.ResidusDb db) : Controller
{
    [HttpGet("")]
    [HttpGet("panel")]
    public async Task<IActionResult> Index(CancellationToken ct)
    {
        ViewData["Kpis"] = await indicadors.CalculaAsync(ct);
        ViewData["Bd"] = db.Database.ProviderName?.Contains("SqlServer") == true ? "SQL Server" : "PostgreSQL";
        return View(await indicadors.MesPlensAsync(25, ct));
    }
}
