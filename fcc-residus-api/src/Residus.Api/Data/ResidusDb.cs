using Microsoft.EntityFrameworkCore;
using Residus.Api.Domain;

namespace Residus.Api.Data;

/// <summary>
/// Contexto de EF Core. El mismo modelo funciona con PostgreSQL (este contexto, migraciones en
/// Data/Migrations) y con SQL Server (<see cref="ResidusDbSqlServer"/>, migraciones en Data/MigrationsSqlServer).
/// </summary>
public class ResidusDb : DbContext
{
    public ResidusDb(DbContextOptions<ResidusDb> options) : base(options) { }
    protected ResidusDb(DbContextOptions options) : base(options) { }

    public DbSet<Contenidor> Contenidors => Set<Contenidor>();
    public DbSet<Lectura> Lectures => Set<Lectura>();
    public DbSet<Recollida> Recollides => Set<Recollida>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Contenidor>(e =>
        {
            e.ToTable("contenidors");
            e.Property(x => x.Fraccio).HasConversion<string>().HasMaxLength(12);
            e.HasIndex(x => new { x.OsmId, x.Fraccio }).IsUnique(); // un contenedor por fracción y punto
            e.HasIndex(x => new { x.Fraccio, x.NivellPct });        // "los más llenos de cada fracción"
        });
        b.Entity<Lectura>(e =>
        {
            e.ToTable("lectures");
            e.Property(x => x.Font).HasMaxLength(16);
            e.HasIndex(x => new { x.ContenidorId, x.Ts });           // serie temporal de un contenedor
            e.HasOne(x => x.Contenidor).WithMany(c => c.Lectures).HasForeignKey(x => x.ContenidorId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<Recollida>(e =>
        {
            e.ToTable("recollides");
            e.Property(x => x.Fraccio).HasConversion<string>().HasMaxLength(12);
        });
    }
}

/// <summary>Mismo modelo sobre SQL Server (con sus propias migraciones).</summary>
public class ResidusDbSqlServer(DbContextOptions<ResidusDbSqlServer> options) : ResidusDb(options);

/// <summary>Para "dotnet ef migrations add … --context ResidusDbSqlServer" (no se conecta a ninguna base de datos).</summary>
public class ResidusDbSqlServerFactory : Microsoft.EntityFrameworkCore.Design.IDesignTimeDbContextFactory<ResidusDbSqlServer>
{
    public ResidusDbSqlServer CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<ResidusDbSqlServer>().UseSqlServer("Server=localhost;Database=fcc_residus;Trusted_Connection=True;TrustServerCertificate=True").Options);
}

/// <summary>Para "dotnet ef migrations add … --context ResidusDb" (PostgreSQL; no se conecta a ninguna base de datos).</summary>
public class ResidusDbFactory : Microsoft.EntityFrameworkCore.Design.IDesignTimeDbContextFactory<ResidusDb>
{
    public ResidusDb CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<ResidusDb>().UseNpgsql("Host=localhost;Database=fcc_residus;Username=postgres").Options);
}
