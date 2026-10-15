# Instalación, uso sin conexión y almacenamiento

La compilación de producción incluye un manifest y un service worker generado con Vite PWA y Workbox. No necesita cuentas, claves ni servicios externos para guardar datos.

## Primera apertura e instalación

Abre la aplicación con conexión mediante HTTPS, o en `localhost`/`127.0.0.1` para una prueba local. Espera el mensaje **«Aplicación preparada para usar sin conexión»**. La instalación del service worker debe completar la descarga de todos los recursos propios antes de mostrar ese estado; una apertura parcial no garantiza disponibilidad offline.

La sección **«Aplicación y almacenamiento»**, al pie de la página, ofrece instrucciones y el botón **«Instalar Auditórium»** cuando el navegador presenta esa posibilidad. La solicitud requiere una acción explícita. Cancelarla conserva el uso web. Aceptar el diálogo no se anuncia como instalación completada hasta recibir el evento del navegador. También se puede usar su menú de instalación; en iPhone/iPad, Compartir → Añadir a pantalla de inicio, si está disponible.

El soporte depende del navegador y sistema. Una aplicación instalada puede usar un almacenamiento distinto al de una pestaña, especialmente en WebKit. Si aparece vacía, descarga primero un [respaldo JSON](RESPALDOS_JSON.md) de la biblioteca original y restáuralo en el destino vacío. No hay sincronización automática entre modos de apertura, navegadores o dispositivos. Véase la [explicación de WebKit sobre datos de aplicaciones instaladas](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/).

## Qué queda disponible sin red

Tras prepararse, se pueden reabrir y recargar la biblioteca, ficha, formularios, ediciones/pistas, ejemplares, deseos, álbumes retirados y respaldos. Todas esas vistas son navegación interna de la SPA en su base: `/` en el perfil local y `/Auditorium/` en Pages. También se admite `index.html` bajo esa base, parámetros de consulta y fragmentos. No existen enlaces directos por álbum ni un router de rutas adicionales. La [guía de publicación web](PUBLICACION_WEB.md) explica el origen de almacenamiento y el traslado desde localhost.

Las operaciones locales siguen usando [IndexedDB](PERSISTENCIA_LOCAL.md): altas, consulta, notas, escucha, valoraciones, listas, copias, deseos, retirada/restauración y exportación/importación JSON. No se desactivan por el estado de la red.

La caché contiene únicamente el HTML principal, todos los JS/CSS compilados, iconos propios y manifest. No tiene reglas de caché de respuestas en ejecución: no guarda portadas externas, audio, servicios remotos ni archivos JSON arbitrarios. Los enlaces y portadas externos requieren red y mantienen su alternativa textual. La indicación de conexión del navegador es orientativa; no implica comprobar la disponibilidad de un servicio externo.

## Actualizaciones sin recargas forzadas

Una nueva versión descarga sus recursos y espera mientras la versión anterior controle alguna ventana. La interfaz avisa **«Nueva versión lista para la próxima apertura»** y explica que hay que guardar los cambios y cerrar todas las pestañas y ventanas de Auditórium, incluida la instalada. Al volver a abrir, se activa la nueva versión.

La aplicación no envía `SKIP_WAITING` ni recarga automáticamente ventanas abiertas. Esto protege los borradores y evita mezclar recursos de versiones distintas entre pestañas. La activación elimina únicamente entradas obsoletas de su precaché; no borra otras cachés del sitio, IndexedDB ni la identidad. Un fallo al descargar la actualización conserva la versión activa. **«Comprobar actualización»** permite comprobar de nuevo con conexión.

El service worker no administra datos musicales ni migraciones de la base. Este incremento conserva DB v3 y respaldo v1. La [validación adicional de migraciones y recuperación](MIGRACIONES_RECUPERACION.md) corresponde a MVP-04.

## Protección y límites del almacenamiento

La sección muestra el estado de `navigator.storage.persisted()` y, cuando está disponible, una estimación de uso/cuota del sitio. Incluye caché y biblioteca; no mide exclusivamente la colección y la cuota puede cambiar. Los valores ausentes no se interpretan como cero.

**«Solicitar protección del almacenamiento»** llama a `navigator.storage.persist()` solo tras un clic. Puede concederse, denegarse o no estar disponible. Denegar la protección no bloquea el uso local y permite reintentar. Incluso con protección, borrar datos del sitio, navegación privada o pérdida del dispositivo pueden eliminar datos. Instalar una PWA no sustituye un respaldo: descarga JSON periódicamente y conserva copias fuera del dispositivo.

Referencias: [persistencia solicitada al navegador](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist), [cuotas y eliminación de almacenamiento](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Desarrollo y verificación

`npm run dev` mantiene la caché PWA desactivada para evitar servir compilaciones antiguas durante desarrollo. Para probar producción, usa `npm run build` y `npm run preview`, en un origen distinto al servidor de desarrollo. Para `/Auditorium/`, ejecuta `npm run build:pages` y `npm run preview -- --mode pages`. Un hosting debe servir `sw.js`, el módulo Workbox, manifest y recursos del build con sus tipos MIME correctos, y permitir comprobar cambios del service worker sin una caché HTTP permanente. La publicación Pages se valida en el hito WEB-01.

```sh
npx playwright install chromium
npm run test:e2e
```

Las pruebas usan Chromium, contextos aislados con datos ficticios, dos compilaciones de producción y un servidor de prueba en `127.0.0.1:4178`. Verifican recursos, reapertura/recarga offline, operaciones de biblioteca, respaldo/restauración, preservación de todas las tablas e identidad al actualizar y espera con dos ventanas y un borrador. No usan la biblioteca del navegador habitual. Los builds y resultados de prueba se ignoran en Git. CI prepara Chromium con `--with-deps` en Linux y ejecuta los mismos recorridos.

La instalación en sistemas móviles y los comportamientos específicos de Safari/Firefox requieren comprobaciones en esos dispositivos. No se da por verificada su instalación por pasar las pruebas de Chromium.

Referencias técnicas: [Vite PWA](https://vite-pwa-org.netlify.app/guide/), [ciclo del service worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [pruebas con service workers](https://playwright.dev/docs/service-workers).
