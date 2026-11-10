namespace Residus.Tests;

public class ConnexioTests
{
    [Fact]
    public void Convierte_una_url_de_neon()
    {
        var cs = Connexio.Normalitza("postgresql://usuari:cl%40u@ep-x-123.eu-central-1.aws.neon.tech/residus?sslmode=require");
        Assert.Contains("Host=ep-x-123.eu-central-1.aws.neon.tech", cs);
        Assert.Contains("Port=5432", cs);
        Assert.Contains("Database=residus", cs);
        Assert.Contains("Username=usuari", cs);
        Assert.Contains("Password=cl@u", cs);
        Assert.Contains("SSL Mode=Require", cs);
    }

    [Fact]
    public void Deja_igual_una_cadena_clasica()
    {
        const string cs = "Host=localhost;Database=fcc_residus;Username=postgres";
        Assert.Equal(cs, Connexio.Normalitza(cs));
    }
}
