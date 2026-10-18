# Documentación de Auditorium

Documentación de la implementación actual, basada en el contrato de datos del **MVP v1.0.0**, junto con su publicación web, evolución visual e incremento en revisión de integraciones y edición del catálogo. La release original corresponde al [tag v1.0.0](https://github.com/NicoCG32/Auditorium/releases/tag/v1.0.0); las referencias técnicas vigentes se mantienen en este repositorio y deben revisarse cuando cambien código, esquemas o decisiones. El incremento en revisión todavía no está publicado. Las capacidades futuras aparecen como propuestas separadas.

## Ruta de lectura

Para abrir o mantener la web/PWA alojada, consulta la [guía de GitHub Pages](PUBLICACION_WEB.md), incluido el traslado de la biblioteca desde localhost.

| Necesidad                                                                 | Documento                                |
| ------------------------------------------------------------------------- | ---------------------------------------- |
| Comprender límites del sistema, componentes, dependencias y flujos        | [Arquitectura](ARQUITECTURA.md)          |
| Entender entidades, relaciones, cardinalidades, invariantes y estados     | [Modelo de dominio](MODELO_DOMINIO.md)   |
| Consultar tablas, claves, índices, migraciones, transacciones y respaldos | [Modelo de datos](MODELO_DATOS.md)       |
| Usar o alojar el paquete publicado                                        | [Entrega del MVP](ENTREGA_MVP.md)        |
| Revisar evidencia y límites de aceptación                                 | [Validación del MVP](VALIDACION_MVP.md)  |
| Conocer alcance, proceso y seguimiento                                    | [Plan de desarrollo](PLAN_DESARROLLO.md) |

Arquitectura, dominio y datos son vistas complementarias: una relación conceptual no implica una clave foránea nativa ni un endpoint de servidor. Los diagramas se mantienen en bloques Mermaid junto al texto y pueden verse en [GitHub](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams). La [notación de relaciones](https://mermaid.js.org/syntax/entityRelationshipDiagram.html) incluye cardinalidades y atributos; cada modelo aclara sus garantías y opcionales.

## Guías por capacidad

| Área                     | Referencias                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Catálogo e identidad     | [Catálogo](DOMINIO_CATALOGO.md), [biblioteca personal](DOMINIO_BIBLIOTECA.md), [persistencia local](PERSISTENCIA_LOCAL.md) |
| Consultas y alta         | [Consulta y búsqueda](CONSULTA_BIBLIOTECA.md), [registro manual y duplicados](REGISTRO_MANUAL.md)                          |
| Álbum y experiencia      | [Ficha](FICHA_ALBUM.md), [edición del catálogo](EDICION_CATALOGO.md), [escucha y notas](EXPERIENCIA_PERSONAL.md)           |
| Pistas y ediciones       | [Listas](LISTAS_EDICIONES.md), [calificaciones de pistas](CALIFICACIONES_PISTAS.md)                                        |
| Colección                | [Ejemplares](EJEMPLARES.md), [deseos de compra](DESEOS_COMPRA.md)                                                          |
| Cambios personales       | [Retirada y confirmaciones](ELIMINACIONES_PERSONALES.md)                                                                   |
| Recuperación y offline   | [Respaldos JSON](RESPALDOS_JSON.md), [PWA](PWA_OFFLINE.md), [migraciones](MIGRACIONES_RECUPERACION.md)                     |
| Implementación y calidad | [Casos de uso](CASOS_DE_USO.md), [integridad y persistencia](VALIDACION_PERSISTENCIA.md), [diseño base](DISENO_BASE.md)    |

Estas guías complementan las referencias transversales. Las menciones a esquemas v1/v2/v3/v4/v5 corresponden a la evolución de IndexedDB; la versión del archivo de respaldo es un contrato independiente, actualmente 3, con importación compatible de los formatos 1 y 2 estrictos.

La [guía de integraciones opcionales](INTEGRACIONES_OPCIONALES.md) explica búsqueda Wikidata, procedencia persistente, portadas y enlaces, y recomendaciones Groq/Gemini con clave propia en memoria, datos enviados, condiciones de gratuidad y límites de validación.

## Investigaciones y propuestas

| Estudio                                                     | Resultado y estado                                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [EXT-01: metadatos externos](METADATOS_EXTERNOS.md)         | Evaluación de MusicBrainz, condiciones de uso, mapeo y prueba offline ficticia; importación propuesta para una implementación posterior |
| [UX-03: experiencia de usuario](EXPERIENCIA_USUARIO.md)     | Propuesta de navegación, recorridos y [bocetos navegables](prototipos/experiencia/index.html), sin cambios en la aplicación publicada   |
| [UX-03: contratos de experiencia](CONTRATOS_EXPERIENCIA.md) | Responsabilidades de álbum, valoración, enlaces personales, audio e inventario; compatibilidad y tareas pendientes                      |

## Decisiones de arquitectura

| Decisión                                                                 | Justificación                                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [ADR-001: MVP local](adr/001-mvp-local.md)                               | Biblioteca ejecutada y guardada en el navegador                                                       |
| [ADR-002: álbum, edición y pista](adr/002-album-edicion-pista.md)        | Identidades musicales y apariciones diferenciadas                                                     |
| [ADR-003: costo obligatorio cero](adr/003-costo-cero.md)                 | Servicios opcionales evaluados antes de incorporarlos                                                 |
| [ADR-004: retirada personal](adr/004-retirada-personal.md)               | Restauración de la misma entrada sin borrar catálogo o datos relacionados                             |
| [ADR-005: identidad del respaldo](adr/005-identidad-respaldo.md)         | Adopción atómica de identidad y datos en un destino vacío                                             |
| [ADR-006: actualización PWA](adr/006-actualizaciones-pwa.md)             | Aplicación de recursos nuevos después de cerrar las ventanas anteriores                               |
| [ADR-007: importación revisada](adr/007-importacion-metadatos.md)        | Propuesta: archivo local, identidades preservadas y confirmación antes de escribir                    |
| [ADR-008: integraciones opcionales](adr/008-integraciones-opcionales.md) | Búsqueda Wikidata revisada y recomendaciones con clave de sesión, sin dependencia del núcleo local    |
| [ADR-009: edición y metadatos](adr/009-edicion-metadatos-portadas.md)    | Edición con identidad estable, géneros, país y portada automática local o remota                      |
| [ADR-010: navegación por tareas](adr/010-navegacion-experiencia.md)      | Propuesta de navegación y guardados por responsabilidad, enlaces personales y colección física aparte |

Los ADR conservan la fecha y el contexto de la decisión. El estado de ejecución actual se consulta en la [arquitectura](ARQUITECTURA.md), el [Project](https://github.com/users/NicoCG32/projects/4) y los [hitos](https://github.com/NicoCG32/Auditorium/milestones).

## Mantenimiento de los modelos

Un cambio de dominio debe actualizar entidades, relaciones e invariantes junto a sus schemas y pruebas. Un cambio de persistencia debe revisar claves, índices, versiones, migración y recuperación. Un cambio de interacción o de entorno debe revisar la arquitectura y sus flujos. Las capacidades futuras se señalan como propuestas hasta que exista una implementación validada.

Antes de integrar cambios documentales, comprobar referencias al código, enlaces relativos, formato y sintaxis/renderizado de todos los diagramas. Los ejemplos deben ser ficticios y los documentos publicados deben contener solo información de producto y contratos técnicos.
