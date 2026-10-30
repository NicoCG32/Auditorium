# 05 — Reglas y núcleo

<!-- DOCUMENTACION:nivel-2026-10-29:BEGIN -->

**Nivel:** técnica.

## Núcleo e invariantes

Revisión documental: 2026-10-29. Base `0dccf7cb8659` en `main`; árbol inicialmente limpio. La inspección de fuentes no sustituye pruebas de ejecución.

**Estado y alcance:** Web/PWA 1.1.0 publicada según la guía de entrega y el tag; escritorio empaquetado y APK siguen siendo objetivos separados, no productos certificados por la web.

- La nota general y las notas por género son independientes; cambiar una no debe recalcular silenciosamente la otra.
- Retirar de la colección no equivale a borrar el álbum de catálogo ni las otras experiencias.
- Las operaciones conjuntas validan identidad, referencias y concurrencia antes de confirmar.
- El audio se limita por archivo, biblioteca y respaldo; no se copia al snapshot de sincronización.
- Las referencias externas son revisables; una recomendación no modifica por sí misma las valoraciones.

### Entradas, decisión y efectos

El recorrido de [03-flujo-de-usuario.md](03-flujo-de-usuario.md) proporciona entradas al núcleo. Las reglas anteriores determinan lo aceptado y sus efectos; UI y proveedores externos no deben sustituir silenciosamente esas decisiones. El modelo de [04-base-de-datos.md](04-base-de-datos.md) identifica los estados/referencias afectados.

Las fórmulas y parámetros detallados permanecen en las fuentes especializadas enlazadas. Distinguir parámetros provisionales, azar, reloj y resultados persistidos; cambiar presentación o reexportar no debe presentarse como una nueva evaluación equivalente sin identificarlo.

### Pruebas con propósito

Proteger al menos una transición válida, un rechazo importante y la repetición/reapertura que pueda duplicar efectos. No inventar una suite ni un porcentaje de cobertura: consultar los comandos existentes y la evidencia de su ejecución en [09-instalacion-y-despliegue.md](09-instalacion-y-despliegue.md).

## Fuentes de implementación y contratos

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
<!-- DOCUMENTACION:nivel-2026-10-29:END -->
