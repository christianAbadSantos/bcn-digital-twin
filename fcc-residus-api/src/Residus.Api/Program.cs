using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Residus.Api.Data;
using Residus.Api.Services;
using Scalar.AspNetCore;

// números y fechas en formato español en el panel MVC (7.495, no 7,495)
System.Globalization.CultureInfo.DefaultThreadCurrentCulture = new("es-ES");
System.Globalization.CultureInfo.DefaultThreadCurrentUICulture = new("es-ES");

var builder = WebApplication.CreateBuilder(args);

// En el hosting (IIS) la cadena de conexión con la contraseña va en appsettings.Secrets.json, que solo
// existe en el servidor (archivo protegido: los despliegues desde Git no lo tocan) y nunca en el repositorio.
builder.Configuration.AddJsonFile("appsettings.Secrets.json", optional: true, reloadOnChange: false);

builder.Services.Configure<OpcionsOperacio>(builder.Configuration.GetSection("Operacio"));
builder.Services.Configure<OpcionsSimulador>(builder.Configuration.GetSection("Simulador"));
builder.Services.Configure<OpcionsDades>(builder.Configuration.GetSection("Dades"));

// PostgreSQL con EF Core (Npgsql). La contraseña va en user-secrets o en variables de entorno, nunca en el repo.
// Acepta también el formato URL de los proveedores en la nube (postgresql://usuario:clave@host/bd?sslmode=require).
var cs = Connexio.Normalitza(builder.Configuration.GetConnectionString("Residus")
    ?? throw new InvalidOperationException("Falta ConnectionStrings:Residus (dotnet user-secrets set ...)"));
// mismo modelo con PostgreSQL (por defecto) o SQL Server (Database:Provider = SqlServer)
if (Connexio.EsSqlServer(builder.Configuration["Database:Provider"], cs))
    builder.Services.AddDbContext<ResidusDb, ResidusDbSqlServer>(o => o.UseSqlServer(cs, sql => sql.EnableRetryOnFailure(3)));
else
    builder.Services.AddDbContext<ResidusDb>(o => o.UseNpgsql(cs, npg => npg.EnableRetryOnFailure(3)));

builder.Services.AddScoped<Seeder>();
builder.Services.AddScoped<Indicadors>();
builder.Services.AddSingleton<Activitat>();
builder.Services.AddHostedService<SimuladorSensors>();

// respuestas comprimidas y una caché corta: varias visitas a la vez no multiplican las consultas
builder.Services.AddResponseCompression(o => o.EnableForHttps = true);
builder.Services.AddOutputCache(o => o.AddBasePolicy(p => p.Expire(TimeSpan.FromSeconds(10))));

builder.Services.AddControllersWithViews()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

// el gemelo digital (Vite en local o la web publicada) consulta esta API desde el navegador
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origens").Get<string[]>() ?? ["http://localhost:5173"])
    .AllowAnyHeader()
    .WithMethods("GET", "POST")));

var app = builder.Build();

// aplica las migraciones y carga los contenedores reales la primera vez
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ResidusDb>();
    await db.Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<Seeder>().SeedAsync();
}

app.UseExceptionHandler();
app.UseResponseCompression();
app.Use((ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api") || ctx.Request.Path.StartsWithSegments("/panel") || ctx.Request.Path == "/")
        ctx.RequestServices.GetRequiredService<Activitat>().Marca();
    return next(ctx);
});
app.UseCors();
app.UseOutputCache();
app.MapOpenApi();
app.MapScalarApiReference(o => o.WithTitle("Residus BCN · API"));
app.MapControllers();
app.MapGet("/health", async (ResidusDb db) => Results.Ok(new { ok = await db.Database.CanConnectAsync(), contenidors = await db.Contenidors.CountAsync() }));

app.Run();

// para los tests de integración (WebApplicationFactory)
public partial class Program;

/// <summary>Convierte una URL postgresql://… (Neon, Render, Supabase) en una cadena de conexión de Npgsql.</summary>
public static class Connexio
{
    /// <summary>SQL Server si se pide explícitamente o si la cadena tiene la forma típica de SQL Server.</summary>
    public static bool EsSqlServer(string? provider, string cs) =>
        string.Equals(provider, "SqlServer", StringComparison.OrdinalIgnoreCase)
        || (provider is null && (cs.Contains("Data Source=", StringComparison.OrdinalIgnoreCase) || cs.Contains("Initial Catalog=", StringComparison.OrdinalIgnoreCase)));

    public static string Normalitza(string cs)
    {
        if (!cs.StartsWith("postgres://") && !cs.StartsWith("postgresql://")) return cs;
        var u = new Uri(cs);
        var userInfo = u.UserInfo.Split(':', 2);
        var q = System.Web.HttpUtility.ParseQueryString(u.Query);
        var ssl = (q["sslmode"] ?? "require").ToLowerInvariant() switch { "disable" => "Disable", "verify-full" => "VerifyFull", _ => "Require" };
        return $"Host={u.Host};Port={(u.Port > 0 ? u.Port : 5432)};Database={u.AbsolutePath.TrimStart('/')};" +
               $"Username={Uri.UnescapeDataString(userInfo[0])};Password={Uri.UnescapeDataString(userInfo.ElementAtOrDefault(1) ?? "")};" +
               $"SSL Mode={ssl};Pooling=true;Maximum Pool Size=10";
    }
}
