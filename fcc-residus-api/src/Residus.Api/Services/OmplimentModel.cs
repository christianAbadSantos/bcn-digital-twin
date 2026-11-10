using Residus.Api.Domain;

namespace Residus.Api.Services;

/// <summary>
/// Cuánto se llena un contenedor con el tiempo (SIMULADO, a falta de sensores reales).
/// Ritmo base por fracción y un perfil horario: de noche casi no se tira nada; por la mañana y
/// por la tarde-noche, más. Así se puede probar el planificador con datos verosímiles.
/// </summary>
public static class OmplimentModel
{
    /// <summary>Porcentaje de llenado por hora en una hora "normal" (factor horario = 1).</summary>
    public static double RitmeBase(Fraccio f) => f switch
    {
        Fraccio.Rebuig => 2.6,
        Fraccio.Organica => 2.2,
        Fraccio.Envasos => 1.8,
        Fraccio.Paper => 1.5,
        Fraccio.Vidre => 0.7,
        _ => 1.5,
    };

    /// <summary>Factor según la hora local (0–23).</summary>
    public static double FactorHorari(int hora) => hora switch
    {
        >= 0 and < 6 => 0.15,
        >= 6 and < 9 => 1.3,
        >= 9 and < 13 => 0.9,
        >= 13 and < 16 => 1.1,
        >= 16 and < 20 => 0.9,
        _ => 1.6, // 20–24: se baja la basura después de cenar
    };

    /// <summary>
    /// Nivel tras <paramref name="hores"/> horas. <paramref name="variacio"/> (≈0,6–1,4) hace que no
    /// todos los contenedores vayan al mismo ritmo. Nunca pasa de 100 % (desborda).
    /// </summary>
    public static double Avanca(double nivell, Fraccio f, int hora, double hores, double variacio = 1)
    {
        if (hores <= 0) return nivell;
        var nou = nivell + RitmeBase(f) * FactorHorari(hora) * variacio * hores;
        return Math.Clamp(nou, 0, 100);
    }

    /// <summary>Kilos aproximados que hay en un contenedor (densidad aparente por fracción).</summary>
    public static double Kg(Fraccio f, int litres, double nivellPct)
    {
        var kgPerLitre = f switch
        {
            Fraccio.Vidre => 0.30,
            Fraccio.Organica => 0.25,
            Fraccio.Rebuig => 0.12,
            Fraccio.Paper => 0.06,
            Fraccio.Envasos => 0.03,
            _ => 0.1,
        };
        return Math.Round(litres * nivellPct / 100 * kgPerLitre, 1);
    }
}
