# Changelog

## Web — 2026-11-23

- Navegación visible por Buscar, Mi colección, Deseos, Sugerencias y Ajustes: lateral en escritorio e inferior en móvil. Desaparecen el menú genérico Más opciones, el control de apariencia aislado y el pie de almacenamiento. Añadir álbum queda como acción de cabecera.
- La colección organiza Álbumes, Artistas, Ejemplares y Calificaciones. El directorio de artistas reúne los álbumes activos y conserva búsqueda y foco al volver de una banda. Buscar abre directamente el catálogo de discografías.
- Ajustes unifica personalización, cuenta, respaldos, retirados y aplicación. La personalización y las opciones de aplicación se abren en un panel modal que conserva el reproductor y los formularios; las operaciones sobre datos mantienen la protección de borradores. Los avisos importantes aparecen dentro del contexto activo.
- Sugerencias muestra primero los pendientes y últimas incorporaciones de la colección, sin servicios externos. La configuración opcional de recomendaciones asistidas conserva consentimiento, claves temporales y límites de datos.
- Presentación más sobria, portadas sin marcos pesados, titulares del sistema y controles compactos en móvil. Las preferencias nuevas empiezan sin fondo decorativo; se conservan elecciones existentes. Sin cambios de datos, respaldos, sincronización, dependencias ni ZIP 1.1.0.

## Web — 2026-11-19

- Mi colección reúne las portadas con filtros Todos/Físico/Digital y recuentos de álbumes según ejemplares registrados. La gestión de copias y calificaciones pasa al menú secundario; se conservan rutas, borradores y regreso con contexto.
- Personalización de nombre, tamaño de portadas, lista/cuadrícula, detalles y orden recordados por navegador, junto al tema existente. Las tarjetas priorizan portada, artista y formatos. Mantenimiento técnico cotidiano plegado; avisos importantes visibles. Sin cambios de formatos musicales, migraciones o sincronización.

## Web — 2026-11-17

Actualización de la web publicada. El ZIP de la release 1.1.0 conserva sus archivos originales.

- Servicio MusicBrainz alojado en el Supabase existente, con cola, concesiones y caché coordinadas entre instancias. Consulta sin cuenta mediante clave publicable, sin enviar la biblioteca. Tablas y RPC exclusivas del servidor, límites de memoria y caducidad, y pruebas SQL con rollback. Guía en `docs/CATALOGO_SUPABASE.md`.

- Pantalla de artista desde las tarjetas y fichas: álbumes locales, copias y deseos, comparación explícita con MusicBrainz e incorporación de discos sin salir de la comparación. Los artistas manuales se vinculan tras revisar su identidad y conservan su nombre local.
- Selección de ediciones con pistas opcionales por disco, reutilización explícita de pistas manuales y reconocimiento de referencias ya guardadas. Se conservan listas anteriores, UUID, valoraciones, copias, deseos, enlaces y audio; no se infieren compras. Vista previa opcional de Cover Art Archive y sustitución de portada confirmada.
- DB13/nativa130 y JSON/snapshot9 añaden referencias MusicBrainz de edición y grabación, con unicidad de grabación por álbum. Migración estricta desde DB12 y sus checkpoints, lectores JSON1–8, actualización SQL para sincronización y recuperación de lectura sin repetir escrituras. ZIP1 conserva su formato. Guía en `docs/ARTISTAS_Y_EDICIONES.md`.
- Interfaz orientada a la colección: ejemplares y deseos al principio de la ficha, guardado manual junto a artista y título, detalles del ejemplar y metadatos desplegables, y tarjetas con adquisiciones y deseos sin filas de datos ausentes. Escucha, notas y audio siguen siendo opcionales; se conserva la protección de borradores.
- Búsqueda de artistas y discografías MusicBrainz con paginación, filtros y selección múltiple. Revisión explícita de homónimos y posibles duplicados, importación atómica, referencias persistentes y protección de experiencia y álbumes retirados. Servicio de consulta identificado con cola compartida, caché acotada y errores recuperables; integración de desarrollo y configuración para sitios estáticos.
- «Añadir música» reúne búsqueda de discografía, alta manual compacta e importación JSON. Las referencias se conservan al editar metadatos y se desvinculan al cambiar la identidad de la obra. DB12/nativa120 y JSON/snapshot8 incorporan procedencia MusicBrainz; migración desde DB11, lectura estricta de JSON1–7 y migración SQL para sincronización. ZIP1 conserva su formato.
- Importación aditiva de respaldos JSON sobre bibliotecas existentes, con vista previa, decisiones explícitas de conflictos e identidades coincidentes, confirmación atómica y detección de cambios concurrentes. Conserva identidad de destino, registros ausentes, audio y experiencia; recuperación de lectura sin repetir importación.
- Catálogo musical JSON versionado para incorporar discografías sin notas, escuchas o adquisiciones inferidas. Plantilla exportable con identificadores y créditos principales, sin identidad ni experiencia personal; contrato y guía de importación. Su formato sencillo continúa en versión 1.

## 1.1.0 — 2026-10-29

Consolidación del recorrido de biblioteca, experiencia y colección, aceptado el 28 de octubre de 2026.

- Navegación por Biblioteca, Añadir álbum, Calificaciones y Mi colección, con búsqueda, filtros combinables, vistas, contexto y foco al regresar. Protección de borradores, cancelación explícita y reintento de lectura sin repetir una escritura confirmada.
- Alta manual mínima y edición con identidad estable; clasificación separada en tipo principal, categorías y publicación. Géneros y país por artista, créditos múltiples y reutilización explícita de bandas, con sugerencias locales por prefijo y control de homónimos. Mayúscula inicial por palabra conservando siglas; lectura y respaldos históricos mantienen sus nombres.
- Experiencia conjunta con escucha, comentario, nota general opcional y notas independientes por género. Referencias opcionales a ediciones del mismo álbum, poseídas o no. Comparación visible compartida por cifra, orden y filtros, sin promedios ni sustitución de notas ausentes. Renombrado protegido y conflictos recuperables. Incorporar un álbum expresa valor; una nota baja es comparativa.
- Mi colección con búsqueda, medios y formatos diferenciados, recuentos físicos/digitales y varias copias con etiquetas legibles. Edición y retirada confirmada de cada adquisición conservan álbum, ediciones compartidas, valoraciones, enlaces y deseos. Deseos secundarios y cumplimiento explícito.
- Enlaces personales Escuchar/Comprar, favorito opcional y portadas automáticas por URL o JPG/PNG local de hasta 2 MiB. Consulta Wikidata explícita con selección revisada y referencias; el registro manual permanece disponible. Recomendaciones Gemini/Groq con clave propia sólo en memoria y datos acotados, sin modificar notas.
- Reproducción Spotify/YouTube por elección, alternativa externa, cancelación y referencia temporal. Audio propio persistente por dispositivo, asociación opcional a pista, un reproductor activo y límites explícitos. Respaldos ZIP completos con audio e integridad comprobada; archivos y descriptores excluidos de JSON y sincronización.
- Cuenta opcional con Supabase, aislamiento por cuenta, sincronización privada, incorporación explícita de la biblioteca local, revisiones y resolución de conflictos. Correo transaccional configurado en la web publicada y recuperación con tratamiento de retornos caducados. El ZIP genérico usa modo local; la activación de cuentas se configura al compilar.
- Identidad visual, temas oscuro/pergamino, ambientación opcional y portadas offline. Ajustes de reflujo con texto al 200 %, buscador, formularios, navegación y controles de archivo en pantallas estrechas.
- Persistencia DB11/nativa110, JSON/snapshot7 y ZIP1. Lectores históricos estrictos, migración sin regenerar identidad y restauración atómica en destino vacío. Una base actualizada no se abre con una aplicación antigua: conservar respaldos antes de actualizar.
- Arquitectura, dominio, guías y diagramas actualizados. Documentación de aceptación al día y guía de distribución 1.1.0 incluida en el paquete, con referencias fijadas al tag. Inventario de archivos y SHA-256, calidad y paquete vinculados al commit exacto de CI. La release v1.0.0 conserva sus archivos originales.

## 1.0.0 — 2026-10-14

Primera release estable del MVP local. Completa las Fases 0–4.

- Biblioteca persistente con registro manual, revisión de duplicados, búsqueda, filtros, ordenación y vistas de cuadrícula/lista.
- Ficha de álbum con escucha, comentarios y valoraciones de 1 a 10 en pasos de 0,5; notas de álbum y pistas independientes.
- Listas originales, ediciones, apariciones de pistas compartidas y variantes con valoración propia.
- Ejemplares físicos, compras digitales y deseos por formato o edición, con cumplimiento explícito mediante una compra coincidente.
- Retirada reversible de álbumes, confirmaciones de eliminación y respaldos JSON con restauración íntegra en una biblioteca vacía.
- PWA para reabrir y gestionar la biblioteca offline tras prepararse; actualizaciones que esperan al cierre de las ventanas, información de almacenamiento y recuperación segura ante fallos.
- Verificación automatizada de dominio, interfaz y persistencia, aceptación en Chromium/Firefox/WebKit, accesibilidad, teclado y pantallas.
- Paquete estático con instrucciones, avisos de dependencias e inventario SHA-256, distribuido como ZIP con checksum.

La aplicación guarda los datos en el origen y perfil del navegador. Las portadas y enlaces externos requieren red. Las cuentas, sincronización, importación automática de plataformas y reproducción musical corresponden a etapas posteriores. Consulta los [límites y la guía de entrega](https://github.com/NicoCG32/Auditorium/blob/v1.0.0/docs/ENTREGA_MVP.md).
