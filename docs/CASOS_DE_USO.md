# Casos de uso del núcleo local

DATA-02 conecta los modelos con IndexedDB mediante `MusicLibrary`, en `src/application/`. La aplicación recibe un repositorio transaccional y proveedores síncronos de UUID/reloj; no importa React ni Dexie. LIB-02 conecta el formulario manual al caso `registerAlbum`, con revisión transaccional de coincidencias antes de crear. Ver [registro manual](REGISTRO_MANUAL.md).

## Operaciones

| Caso de uso                           | Resultado                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| createAlbum                           | Crea álbum, créditos, artistas nuevos indicados y, por defecto, entrada personal en una operación       |
| registerAlbum                         | Devuelve coincidencias para revisión o crea álbum y relación personal tras la decisión explícita        |
| addAlbumToLibrary                     | Crea una entrada activa o devuelve la existente sin alterar notas o fechas                              |
| addRelease                            | Crea una edición del álbum y copia su lista original si existe, salvo indicación contraria              |
| addTrackToRelease                     | Reutiliza una pista indicada por UUID o crea una nueva, y añade su aparición ordenada                   |
| saveTrackList                         | Guarda la lista original o la de una edición como lote validado, con referencia inicial de concurrencia |
| addOwnedItem                          | Registra una copia física o compra digital con UUID propio, validando entrada, formato y edición        |
| removeOwnedItem                       | Retira únicamente el ejemplar seleccionado, conservando catálogo y las demás colecciones personales     |
| rateAlbum / rateTrack                 | Guarda la nota visible validada como unidades enteras, independientemente                               |
| removeAlbumRating / removeTrackRating | Quita exclusivamente la nota seleccionada                                                               |
| updatePersonalExperience              | Guarda escucha y comentario juntos; opcionalmente rechaza una referencia de experiencia desactualizada  |

Todos devuelven promesas que se resuelven después de completar la transacción. Las entradas inválidas se rechazan conservando el detalle de validación.

Los [deseos de compra](DESEOS_COMPRA.md) añaden `addPurchaseWish`, `updatePurchaseWish` y `setPurchaseWishStatus`: alta activa, edición con referencia previa y cambio explícito de estado. Cumplir requiere una copia coincidente vigente; registrar ejemplares nunca cumple deseos automáticamente.

## Altas y relaciones

`createAlbum` requiere título y una lista de créditos con al menos un artista principal. Cada crédito indica un artista existente mediante `artistId` o los datos de un artista nuevo. No se fusionan nombres coincidentes. La posición de crédito corresponde al orden de la lista. Los registros creados manualmente se vinculan a la identidad local como creador.

`addToLibrary` es verdadero por defecto y puede ser falso para crear solo catálogo. Añadir después un álbum activo devuelve la misma entrada. Si únicamente existen históricos dados de baja, se crea una entrada activa con otro ID conservando los históricos.

`addRelease` necesita álbum y formato; los metadatos siguen siendo opcionales. `copyCoreTracks` es verdadero por defecto y reutiliza identificadores y posiciones de la lista original, sin inventar duraciones. No crea propiedad ni una segunda entrada de biblioteca.

`addTrackToRelease` recibe una edición, disco y posición. Para reutilizar indica `trackId`; para crear indica `track` con título y metadatos opcionales de variante. Ambas opciones son excluyentes. Una pista debe pertenecer al álbum de la edición. `corePosition`, si se especifica, añade también una aparición a la lista original; añadir un bonus a una reedición no modifica esa lista automáticamente.

Los consumidores deben ordenar las listas por disco/posición; el orden de los arrays del snapshot no sustituye sus campos de orden.

`saveTrackList` reemplaza las apariciones de una única lista, conservando pistas y datos personales. Valida referencias y posiciones finales y rechaza una lista desactualizada dentro de la transacción. Permite guardar intercambios de posición sin estados intermedios visibles. Ver [listas originales y ediciones](LISTAS_EDICIONES.md).

## Transacción e integridad

El contrato `TransactionalLocalRepository.mutate` recibe una función síncrona sobre una copia de un snapshot. Devuelve el nuevo snapshot y un resultado. El adaptador:

1. Abre la base compatible y conserva la identidad existente.
2. Lee identidad, catálogo y biblioteca dentro del scope de escritura.
3. Ejecuta el cambio y valida el resultado completo antes de escribir.
4. Rechaza cambios de identidad local y resultados que sean promesas externas.
5. Calcula diferencias por clave y escribe únicamente filas añadidas, modificadas o retiradas.
6. Confirma toda la operación o revierte sus escrituras si falla.

Las filas afectadas se retiran antes de guardar su nueva versión para liberar índices únicos; esa ausencia temporal permanece dentro de la transacción. Un fallo posterior restaura también las filas retiradas. Metadata no forma parte de las escrituras musicales.

Las operaciones concurrentes leen el estado vigente al obtener la transacción. Dos solicitudes de añadir el mismo álbum conservan una sola entrada activa. No realizar fetch, timers ni otro I/O externo dentro del callback transaccional.

## Calificaciones y errores

Las notas visibles usan 1–10 con paso 0,5; se validan antes de convertirlas a `scoreUnits`. La nota de una pista compartida conserva su identidad entre ediciones y una demo puede tener otra. Cambiar pistas no calcula ni sobrescribe la nota del álbum. Las remociones no cambian escucha, comentarios ni otras notas.

Se conservan los errores del dominio y de Zod para entradas, relaciones y operaciones inválidas. Los errores de I/O se propagan como `LocalStorageError`, incluida falta de espacio dentro de un lote de escrituras, preservando su causa. Capturarlos en la interfaz o en el llamador final; los scopes transaccionales no los silencian.

## Verificación y límites

Las pruebas de integración usan IndexedDB simulado y datos ficticios para el flujo principal, duplicados, referencias, edición Deluxe, calificaciones, reapertura y rollback. También se recorrió el flujo con IndexedDB real, dos conexiones y un fallo de escritura provocado al reemplazar una nota.

El adaptador prioriza integridad leyendo y validando un snapshot completo; persiste únicamente las diferencias. Consultas y scopes más acotados podrán incorporarse si las mediciones de colecciones grandes lo requieren, manteniendo las reglas y sus pruebas.

El esquema v2 añade [ejemplares](EJEMPLARES.md), con migración aditiva desde v1. `addOwnedItem` registra cada copia con ID propio; `removeOwnedItem` retira solo el ID elegido tras la confirmación de interfaz. Ambas operaciones conservan catálogo y otras colecciones personales. Consulta, registro manual, listas, experiencia y valoraciones de álbum y pistas usan el núcleo local. Ver [calificaciones de pistas](CALIFICACIONES_PISTAS.md) para identidad compartida, independencia y recuperación de errores en la interfaz. Los [deseos](DESEOS_COMPRA.md) se incorporan en v3 como registros independientes. No se incorporan funciones de importación, respaldo, sincronización ni autenticación en estos casos de uso.

Referencia: [transacciones de Dexie](<https://dexie.org/docs/Dexie/Dexie.transaction()>).
