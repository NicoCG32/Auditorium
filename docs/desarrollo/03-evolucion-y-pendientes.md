# Evolución y pendientes

El desarrollo parte de la web/PWA y de la conservación de la biblioteca entre versiones.

## Funciones disponibles

La web/PWA incluye biblioteca local, catálogo, experiencia, ejemplares, deseos, enlaces, audio propio, respaldos y cuenta opcional. Las pruebas cubren lógica, persistencia, interfaz y navegación.

## Cambios posteriores a 1.1.0

La web incluye importación aditiva de respaldos y el formato JSON de catálogo musical desde la actualización del 17 de noviembre. La [guía de importación](../IMPORTACION_JSON.md) explica su uso y sus conflictos. El ZIP descargable de la release 1.1.0 conserva sus archivos originales.

La preparación de esa release requiere comprobar compatibilidad de archivos, conflictos, recuperación y conservación de identidad sobre el paquete generado.

La misma actualización incorpora [Discografías por artista](../DISCOGRAFIAS.md) y [Artistas y ediciones](../ARTISTAS_Y_EDICIONES.md): búsqueda MusicBrainz, selección múltiple, comparación con la colección y elección opcional de edición, pistas y portada con DB13/JSON9. El [servicio HTTPS en Supabase](../CATALOGO_SUPABASE.md) y las migraciones JSON8/9 se verificaron en el proyecto publicado.

## Líneas de evolución

- Empaquetado de **escritorio** y **Android** separado de la PWA.
- Pruebas físicas y de rendimiento con bibliotecas grandes, distintos navegadores y almacenamiento limitado.
- Mejoras de transporte y recuperación de archivos propios entre dispositivos.

## Criterio de cierre

Para entregar una capacidad, reviso su implementación, las pruebas pertinentes, la guía de uso y el paquete que se va a publicar.

[Proceso](01-proceso-y-decisiones.md) · [Entorno](02-entorno-y-verificacion.md)
