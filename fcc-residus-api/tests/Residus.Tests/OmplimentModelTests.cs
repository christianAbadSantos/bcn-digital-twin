using Residus.Api.Data;
using Residus.Api.Domain;
using Residus.Api.Services;

namespace Residus.Tests;

public class OmplimentModelTests
{
    [Fact]
    public void Nunca_pasa_del_100()
    {
        var n = OmplimentModel.Avanca(95, Fraccio.Rebuig, 21, hores: 10);
        Assert.Equal(100, n);
    }

    [Fact]
    public void Sin_tiempo_no_cambia() => Assert.Equal(42, OmplimentModel.Avanca(42, Fraccio.Paper, 10, 0));

    [Fact]
    public void De_noche_se_llena_menos_que_despues_de_cenar()
    {
        var noche = OmplimentModel.Avanca(0, Fraccio.Organica, 3, 1);
        var cena = OmplimentModel.Avanca(0, Fraccio.Organica, 21, 1);
        Assert.True(cena > noche * 5);
    }

    [Fact]
    public void El_vidrio_pesa_mas_que_los_envases_al_mismo_nivel()
    {
        Assert.True(OmplimentModel.Kg(Fraccio.Vidre, 2500, 80) > OmplimentModel.Kg(Fraccio.Envasos, 2500, 80) * 5);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(123456789)]
    [InlineData(-5)]
    public void Hash_estable_entre_0_y_1(long x)
    {
        var h = Seeder.Hash(x);
        Assert.InRange(h, 0, 1);
        Assert.Equal(h, Seeder.Hash(x));
    }

    [Fact]
    public void Los_soterrados_tienen_mas_capacidad()
    {
        Assert.True(Seeder.Capacitat(Fraccio.Rebuig, soterrat: true) > Seeder.Capacitat(Fraccio.Rebuig, soterrat: false));
    }
}

public class RecollidaTests
{
    [Fact]
    public void Por_debajo_del_75_no_se_recoge() => Assert.Equal(0, OmplimentModel.ProbRecollida(60, 1));

    [Fact]
    public void Un_contenedor_desbordado_tiene_prioridad()
    {
        Assert.True(OmplimentModel.ProbRecollida(100, 0.5) > OmplimentModel.ProbRecollida(80, 0.5) * 3);
    }

    [Fact]
    public void Con_recogida_el_llenado_medio_se_mantiene_realista()
    {
        // 2.000 contenedores de resto durante 3 días simulados (pasos de media hora)
        var niveles = Enumerable.Range(0, 2000).Select(i => 80 * Residus.Api.Data.Seeder.Hash(i)).ToArray();
        long n = 0;
        for (var paso = 0; paso < 144; paso++, n++)
            for (var i = 0; i < niveles.Length; i++)
            {
                niveles[i] = OmplimentModel.Avanca(niveles[i], Residus.Api.Domain.Fraccio.Rebuig, paso / 2 % 24, 0.5, 0.6 + 0.8 * Residus.Api.Data.Seeder.Hash(i));
                if (Residus.Api.Data.Seeder.Hash(i * 7919L + n * 104729L) < OmplimentModel.ProbRecollida(niveles[i], 0.5)) niveles[i] = 2;
            }
        var desbordados = niveles.Count(x => x >= 100) / (double)niveles.Length;
        Assert.InRange(niveles.Average(), 25, 70);
        Assert.True(desbordados < 0.1, $"desbordados: {desbordados:P0}");
    }
}
