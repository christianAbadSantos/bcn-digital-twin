# Imagen de la API para la nube (Hugging Face Spaces, Render, Azure…).
# Contexto: la carpeta fcc-residus-api, con data/residus.json copiado desde public/data del gemelo
# (lo hace scripts/prepare-hf-space.mjs).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/Residus.Api/Residus.Api.csproj src/Residus.Api/
RUN dotnet restore src/Residus.Api/Residus.Api.csproj
COPY src/ src/
RUN dotnet publish src/Residus.Api/Residus.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
COPY data/residus.json /app/data/residus.json
# Hugging Face Spaces expone el puerto 7860. La cadena de conexión llega como secreto:
# ConnectionStrings__Residus = postgresql://usuario:clave@host/bd?sslmode=require
ENV ASPNETCORE_HTTP_PORTS=7860 \
    ASPNETCORE_ENVIRONMENT=Production \
    Dades__Fitxer=/app/data/residus.json \
    Simulador__PausaSenseUsMinuts=10 \
    Simulador__FraccioLectures=0.01 \
    Simulador__RetencioHores=12
EXPOSE 7860
ENTRYPOINT ["dotnet", "Residus.Api.dll"]
