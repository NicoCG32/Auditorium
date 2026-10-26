# Respaldos JSON y restauración

«Respaldos» permite descargar la biblioteca musical en JSON y restaurarla en un destino vacío. El audio y sus descriptores locales se trasladan únicamente mediante el [respaldo completo ZIP](AUDIO_LOCAL.md); el JSON conserva su límite y formato propios. Todo se procesa localmente; no se suben archivos a un servidor. El JSON incluye notas y valoraciones personales.

Los archivos generados con nombre `auditorium-*.json` se excluyen del control de versiones. Guarda los respaldos fuera del repositorio público.

## Archivo

El contrato vigente exporta `format: "auditorium-backup"`, `schemaVersion: 7`, `exportedAt` UTC y `data` con identidad, catálogo y biblioteca. Es independiente de IndexedDB, actualmente DB11/nativa110. El formato7 exige `library.albumGenreRatings`, aunque esté vacío; conserva notas y referencias independientes por género. Los formatos históricos 1–6 se validan con sus contratos estrictos y migran sin inferir notas. El formato6 añadió la referencia opcional de la nota general; el5 separó clasificación y el4 incorporó enlaces personales. Véase [compatibilidad de las notas por género](VALORACIONES_POR_GENERO.md#persistencia-y-compatibilidad).

Se incluyen todos los IDs y relaciones: artistas, álbumes y créditos, pistas y variantes, lista original, ediciones y apariciones, entradas personales activas/retiradas, escucha, fechas, notas, ejemplares, deseos y ratings. Una portada local JPEG/PNG se incluye como data URL en `Album.coverImage`; una URL remota conserva sólo el enlace, sin descargar su binario. No se incluyen índices derivados, claves técnicas de metadata, credenciales, solicitudes o resultados de recomendaciones. La clave propia de Groq/Gemini existe sólo en memoria y nunca forma parte del archivo. Los IDs y notas literales de un respaldo exportado válido se conservan al restaurar; el orden de pistas continúa determinado por disco/posición.

La exportación obtiene un snapshot validado dentro de una sola transacción de lectura. La descarga utiliza Blob JSON con nombre fechado, sin títulos ni identidad en el nombre. «Descarga iniciada» indica que el navegador recibió la solicitud; comprueba que el archivo se haya guardado en tu equipo. Un fallo no modifica la biblioteca ni produce un respaldo parcial.

Se admite un máximo de 20 MiB (20 × 1024 × 1024 bytes UTF-8), incluyendo blancos y BOM. Se comprueba el tamaño del archivo antes de leer y el tamaño del texto antes de parsear. Antes de mostrar la confirmación también se comprueba la representación serializada del documento validado. Exportar aplica el mismo límite para evitar generar un respaldo que esta versión no pueda restaurar.

## Validación y confirmación

Seleccionar un archivo solo lo lee y valida. Se rechazan JSON mal formado, formato ajeno, versiones no compatibles, campos desconocidos, colecciones requeridas ausentes, IDs duplicados, fechas inválidas, propietario incorrecto y referencias incoherentes. No se reparan ni fusionan registros silenciosamente. La validación emplea las mismas reglas del dominio que la biblioteca local.

Un archivo válido muestra fecha de exportación y cantidades de álbumes activos/retirados, catálogo, ediciones, pistas, copias, deseos y valoraciones. El diálogo explica que se recuperarán datos e identidad local del archivo. El foco comienza en cancelar; cancelar o Escape no escriben y devuelven el foco al selector. Confirmar es la única acción que inicia la restauración.

El selector solo se habilita si no hay datos musicales. Una biblioteca sin álbumes visibles puede seguir conteniendo álbumes retirados o catálogo: en ese caso no está vacía y no admite restauración. Este hito no reemplaza bibliotecas existentes ni realiza merge.

## Identidad y escritura atómica

El destino debe estar vacío en todas las tablas musicales y en ambas tablas de audio, conservando únicamente su identidad inicial en metadata. La comprobación incluye binarios o descriptores huérfanos; restaurar un JSON no los borra. `BackupLocalRepository.restoreEmpty(snapshot, expectedIdentity)` vuelve a validar el snapshot antes de abrir el destino y comprueba vacío/identidad dentro de la transacción de escritura. Metadata ajena, una alta concurrente o un cambio de identidad desde la preparación impiden restaurar sin modificar datos.

La identidad del archivo, incluidos UUID y fecha de creación, se adopta junto con todas sus relaciones en la misma transacción. Se derivan los índices locales al escribir. No se generan IDs de reemplazo ni se reasignan propietarios: al reabrir, la identidad corresponde a las entradas restauradas y estas quedan visibles. Las mutaciones musicales normales siguen sin poder cambiar identidad.

Cuota, aborto o cualquier fallo de escritura revierten tanto la adopción de identidad como las filas musicales. El archivo validado y la confirmación se conservan para reintentar. Dos restauraciones competidoras no mezclan datos; la segunda comprueba nuevamente el destino antes de escribir. Una biblioteca válida sin filas puede restaurar solo su identidad.

Después del commit, una lectura fallida muestra el resultado confirmado y las cantidades restauradas. «Reintentar lectura tras restauración» solo lee, sin repetir importación. Escrituras y navegación permanecen bloqueadas hasta recuperar un snapshot coherente. Reabrir o recargar consulta la identidad adoptada y las relaciones ya confirmadas.

## Contratos

- `LibraryBackups.export()` devuelve documento y texto serializado completos.
- `readFile(file)` comprueba tamaño, lee texto y valida el archivo, sin escribir en el repositorio.
- `restore(document, expectedIdentity)` valida versión/datos/tamaño y delega únicamente al caso de restauración vacía.

Se aceptan archivos v1/v2/v3/v4/v5 con sus contratos históricos estrictos. v1 no admite catalogReference; v1/v2 no admiten genres, country ni coverImage; v1/v2/v3 no admiten links o preferredPlaybackLinkId. Los álbumes de v1–v4 usan releaseType y no admiten campos nuevos de clasificación. Después de validar se transforman y se comprueban todas las relaciones; los formatos1–5 rechazan referenceReleaseId en la nota y no infieren una referencia; toda exportación usa v6. DB8 conserva identidad y tablas y sustituye únicamente el índice de tipo de álbum. Versiones futuras se rechazan. DB9 valida además las notas y todos los documentos del checkpoint sin alterar sus campos. Una aplicación anterior no abre DB9 ni el respaldo6; conserva los archivos históricos como copias independientes. El límite sigue en 20 MiB. Véase [clasificación y compatibilidad](CLASIFICACION_ALBUM.md#migración-y-compatibilidad).

Las pruebas ficticias cubren exportación/restauración completa, identidad, retirados, datos inválidos y tamaño, cuota/aborto tardíos, concurrencia, reapertura y recuperación de lectura. Ver [ADR-005](adr/005-identidad-respaldo.md) y [retirada personal](ELIMINACIONES_PERSONALES.md).
