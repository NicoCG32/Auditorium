# 18 — Escenarios económicos CLP / USD

<!-- DOCUMENTACION:nivel-2026-10-29:BEGIN -->

**Nivel:** desarrollo del proyecto.

## Escenarios económicos de Auditorium

**Finalidad:** presupuestar decisiones futuras, no tasar el repositorio ni declarar costos/ventas históricos. Alcance modelado: **Evaluación de empaquetado y validación de archivos/audio en una plataforma adicional**. Sin ingresos ni precio de venta definidos. El retorno inicial es utilidad personal, portabilidad y aprendizaje.

### Moneda y supuestos

Conversión: **USD 1 = CLP 994,29**, valor del **27-10-2026** en la [tabla oficial SII](https://www.sii.cl/valores_y_fechas/dolar/dolar2026.htm), último día con cifra visible al consultar el 29-10-2026. No se atribuye ese valor al día 29 ni a una transacción bancaria. CLP = USD × R; USD = CLP / R, con R = 994,29.

Para valorizar esfuerzo se supone **CLP 15.000/h** (USD 15,09/h). Es una tasa elegida para comparar escenarios, no sueldo de mercado, tarifa profesional ni compromiso del responsable. Rangos de horas, mantenimiento y reservas también son supuestos; no se deducen de SCT, commits o líneas de código.

### Inversión del siguiente alcance

| Concepto                        | Base del escenario                       | CLP                     | USD                   |
| ------------------------------- | ---------------------------------------- | ----------------------- | --------------------- |
| Tiempo del siguiente alcance    | 24–48 h a CLP 15.000/h                   | CLP 360.000–CLP 720.000 | USD 362,07–USD 724,13 |
| Reserva de materiales           | Supuesto; equipo existente no valorizado | CLP 0                   | USD 0,00              |
| Total de inversión de escenario | No es inversión histórica ni cotización  | CLP 360.000–CLP 720.000 | USD 362,07–USD 724,13 |

### Operación mensual

Escenario local: servicios obligatorios USD 0. Escenario opcional aquí modelado: base Pro desde USD 25/mes, sin cambiar que la biblioteca local funciona sin esa contratación. No es el gasto actual del proyecto.

| Concepto                        | Base                               | CLP/mes    | USD/mes   |
| ------------------------------- | ---------------------------------- | ---------- | --------- |
| Mantenimiento de escenario      | 2 h/mes                            | CLP 30.000 | USD 30,17 |
| Servicios externos de escenario | Ver composición; no factura actual | CLP 24.857 | USD 25,00 |
| Costo mensual modelado          | Tiempo + servicios                 | CLP 54.857 | USD 55,17 |

No se suman aquí impuestos, comisiones, dominio, sobreconsumo, reposición extraordinaria o equipo no valorizado. Costos de nube por proyecto/organización y cuotas gratuitas deben revisarse para la cuenta concreta. Una cuota de nube no sustituye la arquitectura ni la validación necesarias para escalar.

### Justificación y retorno

Ejemplo **hipotético**, no resultado medido: evitar 2 h/mes a la misma tasa representa CLP 30.000 / USD 30,17 de tiempo valorizado, no ingresos. Frente al costo modelado, el saldo de ese ejemplo es CLP -24.857 / USD -25,00 al mes. El punto de equilibrio por ahorro temporal sería 3.66 h/mes; debe comprobarse con uso real, pérdidas evitadas o un beneficio distinto.

Tiempo para encontrar un registro y exactitud de colección/restauración; satisfacción y uso sostenido, sin convertir volumen de álbumes en éxito por sí solo.

ROI sólo se calcula cuando beneficios y costos comparables estén medidos: (beneficio − costo) / costo, indicando período y si el tiempo valorizado realmente se convierte en ahorro. Un costo de caja bajo no acredita rentabilidad ni valor comercial de la idea.

### Sensibilidad y decisión

- Con R ±10 %, cambia en ±10 % el costo CLP de servicios fijados en USD; el gasto local CLP no cambia por ese supuesto.
- Separar creación puntual de mantenimiento recurrente y reserva física de consumo.
- Registrar facturas/uso, horas observadas y aceptación antes de reemplazar estos escenarios por un presupuesto comprometido.
- Las monedas ficticias de un videojuego, saldos de clientes e inventario de una empresa no son ingresos del software.

### Referencias de servicios

[Supabase](https://supabase.com/pricing): Free y Pro desde USD 25/mes; [Vercel](https://vercel.com/pricing): Hobby y Pro desde USD 20/mes. Son referencias consultadas, no planes asignados al proyecto. [Gemini](https://ai.google.dev/gemini-api/docs/pricing) y [Firebase](https://firebase.google.com/pricing) requieren revisar producto/modelo, cuotas y condiciones antes de cuantificar consumo. El plan actual de Lovable u otro proveedor no se deduce de estas tarifas.

## Fuentes de implementación y contratos

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
<!-- DOCUMENTACION:nivel-2026-10-29:END -->
