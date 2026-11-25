# Spec · Obra 4D/5D en el CDE

## Problema

El CDE enseña el modelo tal como está diseñado, pero no cómo avanza la obra. En ejecución hace falta ver, en el mismo modelo IFC:

- qué está construido en cada fecha (4D);
- cuánto se ha gastado frente a lo previsto (5D);
- qué dicen los sensores de obra.

La referencia es un *construction timelapse* hecho con ArcGIS sobre un IFC 4x3: deslizador de tiempo, coste frente a presupuesto, sensores de vibración y de temperatura del hormigón, y lluvia. Aquí se hace con lo que ya tiene el proyecto, sin ArcGIS.

## Solución

Una pestaña **Obra 4D/5D** en el CDE con el visor de That Open:

1. **Plan de obra derivado del modelo.** Cada elemento ya lleva su fase (`03_01_PdE_Fase Obra`), su planta (`01_02_PdE_Localizador`), su unidad de obra (`03_04_01_PdE_Ud Medición 01`) y sus cantidades (`02_PdE_Cantidades`). Con eso se monta un calendario de tareas (fase × planta) y el coste de cada elemento, con precios unitarios de ejemplo.
2. **Deslizador de tiempo** del inicio al final de la obra, con botón de reproducir y la marca de hoy:
   - lo que no ha empezado no se ve;
   - lo que está en curso se pinta en naranja;
   - lo terminado se ve con su material.
3. **5D por valor ganado:** valor planificado (PV), valor ganado (EV), coste real (AC), SPI, CPI y la curva S. El avance real va con retraso en los cerramientos por lluvia, y su coste se pasa del presupuesto.
4. **Sensores de obra simulados:**
   - temperatura de curado de cada forjado desde su hormigonado;
   - vibración (velocidad de pico) mientras hay tareas de estructura o cerramientos;
   - lluvia diaria.

   Alertas: vibración por encima del umbral, lluvia el día de un hormigonado y riesgo de helada durante el curado.

## Fuera de alcance

- La conexión con un planificador real (Primavera P6, MS Project) o con sensores reales. La fuente se cambiaría manteniendo los mismos datos.
- Las certificaciones mensuales. Ya hay certificados SHA-256 de lo publicado.

## Tareas (cada una funciona de principio a fin)

1. **Plan:** `planificar(elementos)` → tareas y fechas de cada elemento a partir de fase y planta. *Test:* la estructura de planta baja va antes que la de planta primera; las instalaciones de cubierta van al final.
2. **Estado en una fecha:** `estadoEn(plan, fecha, 'plan' | 'real')` → pendiente, en curso (con %) o hecho. *Test:* antes del inicio no hay nada; al final está todo; el real va por detrás del plan en cerramientos.
3. **Valor ganado:** `valorGanado(plan, fecha)` → PV, EV, AC, SPI, CPI y la serie de la curva S. *Test:* al final, PV = presupuesto; con retraso, SPI < 1; con sobrecoste, CPI < 1.
4. **Sensores:** `sensoresObra(plan, fecha)` → temperatura de curado, vibración, lluvia y alertas. *Test:* el pico de temperatura del forjado llega entre 12 y 48 h después del hormigonado; la lluvia del día de hormigonado de FJ-01 genera alerta.
5. **Pestaña en el CDE:** visor con elementos ocultos o coloreados según el estado, deslizador y reproducir, valor ganado con curva S, sensores y alertas. *Prueba:* de extremo a extremo en el navegador.
