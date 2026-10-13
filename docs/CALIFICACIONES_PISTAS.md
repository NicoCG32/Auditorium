# Calificaciones de pistas

La ficha muestra la nota de cada pista en la lista original y en las ediciones. «Valorar pista» abre un único editor para esa identidad musical. Una aparición con título propio sigue usando la nota de su pista; varias apariciones de la misma pista muestran la misma nota. Una demo o variante tiene otro ID y puede tener una valoración independiente.

## Guardar y quitar

Se admiten notas de 1 a 10 en pasos de 0,5, con coma o punto decimal. Vacío, cero, valores fuera del rango y otros pasos son inválidos. «Guardar nota de pista» llama a `MusicLibrary.rateTrack(userAlbumId, trackId, score)`. Se guarda una sola nota por relación personal y pista, como unidades enteras de 2 a 20, dentro de la transacción existente.

«Quitar nota de pista» llama a `removeTrackRating` y elimina exclusivamente ese registro; no guarda cero. Todas sus apariciones pasan a «Sin nota». La nota del álbum, otras pistas y variantes, escucha, comentarios, catálogo y otros álbumes permanecen independientes. No se calcula un promedio para reemplazar la valoración del álbum.

El editor se identifica por el ID de pista. Cambiar de pista o de lista descarta el borrador sin guardar y muestra los datos de la nueva selección. «Cerrar valoración de pista» descarta ese borrador y devuelve el foco a su botón. Actualizar otra valoración conserva el borrador de la pista abierta. Los borradores no sobreviven a una recarga.

## Recuperación y coherencia

El formulario comparte validación, controles y recuperación con la valoración del álbum. Una entrada inválida enfoca el campo y asocia un mensaje mediante `aria-describedby`. Una escritura fallida conserva el borrador y la nota previa. Los mensajes evitan mostrar excepciones internas.

Después de confirmar el guardado o remoción, la ficha relee el snapshot y actualiza las apariciones por Track ID. Si esa lectura falla, el formulario y las apariciones visibles muestran el resultado confirmado. «Reintentar lectura de nota de pista» solo lee: no guarda otra vez ni repite una remoción. Hasta recuperar la lectura se bloquean los demás editores, el cambio de lista y la navegación. Al terminar se enfoca el campo de nota; durante recuperación se enfoca el reintento.

Las escrituras de álbum, pista, listas y experiencia comparten la exclusión de operaciones pendientes. Se impiden envíos repetidos. Una nota no se deduce de la edición ni del número de posición; las referencias se validan dentro del caso de uso. Si varias conexiones escriben una nota, queda la última transacción confirmada. Se consultan cambios externos al actualizar o recargar; no hay suscripción automática ni protocolo de sincronización.

## Verificación y alcance

Las pruebas de interfaz atraviesan el repositorio con IndexedDB simulado y fixtures ficticios: notas compartidas en original y ediciones, variante independiente, apariciones repetidas/título propio, quitar, validación, cuota/rollback, reapertura, lectura fallida tras guardar o quitar, exclusión de escrituras, identidad de borrador y foco. Las pruebas existentes de dominio y aplicación validan el par relación/pista y su independencia de la nota del álbum.

La comprobación manual usa IndexedDB real en una base aislada del producto: guardado por teclado, varias ediciones, demo independiente, remoción, recarga, cuota y recuperación de lectura, móvil y foco. No se cargan datos de ejemplo en la biblioteca del producto. Las tablas y dependencias de calificaciones se conservan. [Ejemplares](EJEMPLARES.md) añade el esquema v2 sin modificar sus filas; [Deseos](DESEOS_COMPRA.md) añade el esquema v3 y conserva las otras colecciones.
