# Persistencia local — esquema inicial

DATA-01 implementa el esquema IndexedDB con Dexie, la identidad local y un contrato de lectura consistente. DATA-02 incorpora [casos de uso y escrituras transaccionales](CASOS_DE_USO.md) sobre el mismo esquema. La bienvenida todavía no abre la base ni carga una colección.

## Apertura e identidad

`IndexedDbRepository` implementa `TransactionalLocalRepository`, que extiende el contrato del dominio `LocalRepository` con `mutate`, además de `open`, `readSnapshot` y `close`. El dominio no importa Dexie ni depende de IndexedDB.

`open()` comprueba la versión y estructura nativas antes de permitir la apertura con Dexie. Un esquema más reciente o incompatible genera un error. La primera creación de tablas corresponde a la versión declarada, sin reparaciones automáticas de una base existente.

La identidad es un UUID aleatorio y una fecha UTC de creación, almacenados bajo la clave única `local_identity` en `metadata`. Se consulta o crea dentro de una transacción de escritura sobre todas las tablas. Las conexiones concurrentes se serializan y solo la primera inicialización genera el UUID. Las siguientes aperturas conservan la identidad y no vuelven a consultar el generador ni el reloj.

Si falta la identidad pero la base contiene datos, la operación falla. No se infiere un propietario ni se crea uno de reemplazo. Una identidad inválida también genera un error conservando los registros originales.

## Esquema v1

Nombre predeterminado: `auditorium`. Versión lógica: 1. Se materializan únicamente las entidades implementadas, además de metadata.

| Tabla         | Clave e índices principales                                             |
| ------------- | ----------------------------------------------------------------------- |
| metadata      | key                                                                     |
| artists       | id; name no único                                                       |
| albums        | id; title no único, releaseType, originalYear                           |
| albumArtists  | álbum/artista/rol; posición única por álbum; artista                    |
| tracks        | id; álbum, título y variante original                                   |
| coreTracks    | álbum/disco/posición; álbum/pista                                       |
| releases      | id; álbum y formato                                                     |
| releaseTracks | id; posición única por edición/disco; edición/pista y pista             |
| userAlbums    | id; activeAlbumKey único; usuario/álbum, álbum, escucha y fecha de alta |
| albumRatings  | entrada personal como clave primaria                                    |
| trackRatings  | entrada personal/pista como clave primaria; pista                       |

IndexedDB no ofrece claves foráneas. Los validadores de dominio comprueban las referencias antes de escribir dentro de la transacción. Los índices únicos complementan esas reglas.

### Unicidad activa

El registro almacenado de UserAlbum incluye `activeAlbumKey`, derivado de usuario y álbum cuando está activo. Una entrada dada de baja guarda null, que no participa en ese índice. Así pueden coexistir históricos y una sola entrada activa.

`toStoredUserAlbum` valida y calcula el índice; `fromStoredUserAlbum` comprueba su coherencia y lo separa del modelo de dominio. El campo técnico no se incorpora a la biblioteca ni a sus calificaciones. Las escrituras de biblioteca usan este mapper, junto con la validación de dominio.

## Snapshot y errores

`readSnapshot()` lee identidad, catálogo y biblioteca dentro de una sola transacción de lectura. Valida modelos, relaciones, propietario y campos derivados antes de devolverlos. Nunca mezcla lecturas independientes de tablas mientras otros cambios podrían estar en curso.

Los fallos se propagan como `LocalStorageError`, con código, mensaje y causa original. Se distinguen API ausente o restringida, apertura bloqueada, cuota, datos inválidos, identidad ausente, generación inválida, restricciones, abortos y versiones incompatibles. `recoverable` indica que el llamador debe presentar una acción de recuperación; no promete que cualquier fallo desaparezca con un reintento.

Una apertura nativa bloqueada no se cancela de inmediato porque IndexedDB no permite cancelar ese request antes de que termine. Se informa el bloqueo, se evita lanzar aperturas duplicadas y se cierra la conexión pendiente cuando puede completar. El usuario puede cerrar las conexiones anteriores y reintentar. Los errores de transacción se capturan fuera del scope para conservar rollback.

No borrar, vaciar o recrear automáticamente la base ante un fallo. No registrar datos personales en mensajes o telemetría. El adaptador actual no activa servicios remotos.

## Evolución y verificación

La definición `SCHEMA_V1` queda como historial inmutable. Los futuros cambios requerirán otra versión y, cuando afecten datos, migraciones explícitas y probadas. Esta es la primera versión publicada del esquema; no se inventan migraciones entre versiones que todavía no existen.

Las pruebas usan fake-indexeddb con bases independientes y datos ficticios: reapertura, seis conexiones simultáneas, snapshots, claves únicas, rollback, bloqueos, cuotas y datos/esquemas inválidos. También se verificó IndexedDB real en dos pestañas, con ocho conexiones simultáneas y reapertura tras recargar. Las páginas auxiliares de esa comprobación no forman parte del producto.

La [matriz de aceptación de Fase 1](VALIDACION_PERSISTENCIA.md) detalla rechazos y rollback comprobados tras reabrir, aislamiento de lecturas, escrituras concurrentes y conservación de datos y esquemas incompatibles.

Las funciones de PWA, respaldo JSON y recuperación de bibliotecas pertenecen a Fase 4. IndexedDB puede ser eliminado por el navegador; la implementación de almacenamiento no sustituye esos hitos.

Referencias: [ADR-001](adr/001-mvp-local.md), [transacciones y errores en Dexie](https://dexie.org/docs/Tutorial/Best-Practices) e [índices compuestos](https://dexie.org/docs/Compound-Index).
