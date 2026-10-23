# Archivos sintéticos de evaluación

Los ocho archivos `tone-*` son una onda senoidal matemática de 440 Hz, mono, 48000 Hz, 1,2 segundos y amplitud reducida. Se generan con `../generate-fixtures.mjs`; no proceden de grabaciones, canciones, una colección o servicios externos.

Estos archivos sintéticos se ofrecen bajo CC0-1.0, sin restricciones de reutilización. El código del generador sigue la licencia del repositorio. `manifest.json` registra contenedor, códec, duración, tamaño, versión del generador y SHA-256. Una extensión o un MIME no sustituyen la prueba de decodificación y reproducción.

Para regenerar, instala FFmpeg/ffprobe por un medio de confianza y ejecuta desde la raíz del repositorio:

```sh
node prototypes/audio-01/generate-fixtures.mjs
```

Se pueden indicar ejecutables con `FFMPEG_PATH` y `FFPROBE_PATH`. El generador no registra esas rutas en el manifiesto. FFmpeg y sus binarios no se distribuyen dentro del proyecto ni son necesarios para ejecutar las pruebas con los fixtures ya generados.
