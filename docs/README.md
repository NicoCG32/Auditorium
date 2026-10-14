# Documentación de Auditorium

Documentación de la implementación del **MVP v1.0.0**. La release corresponde al [tag v1.0.0](https://github.com/NicoCG32/Auditorium/releases/tag/v1.0.0); las referencias técnicas describen sus contratos y deben revisarse cuando cambien código, esquemas o decisiones.

## Ruta de lectura

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
| Álbum y experiencia      | [Ficha](FICHA_ALBUM.md), [escucha y notas](EXPERIENCIA_PERSONAL.md)                                                        |
| Pistas y ediciones       | [Listas](LISTAS_EDICIONES.md), [calificaciones de pistas](CALIFICACIONES_PISTAS.md)                                        |
| Colección                | [Ejemplares](EJEMPLARES.md), [deseos de compra](DESEOS_COMPRA.md)                                                          |
| Cambios personales       | [Retirada y confirmaciones](ELIMINACIONES_PERSONALES.md)                                                                   |
| Recuperación y offline   | [Respaldos JSON](RESPALDOS_JSON.md), [PWA](PWA_OFFLINE.md), [migraciones](MIGRACIONES_RECUPERACION.md)                     |
| Implementación y calidad | [Casos de uso](CASOS_DE_USO.md), [integridad y persistencia](VALIDACION_PERSISTENCIA.md), [diseño base](DISENO_BASE.md)    |

Estas guías documentan las capacidades construidas durante el MVP y complementan las referencias transversales. Las menciones a esquemas v1/v2/v3 corresponden a evolución de IndexedDB; la versión del archivo de respaldo es un contrato independiente, actualmente 1.

## Decisiones de arquitectura

| Decisión                                                          | Justificación                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [ADR-001: MVP local](adr/001-mvp-local.md)                        | Biblioteca ejecutada y guardada en el navegador                           |
| [ADR-002: álbum, edición y pista](adr/002-album-edicion-pista.md) | Identidades musicales y apariciones diferenciadas                         |
| [ADR-003: costo obligatorio cero](adr/003-costo-cero.md)          | Servicios opcionales evaluados antes de incorporarlos                     |
| [ADR-004: retirada personal](adr/004-retirada-personal.md)        | Restauración de la misma entrada sin borrar catálogo o datos relacionados |
| [ADR-005: identidad del respaldo](adr/005-identidad-respaldo.md)  | Adopción atómica de identidad y datos en un destino vacío                 |
| [ADR-006: actualización PWA](adr/006-actualizaciones-pwa.md)      | Aplicación de recursos nuevos después de cerrar las ventanas anteriores   |

Los ADR conservan la fecha y el contexto de la decisión. El estado de ejecución actual se consulta en la [arquitectura](ARQUITECTURA.md), el [Project](https://github.com/users/NicoCG32/projects/4) y los [hitos](https://github.com/NicoCG32/Auditorium/milestones).

## Mantenimiento de los modelos

Un cambio de dominio debe actualizar entidades, relaciones e invariantes junto a sus schemas y pruebas. Un cambio de persistencia debe revisar claves, índices, versiones, migración y recuperación. Un cambio de interacción o de entorno debe revisar la arquitectura y sus flujos. Las capacidades futuras se señalan como propuestas hasta que exista una implementación validada.

Antes de integrar cambios documentales, comprobar referencias al código, enlaces relativos, formato y sintaxis/renderizado de todos los diagramas. Los ejemplos deben ser ficticios y los documentos publicados deben contener solo información de producto y contratos técnicos.
