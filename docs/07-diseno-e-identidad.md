# 07 — Diseño y accesibilidad

<!-- DOCUMENTACION:nivel-2026-10-29:BEGIN -->

**Nivel:** técnica / producto.

## Identidad y experiencia de uso

Revisión documental: 2026-10-29. Base `0dccf7cb8659` en `main`; árbol inicialmente limpio. La inspección de fuentes no sustituye pruebas de ejecución.

**Estado y alcance:** Web/PWA 1.1.0 publicada según la guía de entrega y el tag; escritorio empaquetado y APK siguen siendo objetivos separados, no productos certificados por la web.

Interfaz React con temas oscuro y pergamino, navegación por biblioteca/ficha/colección y feedback de guardado. La vista web adaptable y las pruebas de motores de navegador no certifican una APK, Safari físico o un instalador de escritorio.

### Criterios verificables

- Estados vacíos, carga, confirmación y error distinguibles por texto además de color.
- Orden de foco, teclado y nombres accesibles cuando la plataforma los utilice.
- Legibilidad y controles suficientes para el dispositivo objetivo; considerar área segura y ciclo de vida en móvil.
- Evitar que animación, espera o respuesta tardía apliquen efectos ajenos a la selección vigente.

Son criterios de revisión, no certificaciones de accesibilidad ya obtenidas. La aceptación se registra por resolución/plataforma y recorrido; no se extrapola desde una captura aislada.

## Fuentes de implementación y contratos

[README.md](../README.md) · [docs/ARQUITECTURA.md](ARQUITECTURA.md) · [docs/MODELO_DOMINIO.md](MODELO_DOMINIO.md) · [docs/MODELO_DATOS.md](MODELO_DATOS.md) · [docs/ENTREGA.md](ENTREGA.md) · [docs/PLAN_DESARROLLO.md](PLAN_DESARROLLO.md) · [docs/AUDIO_LOCAL.md](AUDIO_LOCAL.md).
<!-- DOCUMENTACION:nivel-2026-10-29:END -->

<!-- IDENTIDAD:2026-10-30 -->

## Recursos de identidad y distribución

[Catálogo de originales y variantes](../branding/README.md) · [Manifest de identidad](../branding/manifest.json).

La cabecera utiliza wordmark-dark/light.svg en public/auditorium/brand, conservando las rutas de precaché y el prefijo de Pages. Favicon e iconos PWA/Apple proceden del pack. Los maestros no se añaden íntegros a la caché offline.

Los banners de presentación se seleccionan por tema en el README. Las aplicaciones incorporan sólo los recursos necesarios, con dimensiones/proporción estables; las variantes y originales permanecen en branding. La identidad visual no amplía funcionalidades ni cambia las condiciones de uso.
