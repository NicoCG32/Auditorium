# Documentación de Auditorium

Aplicación web/PWA para gestionar una fonoteca personal. Las versiones de escritorio y Android están previstas como entregas independientes.

## Documentación por cuatro tipos

| Tipo                    | Qué encontrarás                                                 | Por dónde empezar                                                                                                                                |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| General                 | Problemática, público, solución y motivación personal           | [Propuesta](00-problematica-cliente-y-valor.md) · [Origen](16-motivacion-y-contexto.md)                                                          |
| Técnica                 | Arquitectura, dominio, datos, interfaz y puesta en marcha       | [Arquitectura](01-arquitectura-general.md) · [Instalación](09-instalacion-y-despliegue.md)                                                       |
| Desarrollo del proyecto | Etapas, metodología, justificación, proyección y costos CLP/USD | [Metodología](17-desarrollo-y-metodologia.md) · [Proyección](15-escalabilidad-y-nuevos-mercados.md) · [Costos](18-analisis-economico-clp-usd.md) |
| Académica/formativa     | No aplica al origen de este proyecto                            | —                                                                                                                                                |

## Rutas de lectura

- **Conocer el proyecto:** [propuesta](00-problematica-cliente-y-valor.md) → [motivación](16-motivacion-y-contexto.md) → [funcionalidades](02-funcionalidades.md).
- **Utilizarlo o desplegarlo:** [recorrido](03-flujo-de-usuario.md) → [instalación](09-instalacion-y-despliegue.md).
- **Desarrollar o contribuir:** [arquitectura](01-arquitectura-general.md) → [dominio y datos](04-base-de-datos.md) → [reglas](05-motor-o-nucleo-de-negocio.md).
- **Evaluar su evolución:** [metodología](17-desarrollo-y-metodologia.md) → [proyección](15-escalabilidad-y-nuevos-mercados.md) → [costos](18-analisis-economico-clp-usd.md).

## Tabla de contenidos

| Capítulo | Documento                                                                          |
| -------- | ---------------------------------------------------------------------------------- |
| 00       | [Problemática, cliente y solución](00-problematica-cliente-y-valor.md)             |
| 01       | [Arquitectura por niveles](01-arquitectura-general.md)                             |
| 02       | [Catálogo funcional](02-funcionalidades.md)                                        |
| 03       | [Recorrido y estados](03-flujo-de-usuario.md)                                      |
| 04       | [Dominio, entidades y persistencia](04-base-de-datos.md)                           |
| 05       | [Reglas y núcleo](05-motor-o-nucleo-de-negocio.md)                                 |
| 06       | [Integraciones y asistencia](06-capa-de-ia-o-analisis.md)                          |
| 07       | [Diseño y accesibilidad](07-diseno-e-identidad.md)                                 |
| 08       | [Salidas y entregables](08-exportacion-e-informes.md)                              |
| 09       | [Puesta en marcha y distribución](09-instalacion-y-despliegue.md)                  |
| 15       | [Justificación, proyección y escalabilidad](15-escalabilidad-y-nuevos-mercados.md) |
| 16       | [Motivación personal y contexto](16-motivacion-y-contexto.md)                      |
| 17       | [Etapas y metodología](17-desarrollo-y-metodologia.md)                             |
| 18       | [Escenarios económicos CLP / USD](18-analisis-economico-clp-usd.md)                |

## Guías especializadas

- [Arquitectura del sistema](ARQUITECTURA.md).
- [Audio personal persistente y respaldo completo](AUDIO_LOCAL.md).
- [Biblioteca: búsqueda, filtros y consulta](BIBLIOTECA.md).
- [Calificaciones de pistas](CALIFICACIONES_PISTAS.md).
- [Casos de uso del núcleo local](CASOS_DE_USO.md).
- [Clasificación del álbum y alta guiada](CLASIFICACION_ALBUM.md).
- [Consultar la biblioteca local](CONSULTA_BIBLIOTECA.md).
- [Contratos de experiencia y acceso musical](CONTRATOS_EXPERIENCIA.md).
- [Deseos de compra](DESEOS_COMPRA.md).
- [Diseño base](DISENO_BASE.md).
- [Dominio de biblioteca personal](DOMINIO_BIBLIOTECA.md).
- [Dominio del catálogo](DOMINIO_CATALOGO.md).
- [Editar álbumes, géneros y países](EDICION_CATALOGO.md).
- [Ejemplares físicos y compras digitales](EJEMPLARES.md).
- [Retirada y eliminaciones personales](ELIMINACIONES_PERSONALES.md).
- [Enlaces personales de reproducción y compra](ENLACES_PERSONALES.md).
- [Entrega de Auditorium 1.1.0](ENTREGA.md).
- [Entrega histórica del MVP 1.0.0](ENTREGA_MVP.md).
- [Escucha y notas personales](EXPERIENCIA_PERSONAL.md).
- [Experiencia de biblioteca, escucha y colección](EXPERIENCIA_USUARIO.md).
- [Ficha y valoración del álbum](FICHA_ALBUM.md).
- [Recomendaciones y referencias externas](INTEGRACIONES_OPCIONALES.md).
- [Listas originales y ediciones](LISTAS_EDICIONES.md).
- [Evaluación de metadatos externos](METADATOS_EXTERNOS.md).
- [Mi colección: ejemplares y compras digitales](MI_COLECCION.md).
- [Ficha, calificación y edición de referencia](MI_EXPERIENCIA.md).
- [Migraciones, persistencia y recuperación](MIGRACIONES_RECUPERACION.md).
- [Modelo de datos y persistencia](MODELO_DATOS.md).
- [Modelo de dominio](MODELO_DOMINIO.md).
- [Navegación, contexto y borradores](NAVEGACION.md).
- [Persistencia local — esquemas v1 a v10](PERSISTENCIA_LOCAL.md).
- [Plan de desarrollo de Auditorium](PLAN_DESARROLLO.md).
- [Metadatos y reproducción desde enlaces](PROVEEDORES_STREAMING.md).
- [Publicación web en GitHub Pages](PUBLICACION_WEB.md).
- [Instalación, uso sin conexión y almacenamiento](PWA_OFFLINE.md).
- [Referencia ampliada de uso](Referencia-de-uso.md).
- [Registro manual de álbumes](REGISTRO_MANUAL.md).
- [Reproducción desde tus enlaces](REPRODUCCION.md).
- [Respaldos JSON y restauración](RESPALDOS_JSON.md).
- [Cuenta y biblioteca entre dispositivos](SINCRONIZACION_SUPABASE.md).
- [Validación final del MVP](VALIDACION_MVP.md).
- [Validación del núcleo local](VALIDACION_PERSISTENCIA.md).
- [Validación del recorrido principal](VALIDACION_RECORRIDO.md).
- [Valoraciones personales por género](VALORACIONES_POR_GENERO.md).
- [bocetos navegables](prototipos/experiencia/index.html).
- [ADR-011: cuenta opcional con Supabase](adr/011-supabase-sincronizacion.md).
- [ADR-001: MVP local](adr/001-mvp-local.md).
- [ADR-002: álbum, edición y pista](adr/002-album-edicion-pista.md).
- [ADR-003: costo obligatorio cero](adr/003-costo-cero.md).
- [ADR-004: retirada personal](adr/004-retirada-personal.md).
- [ADR-005: identidad del respaldo](adr/005-identidad-respaldo.md).
- [ADR-006: actualización PWA](adr/006-actualizaciones-pwa.md).
- [ADR-007: importación revisada](adr/007-importacion-metadatos.md).
- [ADR-008: integraciones opcionales](adr/008-integraciones-opcionales.md).
- [ADR-009: edición y metadatos](adr/009-edicion-metadatos-portadas.md).
- [ADR-010: navegación por tareas](adr/010-navegacion-experiencia.md).
- [ADR-011: sincronización opcional](adr/011-supabase-sincronizacion.md).
- [ADR-012: audio por dispositivo y respaldo completo](adr/012-audio-local-respaldo.md).
- [ADR-013: notas por género](adr/013-valoraciones-por-genero.md).

## Investigaciones y propuestas

| Estudio                                                     | Resultado y estado                                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [EXT-01: metadatos externos](METADATOS_EXTERNOS.md)         | Evaluación de MusicBrainz, condiciones de uso, mapeo y prueba offline ficticia; importación propuesta para una implementación posterior |
| [UX-03: experiencia de usuario](EXPERIENCIA_USUARIO.md)     | Propuesta de navegación, recorridos y [bocetos navegables](prototipos/experiencia/index.html), sin cambios en la aplicación publicada   |
| [UX-03: contratos de experiencia](CONTRATOS_EXPERIENCIA.md) | Responsabilidades de álbum, valoración, enlaces personales, audio e inventario; compatibilidad y tareas pendientes                      |

## Decisiones de arquitectura

[ADR-011: cuenta opcional con Supabase](adr/011-supabase-sincronizacion.md) amplía las decisiones del MVP para acceder a una biblioteca privada desde varios dispositivos.

| Decisión                                                                              | Justificación                                                                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [ADR-001: MVP local](adr/001-mvp-local.md)                                            | Biblioteca ejecutada y guardada en el navegador                                                      |
| [ADR-002: álbum, edición y pista](adr/002-album-edicion-pista.md)                     | Identidades musicales y apariciones diferenciadas                                                    |
| [ADR-003: costo obligatorio cero](adr/003-costo-cero.md)                              | Servicios opcionales evaluados antes de incorporarlos                                                |
| [ADR-004: retirada personal](adr/004-retirada-personal.md)                            | Restauración de la misma entrada sin borrar catálogo o datos relacionados                            |
| [ADR-005: identidad del respaldo](adr/005-identidad-respaldo.md)                      | Adopción atómica de identidad y datos en un destino vacío                                            |
| [ADR-006: actualización PWA](adr/006-actualizaciones-pwa.md)                          | Aplicación de recursos nuevos después de cerrar las ventanas anteriores                              |
| [ADR-007: importación revisada](adr/007-importacion-metadatos.md)                     | Propuesta: archivo local, identidades preservadas y confirmación antes de escribir                   |
| [ADR-008: integraciones opcionales](adr/008-integraciones-opcionales.md)              | Búsqueda Wikidata revisada y recomendaciones con clave de sesión, sin dependencia del núcleo local   |
| [ADR-009: edición y metadatos](adr/009-edicion-metadatos-portadas.md)                 | Edición con identidad estable, géneros, país y portada automática local o remota                     |
| [ADR-010: navegación por tareas](adr/010-navegacion-experiencia.md)                   | Navegación y borradores en UX-04; enlaces, experiencia conjunta y contratos de colección por tareas  |
| [ADR-011: sincronización opcional](adr/011-supabase-sincronizacion.md)                | Bibliotecas privadas, cachés por cuenta, revisiones y conflictos con Supabase                        |
| [ADR-012: audio por dispositivo y respaldo completo](adr/012-audio-local-respaldo.md) | Adjuntos locales, aislamiento, ZIP1 y restauración atómica, independientes del JSON6 y la cuenta     |
| [ADR-013: notas por género](adr/013-valoraciones-por-genero.md)                       | Notas contextuales independientes, clave normalizada, renombrado atómico y compatibilidad DB11/JSON7 |

Los ADR conservan la fecha y el contexto de la decisión. El estado de ejecución actual se consulta en la [arquitectura](ARQUITECTURA.md), el [Project](https://github.com/users/NicoCG32/projects/4) y los [hitos](https://github.com/NicoCG32/Auditorium/milestones).

## Mantenimiento de los modelos

Un cambio de dominio debe actualizar entidades, relaciones e invariantes junto a sus schemas y pruebas. Un cambio de persistencia debe revisar claves, índices, versiones, migración y recuperación. Un cambio de interacción o de entorno debe revisar la arquitectura y sus flujos. Las capacidades futuras se señalan como propuestas hasta que exista una implementación validada.

Antes de integrar cambios documentales, comprobar referencias al código, enlaces relativos, formato y sintaxis/renderizado de todos los diagramas. Los ejemplos deben ser ficticios y los documentos publicados deben contener solo información de producto y contratos técnicos.

## Uso y distribución

[Presentación y descargas](../README.md) · [Licencia y créditos](../LICENSING.md).
