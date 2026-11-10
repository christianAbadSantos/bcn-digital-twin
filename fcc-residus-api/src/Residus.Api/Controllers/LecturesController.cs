using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Residus.Api.Data;
using Residus.Api.Domain;

namespace Residus.Api.Controllers;

public record NovaLectura([Range(1, int.MaxValue)] int ContenidorId, [Range(0, 100)] double NivellPct, double? TemperaturaC, [Range(0, 100)] double? BateriaPct, int? Rssi);

/// <summary>
/// Entrada de lecturas de los sensores de llenado. Además del formato propio, acepta directamente el
/// webhook de The Things Stack (LoRaWAN), como llegaría de sensores reales.
/// </summary>
[ApiController]
[Route("api/lectures")]
public class LecturesController(ResidusDb db) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Post(NovaLectura l, CancellationToken ct)
    {
        var ok = await Guarda(l.ContenidorId, l.NivellPct, l.TemperaturaC, l.BateriaPct, l.Rssi, "api", ct);
        return ok ? Accepted() : NotFound(new { error = $"No existe el contenedor {l.ContenidorId}" });
    }

    /// <summary>
    /// Webhook de The Things Stack v3: device_id "cont-{id}" y decoded_payload con
    /// { "nivell": 0-100, "temperatura": °C, "bateria": % }.
    /// </summary>
    [HttpPost("ttn")]
    public async Task<IActionResult> Ttn([FromBody] JsonElement uplink, CancellationToken ct)
    {
        try
        {
            var device = uplink.GetProperty("end_device_ids").GetProperty("device_id").GetString() ?? "";
            if (!device.StartsWith("cont-") || !int.TryParse(device[5..], out var id))
                return BadRequest(new { error = "device_id debe ser 'cont-{id}'" });
            var msg = uplink.GetProperty("uplink_message");
            var p = msg.GetProperty("decoded_payload");
            double? opt(string k) => p.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;
            var nivell = opt("nivell");
            if (nivell is null or < 0 or > 100) return BadRequest(new { error = "decoded_payload.nivell (0-100) es obligatorio" });
            int? rssi = msg.TryGetProperty("rx_metadata", out var rx) && rx.GetArrayLength() > 0 && rx[0].TryGetProperty("rssi", out var r) ? r.GetInt32() : null;
            var ok = await Guarda(id, nivell.Value, opt("temperatura"), opt("bateria"), rssi, "ttn", ct);
            return ok ? Accepted() : NotFound(new { error = $"No existe el contenedor {id}" });
        }
        catch (KeyNotFoundException e)
        {
            return BadRequest(new { error = $"Uplink incompleto: {e.Message}" });
        }
    }

    private async Task<bool> Guarda(int id, double nivell, double? temp, double? bateria, int? rssi, string font, CancellationToken ct)
    {
        var c = await db.Contenidors.FindAsync([id], ct);
        if (c is null) return false;
        var ara = DateTimeOffset.UtcNow;
        c.NivellPct = Math.Round(nivell, 1);
        if (bateria is not null) c.BateriaPct = Math.Round(bateria.Value, 1);
        c.UltimaLectura = ara;
        db.Lectures.Add(new Lectura { ContenidorId = id, Ts = ara, NivellPct = c.NivellPct, TemperaturaC = temp, BateriaPct = bateria, Rssi = rssi, Font = font });
        await db.SaveChangesAsync(ct);
        return true;
    }
}
