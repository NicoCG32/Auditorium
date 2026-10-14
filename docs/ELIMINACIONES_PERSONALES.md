# Retirada y eliminaciones personales

Quitar un álbum de la biblioteca es una baja reversible. La entrada deja de aparecer en búsqueda, filtros y listas activas, pero sigue almacenada y disponible en «Álbumes retirados». No elimina datos del catálogo.

## Efectos por operación

| Operación                    | Efecto personal                                         | Datos conservados                                                                                               | Recuperación                                                                              |
| ---------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Quitar álbum de biblioteca   | Marca la entrada como retirada y actualiza su fecha     | ID, fecha de alta, escucha, notas, valoraciones de álbum/pistas, deseos con sus estados, ejemplares y sus notas | «Álbumes retirados» permite restaurar la misma entrada                                    |
| Restaurar álbum              | Reactiva esa entrada, con el mismo ID y fecha de alta   | Todos sus datos y el catálogo                                                                                   | Puede retirarse otra vez mediante confirmación                                            |
| Quitar valoración de álbum   | Retira solo ese registro de nota                        | Notas de pistas, escucha, notas personales, deseos, ejemplares y catálogo                                       | Se puede volver a valorar; no se restaura automáticamente la nota anterior                |
| Quitar valoración de pista   | Retira la nota de esa pista en todas sus apariciones    | Variantes, nota del álbum, datos personales y catálogo                                                          | Se puede volver a valorar; no hay restauración automática de la nota anterior             |
| Eliminar ejemplar            | Retira exclusivamente la copia seleccionada y sus notas | Otras copias, deseos, notas personales, escucha, valoraciones y catálogo                                        | No tiene restauración automática; requiere confirmación explicando sus consecuencias      |
| Cancelar deseo               | Cambia su estado y conserva objetivo/notas              | Copias y todas las otras colecciones                                                                            | Puede reactivarse                                                                         |
| Limpiar notas del formulario | Cambia únicamente el borrador                           | Los datos guardados hasta pulsar guardar                                                                        | Cancelar o recargar conserva los datos guardados; guardar un campo vacío quita esas notas |

No se incorpora borrado permanente del historial personal. Retirar no es una venta de ejemplares ni cancela deseos: ambos mantienen sus registros. Al restaurar vuelven a mostrarse los mismos datos. Los álbumes retirados no admiten edición de escucha, notas, ratings, copias o deseos hasta restaurarse.

## Confirmación y restauración

La ficha ofrece «Quitar álbum de biblioteca». El diálogo muestra el álbum, cantidades de valoraciones de pistas, copias y deseos, y explica la conservación de notas, escucha y catálogo. El foco comienza en «Conservar en biblioteca»; ese botón o Escape cancelan sin escribir y devuelven el foco. «Confirmar retirada» aplica la baja.

«Álbumes retirados» está disponible incluso si ya no quedan álbumes activos. Muestra las entradas retiradas y los datos que conservan. Restaurar abre su ficha con el mismo ID. Si existe otra entrada activa del mismo álbum, ambas se conservan; se ofrece abrir la activa para revisarla. No se fusionan ni transfieren datos silenciosamente. La restauración se rechaza también si otra conexión creó una entrada activa después de leer.

Quitar una nota requiere un diálogo independiente: muestra su valor, alcance y ausencia de restauración automática. En pistas explica que afecta a todas las apariciones de la misma identidad musical. Conservar o Escape cancelan; confirmar vuelve a comprobar que el valor vigente sea el confirmado.

## Transacción, concurrencia y errores

`removePersonalAlbum(userAlbumId, expectedToken)` y `restorePersonalAlbum(userAlbumId, expectedToken)` aplican cambios puros dentro de una transacción. `personalEntryToken` representa la entrada y sus ratings, deseos y copias, ordenados por clave. Es una referencia de concurrencia local, no una credencial, y no se registra ni transmite.

La baja comprueba la identidad, la entrada activa y la referencia completa mostrada al confirmar. Si notas, ratings, deseos o copias cambiaron, se rechaza y se permite releer antes de abrir una nueva confirmación. Cambios ajenos a esa entrada u ordenaciones de arrays no invalidan la referencia. Restaurar comprueba la misma referencia, la fecha y la ausencia de otra entrada activa del mismo álbum.

Solo cambia la fila `userAlbums`: baja fija `deletedAt`/`updatedAt`, restauración quita `deletedAt` y actualiza `updatedAt`. `activeAlbumKey` se deriva al persistir: null al retirar y usuario/álbum al restaurar. Se conserva el esquema v3; no hay tablas nuevas ni transformación de datos anteriores.

Cuota, abortos o restricciones revierten toda la transacción. La confirmación y los datos se conservan para reintentar. Un doble envío de la interfaz se bloquea. Una escritura confirmada seguida de lectura fallida muestra el resultado guardado y permite reintentar solo la lectura; otras escrituras y la navegación esperan una ficha coherente.

Los casos de quitar ratings admiten `expectedScore` opcional; los diálogos lo suministran siempre. Un valor distinto o una nota ya retirada se rechazan cuando se ha proporcionado esa referencia. Los llamadores sin referencia conservan la remoción explícita idempotente sobre un destino activo válido.

## Referencias del catálogo

Retirar o restaurar una entrada personal nunca borra álbumes, artistas, ediciones, pistas ni apariciones. No se añade un borrado de ediciones a la interfaz ni un caso de uso que elimine sus referencias en cascada.

Los validadores de snapshots impiden retirar una edición referenciada por copias o deseos, aunque su entrada personal esté retirada; también comprueban las apariciones de pistas. Una operación futura de catálogo deberá resolver esas referencias explícitamente antes de permitir eliminación. La baja personal no libera referencias para un borrado silencioso.

Las pruebas ficticias cubren retirada/restauración persistente, filas protegidas, unicidad, concurrencia, cuota/aborto, referencias históricas y errores de lectura/foco. Los [respaldos](RESPALDOS_JSON.md) incluyen retirados y sus relaciones; restauran datos e identidad en un destino vacío. El MVP v1.0.0 incluye [PWA y uso offline](PWA_OFFLINE.md).
