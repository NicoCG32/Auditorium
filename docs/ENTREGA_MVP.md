# Candidata de entrega del MVP

Versión `1.0.0-rc.1`. Esta entrega prepara la revisión de MVP-05. La Fase 4 se cierra tras revisar e integrar esa tarea.

## Usar la biblioteca

1. Abre la aplicación y añade un álbum con artista y título.
2. Busca el álbum y abre su ficha. Registra escucha, comentarios y una nota de 1 a 10 en pasos de 0,5.
3. Completa la lista original, sus ediciones y notas de pistas. Cada pista conserva su nota entre apariciones; las variantes y el álbum tienen notas independientes.
4. Registra ejemplares o compras digitales y deseos por formato o edición. Marca un deseo cumplido cuando exista una compra coincidente.
5. Guarda un respaldo JSON desde «Respaldos» fuera del navegador. Puedes restaurarlo en una biblioteca completamente vacía, recuperando los datos y la identidad original.
6. Espera «Aplicación preparada para usar sin conexión» antes de cerrar o desconectar. La próxima versión espera al cierre de todas las ventanas; guarda los borradores antes de cerrarlas.

Retirar un álbum permite restaurarlo con sus datos. Eliminar un ejemplar o quitar una valoración requiere confirmación y no ofrece deshacer automático. Las portadas externas requieren conexión y se muestran mediante una acción explícita.

## Revisar la candidata local

En el repositorio, con Node 24 y npm 12:

```sh
npm ci
npm run check
npx playwright install chromium firefox webkit
npm run test:e2e
npm run package
npm run preview
```

`preview` sirve la compilación en un origen local independiente del servidor de desarrollo. Usa un perfil de prueba vacío y datos ficticios para la revisión. `package` prepara `release/auditorium-1.0.0-rc.1/`: archivos estáticos en `site/`, esta guía, evidencia de validación, avisos de dependencias e inventario SHA-256. No incorpora bibliotecas musicales, respaldos descargados, perfiles ni resultados de pruebas. GitHub Actions conserva la candidata siete días para descargarla desde el run de calidad.

## Condiciones de alojamiento

La candidata contiene archivos estáticos, sin servidor de datos. Requiere servir `site/` en la raíz de un origen HTTPS (o localhost para revisión), con MIME correctos para JavaScript, CSS, PNG, SVG y `application/manifest+json`. `sw.js` debe poder consultarse sin una caché HTTP prolongada para detectar actualizaciones. No abras `index.html` mediante `file://`. El alcance y la URL de inicio de la PWA son `/`; alojarla bajo un subdirectorio requiere adaptar y volver a verificar la configuración.

Esta tarea no publica un sitio ni crea una GitHub Release. El despliegue corresponde a un hito opcional separado.

## Límites operativos

Los datos pertenecen al origen y al perfil del navegador; cambiar de dirección, dispositivo, perfil o aplicación instalada puede abrir otro almacenamiento. No hay cuenta, sincronización, importación automática de plataformas ni reproducción musical. El navegador puede borrar datos locales aunque la aplicación funcione offline; solicitar protección no garantiza su conservación. Mantén respaldos fuera del dispositivo.

La restauración reemplaza únicamente un destino totalmente vacío y acepta el contrato JSON v1 hasta 20 MiB. Para combinar bibliotecas se necesita una función futura. No elimines datos como respuesta a un error de apertura: reintenta, libera espacio o cierra otras ventanas según el mensaje. Conserva el respaldo antes de limpiar un perfil.

Chromium, Firefox y WebKit de Playwright verifican el flujo principal. WebKit automatizado no acredita la instalación ni el almacenamiento de Safari/iOS en un dispositivo real. Las auditorías automáticas de accesibilidad complementan la revisión de teclado y pantallas; no constituyen una certificación WCAG.
