# Entrega del MVP

Versión `1.0.0`. MVP local validado e integrado, con las Fases 0–4 completadas. La [release v1.0.0](https://github.com/NicoCG32/Auditorium/releases/tag/v1.0.0) incluye el paquete estático y su checksum SHA-256.

Las secciones de uso y límites del MVP que siguen conservan el comportamiento del ZIP original. Las ampliaciones integradas en main y Pages no modifican ese ZIP ni su tag.

## Paquetes generados desde main

Los artefactos actuales de CI contienen las ampliaciones posteriores al MVP aunque el campo de versión siga siendo `1.0.0`. Se identifican por el commit y el run, no sólo por el nombre de carpeta. No deben confundirse con la release histórica.

En estos artefactos ya están disponibles edición de álbumes, géneros, portadas automáticas, enlaces favoritos, valoraciones por género y adquisiciones físicas/digitales editables. La cuenta y sincronización son opcionales; la biblioteca local sigue funcionando sin cuenta. Spotify/YouTube se cargan por elección y los archivos de audio se conservan por dispositivo. Incorporar música no exige una compra ni una calificación.

La biblioteca musical usa DB11/nativa110 y JSON7. El JSON de hasta 20 MiB conserva música, notas y portadas, sin audio; ZIP1 incluye los archivos locales y admite hasta 160 MiB. La restauración requiere un destino vacío. Los borradores se protegen durante la navegación y permanecen en memoria, sin garantía después de confirmar una recarga o cerrar la pestaña. Las portadas válidas se cargan automáticamente; reproducir un servicio sigue siendo explícito.

Las guías vigentes en línea detallan [valoraciones](https://github.com/NicoCG32/Auditorium/blob/main/docs/VALORACIONES_POR_GENERO.md), [Mi colección](https://github.com/NicoCG32/Auditorium/blob/main/docs/MI_COLECCION.md), [audio y respaldo completo](https://github.com/NicoCG32/Auditorium/blob/main/docs/AUDIO_LOCAL.md) y [sincronización opcional](https://github.com/NicoCG32/Auditorium/blob/main/docs/SINCRONIZACION_SUPABASE.md). El [informe del recorrido](https://github.com/NicoCG32/Auditorium/blob/main/docs/VALIDACION_RECORRIDO.md) separa regresión técnica y aceptación de comprensión pendiente. Las guías ampliadas se consultan en el repositorio; no se incluyen todas en el paquete estático.

## Usar la biblioteca

1. Abre la aplicación y añade un álbum con artista y título.
2. Busca el álbum y abre su ficha. Registra escucha, comentarios y una nota de 1 a 10 en pasos de 0,5.
3. Completa la lista original, sus ediciones y notas de pistas. Cada pista conserva su nota entre apariciones; las variantes y el álbum tienen notas independientes.
4. Registra ejemplares o compras digitales y deseos por formato o edición. Marca un deseo cumplido cuando exista una compra coincidente.
5. Guarda un respaldo JSON desde «Respaldos» fuera del navegador. Puedes restaurarlo en una biblioteca completamente vacía, recuperando los datos y la identidad original.
6. Espera «Aplicación preparada para usar sin conexión» antes de cerrar o desconectar. La próxima versión espera al cierre de todas las ventanas; guarda los borradores antes de cerrarlas.

Retirar un álbum permite restaurarlo con sus datos. Eliminar un ejemplar o quitar una valoración requiere confirmación y no ofrece deshacer automático. Las portadas externas requieren conexión y se muestran mediante una acción explícita.

## Abrir el paquete descargado

Descarga `auditorium-1.0.0.zip` y `SHA256SUMS.txt` desde la release. Verifica el checksum del ZIP antes de extraerlo. En PowerShell puedes calcularlo con `Get-FileHash auditorium-1.0.0.zip -Algorithm SHA256` y compararlo con el archivo de checksums. El ZIP contiene una carpeta `auditorium-1.0.0/`, con el sitio en `site/`, las guías, changelog, avisos de dependencias e inventario de los archivos.

Desde esa carpeta, con Node 24 y npm 12 instalados, puedes iniciar un servidor de revisión:

```sh
npx --yes vite@8.3.4 preview --host 127.0.0.1 --port 4173 --strictPort --outDir site
```

Abre `http://127.0.0.1:4173/`. La primera preparación del servidor requiere red para descargar Vite; detenlo con Ctrl+C. La PWA puede reabrirse offline una vez que indique que está preparada. Usa siempre el mismo origen y perfil para acceder a la misma biblioteca.

## Compilar y revisar desde el código

En el repositorio, con Node 24 y npm 12:

```sh
npm ci
npm run check
npx playwright install chromium firefox webkit
npm run test:e2e
npm run package
npm run preview
```

`preview` sirve la compilación en un origen local independiente del servidor de desarrollo. Usa un perfil de prueba vacío y datos ficticios para la revisión. `package` prepara `release/auditorium-1.0.0/`: archivos estáticos en `site/`, esta guía, evidencia de validación, changelog, avisos de dependencias e inventario SHA-256. No incorpora bibliotecas musicales, respaldos descargados, perfiles ni resultados de pruebas. GitHub Actions conserva cada paquete siete días para descargarlo desde el run de calidad; la GitHub Release conserva el ZIP y su checksum junto al tag.

## Condiciones de alojamiento

El paquete local contiene archivos estáticos, sin servidor de datos. Requiere servir `site/` en la raíz de un origen HTTPS (o localhost para revisión), con MIME correctos para JavaScript, CSS, PNG, SVG y `application/manifest+json`. `sw.js` debe poder consultarse sin una caché HTTP prolongada para detectar actualizaciones. No abras `index.html` mediante `file://`. El alcance y la URL de inicio de la PWA del paquete son `/`. El perfil separado `npm run build:pages` genera la aplicación para `/Auditorium/`, con su propia validación de subdirectorio.

La release distribuye el paquete para alojarlo o revisarlo localmente. La [publicación web en GitHub Pages](PUBLICACION_WEB.md) corresponde al hito WEB-01 y conserva los archivos de la release publicada.

## Límites operativos

Los datos pertenecen al origen y al perfil del navegador; cambiar de dirección, dispositivo, perfil o aplicación instalada puede abrir otro almacenamiento. No hay cuenta, sincronización, importación automática de plataformas ni reproducción musical. El navegador puede borrar datos locales aunque la aplicación funcione offline; solicitar protección no garantiza su conservación. Mantén respaldos fuera del dispositivo.

La restauración reemplaza únicamente un destino totalmente vacío y acepta el contrato JSON v1 hasta 20 MiB. Para combinar bibliotecas se necesita una función futura. No elimines datos como respuesta a un error de apertura: reintenta, libera espacio o cierra otras ventanas según el mensaje. Conserva el respaldo antes de limpiar un perfil.

Chromium, Firefox y WebKit de Playwright verifican el flujo principal. WebKit automatizado no acredita la instalación ni el almacenamiento de Safari/iOS en un dispositivo real. Las auditorías automáticas de accesibilidad complementan la revisión de teclado y pantallas; no constituyen una certificación WCAG.
