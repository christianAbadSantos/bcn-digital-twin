using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Residus.Api.Data;
using Residus.Api.Services;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<OpcionsOperacio>(builder.Configuration.GetSection("Operacio"));
builder.Services.Configure<OpcionsSimulador>(builder.Configuration.GetSection("Simulador"));
builder.Services.Configure<OpcionsDades>(builder.Configuration.GetSection("Dades"));

// PostgreSQL con EF Core (Npgsql). La contraseña va en user-secrets o en variables de entorno, nunca en el repo.
var cs = builder.Configuration.GetConnectionString("Residus")
    ?? throw new InvalidOperationException("Falta ConnectionStrings:Residus (dotnet user-secrets set ...)");
builder.Services.AddDbContext<ResidusDb>(o => o.UseNpgsql(cs));

builder.Services.AddScoped<Seeder>();
builder.Services.AddScoped<Indicadors>();
builder.Services.AddHostedService<SimuladorSensors>();

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
app.UseCors();
app.MapOpenApi();
app.MapScalarApiReference(o => o.WithTitle("Residus BCN · API"));
app.MapControllers();
app.MapGet("/health", async (ResidusDb db) => Results.Ok(new { ok = await db.Database.CanConnectAsync(), contenidors = await db.Contenidors.CountAsync() }));

app.Run();

// para los tests de integración (WebApplicationFactory)
public partial class Program;
