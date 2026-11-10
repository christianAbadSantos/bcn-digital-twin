using Microsoft.EntityFrameworkCore;
using Residus.Api.Domain;

namespace Residus.Api.Data;

public class ResidusDb(DbContextOptions<ResidusDb> options) : DbContext(options)
{
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
