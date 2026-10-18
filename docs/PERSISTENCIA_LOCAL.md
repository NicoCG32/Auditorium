# Persistencia local — esquemas v1 a v6

El esquema vigente es v6, versión nativa 60: añade la tabla técnica `syncCheckpoint`, vacía para el uso sin cuenta, sin transformar las trece tablas e identidades musicales de v1–v5. Las cachés conectadas se separan por proyecto y cuenta. La [guía de sincronización](SINCRONIZACION_SUPABASE.md) documenta los checkpoints y la [ADR-011](adr/011-supabase-sincronizacion.md) justifica esta evolución. Los apartados v5 siguientes conservan la descripción de sus tablas musicales.

DATA-01 implementa el esquema IndexedDB con Dexie, la identidad local y un contrato de lectura consistente. DATA-02 incorpora [casos de uso y escrituras transaccionales](CASOS_DE_USO.md) sobre el mismo esquema. LIB-01 conecta la [consulta de biblioteca](CONSULTA_BIBLIOTECA.md) con su lectura validada.

El [modelo de datos](MODELO_DATOS.md) reúne el esquema físico vigente y su evolución desde el MVP v1.0.0, sus índices, contratos transaccionales y flujos de respaldo.

## Apertura e identidad

`IndexedDbRepository` implementa `TransactionalLocalRepository`, que extiende el contrato del dominio `LocalRepository` con `mutate`, además de `open`, `readSnapshot` y `close`. El dominio no importa Dexie ni depende de IndexedDB.

`open()` comprueba la versión y estructura nativas antes de permitir la apertura con Dexie. Un esquema más reciente o incompatible genera un error. La primera creación de tablas corresponde a la versión declarada, sin reparaciones automáticas de una base existente.

La identidad es un UUID aleatorio y una fecha UTC de creación, almacenados bajo la clave única `local_identity` en `metadata`. Se consulta o crea dentro de una transacción de escritura sobre todas las tablas. Las conexiones concurrentes se serializan y solo la primera inicialización genera el UUID. Las siguientes aperturas conservan la identidad y no vuelven a consultar el generador ni el reloj.

Si falta la identidad pero la base contiene datos, la operación falla. No se infiere un propietario ni se crea uno de reemplazo. Una identidad inválida también genera un error conservando los registros originales.

## Esquema musical heredado de v5

Nombre predeterminado: `auditorium`. La versión v5 usaba la versión nativa 50; v6 añade el checkpoint técnico. Las definiciones v1 a v4 se conservan como historial; v2 añade ejemplares y v3 deseos de compra. v4 conserva sus trece tablas e índices y admite la referencia opcional de catálogo dentro de `albums`. v5 conserva esa estructura y admite `Artist.country`, `Album.genres` y `Album.coverImage` opcionales. Es una barrera de compatibilidad para impedir que un binario anterior abra datos con campos nuevos; no consulta servicios ni transforma filas históricas.

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
| ownedItems    | id; entrada personal, edición, medio, formato y fecha de registro       |

La tabla `purchaseWishes` usa clave `id` e índices `userAlbumId`, `targetReleaseId`, `targetFormat`, `status` y `createdAt`.

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

`SCHEMA_V1` queda como historial inmutable. `SCHEMA_V2` añade exclusivamente `ownedItems`, vacía al migrar una v1 compatible, conservando filas e identidad. Se comprueban estructura, claves e índices tanto de v1 como v2 y se rechazan esquemas incompletos, versiones intermedias desconocidas o futuras sin reparación automática. La migración se prueba con bibliotecas vacías/pobladas, apertura concurrente y bloqueo de actualización. Ver [ejemplares y migración](EJEMPLARES.md). `SCHEMA_V3` añade únicamente `purchaseWishes`. v1/v2 compatibles migran a v3 conservando todas sus filas, ejemplares e identidad; se comprueban las tres versiones sin reparar bases incompletas. Ver [deseos y migración v3](DESEOS_COMPRA.md). `SCHEMA_V4` mantiene la estructura física de v3 y establece la barrera para `Album.catalogReference`. v1/v2/v3 compatibles migran a v4 sin perder identidad, IDs ni filas; la inspección reconoce las versiones históricas 10/20/30/40. `SCHEMA_V5` conserva esas tablas e índices y establece la barrera para país, géneros y portada local; admite la versión nativa 50 histórica y migra las cuatro anteriores sin transformar filas. Futuros cambios requerirán otra versión y migraciones explícitas cuando afecten datos.

Las pruebas usan fake-indexeddb con bases independientes y datos ficticios: reapertura, seis conexiones simultáneas, snapshots, claves únicas, rollback, bloqueos, cuotas y datos/esquemas inválidos. También se verificó IndexedDB real en dos pestañas, con ocho conexiones simultáneas y reapertura tras recargar. Las páginas auxiliares de esa comprobación no forman parte del producto.

La [matriz de aceptación de Fase 1](VALIDACION_PERSISTENCIA.md) detalla rechazos y rollback comprobados tras reabrir, aislamiento de lecturas, escrituras concurrentes y conservación de datos y esquemas incompatibles.

Los [respaldos JSON](RESPALDOS_JSON.md) permiten restaurar bibliotecas vacías con adopción de identidad atómica. La [PWA](PWA_OFFLINE.md) conserva los recursos propios para abrir offline y ofrece solicitar protección del almacenamiento. Su service worker no accede a IndexedDB ni modifica la identidad. Las [pruebas de migración y recuperación](MIGRACIONES_RECUPERACION.md) incluyen reinicio de Chromium, preservación completa y fallos con reintento. IndexedDB puede ser eliminado por el navegador; ni la caché ni la protección concedida sustituyen un respaldo. La validación final y entrega del MVP continúa en Fase 4.

Referencias: [ADR-001](adr/001-mvp-local.md), [transacciones y errores en Dexie](https://dexie.org/docs/Tutorial/Best-Practices) e [índices compuestos](https://dexie.org/docs/Compound-Index).

## Retirada reversible

La [baja personal](ELIMINACIONES_PERSONALES.md) conserva todas las filas dependientes y solo cambia `userAlbums`: fija `deletedAt`/`updatedAt` y deriva `activeAlbumKey=null`. Restaurar elimina el marcador, actualiza la fecha y deriva el índice activo, exigiendo que no exista otra entrada activa del mismo álbum. Se conservan IDs y fecha de alta; una referencia obsoleta se rechaza antes de escribir. Esta operación no añade tablas ni exige una migración propia; opera en el esquema vigente v5. Ver [ADR-004](adr/004-retirada-personal.md).

## Restauración vacía

`BackupLocalRepository` extiende el repositorio transaccional con `restoreEmpty`. La validación de datos ocurre antes de abrir; la transacción comprueba todas las colecciones vacías, metadata única e identidad esperada. Identidad respaldada y escrituras musicales se confirman o revierten juntas. Las mutaciones ordinarias siguen preservando identidad; no hay cambios de tablas ni versión. Ver [ADR-005](adr/005-identidad-respaldo.md).
