# Changelog

## Sin publicar

- Búsqueda opcional de álbumes en Wikidata por acción explícita, con revisión de candidatos, créditos múltiples y borrador editable. El registro manual continúa disponible sin coincidencia, red o servicio.
- Procedencia y referencias validadas de MusicBrainz, Spotify y YouTube en la ficha; URL de portada opcional de Cover Art Archive, aceptada por separado y cargada sólo al solicitarla.
- Recomendaciones de escucha o revaloración mediante Groq o Gemini, con clave propia sólo en memoria, contexto acotado y respuesta validada sobre álbumes ya guardados. No cambia valoraciones ni activa facturación; los niveles gratuitos dependen de cada cuenta y sus cuotas.
- Base local v4 (nativa 40) con las mismas trece tablas e índices de v3 y referencias opcionales de catálogo. Migración compatible desde v1/v2/v3 sin regenerar identidad ni IDs.
- Exportación de respaldos v2 e importación del formato v1 estricto normalizado a v2. Las claves y recomendaciones no forman parte de la base, respaldo o precaché.
- Guía de integraciones y ADR-008, con arquitectura, dominio, datos, privacidad y recuperación actualizados. La release v1.0.0 y sus archivos conservan su contrato original.

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
