# ADR-002 — Álbum, edición y pista como identidades diferenciadas

Estado: aceptada para el MVP.
Fecha: 2026-10-11.

## Contexto

Una obra puede tener ediciones originales, reediciones, remasters o publicaciones en distintos formatos. Sus listas pueden cambiar sin que el álbum conceptual se duplique. Los ejemplares poseídos representan una relación personal y no la identidad musical.

## Decisión

- Un álbum conceptual agrupa varias ediciones bajo un mismo identificador.
- Cada edición conserva su propio orden de pistas y roles de contenido, incluidos bonus y alternativas.
- El álbum conserva una lista original de referencia, independiente de los cambios en una edición.
- Las pistas son contextuales al álbum. Reutilizar una misma pista entre ediciones cuando representa la misma versión musical; demos o variantes pueden tener identidad propia y referencia a la original.
- Las referencias deben pertenecer al álbum correcto. Prohibir posiciones duplicadas por disco y ciclos entre variantes.
- La biblioteca personal, ejemplares, escucha, deseos y calificaciones permanecen separados del catálogo.

## Consecuencias

Dos copias de una misma edición producen dos ejemplares y una entrada de biblioteca. Poseer un disco no lo marca como escuchado. La calificación del álbum es independiente de las pistas; una pista compartida conserva su nota entre ediciones, y una variante admite nota propia.

No fusionar obras ni artistas automáticamente por nombre. Antes de importar metadatos externos, estudiar el mapeo de sus entidades para conservar los identificadores y las relaciones locales.

Estas reglas se implementarán y probarán durante Fases 1–3; no hay modelos de dominio implementados en Fase 0.
