# Changelog

## Sin publicar

- Nombres de álbumes, artistas, alias acreditados y géneros con mayúscula inicial por palabra al añadir o editar, también desde catálogo; conserva siglas reconocibles como AC/DC, R.E.M. y U2. Las correcciones de mayúsculas/espacios mantienen IDs y procedencia externa. Lectura e importación conservan los nombres históricos, sin migración masiva.

- Navegación por Biblioteca, Añadir álbum, Calificaciones y Mi colección mediante rutas de fragmento compatibles con Pages. Conserva contexto, consulta, vista, foco y posición al regresar; Calificaciones y Mi colección incorporan índices iniciales sobre los datos existentes, con medios físicos y digitales diferenciados.
- Protección de borradores al navegar, usar Atrás/Adelante o cancelar editores: guardar y salir, descartar explícitamente o seguir editando. Un commit con lectura fallida bloquea nuevas escrituras y sólo reintenta lectura; el alta abre su ficha después de confirmar ambos pasos. Los borradores siguen en memoria de la pestaña y no sobreviven a una recarga confirmada.
- Búsqueda opcional de álbumes en Wikidata por acción explícita, con revisión de candidatos, créditos múltiples y borrador editable. El registro manual continúa disponible sin coincidencia, red o servicio.
- Procedencia y referencias validadas de MusicBrainz, Spotify y YouTube en la ficha; URL de portada opcional de Cover Art Archive, aceptada por separado y cargada automáticamente en el borrador, la ficha y las tarjetas.
- Recomendaciones de escucha o revaloración mediante Groq o Gemini, con clave propia sólo en memoria, contexto acotado y respuesta validada sobre álbumes ya guardados. No cambia valoraciones ni activa facturación; los niveles gratuitos dependen de cada cuenta y sus cuotas.
- Edición de metadatos de álbumes guardados con el mismo ID, comprobación de cambios concurrentes y conservación de listas, notas, colección y deseos. Cambiar el nombre de un artista crea una identidad para ese álbum; corregir su país mantiene la referencia compartida y se advierte en el editor.
- Géneros libres de álbum y país de origen de cada artista, con búsqueda, filtros y ordenación A–Z. Portadas JPEG/PNG locales de hasta 2 MiB, validadas antes de guardarse y disponibles también offline.
- Base local v5 (nativa 50) con las mismas trece tablas e índices de v3/v4, referencias opcionales de catálogo, géneros, país y portada local. Migración compatible desde v1/v2/v3/v4 sin regenerar identidad ni IDs.
- Exportación de respaldos v3 e importación de formatos v1/v2 mediante sus contratos históricos estrictos, normalizados a v3. Las claves y recomendaciones no forman parte de la base, respaldo o precaché.
- Guías de integraciones y edición, ADR-008/ADR-009, con arquitectura, dominio, datos, privacidad y recuperación actualizados. La release v1.0.0 y sus archivos conservan su contrato original.

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
