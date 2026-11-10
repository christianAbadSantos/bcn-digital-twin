namespace Residus.Api.Services;

/// <summary>Configuración de la operación (appsettings.json → "Operacio").</summary>
public class OpcionsOperacio
{
    /// <summary>Base de los camiones en la Zona Franca (ubicación aproximada).</summary>
    public double BaseLat { get; set; } = 41.3440;
    public double BaseLon { get; set; } = 2.1360;
    public string BaseNom { get; set; } = "Base Zona Franca";
    public double CapacitatCamioKg { get; set; } = 9000;
    /// <summary>A partir de este nivel (%) un contenedor entra en la ruta.</summary>
    public double LlindarPct { get; set; } = 80;
}

/// <summary>Simulador de sensores (appsettings.json → "Simulador").</summary>
public class OpcionsSimulador
{
    public bool Actiu { get; set; } = true;
    public int TickSegons { get; set; } = 15;
    /// <summary>Horas simuladas por hora real (60 = cada minuto real es una hora).</summary>
    public double Acceleracio { get; set; } = 60;
    /// <summary>Parte de los contenedores que envía lectura en cada tick (el resto solo avanza).</summary>
    public double FraccioLectures { get; set; } = 0.05;
    public int RetencioHores { get; set; } = 48;
}

/// <summary>Datos iniciales (appsettings.json → "Dades").</summary>
public class OpcionsDades
{
    /// <summary>Fichero con los puntos reales de contenedores (generado por scripts/build-residus-data.mjs).</summary>
    public string Fitxer { get; set; } = "../../../public/data/residus.json";
}
