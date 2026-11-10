namespace Residus.Api.Services;

public record Punt(int Id, double Lat, double Lon, double Kg);

public record Viatge(IReadOnlyList<Punt> Parades, double Km, double Kg);

public record PlaRuta(IReadOnlyList<Viatge> Viatges, double KmTotal, double KgTotal, double Minuts)
{
    public int Parades => Viatges.Sum(v => v.Parades.Count);
}

/// <summary>
/// Planifica la recogida de los contenedores que superan el umbral: sale de la base, visita las
/// paradas y vuelve a descargar cuando el camión se llena (varios viajes). Heurística clásica de
/// vecino más próximo + mejora 2-opt en cada viaje. Distancia por calle ≈ distancia recta × 1,3.
/// </summary>
public static class PlanificadorRutes
{
    public const double FactorCarrer = 1.3;    // rodeo de la red viaria del Eixample respecto a la recta
    public const double VelocitatKmH = 18;     // camión en ciudad
    public const double MinutsParada = 1.5;    // levantar, vaciar y bajar un contenedor

    public static double DistKm(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 6371;
        double rad(double d) => d * Math.PI / 180;
        var dLat = rad(lat2 - lat1);
        var dLon = rad(lon2 - lon1);
        var a = Math.Pow(Math.Sin(dLat / 2), 2) + Math.Cos(rad(lat1)) * Math.Cos(rad(lat2)) * Math.Pow(Math.Sin(dLon / 2), 2);
        return 2 * R * Math.Asin(Math.Sqrt(a)) * FactorCarrer;
    }

    public static PlaRuta Planifica((double Lat, double Lon) base_, IEnumerable<Punt> punts, double capacitatKg)
    {
        if (capacitatKg <= 0) throw new ArgumentOutOfRangeException(nameof(capacitatKg));
        var pendents = punts.ToList();
        var viatges = new List<Viatge>();

        while (pendents.Count > 0)
        {
            // vecino más próximo mientras quepa en el camión
            var viatge = new List<Punt>();
            double kg = 0, lat = base_.Lat, lon = base_.Lon;
            while (true)
            {
                Punt? millor = null;
                var dMillor = double.MaxValue;
                foreach (var p in pendents)
                {
                    if (kg + p.Kg > capacitatKg && viatge.Count > 0) continue;
                    var d = DistKm(lat, lon, p.Lat, p.Lon);
                    if (d < dMillor) { dMillor = d; millor = p; }
                }
                if (millor is null) break;
                viatge.Add(millor);
                pendents.Remove(millor);
                kg += millor.Kg;
                (lat, lon) = (millor.Lat, millor.Lon);
            }
            var ordenat = DosOpt(base_, viatge);
            viatges.Add(new Viatge(ordenat, Math.Round(LongitudKm(base_, ordenat), 2), Math.Round(kg, 1)));
        }

        var km = viatges.Sum(v => v.Km);
        var parades = viatges.Sum(v => v.Parades.Count);
        var minuts = km / VelocitatKmH * 60 + parades * MinutsParada;
        return new PlaRuta(viatges, Math.Round(km, 2), Math.Round(viatges.Sum(v => v.Kg), 1), Math.Round(minuts));
    }

    /// <summary>Longitud de base → paradas → base.</summary>
    public static double LongitudKm((double Lat, double Lon) b, IReadOnlyList<Punt> r)
    {
        if (r.Count == 0) return 0;
        var km = DistKm(b.Lat, b.Lon, r[0].Lat, r[0].Lon) + DistKm(r[^1].Lat, r[^1].Lon, b.Lat, b.Lon);
        for (var i = 0; i < r.Count - 1; i++) km += DistKm(r[i].Lat, r[i].Lon, r[i + 1].Lat, r[i + 1].Lon);
        return km;
    }

    /// <summary>2-opt: invierte tramos mientras el recorrido se acorte.</summary>
    public static List<Punt> DosOpt((double Lat, double Lon) b, List<Punt> ruta, int maxPasses = 20)
    {
        var r = new List<Punt>(ruta);
        if (r.Count < 3) return r;
        var millora = true;
        for (var pass = 0; millora && pass < maxPasses; pass++)
        {
            millora = false;
            for (var i = 0; i < r.Count - 1; i++)
            {
                for (var k = i + 1; k < r.Count; k++)
                {
                    // aristas (i-1 → i) y (k → k+1), con la base en los extremos
                    var (aLat, aLon) = i == 0 ? b : (r[i - 1].Lat, r[i - 1].Lon);
                    var (dLat, dLon) = k == r.Count - 1 ? b : (r[k + 1].Lat, r[k + 1].Lon);
                    var abans = DistKm(aLat, aLon, r[i].Lat, r[i].Lon) + DistKm(r[k].Lat, r[k].Lon, dLat, dLon);
                    var despres = DistKm(aLat, aLon, r[k].Lat, r[k].Lon) + DistKm(r[i].Lat, r[i].Lon, dLat, dLon);
                    if (despres + 1e-9 < abans)
                    {
                        r.Reverse(i, k - i + 1);
                        millora = true;
                    }
                }
            }
        }
        return r;
    }
}
