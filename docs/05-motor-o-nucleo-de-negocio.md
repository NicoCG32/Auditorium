# 05 — Reglas y núcleo

## Núcleo e invariantes

- La nota general y las notas por género son independientes; cambiar una no debe recalcular silenciosamente la otra.
- Retirar de la colección no equivale a borrar el álbum de catálogo ni las otras experiencias.
- Las operaciones conjuntas validan identidad, referencias y concurrencia antes de confirmar.
- El audio se limita por archivo, biblioteca y respaldo; no se copia al snapshot de sincronización.
- Las referencias externas son revisables; una recomendación no modifica por sí misma las valoraciones.

### Entradas, decisión y efectos

El recorrido de [03-flujo-de-usuario.md](03-flujo-de-usuario.md) proporciona entradas al núcleo. Las reglas anteriores determinan lo aceptado y sus efectos; UI y proveedores externos no deben sustituir silenciosamente esas decisiones. El modelo de [04-base-de-datos.md](04-base-de-datos.md) identifica los estados/referencias afectados.

Los documentos especializados enlazados detallan las fórmulas, parámetros y efectos de cada operación.

### Pruebas con propósito

Para comprobar el núcleo, cubre una operación válida, una entrada rechazada y la reapertura o repetición de la operación. Los comandos de prueba están en [instalación y despliegue](09-instalacion-y-despliegue.md).

## Código y documentación relacionada

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
