# ADR-006 — Caché de aplicación y actualización al cerrar las ventanas

Estado: aceptada. Fecha: 2026-10-13.

## Contexto

La biblioteca musical ya se guarda en IndexedDB y dispone de respaldo JSON. Para poder reabrirla sin red, la aplicación debe conservar su código y recursos propios. Una actualización automática mientras se editan formularios o existen varias ventanas puede perder borradores o mezclar recursos de versiones diferentes.

## Decisión

Generar manifest y service worker mediante `vite-plugin-pwa` 2.0.0, compatible con Vite 8, usando Workbox `generateSW`. Se fija el plugin en el lockfile y se mantienen licencias gratuitas: MIT para Vite PWA y MIT para Workbox. Playwright 1.64.0, Apache-2.0, se usa únicamente para pruebas.

Precargar exclusivamente HTML principal, JS/CSS compilados, recursos visuales propios seleccionados y manifest. La selección de marca, fondos e iconos se especifica en [diseño base](../DISENO_BASE.md). No cachear respuestas arbitrarias ni contenido externo. La biblioteca permanece en IndexedDB; el service worker no accede a ella ni cambia su versión o identidad.

Mantener `skipWaiting: false`. El registro es explícito y la aplicación no envía mensajes para forzar activación ni llama a recargar la página. Una versión nueva espera al cierre de todas las ventanas controladas por la anterior. `clientsClaim` permite controlar la primera apertura después de completar la precarga; no salta la espera de actualizaciones. Informar de la versión pendiente y de cómo aplicarla.

Usar una precaché identificada con `auditorium-shell` y no activar la limpieza general de cachés antiguas de Workbox. Workbox elimina entradas obsoletas de su propia precaché al activar una versión; otras cachés y bases locales se conservan.

Mostrar soporte de instalación, estado de protección y estimación de almacenamiento. Solicitar persistencia solo mediante una acción del usuario y recomendar respaldos aunque se conceda. Desactivar el service worker en desarrollo; verificar producción y actualización entre builds distintos en Chromium aislado.

## Consecuencias

Los borradores de ventanas abiertas no sufren una recarga impuesta. El usuario debe guardar y cerrar todas las ventanas para aplicar una actualización; recargar una sola pestaña puede mantener la versión anterior. La instalación y disponibilidad offline dependen del soporte y del almacenamiento del navegador. No se promete disponibilidad externa ni que los datos locales estén a salvo de borrado manual o pérdida del dispositivo.

Los iconos usan el emblema de vinilo del producto, sin imágenes de carátulas ajenas. Los recursos necesarios de ambos temas se precargan para poder cambiar de apariencia sin red. No se añaden servicios ni costos recurrentes.

Referencias: [comportamientos de Vite PWA](https://vite-pwa-org.netlify.app/guide/service-worker-strategies-and-behaviors), [opciones de Workbox](https://developer.chrome.com/docs/workbox/modules/workbox-build), [ciclo de actualización](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
