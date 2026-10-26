# ADR-013: valoraciones independientes por género del álbum

Fecha: 2026-10-26. Estado: aceptada e implementada en RATE-01 #80. La interfaz y los filtros se desarrollan en RATE-02 #81.

## Contexto

Una nota general no expresa necesariamente la experiencia con cada género de un álbum. Guardar música ya le atribuye valor personal; la puntuación compara experiencias dentro de la biblioteca. Álbum, edición, experiencia e inventario conservan responsabilidades diferentes.

## Decisión

Añadir `AlbumGenreRating`, identificada por entrada personal y clave normalizada de un género asignado al álbum. Conservar etiquetas libres en `Album.genres`, sin introducir una taxonomía global ni nuevas identidades de género. Mantener la nota general opcional y explícita, independiente de notas por género y por pista; no producir medias o sustituciones implícitas.

Cada nota por género admite su propia edición de referencia del mismo álbum, sin exigir adquisición. Usar comparación del registro completo para actualizar y quitar. Proteger las etiquetas valoradas frente a borrados ordinarios y ofrecer un renombrado explícito, atómico y sin fusiones de puntuaciones que conserve fechas y notas retiradas.

Elevar IndexedDB a11, JSON/snapshot a7 y conservar lectores históricos estrictos. Migrar datos y todos los documentos del checkpoint en una transacción, sin notas inferidas. Mantener ZIP1 y sus bytes de audio; extender la RPC existente con validación y versión7, sin nueva infraestructura ni coste obligatorio.

## Alternativas y consecuencias

Una entidad Genre con UUID global añadiría una taxonomía y migración innecesarias para etiquetas personales. Guardar notas por etiqueta literal perdería relaciones al corregir mayúsculas o acentos. Borrar notas al editar géneros ocultaría pérdida de información. Se elige una clave normalizada y un protocolo explícito de renombrado para mantener esa flexibilidad con integridad verificable.

Los clientes antiguos deben actualizarse antes de escribir una biblioteca ya guardada como7. Los filtros futuros deben mostrar qué contexto comparan y tratar los géneros sin nota como ausencia, sin recurrir a la general. Véase la [guía completa](../VALORACIONES_POR_GENERO.md).
