using Residus.Api.Services;

namespace Residus.Tests;

public class PlanificadorRutesTests
{
    private static readonly (double Lat, double Lon) Base = (41.344, 2.136);

    [Fact]
    public void Sin_contenedores_no_hay_viajes()
    {
        var pla = PlanificadorRutes.Planifica(Base, [], 9000);
        Assert.Empty(pla.Viatges);
        Assert.Equal(0, pla.KmTotal);
    }

    [Fact]
    public void Visita_todos_los_contenedores_una_sola_vez()
    {
        var punts = Enumerable.Range(1, 40).Select(i => new Punt(i, 41.37 + i * 0.001, 2.15 + (i % 7) * 0.002, 100)).ToList();
        var pla = PlanificadorRutes.Planifica(Base, punts, 9000);
        var visitats = pla.Viatges.SelectMany(v => v.Parades).Select(p => p.Id).ToList();
        Assert.Equal(40, visitats.Count);
        Assert.Equal(40, visitats.Distinct().Count());
    }

    [Fact]
    public void Parte_en_varios_viajes_si_el_camion_se_llena()
    {
        var punts = Enumerable.Range(1, 10).Select(i => new Punt(i, 41.38, 2.15 + i * 0.001, 2500)).ToList();
        var pla = PlanificadorRutes.Planifica(Base, punts, 9000);
        Assert.Equal(4, pla.Viatges.Count);               // caben 3 por viaje: 3 + 3 + 3 + 1
        Assert.All(pla.Viatges, v => Assert.True(v.Kg <= 9000));
    }

    [Fact]
    public void Un_contenedor_mas_pesado_que_el_camion_va_solo()
    {
        var pla = PlanificadorRutes.Planifica(Base, [new Punt(1, 41.38, 2.15, 12000)], 9000);
        Assert.Single(pla.Viatges);
        Assert.Single(pla.Viatges[0].Parades);
    }

    [Fact]
    public void DosOpt_no_empeora_y_deshace_un_cruce()
    {
        // cuatro esquinas visitadas en orden cruzado (1 → 3 → 2 → 4)
        var cruzada = new List<Punt>
        {
            new(1, 41.36, 2.14, 0), new(3, 41.37, 2.15, 0), new(2, 41.36, 2.15, 0), new(4, 41.37, 2.14, 0),
        };
        var antes = PlanificadorRutes.LongitudKm(Base, cruzada);
        var despues = PlanificadorRutes.LongitudKm(Base, PlanificadorRutes.DosOpt(Base, cruzada));
        Assert.True(despues < antes);
    }

    [Fact]
    public void Distancia_conocida_aproximada()
    {
        // Plaça Catalunya → Sagrada Família: ~2,0 km en línea recta, ×1,3 por calle
        var km = PlanificadorRutes.DistKm(41.3870, 2.1700, 41.4036, 2.1744);
        Assert.InRange(km, 2.2, 2.6);
    }

    [Fact]
    public void Capacidad_invalida_lanza_excepcion() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => PlanificadorRutes.Planifica(Base, [], 0));
}
