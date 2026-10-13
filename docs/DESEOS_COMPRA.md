# Deseos de compra

La ficha del álbum registra intenciones independientes de los ejemplares, la escucha y las valoraciones. Poseer un CD puede coexistir con un deseo de vinilo. Los deseos se identifican por UUID; objetivos iguales no se fusionan.

## Objetivo y estados

Cada deseo requiere un formato genérico, una edición exacta del álbum o ambos. Si se indican ambos deben ser compatibles. Los formatos admitidos son vinilo, CD, casete, descarga digital y otro. «Solo edición exacta» exige seleccionar una edición; cambiar de formato limpia esa selección y ofrece únicamente ediciones compatibles.

Los deseos nuevos están activos. Se pueden editar objetivo y notas mientras están activos, cancelar conservando sus datos y reactivar un deseo cancelado o cumplido. No se elimina el historial desde este panel. Notas no vacías conservan espacios y saltos de línea; un borrador vacío o formado solo por blancos omite las notas.

Un ejemplar coincidente ofrece «Marcar cumplido», con selección de la compra. El usuario confirma ese deseo individual mediante el botón; los demás permanecen intactos, aunque coincidan con la misma compra. La sugerencia también está disponible al reabrir la ficha, para compras registradas antes del deseo. No se considera una compra la reproducción por streaming.

La coincidencia exige la misma entrada personal y un deseo activo. Un objetivo genérico compara formato; descarga digital corresponde al ejemplar `purchased_digital/digital_download`. Un objetivo exacto exige el mismo ID de edición registrado en la copia: no se deduce una edición de su formato. Cuando existen ambos objetivos se comprueban ambos. Retirar la compra después de leer impide cumplirla; retirar una copia posteriormente no cambia el estado histórico del deseo ya cumplido.

## Contratos y recuperación

- `MusicLibrary.addPurchaseWish(userAlbumId, input)` crea un deseo activo y genera UUID/fecha UTC de registro. La fecha no puede preceder al alta en biblioteca.
- `updatePurchaseWish(expected, input)` reemplaza objetivo/notas de un deseo activo; comprueba la referencia completa leída para evitar sobrescribir cambios concurrentes.
- `setPurchaseWishStatus(expected, status, ownedItemId?)` comprueba el estado previo. Cumplir exige un ejemplar actualmente coincidente dentro de la misma transacción. Cancelar/reactivar no cambia otras propiedades; devuelve el registro vigente.

Todas las operaciones exigen entrada activa, propietario local y referencias válidas. Escriben únicamente en `purchaseWishes`. No actualizan `UserAlbum`, catálogo, copias ni ratings. Un fallo revierte la transacción y conserva el borrador; un doble envío de la interfaz se bloquea. Las escrituras de los demás editores esperan mientras el cambio está en curso.

Después de guardar se muestra el deseo confirmado mientras se relee la ficha. Si esa lectura falla, la interfaz ofrece «Reintentar lectura de deseos» y mantiene bloqueadas otras escrituras y la navegación. El reintento solo lee: no crea otro deseo ni repite el cumplimiento. Escape o cancelar el formulario descartan el borrador sin escribir y devuelven el foco al registro.

## Esquema v3

`SCHEMA_V3` añade exclusivamente `purchaseWishes` a v2: clave `id` e índices de entrada, edición objetivo, formato objetivo, estado y fecha. v1 y v2 mantienen sus definiciones históricas. Ambas versiones compatibles migran a v3 con deseos vacíos y conservan todas sus filas e identidad, incluidos los ejemplares de v2.

Antes de migrar se comprueban tablas, claves e índices de la versión existente. Bases incompletas o con índices alterados, versiones desconocidas o futuras se rechazan sin reparación automática. Las lecturas y mutaciones posteriores incluyen los deseos en el snapshot transaccional validado. La ausencia de la colección en entradas de dominio anteriores se normaliza a `[]`; la persistencia actual siempre exige su tabla.

Las pruebas usan datos ficticios: objetivos, coincidencias, acciones explícitas, concurrencia, cuota/aborto, recuperación de lectura y migración de bibliotecas vacías/pobladas. El [plan](PLAN_DESARROLLO.md) mantiene respaldo y PWA en Fase 4.
