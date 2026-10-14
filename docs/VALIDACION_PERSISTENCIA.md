# Validación del núcleo local

Este documento conserva la aceptación de Fase 1 sobre dominio y casos de uso locales. La Fase 4 añade [migraciones, reinicio del navegador y recuperación](MIGRACIONES_RECUPERACION.md). Estos resultados no equivalen a la entrega del MVP completo.

## Matriz de aceptación

| Regla                                                                                                   | Evidencia automatizada                                                                                             | Comprobación en IndexedDB real                                                                    |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Original y Deluxe comparten versiones musicales; una demo tiene identidad y nota propias                | Casos de uso de ediciones y calificaciones; reapertura del catálogo                                                | Altas, pistas compartidas, demo y notas independientes                                            |
| Referencias cruzadas, duplicados activos, ciclos y notas inválidas se rechazan juntos con otros cambios | Mutaciones inválidas comparadas con el snapshot previo después de cerrar y reabrir                                 | Cuatro rechazos con reapertura y conservación de filas                                            |
| Un fallo de escritura conserva todas las tablas y la identidad                                          | Cuota al reemplazar una nota; abortar la transacción después de escribir un álbum; comparación tras reapertura     | Abort nativo posterior a una escritura, con rollback y reapertura                                 |
| Conexiones concurrentes no pierden altas ni notas distintas                                             | Dos conexiones escriben álbumes y calificaciones independientes                                                    | Dos altas y dos notas conservadas tras reapertura                                                 |
| Las lecturas no presentan un grafo parcialmente guardado                                                | Lecturas concurrentes comparadas con los snapshots completos anterior y posterior                                  | Cubierto por las transacciones del flujo; la prueba de lectores pertenece a la suite automatizada |
| Cambiar posiciones de Deluxe conserva IDs, notas y lista original                                       | Intercambio de dos posiciones con índice único y reapertura                                                        | Intercambio sin modificar CoreTrack                                                               |
| Datos persistidos inválidos no se borran ni se corrigen silenciosamente                                 | Ciclo, referencia cruzada, índice activo alterado y rating inválido bloquean lectura y mutación; filas sin cambios | Ciclo persistido bloquea lectura y escritura; registros conservados                               |
| Un esquema v1 incompatible se informa sin reparación implícita                                          | Índice ausente, renombrado o sin unicidad; comparación directa de estructura nativa e identidad                    | Índice renombrado devuelve `corrupt_data`; esquema e identidad conservados                        |

Las suites están en [casos de uso](../src/application/music-library.test.ts), [repositorio](../src/infrastructure/repositories/indexeddb-repository.test.ts) y [integridad persistida](../src/infrastructure/repositories/integrity-persistence.test.ts), además de las pruebas del dominio. Todas usan datos ficticios y bases aisladas. Se ejecutan con `npm run check`, junto con formato, lint, tipos y compilación.

Las comprobaciones manuales usan páginas auxiliares de desarrollo y bases independientes del producto. Esas páginas no se distribuyen con la aplicación. Los fallos de cuota son inyectados: comprueban propagación y rollback, sin afirmar que se agotó realmente el almacenamiento del navegador.

## Corrección comprobada

En DATA-03, la apertura comparaba la cantidad de índices antes de acceder a cada nombre esperado. Un índice renombrado conservaba esa cantidad y terminaba informado como error inesperado. La corrección compara el conjunto completo de nombres antes de inspeccionar claves y propiedades. Devuelve `corrupt_data` conservando el esquema y los registros existentes; ese cambio no requirió migración. La versión actual y sus ampliaciones se documentan en [persistencia local](PERSISTENCIA_LOCAL.md).

La inspección usa los [nombres de índices nativos de IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/indexNames); la atomicidad se apoya en el [contrato transaccional de Dexie](<https://dexie.org/docs/Dexie/Dexie.transaction()>).

## Límites de esta aceptación

Conservar filas dañadas y presentar un error deja disponible la información para una recuperación explícita. Los [respaldos JSON](RESPALDOS_JSON.md) permiten restauración validada y atómica en una biblioteca vacía. No se reparan datos corruptos ni se sustituyen bibliotecas existentes automáticamente; la [validación ampliada de migraciones](MIGRACIONES_RECUPERACION.md) detalla resultados y límites. Tampoco se ha medido el rendimiento con colecciones grandes ni se promete conservación si el navegador elimina IndexedDB.

Fase 1 se cerró tras integrar DATA-03. Fase 4 permanece abierta hasta su validación final y entrega, siguiendo la [definición de terminado](PLAN_DESARROLLO.md#definición-de-terminado).
