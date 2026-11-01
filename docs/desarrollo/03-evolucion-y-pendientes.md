# Evolución y pendientes

El desarrollo parte de la web/PWA y de la conservación de la biblioteca entre versiones.

## Funciones disponibles

La web/PWA incluye biblioteca local, catálogo, experiencia, ejemplares, deseos, enlaces, audio propio, respaldos y cuenta opcional. Las pruebas cubren lógica, persistencia, interfaz y navegación.

## Cambios posteriores a 1.1.0

El [changelog](../../CHANGELOG.md) mantiene como **Sin publicar** la importación aditiva de respaldos y el formato JSON de catálogo musical. La [guía de importación](../IMPORTACION_JSON.md) explica su uso y sus conflictos. Estos cambios se incorporarán a una release posterior a 1.1.0.

La preparación de esa release requiere comprobar compatibilidad de archivos, conflictos, recuperación y conservación de identidad sobre el paquete generado.

## Líneas de evolución

- Empaquetado de **escritorio** y **Android** separado de la PWA.
- Pruebas físicas y de rendimiento con bibliotecas grandes, distintos navegadores y almacenamiento limitado.
- Mejoras de transporte y recuperación de archivos propios entre dispositivos.

## Criterio de cierre

Para entregar una capacidad, reviso su implementación, las pruebas pertinentes, la guía de uso y el paquete que se va a publicar.

[Proceso](01-proceso-y-decisiones.md) · [Entorno](02-entorno-y-verificacion.md)
