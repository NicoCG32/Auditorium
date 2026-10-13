# Listas originales y ediciones

La ficha reúne una lista original de referencia y las publicaciones del mismo álbum. «Lista que quieres consultar» alterna entre ellas sin crear otro álbum ni otra relación personal. Una edición requiere formato; nombre y año son opcionales. «Copiar lista original» reutiliza los IDs de sus pistas y sus posiciones al crear la edición. Desmarcarlo permite empezar con una lista vacía.

## Editar una lista

«Editar lista original» y «Editar lista de edición» abren un borrador de la lista seleccionada. Cada aparición tiene disco y posición enteros positivos; la combinación debe ser única dentro de esa lista. Se permiten varios discos, huecos y la misma pista en posiciones diferentes. Cambiar posiciones de varias apariciones se guarda en una sola transacción, incluidos intercambios de orden.

Una aparición puede utilizar una pista existente del mismo álbum o crear una nueva. Las pistas compartidas conservan identidad y valoraciones. Para una versión musical diferente se crea otra pista y se indica su original en «Variante de», con una etiqueta opcional como Demo. No se fusionan títulos coincidentes. El editor no modifica el título ni otros datos de una pista compartida: el título mostrado exclusivamente en una edición se indica en «Título en esta edición».

Las ediciones permiten contenido estándar, bonus, alternativo u otro, título de aparición y duración opcional. La duración se introduce en minutos y segundos (`3:45`, o `3:45.123` para conservar precisión) y se guarda como milisegundos enteros positivos. Los datos ausentes se omiten.

«Quitar aparición» cambia solo el borrador. Al guardar, retira la aparición de esa lista y conserva la entidad pista, sus variantes, las otras listas y sus valoraciones. «Descartar borrador» abandona todos los cambios sin escribir. Cambiar de lista se habilita al terminar o descartar la edición del borrador. Volver a la biblioteca o recargar descarta borradores sin guardar.

## Contrato e integridad

`MusicLibrary.saveTrackList` recibe `albumId`, `releaseId` opcional, `expected` y `rows`. Sin edición cambia exclusivamente los `CoreTrack` de ese álbum; con edición cambia exclusivamente sus `ReleaseTrack`. Cada fila indica `trackId` o `track` nuevo, disco y posición. Una aparición existente puede conservar su ID mediante `occurrenceId`; este ID debe pertenecer a la edición editada. Para la lista original se rechazan atributos exclusivos de edición.

`trackListToken` genera la referencia inicial a partir de las apariciones ordenadas y los datos de las pistas referenciadas. La interfaz la captura al abrir el borrador y no la renueva al refrescar una valoración. La referencia se compara dentro de la transacción con la lista vigente; un cambio en otra lista independiente no invalida el borrador. Un conflicto lanza `TrackListConflictError` antes de escribir. El token es una comprobación local de concurrencia, sin autenticación ni protocolo de sincronización.

La lista final se valida completa antes de persistir: posiciones, IDs únicos, referencias al álbum correcto, variantes existentes y ausencia de ciclos. Los IDs nuevos se generan localmente; los registros existentes y las tablas personales se conservan. El adaptador escribe diferencias por clave y confirma o revierte todo el lote. No cambia la identidad local. La colección de ejemplares incorpora la [migración v2](EJEMPLARES.md), manteniendo las tablas musicales.

## Fallos y recuperación

- Un dato inválido o una escritura fallida conserva la lista guardada y el borrador, con un mensaje enfocado y reintento disponible.
- Ante otra conexión, el guardado se bloquea; «Descartar borrador y cargar lista guardada» reemplaza explícitamente el borrador. Una lectura fallida conserva el borrador hasta poder cargar.
- Una escritura confirmada seguida de lectura fallida anuncia que el cambio se guardó. «Reintentar lectura de listas» solo lee, sin crear otra edición ni volver a guardar la lista. Las demás escrituras y la navegación esperan esa lectura.
- El editor comparte el bloqueo de operaciones pendientes con valoración y experiencia. Los controles y mensajes son nativos, con `status`, `alert` y foco visible; el diseño se adapta a una columna en móvil.

## Verificación y alcance

Las pruebas recorren la interfaz y el repositorio con datos ficticios: original sin edición previa, copia de IDs, orden propio, bonus, variantes, conservación de datos personales y otras listas, referencias y posiciones inválidas, rollback, reapertura, conflictos, doble envío y lectura fallida después del commit. La conversión de duración comprueba precisión y entradas inválidas.

La verificación en IndexedDB real usa una base aislada y comprueba guardado por teclado, posiciones repetidas, rollback, reintento, otra conexión, recarga, copia de lista y responsive. No se añade música de ejemplo a la biblioteca del producto.

La ficha permite [calificar pistas](CALIFICACIONES_PISTAS.md) por identidad compartida entre apariciones; las variantes tienen nota independiente. Los [ejemplares](EJEMPLARES.md) se registran independientemente; los [deseos](DESEOS_COMPRA.md) apuntan a formato o edición y se cumplen mediante acción explícita. No se eliminan álbumes, ediciones ni entidades pista. Respaldo y PWA pertenecen a Fase 4.
