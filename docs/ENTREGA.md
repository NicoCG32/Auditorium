# Entrega de Auditorium 1.1.0

29 de octubre de 2026. Esta versión reúne el recorrido aceptado de Biblioteca, Añadir álbum, Calificaciones y Mi colección, junto con reproducción, audio local, referencias de catálogo y cuenta opcional. La [release v1.0.0](https://github.com/NicoCG32/Auditorium/releases/tag/v1.0.0) conserva el MVP original y sus archivos.

## Elegir cómo usarlo

| Distribución                                               | Uso y configuración                                                                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Web/PWA en Pages](https://nicocg32.github.io/Auditorium/) | Biblioteca local, instalación donde se admita y cuenta opcional configurada por el alojamiento                                                                                                |
| ZIP de la release                                          | Sitio estático para servir en la raíz de un origen, con biblioteca local; el paquete genérico no trae un proyecto de cuentas configurado                                                      |
| Compilación propia                                         | Permite configurar cuenta y sincronización mediante variables de compilación y un servicio compatible; seguir la [guía de sincronización](SINCRONIZACION_SUPABASE.md#instalación-y-operación) |

Los datos pertenecen al origen y perfil del navegador. Abrir Pages, localhost u otro alojamiento crea almacenamientos distintos. Para trasladarlos, descargar y restaurar el respaldo adecuado en un destino vacío. Activar una cuenta permite compartir la biblioteca musical entre dispositivos; los archivos de audio permanecen en cada dispositivo.

## Descargar y abrir el paquete

Obtener `auditorium-1.1.0.zip` y `SHA256SUMS.txt` desde la release. Comprobar el SHA-256 antes de extraerlo; en PowerShell:

```powershell
Get-FileHash auditorium-1.1.0.zip -Algorithm SHA256
```

Comparar la cifra con `SHA256SUMS.txt`. El ZIP contiene `auditorium-1.1.0/` con `site/`, `README.md`, `VALIDACION_RECORRIDO.md`, `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md` y `CONTENTS.json`. El inventario indica tamaño y SHA-256 de cada archivo; las notas de release identifican el commit y su CI.

Desde esa carpeta, con Node 24 y npm 12 instalados:

```sh
npx --yes vite@8.3.4 preview --host 127.0.0.1 --port 4173 --strictPort --outDir site
```

Abrir `http://127.0.0.1:4173/`. La primera preparación del servidor necesita red para descargar Vite. Detenerlo con Ctrl+C. Servir siempre el mismo origen y perfil para acceder a la misma biblioteca; no abrir `index.html` mediante `file://`.

## Recorrido de uso

1. **Biblioteca:** consultar álbumes, buscar por música y aplicar filtros. Incorporar un álbum expresa valor personal; no exige poseerlo ni calificarlo.
2. **Añadir álbum:** artista y título bastan. Géneros, país, clasificación, enlaces y portada son opcionales. Los datos guardados pueden corregirse manteniendo identidad y relaciones.
3. **Calificaciones:** valorar o recalificar la experiencia general y, opcionalmente, cada género. Son cifras independientes, sin promedios ni sustitución de una nota ausente; una nota baja es comparativa. Cada nota puede referenciar una edición añadida de ese álbum aunque no se posea.
4. **Mi colección:** registrar, corregir o retirar cada copia física o compra digital. Las ediciones se agrupan bajo el mismo álbum. Enlaces, suscripciones, archivos y deseos no se cuentan como adquisiciones.

La ficha conecta estos recorridos con listas, pistas, ediciones y experiencia. Los deseos y respaldos están en Más opciones. Los borradores se protegen al navegar, con elección de guardar, descartar o continuar; permanecen en memoria y no se recuperan después de confirmar una recarga o cerrar la pestaña.

Las portadas por HTTPS se cargan automáticamente desde su origen; requieren red. Una portada local JPG/PNG validada de hasta 2 MiB queda en la biblioteca y sus respaldos. Spotify/YouTube se cargan por elección y ofrecen alternativa externa; disponibilidad y reproducción dependen del proveedor. Los archivos de audio se conservan en este dispositivo, con un reproductor activo y sin reproducción automática.

## Respaldo, actualización y recuperación

Antes de actualizar desde una versión anterior, descargar un respaldo y conservar sus archivos originales fuera del navegador. La aplicación usa DB11/nativa110 y migra los esquemas anteriores conservando identidad y relaciones; esa actualización no permite abrir la base con una aplicación antigua.

| Respaldo                   | Contenido y límites                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON musical               | Formato7, hasta 20 MiB; incluye catálogo, experiencia, enlaces, colección y portadas. Lee formatos1–6 mediante sus contratos históricos. No incluye archivos ni descriptores de audio |
| ZIP completo               | Formato1, hasta 160 MiB; biblioteca musical y audio local con validación de integridad. Admite el JSON6 histórico antes de migrarlo                                                   |
| Audio por biblioteca local | Hasta 128 archivos y 128 MiB, máximo 16 MiB por archivo; la cuota real disponible depende del navegador                                                                               |

La restauración exige un destino completamente vacío y valida antes de escribir. Un fallo conserva la biblioteca anterior; un error de lectura después de confirmar una escritura ofrece reintentar sólo la lectura. No borrar datos como respuesta automática a un fallo de apertura. La [guía de respaldos](RESPALDOS_JSON.md) y la [guía de audio](AUDIO_LOCAL.md) concretan formatos y recuperación.

Esperar «Aplicación preparada para usar sin conexión» antes de desconectar. Las actualizaciones de la PWA esperan al cierre de las ventanas anteriores. El navegador puede eliminar almacenamiento local; la instalación o la solicitud de protección no garantizan conservarlo. Mantener respaldos fuera del dispositivo.

## Cuenta e integraciones opcionales

El paquete genérico funciona sin cuenta. Para un alojamiento propio con Supabase, compilar con `VITE_SUPABASE_URL` y una clave `VITE_SUPABASE_PUBLISHABLE_KEY`, configurar el esquema y los retornos de acceso siguiendo la guía enlazada. La [documentación de claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys) distingue la clave publishable del cliente de las claves secret o service_role, que no deben entrar en una compilación pública. La configuración se aplica al compilar, no editando el ZIP después de extraerlo.

La búsqueda de referencias en Wikidata es explícita y el registro manual continúa disponible. Las recomendaciones Gemini/Groq requieren una clave propia conservada sólo en memoria, con consentimiento sobre los datos enviados; las cuotas y disponibilidad dependen de cada cuenta. Las recomendaciones no cambian valoraciones. No se incluyen credenciales SMTP, claves privadas ni una biblioteca personal en la distribución.

## Alojamiento y validación

Servir `site/` en la raíz de un origen HTTPS, o localhost para revisión, con los MIME correctos. La URL de inicio y el scope del paquete son `/`; `sw.js` debe poder consultarse sin una caché HTTP prolongada. Para `/Auditorium/`, utilizar la compilación específica de Pages descrita en la [guía de publicación](PUBLICACION_WEB.md).

La [validación del recorrido](VALIDACION_RECORRIDO.md) distingue pruebas automáticas y aceptación comunicada de escritorio, recibida el 28 de octubre. La CI del commit de entrega verifica calidad, tres motores, PWA y empaquetado; las notas de release enlazan sus resultados exactos. Las simulaciones no acreditan móviles físicos, reproducción completa de proveedores o una evaluación exhaustiva de accesibilidad. Las auditorías automáticas no constituyen certificación WCAG. El rendimiento con bibliotecas grandes y equipos de poca memoria conserva su evaluación posterior.

Para compilar desde el código: `npm ci`, `npm run check`, instalar los navegadores de Playwright y ejecutar `npm run test:e2e`; después `npm run package`. Las referencias ampliadas del paquete apuntan al tag de esa versión en GitHub y requieren conexión para consultarlas.
