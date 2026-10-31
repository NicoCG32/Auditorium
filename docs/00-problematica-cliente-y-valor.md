# 00 — Problemática, cliente y solución

## Síntesis general — Auditorium

**Disponibilidad:** Aplicación web/PWA para gestionar una fonoteca personal. Las versiones de escritorio y Android están previstas como entregas independientes.

### Problemática

Los datos sobre álbumes conocidos, escuchas, notas, ediciones, copias y deseos de compra quedan repartidos entre memoria, plataformas y archivos. Confundir el álbum abstracto con una edición o una copia dificulta saber qué se conoce, qué se posee y qué se desea.

### Cliente, usuario y beneficiario

| Perfil                 | Contexto                                           | Necesidad                                                   |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| Usuario inicial        | La persona que mantiene su biblioteca musical      | Registrar y consultar su experiencia y posesiones           |
| Beneficiario potencial | Coleccionista o aficionado con varias fuentes      | Conservar identidad de catálogo sin perder datos personales |
| Comprador              | No existe comprador ni modelo comercial confirmado | Evaluar utilidad antes de monetización                      |

### Solución y límites

Una biblioteca local-first distingue catálogo, experiencia personal y colección. Permite registrar, valorar, enlazar, respaldar y, opcionalmente, sincronizar metadatos; el audio personal permanece por dispositivo y se traslada mediante respaldo completo.

### Por qué corresponde al problema

| Fricción / necesidad        | Mecanismo de la solución                                                          |
| --------------------------- | --------------------------------------------------------------------------------- |
| Dispersión de información   | Un modelo común y búsqueda reúnen registros sin obligar a contratar streaming     |
| Pérdida de datos personales | IndexedDB, JSON versionado y ZIP con audio explicitan portabilidad y recuperación |
| Dependencia de terceros     | Registro manual y funcionamiento local continúan sin cuenta ni IA                 |

### Validación pendiente o continua

Tiempo para encontrar un registro y exactitud de colección/restauración; satisfacción y uso sostenido, sin convertir volumen de álbumes en éxito por sí solo.

Puedes conocer el origen del proyecto en [16-motivacion-y-contexto.md](16-motivacion-y-contexto.md); el análisis de costos y proyección se separa en [18-analisis-economico-clp-usd.md](18-analisis-economico-clp-usd.md).

## Código y documentación relacionada

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
