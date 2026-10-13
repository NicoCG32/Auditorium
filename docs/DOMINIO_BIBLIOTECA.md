# Dominio de biblioteca personal

DOM-02 implementa modelos y cambios puros en `src/domain/library/`. El catálogo conserva los datos musicales; la biblioteca conserva la relación personal y sus calificaciones. La persistencia y los formularios se incorporarán en los hitos posteriores.

## Modelos

| Modelo      | Clave y función                                                     |
| ----------- | ------------------------------------------------------------------- |
| UserAlbum   | UUID de entrada, usuario y álbum; estado de escucha, notas y fechas |
| AlbumRating | Una nota por entrada personal, con unidades y fecha propias         |
| TrackRating | Una nota por entrada personal y pista, con unidades y fecha propias |

El snapshot requiere `userAlbums`, `albumRatings` y `trackRatings`, aunque las listas estén vacías. La creación y persistencia del UUID local corresponden a DATA-01; estos modelos reciben una identidad explícita y no inventan una identidad compartida.

`createLibrarySchema({ catalog, localUserId })` valida el contexto y devuelve un schema para comprobar estructura, referencias y pertenencia a esa identidad local. La autorización remota se incorporará en una etapa conectada.

## Invariantes

- Una sola entrada activa por usuario y álbum. Los IDs de entradas siempre son únicos.
- Una entrada dada de baja puede coexistir con una nueva activa bajo otro ID. Se permite conservar sus datos históricos; la política de eliminación de interfaz se definirá en Fase 4.
- Toda entrada pertenece a la identidad local del contexto y referencia un álbum existente.
- Una sola calificación por entrada/álbum y otra por entrada/pista. La pista debe existir y pertenecer al álbum correcto.
- Una pista compartida entre ediciones tiene la misma calificación; una variante identificada como otra pista admite nota propia. La edición no forma parte de la clave de calificación.
- Sin nota significa ausencia de registro. No guardar cero, null ni una media de canciones como nota del álbum.
- Cambiar escucha conserva notas, calificaciones, ejemplares y deseos. La [colección](EJEMPLARES.md) usa registros independientes por copia; escuchar no crea propiedad.

## Escala

`scoreUnits` es un entero de 2 a 20, equivalente a notas de 1 a 10 en pasos de 0,5. `scoreToUnits` valida la nota visible antes de multiplicar por dos; `unitsToScore` valida las unidades antes de dividirlas por dos. No redondean entradas inválidas ni convierten strings en números.

Por ejemplo, 9,5 se representa como 19; 9,3 es inválido. Quitar una calificación elimina su registro y conserva los otros datos personales.

## Cambios puros

`applyLibraryChange(context, library, change)` valida el estado inicial y el cambio, crea una copia y devuelve un snapshot nuevamente validado. No modifica el argumento, el catálogo ni una base de datos.

| Tipo de cambio          | Resultado                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------ |
| set_album_rating        | Crea o reemplaza solo la nota del álbum                                              |
| set_track_rating        | Crea o reemplaza solo la nota de la pista                                            |
| remove_album_rating     | Quita solo la nota del álbum                                                         |
| remove_track_rating     | Quita solo la nota de la pista                                                       |
| set_listening_status    | Cambia escucha y fecha de esa entrada                                                |
| set_personal_experience | Cambia escucha, comentario y fecha juntos; comentario omitido elimina solo ese campo |

Una entrada ausente o dada de baja no admite cambios. Las operaciones sobre pistas comprueban pertenencia incluso si se intenta quitar una nota ausente. Quitar una nota ya ausente es idempotente sobre un destino válido.

Los estados `untracked`, `queued`, `in_progress` y `completed` admiten todas las transiciones directas. Las notas del álbum y pistas tienen timestamps independientes de la entrada; modificar una nota no altera el estado ni su fecha de escucha.

## Fechas, notas y errores

- Fechas UTC con milisegundos, formato `YYYY-MM-DDTHH:mm:ss.sssZ`, recibidas explícitamente del llamador. Se comprueba validez real de fecha y orden temporal.
- `updatedAt` de entrada no precede a `addedAt`; una baja debe estar entre ambas fechas. Una nota no puede preceder al alta de la entrada.
- Un cambio fechado no sobrescribe una actualización posterior del mismo destino. Las transacciones serializan cambios locales y el editor de experiencia puede comprobar su referencia anterior mediante `expected`; la sincronización remota pertenece a sus siguientes hitos.
- UUID y referencias se normalizan a minúsculas mediante el scalar compartido con catálogo.
- Las notas personales preservan espacios y saltos de línea; una nota formada solo por blancos debe omitirse. Los opcionales ausentes se omiten, sin null.
- Objetos estrictos rechazan campos de otros modelos.
- Errores de schema: issues Zod con ruta y, para relaciones, `params.rule`. Cambios sobre destino ausente, inactivo, pista ajena o actualización antigua: `LibraryChangeError` con `rule`.

Estas funciones expresan reglas del dominio y `MusicLibrary` las aplica dentro de transacciones, preservando sus errores y los del almacenamiento. La interfaz consulta y modifica la biblioteca local según sus casos de uso. Las pruebas usan únicamente datos ficticios.

## Deseos de compra

`purchaseWishes` contiene objetivos por formato o edición, estado activo/cumplido/cancelado, notas opcionales y fecha UTC. Se exige al menos un objetivo válido del álbum, compatibilidad si se indican ambos e IDs únicos. `add_purchase_wish`, `update_purchase_wish` y `set_wish_status` conservan las otras colecciones. La edición comprueba la referencia leída; cumplir comprueba estado activo y un ejemplar coincidente vigente. Ver [contrato y migración v3](DESEOS_COMPRA.md).
