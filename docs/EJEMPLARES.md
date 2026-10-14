# Ejemplares físicos y compras digitales

«Tu colección» registra cada copia del álbum por separado. Dos CD de la misma edición reciben IDs distintos y pueden retirarse independientemente. Una compra digital registra una adquisición; streaming y archivos gratuitos no declaran propiedad. Registrar o quitar ejemplares no cambia escucha, comentarios personales, catálogo ni valoraciones.

## Registro y eliminación

Un ejemplar físico admite vinilo, CD, casete u otro; compra digital exige descarga digital. La edición es opcional y se elige explícitamente entre las compatibles del mismo álbum: CD con CD, vinilo con vinilo, casete con casete, otro con otro y descarga digital con edición digital. No se infiere una edición por nombre.

Fecha de adquisición, condiciones de soporte/funda y notas son opcionales. La fecha es un día válido `YYYY-MM-DD`, sin zona horaria, y puede preceder al alta en biblioteca. La fecha interna de registro es UTC y no puede preceder a esa alta. Condiciones físicas no corresponden a una compra digital. Notas no vacías conservan espacios y saltos de línea; solo espacios se omiten.

La lista distingue cada copia mediante un identificador corto y se ordena por fecha de registro e ID. Cancelar registro descarta el borrador. «Eliminar ejemplar» selecciona un ID y abre una confirmación con sus consecuencias. «Conservar ejemplar» o Escape cancelan sin escribir y devuelven el foco a ese registro.

Confirmar retira únicamente el ejemplar seleccionado y sus notas de copia. Conserva álbum, ediciones, pistas, otras copias, experiencia y valoraciones. No se puede deshacer desde la aplicación; no hay eliminación en cascada del catálogo ni satisfacción automática de deseos. La confirmación es un diálogo dentro de la ficha, con nombre/descripción accesibles y foco inicial en conservar.

## Contrato y recuperación

`MusicLibrary.addOwnedItem(userAlbumId, input)` valida la entrada estricta, genera UUID/fecha y aplica `add_owned_item` en una transacción. `removeOwnedItem(userAlbumId, ownedItemId)` aplica `remove_owned_item`, exigiendo que el ejemplar corresponda a esa entrada activa. Validan propietario, referencias, compatibilidad y biblioteca antes de escribir. Copias iguales no se deduplican; IDs repetidos o referencias inválidas se rechazan.

Solo se escribe en `ownedItems`. No se actualiza la fecha ni la escucha de `UserAlbum`. Los [deseos](DESEOS_COMPRA.md) son registros independientes: registrar una compra ofrece cumplir coincidencias mediante acción explícita; retirar una copia no cambia sus estados. Un fallo de escritura conserva el borrador y los registros previos; una eliminación fallida conserva la confirmación para reintentar.

Después del commit, la lista muestra la copia añadida o retira la eliminada mientras relee el snapshot. Si esa lectura falla, anuncia el resultado confirmado y ofrece «Reintentar lectura de colección»: solo lee, sin registrar otra copia ni repetir una eliminación. Otras escrituras y la navegación esperan a recuperar la lectura coherente.

## Esquema histórico v2

La tabla `ownedItems` usa UUID como clave e índices de entrada personal, edición, medio, formato y fecha de registro. El dominio normaliza entradas previas sin esta colección a una lista vacía; el repositorio actual siempre lee la tabla y valida sus filas. v3 conserva su definición y añade los deseos.

`SCHEMA_V1` conserva su definición histórica y `SCHEMA_V2` añade exclusivamente esa tabla. Antes de abrir se verifican estructura, claves e índices existentes. Una v1 compatible se actualiza a v2 con la tabla nueva vacía, conservando identidad y filas. Estructuras incompletas, versiones intermedias desconocidas o futuras se rechazan sin reconstruir ni degradar la base. Un bloqueo por otra conexión se informa y admite reintento al cerrarla.

Se usan las [versiones declaradas de Dexie](https://dexie.org/docs/Version/Version.stores%28%29), sin transformar registros anteriores ni añadir dependencias. El MVP v1.0.0 incluye [respaldos y restauración](RESPALDOS_JSON.md); el [modelo de datos](MODELO_DATOS.md) describe el esquema vigente y su evolución.

## Verificación

Pruebas de dominio, aplicación, migración e interfaz con fixtures ficticios cubren copias iguales, referencias/compatibilidad, condiciones, fechas, ausencia, entrada activa, rollback, reapertura y concurrencia. Se verifica la conservación de todas las tablas v1 y el rechazo de esquemas incompletos/desconocidos/futuros.

La interfaz comprueba confirmación/cancelación/Escape, fecha ante cambios de otros campos, notas literales, cuota, remoción fallida, doble envío, relectura posterior al commit y exclusión de escrituras. La comprobación manual usa una base v1 poblada aislada, migra a v2 en IndexedDB real y recorre registro físico/digital, eliminación individual, recuperación, recarga, teclado y responsive. No se añade música ni ejemplares de ejemplo a la base del producto.
