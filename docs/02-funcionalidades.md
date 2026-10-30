# 02 — Catálogo funcional

<!-- DOCUMENTACION:nivel-2026-10-29:BEGIN -->

**Nivel:** general / técnica.

## Catálogo de capacidades — revisión 2026-10-29

Revisión documental: 2026-10-29. Base `0dccf7cb8659` en `main`; árbol inicialmente limpio. La inspección de fuentes no sustituye pruebas de ejecución.

**Estado y alcance:** Web/PWA 1.1.0 publicada según la guía de entrega y el tag; escritorio empaquetado y APK siguen siendo objetivos separados, no productos certificados por la web.

| Módulo              | Capacidad / propósito                      | Caso borde o límite                          |
| ------------------- | ------------------------------------------ | -------------------------------------------- |
| Biblioteca          | Búsqueda, filtros y ficha                  | Ausencia de álbumes o resultados             |
| Registro y catálogo | Álbum, edición, pistas y referencias       | Revisión de duplicados y edición concurrente |
| Experiencia         | Escucha, nota general/género y comentarios | Guardado conjunto y valores opcionales       |
| Colección           | Copias, deseos y retirada reversible       | Confirmación y conservación del historial    |
| Reproducción        | Enlaces oficiales y audio local            | Carga explícita, errores, cierre y limpieza  |
| Recuperación        | JSON, ZIP y cuenta opcional                | Versiones, biblioteca vacía y conflictos     |

Los módulos propuestos se identifican expresamente. La disponibilidad en una plataforma no se extrapola a las demás; la aceptación debe cubrir los casos borde del recorrido principal.

## Fuentes de implementación y contratos

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
<!-- DOCUMENTACION:nivel-2026-10-29:END -->
