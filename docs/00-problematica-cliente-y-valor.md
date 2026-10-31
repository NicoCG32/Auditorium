# 00 — Problemática, cliente y solución

Creé Auditorium para organizar una biblioteca musical personal: álbumes, ediciones, escuchas, valoraciones y adquisiciones, con independencia del formato o de las plataformas de streaming.

**Disponibilidad:** Aplicación web/PWA para gestionar una fonoteca personal. Las versiones de escritorio y Android están previstas como entregas independientes.

## Problemática

Los datos sobre álbumes conocidos, escuchas, notas, ediciones, copias y deseos de compra quedan repartidos entre memoria, plataformas y archivos. Confundir el álbum abstracto con una edición o una copia dificulta saber qué se conoce, qué se posee y qué se desea.

## Cliente, usuario y beneficiario

| Perfil                 | Contexto                                                | Necesidad                                                   |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| Usuario inicial        | La persona que mantiene su biblioteca musical           | Registrar y consultar su experiencia y posesiones           |
| Beneficiario potencial | Coleccionista o aficionado con varias fuentes           | Conservar identidad de catálogo sin perder datos personales |
| Posible cliente        | Aficionado que necesite una adaptación de su biblioteca | Acordar un alcance después de probar la aplicación          |

## Solución y límites

Una biblioteca local-first distingue catálogo, experiencia personal y colección. Permite registrar, valorar, enlazar, respaldar y, opcionalmente, sincronizar metadatos; el audio personal permanece por dispositivo y se traslada mediante respaldo completo.

## Por qué corresponde al problema

| Fricción / necesidad        | Mecanismo de la solución                                                          |
| --------------------------- | --------------------------------------------------------------------------------- |
| Dispersión de información   | Un modelo común y búsqueda reúnen registros sin obligar a contratar streaming     |
| Pérdida de datos personales | IndexedDB, JSON versionado y ZIP con audio explicitan portabilidad y recuperación |
| Dependencia de terceros     | Registro manual y funcionamiento local continúan sin cuenta ni IA                 |

## Cómo quiero evaluar la propuesta

Para mí, su utilidad se ve en tareas sencillas: encontrar un álbum, reconocer qué edición tengo, retomar una escucha y recuperar la biblioteca sin perder información. Quiero comprobar esas tareas con bibliotecas de distintos tamaños y con otras personas que coleccionen música.

[Motivación y contexto](16-motivacion-y-contexto.md) · [Proyección](15-escalabilidad-y-nuevos-mercados.md) · [Estimaciones comerciales](18-analisis-economico-clp-usd.md).

## Código y documentación relacionada

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
