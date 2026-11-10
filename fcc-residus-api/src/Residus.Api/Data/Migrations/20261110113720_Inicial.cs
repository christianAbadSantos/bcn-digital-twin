using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Residus.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Inicial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "contenidors",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OsmId = table.Column<long>(type: "bigint", nullable: false),
                    Fraccio = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    Lat = table.Column<double>(type: "double precision", nullable: false),
                    Lon = table.Column<double>(type: "double precision", nullable: false),
                    Soterrat = table.Column<bool>(type: "boolean", nullable: false),
                    CapacitatLitres = table.Column<int>(type: "integer", nullable: false),
                    NivellPct = table.Column<double>(type: "double precision", nullable: false),
                    BateriaPct = table.Column<double>(type: "double precision", nullable: false),
                    UltimaLectura = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UltimaRecollida = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_contenidors", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "recollides",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Fraccio = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    Inici = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Parades = table.Column<int>(type: "integer", nullable: false),
                    Km = table.Column<double>(type: "double precision", nullable: false),
                    Kg = table.Column<double>(type: "double precision", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_recollides", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "lectures",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ContenidorId = table.Column<int>(type: "integer", nullable: false),
                    Ts = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    NivellPct = table.Column<double>(type: "double precision", nullable: false),
                    TemperaturaC = table.Column<double>(type: "double precision", nullable: true),
                    BateriaPct = table.Column<double>(type: "double precision", nullable: true),
                    Rssi = table.Column<int>(type: "integer", nullable: true),
                    Font = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_lectures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_lectures_contenidors_ContenidorId",
                        column: x => x.ContenidorId,
                        principalTable: "contenidors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_contenidors_Fraccio_NivellPct",
                table: "contenidors",
                columns: new[] { "Fraccio", "NivellPct" });

            migrationBuilder.CreateIndex(
                name: "IX_contenidors_OsmId_Fraccio",
                table: "contenidors",
                columns: new[] { "OsmId", "Fraccio" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_lectures_ContenidorId_Ts",
                table: "lectures",
                columns: new[] { "ContenidorId", "Ts" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "lectures");

            migrationBuilder.DropTable(
                name: "recollides");

            migrationBuilder.DropTable(
                name: "contenidors");
        }
    }
}
