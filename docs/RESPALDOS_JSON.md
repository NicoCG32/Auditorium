# Respaldos JSON y restauración

«Respaldos» permite descargar la biblioteca completa y restaurarla en un destino vacío. Todo se procesa localmente; no se suben archivos a un servidor. El JSON incluye notas y valoraciones personales.

Los archivos generados con nombre `auditorium-*.json` se excluyen del control de versiones. Guarda los respaldos fuera del repositorio público.

## Archivo

El contrato vigente exporta `format: "auditorium-backup"`, `schemaVersion: 2`, `exportedAt` UTC y `data` con identidad, catálogo y biblioteca. La versión del archivo es independiente de la versión física de IndexedDB, actualmente v4 (nativa 40). El formato 2 admite la referencia opcional `Album.catalogReference`, incluidos procedencia, fecha e IDs externos validados.

Se incluyen todos los IDs y relaciones: artistas, álbumes y créditos, pistas y variantes, lista original, ediciones y apariciones, entradas personales activas/retiradas, escucha, fechas, notas, ejemplares, deseos y ratings. No se incluyen índices derivados, claves técnicas de metadata, credenciales, solicitudes o resultados de recomendaciones. La clave propia de Groq/Gemini existe sólo en memoria y nunca forma parte del archivo. Los IDs y notas literales de un respaldo exportado válido se conservan al restaurar; el orden de pistas continúa determinado por disco/posición.

La exportación obtiene un snapshot validado dentro de una sola transacción de lectura. La descarga utiliza Blob JSON con nombre fechado, sin títulos ni identidad en el nombre. «Descarga iniciada» indica que el navegador recibió la solicitud; comprueba que el archivo se haya guardado en tu equipo. Un fallo no modifica la biblioteca ni produce un respaldo parcial.

Se admite un máximo de 20 MiB (20 × 1024 × 1024 bytes UTF-8), incluyendo blancos y BOM. Se comprueba el tamaño del archivo antes de leer y el tamaño del texto antes de parsear. Antes de mostrar la confirmación también se comprueba la representación serializada del documento validado. Exportar aplica el mismo límite para evitar generar un respaldo que esta versión no pueda restaurar.

## Validación y confirmación

Seleccionar un archivo solo lo lee y valida. Se rechazan JSON mal formado, formato ajeno, versiones no compatibles, campos desconocidos, colecciones requeridas ausentes, IDs duplicados, fechas inválidas, propietario incorrecto y referencias incoherentes. No se reparan ni fusionan registros silenciosamente. La validación emplea las mismas reglas del dominio que la biblioteca local.

Un archivo válido muestra fecha de exportación y cantidades de álbumes activos/retirados, catálogo, ediciones, pistas, copias, deseos y valoraciones. El diálogo explica que se recuperarán datos e identidad local del archivo. El foco comienza en cancelar; cancelar o Escape no escriben y devuelven el foco al selector. Confirmar es la única acción que inicia la restauración.

El selector solo se habilita si no hay datos musicales. Una biblioteca sin álbumes visibles puede seguir conteniendo álbumes retirados o catálogo: en ese caso no está vacía y no admite restauración. Este hito no reemplaza bibliotecas existentes ni realiza merge.

## Identidad y escritura atómica

El destino debe estar vacío en todas las tablas musicales y conservar únicamente su identidad inicial. `BackupLocalRepository.restoreEmpty(snapshot, expectedIdentity)` vuelve a validar el snapshot antes de abrir el destino y comprueba vacío/identidad dentro de la transacción de escritura. Metadata ajena, una alta concurrente o un cambio de identidad desde la preparación impiden restaurar sin modificar datos.

La identidad del archivo, incluidos UUID y fecha de creación, se adopta junto con todas sus relaciones en la misma transacción. Se derivan los índices locales al escribir. No se generan IDs de reemplazo ni se reasignan propietarios: al reabrir, la identidad corresponde a las entradas restauradas y estas quedan visibles. Las mutaciones musicales normales siguen sin poder cambiar identidad.

Cuota, aborto o cualquier fallo de escritura revierten tanto la adopción de identidad como las filas musicales. El archivo validado y la confirmación se conservan para reintentar. Dos restauraciones competidoras no mezclan datos; la segunda comprueba nuevamente el destino antes de escribir. Una biblioteca válida sin filas puede restaurar solo su identidad.

Después del commit, una lectura fallida muestra el resultado confirmado y las cantidades restauradas. «Reintentar lectura tras restauración» solo lee, sin repetir importación. Escrituras y navegación permanecen bloqueadas hasta recuperar un snapshot coherente. Reabrir o recargar consulta la identidad adoptada y las relaciones ya confirmadas.

## Contratos

- `LibraryBackups.export()` devuelve documento y texto serializado completos.
- `readFile(file)` comprueba tamaño, lee texto y valida el archivo, sin escribir en el repositorio.
- `restore(document, expectedIdentity)` valida versión/datos/tamaño y delega únicamente al caso de restauración vacía.

Se aceptan archivos v1 mediante su contrato histórico estricto, que rechaza campos nuevos como `catalogReference`. Tras validar se normalizan internamente a v2 y se comprueban todas las relaciones; se conservan identidad, IDs y valores, sin inventar procedencia. Toda nueva exportación usa v2. Versiones desconocidas o futuras se rechazan. La base v4 conserva las tablas e índices de v3 y bloquea la apertura con binarios anteriores. Una versión antigua de Auditorium no puede leer respaldos v2: conserva los archivos anteriores como copias independientes al actualizar. El MVP v1.0.0 incluye [PWA](PWA_OFFLINE.md) y la [validación de sus recorridos offline](VALIDACION_MVP.md).

Las pruebas ficticias cubren exportación/restauración completa, identidad, retirados, datos inválidos y tamaño, cuota/aborto tardíos, concurrencia, reapertura y recuperación de lectura. Ver [ADR-005](adr/005-identidad-respaldo.md) y [retirada personal](ELIMINACIONES_PERSONALES.md).
