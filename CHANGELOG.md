# Changelog

## Sin publicar

Sin cambios pendientes posteriores a 1.1.0.

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
