# Migraciones, persistencia y recuperación

DB10/nativa100 añade las tablas locales de audio. Su barrera de actualización valida el snapshot y todos los documentos del checkpoint con el schema actual de DB9, incluidas las referencias opcionales de nota; no los degrada a un lector heredado. Una incoherencia conserva la versión y los registros previos. Los adjuntos anteriores a DB10 empiezan vacíos; las recuperaciones JSON no contienen audio. [Contrato de audio y ZIP](AUDIO_LOCAL.md).

El incremento UX-01 usa IndexedDB v5 (nativa 50), con esquemas históricos v1 a v4. v2 incorpora ejemplares, v3 deseos y v4 la referencia opcional `Album.catalogReference`. v5 mantiene las trece tablas e índices y establece una barrera de compatibilidad para país de artista, géneros y portada local. No cambia identidad, IDs, notas, valoraciones, ediciones o pistas ni completa metadatos mediante red. El [respaldo JSON v3](RESPALDOS_JSON.md) se versiona por separado y admite importar los contratos v1/v2 estrictos.

## Antes y durante una actualización

La apertura inspecciona versión, tablas, claves e índices nativos antes de permitir una migración. Solo admite versiones nativas 10, 20, 30, 40 y 50, equivalentes a las versiones Dexie 1 a 5. Una versión futura o intermedia desconocida se rechaza, conservando los datos; un esquema histórico alterado se informa sin repararlo automáticamente.

La transacción de lectura que comprueba el esquema termina antes de cerrar su conexión y abrir la actualización. Así no compite con la migración. Si la inspección aborta, la apertura informa el fallo y admite reintento.

IndexedDB realiza los cambios del esquema en una transacción de actualización. Un fallo de cuota o aborto revierte tanto las tablas nuevas como la versión y las filas. Una migración correcta conserva los registros históricos y crea vacías las colecciones que aún no existían; los pasos v3→v4 y v4→v5 sólo actualizan la versión compatible. Una identidad existente no se genera de nuevo.

Otra ventana con una conexión antigua puede bloquear el cambio de versión. La interfaz pide cerrarla y volver a intentar. Al cerrarse, la solicitud de actualización pendiente puede terminar; sus datos se conservan y el reintento abre la biblioteca vigente. No se borran ni recrean bases para resolver un bloqueo.

Referencias: [actualización de IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/upgradeneeded_event), [aborto transaccional](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/abort), [bloqueos en Dexie](https://dexie.org/docs/Dexie/Dexie.on.blocked).

## Matriz de aceptación

La evidencia del MVP y de AI-01/CAT-01 corresponde a sus revisiones anteriores. UX-01 amplía esta matriz a v5 y respaldo v3; su validación y revisión están en curso en la [issue #59](https://github.com/NicoCG32/Auditorium/issues/59). La enumeración de comprobaciones no acredita por sí sola la nueva entrega.

| Situación                                                            | Comprobación                                                                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1, v2, v3 y v4 pobladas migran a v5                                 | Esquemas históricos independientes de las declaraciones actuales; comparación de todas las filas, claves e índices anteriores, incluidos álbumes retirados, notas literales y ejemplares v2 |
| Cuota o aborto durante la migración                                  | Fallo después de crear tablas nuevas; esquema, versión e identidad originales completos tras el rechazo; reintento explícito satisfactorio                                                  |
| Reinicio real del navegador                                          | Cierre completo de Chromium y nuevo proceso con el mismo perfil temporal; reapertura offline y comparación íntegra de datos y esquema                                                       |
| Respaldo y recuperación                                              | Archivo realmente descargado de la biblioteca migrada; restauración offline en otro perfil vacío, adopción de identidad y comparación de todas las tablas tras recarga                      |
| Otra ventana bloquea la migración                                    | Conexión nativa antigua mantenida abierta; mensaje de bloqueo, filas conservadas, cierre y reintento                                                                                        |
| Índice alterado, versión futura, identidad ausente o rating inválido | Mensaje de error y comparación íntegra de esquema/filas después de abrir y reintentar; sin reparación ni borrado automáticos                                                                |
| Cuota al reemplazar una valoración                                   | Nota anterior y todas las otras filas conservadas; borrador disponible para reintentar                                                                                                      |
| Cuota al restaurar un archivo                                        | Rollback de filas e identidad; confirmación conservada y reintento satisfactorio                                                                                                            |
| Persistencia denegada                                                | Información visible, biblioteca y respaldo operativos, datos conservados tras recarga                                                                                                       |

Las pruebas están en [migración y recuperación](../src/infrastructure/repositories/migration-recovery.test.ts), [inspección previa](../src/infrastructure/db/preflight.test.ts), [errores de apertura](../src/app/startup-recovery.test.tsx) y [recorridos de navegador](../e2e/persistence.spec.ts). Los contratos históricos usan [fixtures independientes](../src/test/historical-storage.fixture.ts); no se obtiene la estructura esperada de las declaraciones que se están probando.

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

La suite E2E ejecuta también los recorridos [PWA/offline](PWA_OFFLINE.md). Usa perfiles ficticios aislados: los perfiles persistentes se crean en un directorio temporal corto para evitar límites de rutas de Windows y se eliminan tras cerrar el navegador. Archivos descargados y trazas quedan en resultados de prueba ignorados por Git. La página auxiliar solo la sirve el servidor E2E y no forma parte del build distribuido.

Los fallos de cuota y aborto se inyectan en transacciones IndexedDB reales; no se afirma haber agotado el disco o la cuota del dispositivo. La denegación de persistencia se simula para obtener un resultado determinista. Las comprobaciones del navegador cubren Chromium; otros motores y dispositivos requieren verificación propia.

## Qué hacer ante un error

- **Sin espacio:** conserva el formulario o confirmación, descarga un respaldo si la biblioteca sigue legible y libera espacio antes de volver a intentar. No borres los datos de Auditórium para ganar espacio: contienen la colección.
- **Otra ventana bloquea la apertura:** guarda cambios en esa ventana, ciérrala y pulsa «Volver a intentar» en la que informa el error.
- **Operación abortada:** vuelve a intentar. Los datos anteriores se conservan; una escritura no confirmada no se presenta como guardada.
- **Versión incompatible o datos inválidos:** conserva el perfil original y los respaldos. Reintentar no repara los datos. Usa una versión compatible o una recuperación específica; si tienes un respaldo válido, restáuralo en otro perfil o navegador con biblioteca vacía. La aplicación actual no exporta datos que no puede validar ni reemplaza el destino existente.
- **Protección denegada o no disponible:** continúa con la biblioteca local y guarda respaldos periódicos fuera del dispositivo. La protección concedida tampoco evita el borrado manual o la pérdida del dispositivo.

Esta aceptación no incorpora un reparador de datos corruptos, una importación que mezcle bibliotecas ni sincronización. Tampoco promete conservación frente a la eliminación de datos por el navegador. La validación final y entrega del MVP corresponde a MVP-05.
