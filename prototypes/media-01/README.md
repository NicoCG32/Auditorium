# Prototipo aislado MEDIA-01

Herramienta de evaluación de [metadatos y reproductores](../../docs/PROVEEDORES_STREAMING.md). No se importa desde la aplicación, no entra en su build ni en la precaché de la PWA, y no consulta IndexedDB, Supabase o una biblioteca personal. No usa claves. `serve.mjs` sólo entrega tres archivos estáticos; no hace de proxy.

Con las dependencias del repositorio instaladas:

```sh
node prototypes/media-01/serve.mjs
```

Abre `http://127.0.0.1:4182/Auditorium/prototypes/media-01/`. Escribe un enlace público y pulsa **Revisar enlace**. La consulta de metadatos, la imagen y el reproductor tienen acciones separadas. Los resultados no modifican el borrador hasta elegir **Usar título recibido**. La imagen es una miniatura del recurso, no una portada validada de álbum. No se interpreta el HTML recibido por oEmbed.

Para los contratos sin red:

```sh
node --test prototypes/media-01/media.test.mjs
node prototypes/media-01/probe.mjs --mock --browser all
```

El segundo comando necesita los navegadores Playwright ya instalados. Si falta un motor, la comprobación simulada falla y lo identifica. Se usa en CI tras instalar los tres motores. La simulación no acredita la disponibilidad de los proveedores.

Para repetir las observaciones con servicios reales, sin cuentas:

```sh
node prototypes/media-01/probe.mjs --live --browser chromium
```

Admite `firefox`, `webkit` o `all`, y filtro opcional `--case spotify-album,spotify-track`. Contacta los servicios con los enlaces públicos fijados en el script; el vídeo YouTube puede reproducirse durante tres segundos tras una acción del navegador. No solicita tokens, extrae archivos, guarda medios en el repositorio ni modifica la aplicación. El contexto aislado se cierra al terminar. La disponibilidad, cookies y restricciones dependen del proveedor; revisa sus condiciones antes de usarlo.

El informe JSON sale por stdout y puede guardarse fuera del repositorio. Incluye resultados de transporte, lectura JSON, miniatura, marco, API y reproducción iniciada como campos diferentes. Un motor que no arranca en modo vivo queda como `launchError`, sin declararlo comprobado. Un error interno de la prueba produce salida distinta de cero. No actives estas pruebas de red como condición automática de CI: las pruebas deterministas deben seguir funcionando sin proveedores externos.
