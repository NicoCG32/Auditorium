# 03 — Recorrido y estados

<!-- DOCUMENTACION:nivel-2026-10-29:BEGIN -->

**Nivel:** general / técnica.

## Recorrido operativo y estados

Revisión documental: 2026-10-29. Base `0dccf7cb8659` en `main`; árbol inicialmente limpio. La inspección de fuentes no sustituye pruebas de ejecución.

**Estado y alcance:** Web/PWA 1.1.0 publicada según la guía de entrega y el tag; escritorio empaquetado y APK siguen siendo objetivos separados, no productos certificados por la web.

1. Abrir o crear biblioteca local, con cuenta opcional.
2. Registrar o encontrar el álbum y revisar identidad/edición.
3. Añadir experiencia, valoración, copia o deseo.
4. Revisar cambios y confirmar mediante el caso de uso.
5. Consultar/reproducir y crear un respaldo apropiado antes de trasladar datos.

### Confirmación y resultado

La nota general y las notas por género son independientes; cambiar una no debe recalcular silenciosamente la otra.

Las referencias externas son revisables; una recomendación no modifica por sí misma las valoraciones.

En formularios/operaciones, distinguir captura, revisión, confirmación, resultado y fallo. Cancelar una previsualización no debe anunciar un cambio no confirmado; cuando existe una operación persistente, su recuperación sigue el contrato específico. En juegos, las fases de simulación se definen en el núcleo y la vista refleja esas transiciones.

### Criterio de aceptación del recorrido

Tiempo para encontrar un registro y exactitud de colección/restauración; satisfacción y uso sostenido, sin convertir volumen de álbumes en éxito por sí solo.

Validar inicio, camino principal, error relevante, cancelación y reapertura según la plataforma; registrar también los escenarios aún no ejecutados. Para Auditorium, atender especialmente: evicción/cuota y cambio de origen del navegador.

## Fuentes de implementación y contratos

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
<!-- DOCUMENTACION:nivel-2026-10-29:END -->
