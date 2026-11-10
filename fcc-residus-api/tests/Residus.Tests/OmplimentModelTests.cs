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
