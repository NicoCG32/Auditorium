# 15 — Justificación, proyección y escalabilidad

<!-- DOCUMENTACION:nivel-2026-10-29:BEGIN -->

**Nivel:** desarrollo del proyecto.

## Justificación y proyección

Revisión documental: 2026-10-29. Base `0dccf7cb8659` en `main`; árbol inicialmente limpio. La inspección de fuentes no sustituye pruebas de ejecución.

**Estado y alcance:** Web/PWA 1.1.0 publicada según la guía de entrega y el tag; escritorio empaquetado y APK siguen siendo objetivos separados, no productos certificados por la web.

### Ajuste entre problema y solución

| Necesidad                   | Razón del diseño                                                                  |
| --------------------------- | --------------------------------------------------------------------------------- |
| Dispersión de información   | Un modelo común y búsqueda reúnen registros sin obligar a contratar streaming     |
| Pérdida de datos personales | IndexedDB, JSON versionado y ZIP con audio explicitan portabilidad y recuperación |
| Dependencia de terceros     | Registro manual y funcionamiento local continúan sin cuenta ni IA                 |

Tiempo para encontrar un registro y exactitud de colección/restauración; satisfacción y uso sostenido, sin convertir volumen de álbumes en éxito por sí solo.

### Qué se puede abstraer y qué no

Las entidades, reglas y fronteras de [04-base-de-datos.md](04-base-de-datos.md) permiten evaluar reutilización. Cambiar un nombre o una categoría no prueba compatibilidad con otro sector: datos, permisos, reglas, operación y costos deben validarse de nuevo.

### Extensiones de contexto: hipótesis, no mercados validados

- Fonotecas personales
- Colecciones de cine con ediciones y copias
- Bibliotecas de juegos físicos/digitales
- Archivos de coleccionismo editorial

No se atribuyen clientes, ventas, demanda ni superioridad sobre competidores sin evidencia. La primera validación consiste en una necesidad concreta, un flujo útil y disposición real a adoptarlo. Para juegos, el valor inicial es una experiencia disfrutable, no ahorro de horas ni una promesa educativa no ensayada.

### Límites y trade-offs

- Evicción/cuota y cambio de origen del navegador
- Conflictos entre bibliotecas y compatibilidad de restauración
- Términos y disponibilidad de servicios musicales
- Audio o datos locales trasladados incorrectamente al empaquetar

### Prioridad de inversión

| Prioridad   | Iniciativa                                                                           | Impacto a comprobar                                                                                                                                           | Criterio económico                                                    |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Alta        | Evaluación de empaquetado y validación de archivos/audio en una plataforma adicional | Tiempo para encontrar un registro y exactitud de colección/restauración; satisfacción y uso sostenido, sin convertir volumen de álbumes en éxito por sí solo. | Rango de esfuerzo y costo en capítulo 18; no presupuesto comprometido |
| Media       | Reproducción, soporte y recuperación por plataforma                                  | Menos fallos de entrega y pérdida de datos                                                                                                                    | Costo recurrente separado de implementación                           |
| Estratégica | Validar una extensión/forma de sostenimiento                                         | Uso y aceptación fuera del contexto inicial                                                                                                                   | Investigar costos, demanda y condiciones antes de monetizar           |

Las cifras CLP/USD, supuestos, sensibilidad y retorno se presentan en [18-analisis-economico-clp-usd.md](18-analisis-economico-clp-usd.md); no son una valoración comercial del repositorio.

## Fuentes de implementación y contratos

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
<!-- DOCUMENTACION:nivel-2026-10-29:END -->
