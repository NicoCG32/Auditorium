# AUDIO-01: laboratorio aislado de audio local

El [informe de evaluación](../../docs/AUDIO_LOCAL.md) explica resultados, fuentes y la decisión de persistencia local con respaldo propio para AUDIO-02. Este directorio no forma parte de la aplicación publicada ni de su build/PWA. No conecta con bibliotecas o cuentas de Auditorium.

```sh
node --test prototypes/audio-01/audio.test.mjs
node prototypes/audio-01/probe.mjs --browser all
node prototypes/audio-01/serve.mjs
```

Requiere las dependencias del repositorio y los tres navegadores de Playwright. El servidor estático escucha sólo en loopback, por defecto puerto 4183, y sirve exclusivamente los archivos del laboratorio bajo `/prototypes/audio-01/` y `/Auditorium/prototypes/audio-01/`. El informe JSON de la sonda se imprime en stdout y el resumen en stderr.

Selecciona únicamente archivos propios que quieras probar. Son temporales: se pierden al recargar, cerrar o salir. Máximo 16 MiB/archivo, cuatro archivos y 32 MiB por sesión; un reproductor activo y asociación a entradas ficticias. No se suben archivos ni se guardan en el experimento de almacenamiento. El audio necesita acción explícita para comenzar.

«Comparar almacenamiento» genera datos de 1 y 16 MiB y compara IndexedDB Blob, IndexedDB bytes y OPFS con hashes y aborto de cuota simulado. «Leer después de recargar» consulta esos datos; «Eliminar muestras del experimento» limpia sólo su base/directorio. Si OPFS falla se informa, sin afirmar limpieza completa. No se solicita protección persistente ni se llena el disco.

La matriz registra `canPlayType`, decodificación real e inicio de reproducción por separado. Un PASS del protocolo no garantiza compatibilidad de todos los formatos; el resumen cuenta también los motores que efectivamente reproducen WAV local. CI exige que arranquen los tres motores, pero conserva sus formatos y backends incompatibles como resultados. `--allow-unavailable` es exclusivamente diagnóstico local. Playwright WebKit no acredita Safari ni dispositivos físicos.

La sonda de persistencia crea un perfil nuevo, guarda ocho registros sintéticos de 16 MiB y un WAV, cierra el proceso y vuelve a abrirlo. Comprueba hashes y reproducción por separado. Usa offline sólo si el worker se prepara; si una API se bloquea se informa con tiempo acotado. El protocolo exige al menos un motor con recuperación persistente offline verificada. El selector manual sigue siendo el comparador temporal; no implementa todavía el contrato persistente del producto ni el paquete ZIP.

El worker sólo almacena HTML y tres módulos de este laboratorio; no guarda audio ni controla la aplicación. No utiliza perfiles o bibliotecas habituales. Las [muestras y licencia](fixtures/README.md) y el [manifiesto verificable](fixtures/manifest.json) están incluidos. Para regenerarlas opcionalmente:

```sh
FFMPEG_PATH=/ruta/ffmpeg FFPROBE_PATH=/ruta/ffprobe node prototypes/audio-01/generate-fixtures.mjs
```

La regeneración requiere FFmpeg/ffprobe externos; no son dependencias de la aplicación ni necesarios en CI. En PowerShell se asignan las variables con `$env:FFMPEG_PATH` y `$env:FFPROBE_PATH`. No ejecutar el generador para validar las muestras ya versionadas: los contratos verifican sus hashes.
