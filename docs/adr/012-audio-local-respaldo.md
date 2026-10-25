# ADR-012: audio por dispositivo y respaldo completo propio

- Estado: aceptada e implementada en AUDIO-02.
- Fecha: 2026-10-24.
- Contexto: [evaluación y contrato de audio](../AUDIO_LOCAL.md), posterior a [sincronización opcional](011-supabase-sincronizacion.md).

## Contexto

Un audio propio es una fuente personal de UserAlbum, con referencia opcional a una pista del mismo Album. Debe sobrevivir a recarga y reinicio, sin confundirse con una adquisición, edición, nota o escucha. La web estática necesita recuperar y trasladar los archivos sin exigir un servicio de medios ni introducir binarios en el JSON musical de 20 MiB. Las pruebas previas encontraron diferencias reales de almacenamiento y decodificación entre motores.

## Decisión

Conservar bytes Uint8Array y descriptores en dos tablas locales de IndexedDB DB10/nativa100. El ámbito musical se añade al aislamiento existente por proyecto y cuenta. Límites: 16 MiB por archivo, 128 MiB y 128 adjuntos por biblioteca. Validar los bytes exactos con el decodificador nativo al seleccionarlos; guardar música y adjuntos en una transacción, con control del descriptor anterior. Las selecciones y borradores viven en memoria hasta confirmar.

JSON6, snapshots remotos y checkpoints excluyen bytes y descriptores de audio. Un ZIP Store completo de hasta 160 MiB contiene library.json, audio-manifest.json versión1 y binarios UUID. Se comprueban estructura, CRC, límites, identidad, referencias y SHA antes de confirmar. Sólo se restaura en un destino vacío, incluidos los dos stores de audio, mediante una transacción completa. Los formatos válidos que un destino no decodifica se conservan y muestran un error útil al cargar.

Reproducción explícita, sin autoplay, con una sola fuente activa compartida con streaming. Liberar el reproductor pausa el medio, elimina su origen y revoca su URL. Retirar un álbum conserva sus adjuntos; borrar audio elimina sólo las copias internas. No hay lectura de etiquetas para crear catálogo, transcodificación, almacenamiento de rutas originales ni subidas de archivos.

## Consecuencias

La función conserva costo de infraestructura adicional cero y funciona offline cuando la PWA y los bytes están disponibles. La cuota del origen y el soporte del decodificador siguen dependiendo del navegador; la evicción o limpieza puede borrar los archivos. Se requiere respaldo propio y conservar originales. El ZIP no está cifrado, no fusiona bibliotecas y no sustituye una política de copia externa del usuario. No se promete compatibilidad universal de formatos ni se reserva cuota al estimarla.

## Validación y referencias

[Modelo físico](../MODELO_DATOS.md), [dominio de audio](../../src/domain/audio.ts), [respaldo completo](../../src/application/complete-audio-backups.ts) y pruebas de aplicación/navegador mantienen los invariantes. Se verifican integridad, rollback por cuota/cancelación, cierre y reapertura offline, aislamiento por cuenta/dispositivo y exclusión de JSON/RPC. La matriz de formatos conserva por separado los resultados del laboratorio y de los motores nativos.
